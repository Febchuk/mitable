/**
 * Local SQLite Database
 *
 * On-device storage for sensitive session data that never leaves the user's
 * machine. Stores sensor classifications, classifier outputs, and storyteller
 * narratives. The Mitable agent queries this directly for session details.
 *
 * Location: {userData}/on-device/mitable-local.db
 *
 * Schema:
 *   captures       - per-frame sensor output (what the vision model saw)
 *   classifications - per-batch classifier output (stitched activity narrative)
 *   stories        - per-session storyteller output (full session story + tasks)
 */

import { app } from "electron";
import { join } from "path";
import { createLogger } from "../../lib/logger";

const logger = createLogger("LocalDb");

// better-sqlite3 is a native module — dynamic import so it doesn't crash
// if not yet installed during development
let Database: typeof import("better-sqlite3") | null = null;
let db: import("better-sqlite3").Database | null = null;

// ── Types ───────────────────────────────────────────────────────────────────

export interface LocalCapture {
  id: string;
  sessionId: string;
  frameId: string;
  sequenceNumber: number;
  capturedAt: number;
  windowId: string;
  appName: string;
  windowTitle: string;
  sensorOutput: string;
  deltaChanged: boolean;
  changeType: string | null;
  userAction: string | null;
  createdAt: number;
}

export interface LocalClassification {
  id: string;
  sessionId: string;
  batchIndex: number;
  startSequence: number;
  endSequence: number;
  activityDescription: string;
  activityType: string | null;
  onTask: boolean;
  taskRelevance: string | null;
  importanceScore: number;
  rawOutput: string;
  createdAt: number;
}

export interface LocalStory {
  id: string;
  sessionId: string;
  narrative: string;
  tasks: string;
  timeBreakdown: string | null;
  modelUsed: string;
  createdAt: number;
}

// ── Initialization ──────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS captures (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  frame_id TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  captured_at INTEGER NOT NULL,
  window_id TEXT NOT NULL,
  app_name TEXT NOT NULL DEFAULT '',
  window_title TEXT NOT NULL DEFAULT '',
  sensor_output TEXT NOT NULL DEFAULT '',
  delta_changed INTEGER NOT NULL DEFAULT 0,
  change_type TEXT,
  user_action TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_captures_session ON captures(session_id);
CREATE INDEX IF NOT EXISTS idx_captures_session_seq ON captures(session_id, sequence_number);

