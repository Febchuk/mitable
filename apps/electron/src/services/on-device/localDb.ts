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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

export type TranscriptionSource = "user" | "remote";

export interface LocalTranscription {
  id: string;
  sessionId: string;
  chunkIndex: number;
  speakerId: number;
  transcript: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence: number;
  source: TranscriptionSource;
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

CREATE TABLE IF NOT EXISTS transcriptions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  speaker_id INTEGER NOT NULL DEFAULT 0,
  transcript TEXT NOT NULL DEFAULT '',
  start_time_ms INTEGER NOT NULL,
  end_time_ms INTEGER NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  source TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_transcriptions_session ON transcriptions(session_id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_session_time ON transcriptions(session_id, start_time_ms);
`;

// better-sqlite3 SELECT * returns snake_case column names;
// map them to the camelCase TypeScript interfaces expect.
function snakeToCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = val;
  }
  return out;
}

function mapRows<T>(rows: unknown[]): T[] {
  return rows.map((r) => snakeToCamel(r as Record<string, unknown>) as T);
}

function mapRow<T>(row: unknown): T | null {
  if (!row) return null;
  return snakeToCamel(row as Record<string, unknown>) as T;
}

// ── Service ─────────────────────────────────────────────────────────────────

class LocalDatabase {
  private dbPath: string = "";

  async initialize(): Promise<void> {
    this.dbPath = join(app.getPath("userData"), "on-device", "mitable-local.db");

    const { mkdirSync } = await import("fs");
    mkdirSync(join(app.getPath("userData"), "on-device"), { recursive: true });

    await this.tryOpen();
  }

  /**
   * Re-attempt opening the database (e.g. after electron-rebuild).
   * Safe to call multiple times; no-ops if already open.
   */
  async tryOpen(): Promise<boolean> {
    if (db) return true;

    try {
      const betterSqlite3 = await import("better-sqlite3");
      Database = betterSqlite3;
      db = new betterSqlite3.default(this.dbPath);

      db.pragma("journal_mode = WAL");
      db.pragma("synchronous = NORMAL");
      db.pragma("foreign_keys = ON");

      db.exec(SCHEMA_SQL);

      // Migrate: add source column to transcriptions if missing
      const cols = db.pragma("table_info(transcriptions)") as Array<{ name: string }>;
      if (!cols.some((c) => c.name === "source")) {
        db.exec(`ALTER TABLE transcriptions ADD COLUMN source TEXT NOT NULL DEFAULT 'user'`);
        logger.info("Migrated transcriptions table: added source column");
      }

      logger.info("Local database initialized at", this.dbPath);
      return true;
    } catch (err) {
      logger.error("Failed to initialize local database:", String(err));
      logger.warn(
        "Run `npm run rebuild-native` in apps/electron to compile better-sqlite3 for Electron"
      );
      return false;
    }
  }

  isAvailable(): boolean {
    return db !== null;
  }

  // ── WAL Checkpoint ──────────────────────────────────────────────────────

  checkpoint(): void {
    if (!db) {
      logger.warn("checkpoint() called but DB is unavailable");
      return;
    }
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
      logger.info("WAL checkpoint complete");
    } catch (err) {
      logger.error("WAL checkpoint failed:", String(err));
    }
  }

  // ── Captures ────────────────────────────────────────────────────────────

  insertCapture(capture: Omit<LocalCapture, "createdAt">): void {
    if (!db) {
      logger.error("insertCapture: DB unavailable, dropping frame", capture.frameId);
      return;
    }
    try {
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
    } catch (err) {
      logger.error("insertCapture failed:", String(err), {
        session: capture.sessionId,
        frame: capture.frameId,
      });
    }
  }

  getCapturesForSession(sessionId: string): LocalCapture[] {
    if (!db) {
      logger.warn("getCapturesForSession: DB unavailable");
      return [];
    }
    return mapRows<LocalCapture>(
      db
        .prepare(`SELECT * FROM captures WHERE session_id = ? ORDER BY sequence_number ASC`)
        .all(sessionId)
    );
  }

  getCaptureRange(sessionId: string, startSeq: number, endSeq: number): LocalCapture[] {
    if (!db) {
      logger.warn("getCaptureRange: DB unavailable");
      return [];
    }
    return mapRows<LocalCapture>(
      db
        .prepare(
          `SELECT * FROM captures
         WHERE session_id = ? AND sequence_number BETWEEN ? AND ?
         ORDER BY sequence_number ASC`
        )
        .all(sessionId, startSeq, endSeq)
    );
  }

  getCaptureCount(sessionId: string): number {
    if (!db) return 0;
    const row = db
      .prepare(`SELECT COUNT(*) as cnt FROM captures WHERE session_id = ?`)
      .get(sessionId) as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  }

  // ── Classifications ─────────────────────────────────────────────────────

  insertClassification(classification: Omit<LocalClassification, "createdAt">): void {
    if (!db) {
      logger.error(
        "insertClassification: DB unavailable, dropping batch",
        String(classification.batchIndex)
      );
      return;
    }
    try {
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
    } catch (err) {
      logger.error("insertClassification failed:", String(err), {
        session: classification.sessionId,
        batch: classification.batchIndex,
      });
    }
  }

  getClassificationsForSession(sessionId: string): LocalClassification[] {
    if (!db) {
      logger.warn("getClassificationsForSession: DB unavailable");
      return [];
    }
    return mapRows<LocalClassification>(
      db
        .prepare(`SELECT * FROM classifications WHERE session_id = ? ORDER BY batch_index ASC`)
        .all(sessionId)
    );
  }

  getClassificationCount(sessionId: string): number {
    if (!db) return 0;
    const row = db
      .prepare(`SELECT COUNT(*) as cnt FROM classifications WHERE session_id = ?`)
      .get(sessionId) as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  }

  // ── Stories ─────────────────────────────────────────────────────────────

  insertStory(story: Omit<LocalStory, "createdAt">): void {
    if (!db) {
      logger.error("insertStory: DB unavailable, dropping story for session", story.sessionId);
      return;
    }
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO stories
          (id, session_id, narrative, tasks, time_breakdown, model_used)
        VALUES
          (@id, @sessionId, @narrative, @tasks, @timeBreakdown, @modelUsed)
      `);
      stmt.run(story);
    } catch (err) {
      logger.error("insertStory failed:", String(err), { session: story.sessionId });
    }
  }

  getStoryForSession(sessionId: string): LocalStory | null {
    if (!db) {
      logger.warn("getStoryForSession: DB unavailable");
      return null;
    }
    return mapRow<LocalStory>(
      db.prepare(`SELECT * FROM stories WHERE session_id = ?`).get(sessionId)
    );
  }

  getAllStories(): LocalStory[] {
    if (!db) {
      logger.warn("getAllStories: DB unavailable");
      return [];
    }
    const rows = db.prepare(`SELECT * FROM stories ORDER BY created_at ASC`).all();
    return rows.map((r) => mapRow<LocalStory>(r)!).filter(Boolean);
  }

  // ── Transcriptions ──────────────────────────────────────────────────────

  insertTranscription(transcription: Omit<LocalTranscription, "createdAt">): void {
    if (!db) {
      logger.error(
        "insertTranscription: DB unavailable, dropping chunk",
        String(transcription.chunkIndex)
      );
      return;
    }
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO transcriptions
          (id, session_id, chunk_index, speaker_id, transcript,
           start_time_ms, end_time_ms, confidence, source)
        VALUES
          (@id, @sessionId, @chunkIndex, @speakerId, @transcript,
           @startTimeMs, @endTimeMs, @confidence, @source)
      `);
      stmt.run(transcription);
    } catch (err) {
      logger.error("insertTranscription failed:", String(err), {
        session: transcription.sessionId,
        chunk: transcription.chunkIndex,
      });
    }
  }

  getTranscriptionsForSession(sessionId: string): LocalTranscription[] {
    if (!db) {
      logger.warn("getTranscriptionsForSession: DB unavailable");
      return [];
    }
    return mapRows<LocalTranscription>(
      db
        .prepare(`SELECT * FROM transcriptions WHERE session_id = ? ORDER BY start_time_ms ASC`)
        .all(sessionId)
    );
  }

  getTranscriptionRange(sessionId: string, startMs: number, endMs: number): LocalTranscription[] {
    if (!db) {
      logger.warn("getTranscriptionRange: DB unavailable");
      return [];
    }
    return mapRows<LocalTranscription>(
      db
        .prepare(
          `SELECT * FROM transcriptions
         WHERE session_id = ? AND start_time_ms >= ? AND end_time_ms <= ?
         ORDER BY start_time_ms ASC`
        )
        .all(sessionId, startMs, endMs)
    );
  }

  // ── Queries for the Mitable agent ───────────────────────────────────────

  searchSessions(
    query: string,
    limit = 20
  ): Array<{
    sessionId: string;
    text: string;
    source: "capture" | "classification" | "story" | "transcription";
    timestamp: number;
  }> {
    if (!db) {
      logger.warn("searchSessions: DB unavailable");
      return [];
    }

    const likeQuery = `%${query}%`;
    const results: Array<{
      sessionId: string;
      text: string;
      source: "capture" | "classification" | "story" | "transcription";
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

    const transcriptions = db
      .prepare(
        `SELECT session_id, transcript, start_time_ms
         FROM transcriptions WHERE transcript LIKE ? LIMIT ?`
      )
      .all(likeQuery, limit) as Array<{
      session_id: string;
      transcript: string;
      start_time_ms: number;
    }>;
    for (const t of transcriptions) {
      results.push({
        sessionId: t.session_id,
        text: t.transcript,
        source: "transcription",
        timestamp: t.start_time_ms,
      });
    }

    return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  getDbSizeBytes(): number {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require("fs");
      const stats = fs.statSync(this.dbPath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  close(): void {
    if (db) {
      try {
        db.pragma("wal_checkpoint(TRUNCATE)");
      } catch {
        /* best effort checkpoint before close */
      }
      db.close();
      db = null;
      logger.info("Local database closed");
    }
  }
}

export const localDb = new LocalDatabase();