CREATE TABLE IF NOT EXISTS classifications (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  start_sequence INTEGER NOT NULL,
  end_sequence INTEGER NOT NULL,
  activity_description TEXT NOT NULL DEFAULT '',
  activity_type TEXT,
  on_task INTEGER NOT NULL DEFAULT 0,
  task_relevance TEXT,
  importance_score REAL NOT NULL DEFAULT 0,
  raw_output TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_classifications_session ON classifications(session_id);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  narrative TEXT NOT NULL DEFAULT '',
  tasks TEXT NOT NULL DEFAULT '[]',
  time_breakdown TEXT,
  model_used TEXT NOT NULL DEFAULT 'local',
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_stories_session ON stories(session_id);
`;

// ── Service ─────────────────────────────────────────────────────────────────

class LocalDatabase {
  private dbPath: string = "";

  async initialize(): Promise<void> {
    this.dbPath = join(app.getPath("userData"), "on-device", "mitable-local.db");

    try {
      const betterSqlite3 = await import("better-sqlite3");
      Database = betterSqlite3;
      db = new betterSqlite3.default(this.dbPath);

      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");
      db.pragma("foreign_keys = ON");

      db.exec(SCHEMA_SQL);

      logger.info("Local database initialized at", this.dbPath);
    } catch (err) {
      logger.error("Failed to initialize local database:", String(err));
      logger.info(
        "Local SQLite not available — install better-sqlite3 to enable on-device storage"
      );
    }
  }

  isAvailable(): boolean {
    return db !== null;
  }

  // ── Captures ────────────────────────────────────────────────────────────

  insertCapture(capture: Omit<LocalCapture, "createdAt">): void {
    if (!db) return;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO captures
        (id, session_id, frame_id, sequence_number, captured_at, window_id,
         app_name, window_title, sensor_output, delta_changed, change_type, user_action)
      VALUES
        (@id, @sessionId, @frameId, @sequenceNumber, @capturedAt, @windowId,
         @appName, @windowTitle, @sensorOutput, @deltaChanged, @changeType, @userAction)
    `);
    stmt.run({
      ...capture,
      deltaChanged: capture.deltaChanged ? 1 : 0,
    });
  }

  getCapturesForSession(sessionId: string): LocalCapture[] {
    if (!db) return [];
    return db
      .prepare(
        `SELECT * FROM captures WHERE session_id = ? ORDER BY sequence_number ASC`
      )
      .all(sessionId) as LocalCapture[];
  }

  getCaptureRange(
    sessionId: string,
    startSeq: number,
    endSeq: number
  ): LocalCapture[] {
    if (!db) return [];
    return db
      .prepare(
        `SELECT * FROM captures
         WHERE session_id = ? AND sequence_number BETWEEN ? AND ?
         ORDER BY sequence_number ASC`
      )
      .all(sessionId, startSeq, endSeq) as LocalCapture[];
  }

  // ── Classifications ─────────────────────────────────────────────────────

  insertClassification(classification: Omit<LocalClassification, "createdAt">): void {
    if (!db) return;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO classifications
        (id, session_id, batch_index, start_sequence, end_sequence,
         activity_description, activity_type, on_task, task_relevance,
         importance_score, raw_output)
      VALUES
        (@id, @sessionId, @batchIndex, @startSequence, @endSequence,
         @activityDescription, @activityType, @onTask, @taskRelevance,
         @importanceScore, @rawOutput)
    `);
    stmt.run({
      ...classification,
      onTask: classification.onTask ? 1 : 0,
    });
  }

  getClassificationsForSession(sessionId: string): LocalClassification[] {
    if (!db) return [];
    return db
      .prepare(
        `SELECT * FROM classifications WHERE session_id = ? ORDER BY batch_index ASC`
      )
      .all(sessionId) as LocalClassification[];
  }

  // ── Stories ─────────────────────────────────────────────────────────────

  insertStory(story: Omit<LocalStory, "createdAt">): void {
    if (!db) return;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO stories
        (id, session_id, narrative, tasks, time_breakdown, model_used)
      VALUES
        (@id, @sessionId, @narrative, @tasks, @timeBreakdown, @modelUsed)
    `);
    stmt.run(story);
  }

  getStoryForSession(sessionId: string): LocalStory | null {
    if (!db) return null;
    return (
      (db
        .prepare(`SELECT * FROM stories WHERE session_id = ?`)
        .get(sessionId) as LocalStory | undefined) ?? null
    );
  }

  // ── Queries for the Mitable agent ───────────────────────────────────────

  /**
   * Search local session data by keyword (for agent queries like
   * "what was I doing at 2pm?"). Searches sensor output and classifications.
   */
  searchSessions(query: string, limit = 20): Array<{
    sessionId: string;
    text: string;
    source: "capture" | "classification" | "story";
    timestamp: number;
  }> {
    if (!db) return [];

    const likeQuery = `%${query}%`;
    const results: Array<{
      sessionId: string;
      text: string;
      source: "capture" | "classification" | "story";
      timestamp: number;
    }> = [];

    const captures = db
      .prepare(
        `SELECT session_id, sensor_output, captured_at
         FROM captures WHERE sensor_output LIKE ? LIMIT ?`
      )
      .all(likeQuery, limit) as Array<{
        session_id: string;
        sensor_output: string;
        captured_at: number;
      }>;
    for (const c of captures) {
      results.push({
        sessionId: c.session_id,
        text: c.sensor_output,
        source: "capture",
        timestamp: c.captured_at,
      });
    }

    const classifications = db
      .prepare(
        `SELECT session_id, activity_description, created_at
         FROM classifications WHERE activity_description LIKE ? LIMIT ?`
      )
      .all(likeQuery, limit) as Array<{
        session_id: string;
        activity_description: string;
        created_at: number;
      }>;
    for (const c of classifications) {
      results.push({
        sessionId: c.session_id,
        text: c.activity_description,
        source: "classification",
        timestamp: c.created_at,
      });
    }

    return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  /**
   * Get total storage used by local DB in bytes.
   */
  getDbSizeBytes(): number {
    try {
      const fs = require("fs");
      const stats = fs.statSync(this.dbPath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  close(): void {
    if (db) {
      db.close();
      db = null;
      logger.info("Local database closed");
    }
  }
}

export const localDb = new LocalDatabase();
