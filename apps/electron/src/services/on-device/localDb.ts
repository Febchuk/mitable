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

export interface LocalFeedback {
  id: string;
  message: string;
  logAnalysis: string;
  userName: string;
  userEmail: string;
  emailSent: boolean;
  createdAt: number;
}

export interface LocalDocument {
  id: string;
  userId: string;
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  pageCount: number;
  chunkCount: number;
  status: string;
  error: string | null;
  content: string | null;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LocalDocChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  charStart: number;
  charEnd: number;
  createdAt: number;
}

export interface LocalAgentConversation {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface LocalAgentMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  toolCalls: string;
  createdAt: number;
}

// ── Phase 2 types: Supabase mirror ──────────────────────────────────────────

export interface LocalOrganization {
  id: string;
  name: string;
  domain: string | null;
  settings: string;
  isInternal: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LocalUser {
  id: string;
  organizationId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  avatarUrl: string | null;
  currentWeek: number | null;
  startDate: string | null;
  status: string | null;
  jobTitle: string | null;
  managerId: string | null;
  teamId: string | null;
  department: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LocalMonitoringSession {
  id: string;
  organizationId: string;
  userId: string;
  name: string | null;
  sessionGoal: string | null;
  sessionType: string;
  status: string;
  captureIntervalMs: number;
  selectedWindows: string;
  startedAt: number;
  pausedAt: number | null;
  totalPausedMs: number;
  endedAt: number | null;
  audioRecordingStartedAt: number | null;
  audioRecordingTotalMs: number;
  finalSummary: string | null;
  keyActivities: string | null;
  accomplishments: string | null;
  blockers: string | null;
  timeBreakdown: string | null;
  taskBreakdown: string | null;
  exportPath: string | null;
  createdAt: number;
  updatedAt: number;
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

-- Phase 2: Mirror Supabase schema for local-first storage + cloud migration

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  domain TEXT,
  settings TEXT DEFAULT '{}',
  is_internal INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  avatar_url TEXT,
  current_week INTEGER DEFAULT 1,
  start_date TEXT,
  status TEXT DEFAULT 'active',
  job_title TEXT,
  regular_tasks TEXT DEFAULT '[]',
  regular_apps TEXT DEFAULT '[]',
  additional_context TEXT,
  manager_id TEXT,
  team_id TEXT,
  department TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS monitoring_sessions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT,
  session_goal TEXT,
  session_type TEXT NOT NULL DEFAULT 'focused',
  status TEXT NOT NULL DEFAULT 'active',
  capture_interval_ms INTEGER NOT NULL DEFAULT 30000,
  selected_windows TEXT NOT NULL DEFAULT '[]',
  started_at INTEGER NOT NULL,
  paused_at INTEGER,
  total_paused_ms INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER,
  audio_recording_started_at INTEGER,
  audio_recording_total_ms INTEGER NOT NULL DEFAULT 0,
  final_summary TEXT,
  key_activities TEXT DEFAULT '[]',
  accomplishments TEXT DEFAULT '[]',
  blockers TEXT DEFAULT '[]',
  time_breakdown TEXT,
  task_breakdown TEXT,
  export_path TEXT,
  -- Cloud-only columns kept nullable for migration parity
  ingestion_status TEXT DEFAULT 'pending',
  delivery_status TEXT,
  delivery_channel TEXT,
  delivery_target TEXT,
  delivered_at INTEGER,
  delivery_error TEXT,
  slack_message_ts TEXT,
  intermediate_summary TEXT,
  intermediate_summary_status TEXT,
  summarization_progress TEXT,
  raw_activity_summary TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_org ON monitoring_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_user ON monitoring_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_status ON monitoring_sessions(status);
CREATE INDEX IF NOT EXISTS idx_monitoring_sessions_started ON monitoring_sessions(started_at);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  log_analysis TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  email_sent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS local_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_local_accounts_email ON local_accounts(email);

CREATE TABLE IF NOT EXISTS agent_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_user ON agent_conversations(user_id);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_calls TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_convo ON agent_messages(conversation_id);

CREATE TABLE IF NOT EXISTS local_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_path TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 1,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  content TEXT,
  title TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_local_documents_user ON local_documents(user_id);

CREATE TABLE IF NOT EXISTS local_doc_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES local_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  char_start INTEGER NOT NULL DEFAULT 0,
  char_end INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_local_doc_chunks_doc ON local_doc_chunks(document_id);
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
    // userData survives uninstall by default (standard Electron behavior)
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

      // Migrate: add export_path column to monitoring_sessions if missing
      const msCols = db.pragma("table_info(monitoring_sessions)") as Array<{ name: string }>;
      if (!msCols.some((c) => c.name === "export_path")) {
        db.exec(`ALTER TABLE monitoring_sessions ADD COLUMN export_path TEXT`);
        logger.info("Migrated monitoring_sessions table: added export_path column");
      }

      // Migrate: add content + title columns to local_documents if missing
      const docCols = db.pragma("table_info(local_documents)") as Array<{ name: string }>;
      if (!docCols.some((c) => c.name === "content")) {
        db.exec(`ALTER TABLE local_documents ADD COLUMN content TEXT`);
        logger.info("Migrated local_documents: added content column");
      }
      if (!docCols.some((c) => c.name === "title")) {
        db.exec(`ALTER TABLE local_documents ADD COLUMN title TEXT`);
        logger.info("Migrated local_documents: added title column");
      }

      // FTS5 virtual table for document chunk search (idempotent)
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS local_doc_chunks_fts
        USING fts5(content, content=local_doc_chunks, content_rowid=rowid);
      `);

      // Triggers to keep FTS5 in sync with local_doc_chunks
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS local_doc_chunks_ai AFTER INSERT ON local_doc_chunks BEGIN
          INSERT INTO local_doc_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
        END;
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS local_doc_chunks_ad AFTER DELETE ON local_doc_chunks BEGIN
          INSERT INTO local_doc_chunks_fts(local_doc_chunks_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        END;
      `);
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS local_doc_chunks_au AFTER UPDATE ON local_doc_chunks BEGIN
          INSERT INTO local_doc_chunks_fts(local_doc_chunks_fts, rowid, content) VALUES('delete', old.rowid, old.content);
          INSERT INTO local_doc_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
        END;
      `);

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

  updateClassificationDescription(id: string, description: string): void {
    if (!db) return;
    try {
      db.prepare(`UPDATE classifications SET activity_description = ? WHERE id = ?`).run(
        description,
        id
      );
    } catch (err) {
      logger.error("updateClassificationDescription failed:", String(err));
    }
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

  deleteStoryForSession(sessionId: string): void {
    if (!db) return;
    try {
      db.prepare(`DELETE FROM stories WHERE session_id = ?`).run(sessionId);
    } catch (err) {
      logger.error("deleteStoryForSession failed:", String(err));
    }
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

  // ── Organizations ──────────────────────────────────────────────────────

  upsertOrganization(org: Pick<LocalOrganization, "id" | "name" | "domain" | "settings">): void {
    if (!db) return;
    try {
      db.prepare(
        `
        INSERT INTO organizations (id, name, domain, settings, updated_at)
        VALUES (@id, @name, @domain, @settings, unixepoch('now') * 1000)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, domain = excluded.domain,
          settings = excluded.settings, updated_at = unixepoch('now') * 1000
      `
      ).run(org);
    } catch (err) {
      logger.error("upsertOrganization failed:", String(err));
    }
  }

  getOrganization(id: string): LocalOrganization | null {
    if (!db) return null;
    return mapRow<LocalOrganization>(
      db.prepare(`SELECT * FROM organizations WHERE id = ?`).get(id)
    );
  }

  // ── Users ─────────────────────────────────────────────────────────────

  upsertUser(
    user: Pick<
      LocalUser,
      | "id"
      | "organizationId"
      | "email"
      | "firstName"
      | "lastName"
      | "role"
      | "avatarUrl"
      | "status"
      | "jobTitle"
    >
  ): void {
    if (!db) return;
    try {
      db.prepare(
        `
        INSERT INTO users (id, organization_id, email, first_name, last_name, role, avatar_url, status, job_title, updated_at)
        VALUES (@id, @organizationId, @email, @firstName, @lastName, @role, @avatarUrl, @status, @jobTitle, unixepoch('now') * 1000)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email, first_name = excluded.first_name,
          last_name = excluded.last_name, role = excluded.role,
          avatar_url = excluded.avatar_url, status = excluded.status,
          job_title = excluded.job_title, updated_at = unixepoch('now') * 1000
      `
      ).run(user);
    } catch (err) {
      logger.error("upsertUser failed:", String(err));
    }
  }

  getUser(id: string): LocalUser | null {
    if (!db) return null;
    return mapRow<LocalUser>(db.prepare(`SELECT * FROM users WHERE id = ?`).get(id));
  }

  // ── Monitoring Sessions ────────────────────────────────────────────────

  insertMonitoringSession(session: {
    id: string;
    organizationId: string;
    userId: string;
    name?: string;
    sessionGoal?: string;
    sessionType?: string;
    status?: string;
    captureIntervalMs?: number;
    selectedWindows?: string;
    startedAt: number;
  }): void {
    if (!db) return;
    try {
      db.prepare(
        `
        INSERT OR REPLACE INTO monitoring_sessions
          (id, organization_id, user_id, name, session_goal,
           session_type, status, capture_interval_ms, selected_windows, started_at)
        VALUES
          (@id, @organizationId, @userId, @name, @sessionGoal,
           @sessionType, @status, @captureIntervalMs, @selectedWindows, @startedAt)
      `
      ).run({
        id: session.id,
        organizationId: session.organizationId,
        userId: session.userId,
        name: session.name ?? null,
        sessionGoal: session.sessionGoal ?? null,
        sessionType: session.sessionType ?? "focused",
        status: session.status ?? "active",
        captureIntervalMs: session.captureIntervalMs ?? 30000,
        selectedWindows: session.selectedWindows ?? "[]",
        startedAt: session.startedAt,
      });
    } catch (err) {
      logger.error("insertMonitoringSession failed:", String(err));
    }
  }

  updateMonitoringSessionStatus(
    id: string,
    status: string,
    extra?: { endedAt?: number; finalSummary?: string; pausedAt?: number; totalPausedMs?: number }
  ): void {
    if (!db) return;
    try {
      const sets = ["status = ?", "updated_at = unixepoch('now') * 1000"];
      const params: unknown[] = [status];

      if (extra?.endedAt !== undefined) {
        sets.push("ended_at = ?");
        params.push(extra.endedAt);
      }
      if (extra?.finalSummary !== undefined) {
        sets.push("final_summary = ?");
        params.push(extra.finalSummary);
      }
      if (extra?.pausedAt !== undefined) {
        sets.push("paused_at = ?");
        params.push(extra.pausedAt);
      }
      if (extra?.totalPausedMs !== undefined) {
        sets.push("total_paused_ms = ?");
        params.push(extra.totalPausedMs);
      }

      params.push(id);
      db.prepare(`UPDATE monitoring_sessions SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    } catch (err) {
      logger.error("updateMonitoringSessionStatus failed:", String(err));
    }
  }

  updateMonitoringSessionExportPath(id: string, exportPath: string): void {
    if (!db) return;
    try {
      db.prepare(`UPDATE monitoring_sessions SET export_path = ? WHERE id = ?`).run(exportPath, id);
    } catch (err) {
      logger.error("updateMonitoringSessionExportPath failed:", String(err));
    }
  }

  getExportPath(sessionId: string): string | null {
    if (!db) return null;
    const row = db
      .prepare(`SELECT export_path FROM monitoring_sessions WHERE id = ?`)
      .get(sessionId) as { export_path: string | null } | undefined;
    return row?.export_path ?? null;
  }

  deleteMonitoringSession(id: string): void {
    if (!db) return;
    try {
      db.prepare(`DELETE FROM captures WHERE session_id = ?`).run(id);
      db.prepare(`DELETE FROM classifications WHERE session_id = ?`).run(id);
      db.prepare(`DELETE FROM stories WHERE session_id = ?`).run(id);
      db.prepare(`DELETE FROM transcriptions WHERE session_id = ?`).run(id);
      db.prepare(`DELETE FROM monitoring_sessions WHERE id = ?`).run(id);
    } catch (err) {
      logger.error("deleteMonitoringSession failed:", String(err));
    }
  }

  getMonitoringSession(id: string): LocalMonitoringSession | null {
    if (!db) return null;
    return mapRow<LocalMonitoringSession>(
      db.prepare(`SELECT * FROM monitoring_sessions WHERE id = ?`).get(id)
    );
  }

  getSessionsByStatus(status: string): LocalMonitoringSession[] {
    if (!db) return [];
    return mapRows<LocalMonitoringSession>(
      db
        .prepare(`SELECT * FROM monitoring_sessions WHERE status = ? ORDER BY started_at DESC`)
        .all(status)
    );
  }

  getMonitoringSessionsByDateRange(
    userId: string,
    startMs: number,
    endMs: number
  ): LocalMonitoringSession[] {
    if (!db) return [];
    return mapRows<LocalMonitoringSession>(
      db
        .prepare(
          `
        SELECT * FROM monitoring_sessions
        WHERE user_id = ? AND started_at >= ? AND started_at < ?
        ORDER BY started_at ASC
      `
        )
        .all(userId, startMs, endMs)
    );
  }

  getAllSessionsByDateRange(startMs: number, endMs: number): LocalMonitoringSession[] {
    if (!db) return [];

    // Primary: sessions stored in the monitoring_sessions table
    const tracked = mapRows<LocalMonitoringSession>(
      db
        .prepare(
          `
        SELECT * FROM monitoring_sessions
        WHERE started_at >= ? AND started_at < ?
        ORDER BY started_at ASC
      `
        )
        .all(startMs, endMs)
    );

    // Fallback: reconstruct from captures table for legacy sessions
    // (created before monitoring_sessions was added)
    const trackedIds = new Set(tracked.map((s) => s.id));
    const legacy = db
      .prepare(
        `
        SELECT session_id,
               MIN(captured_at) as first_capture,
               MAX(captured_at) as last_capture
        FROM captures
        WHERE captured_at >= ? AND captured_at < ?
        GROUP BY session_id
        ORDER BY first_capture ASC
        `
      )
      .all(startMs, endMs) as Array<{
      session_id: string;
      first_capture: number;
      last_capture: number;
    }>;

    for (const row of legacy) {
      if (trackedIds.has(row.session_id)) continue;
      const story = this.getStoryForSession(row.session_id);
      tracked.push({
        id: row.session_id,
        userId: "",
        organizationId: "",
        name: null,
        sessionGoal: null,
        sessionType: "monitoring",
        status: story ? "ready" : "ended",
        captureIntervalMs: 10000,
        selectedWindows: "[]",
        startedAt: row.first_capture,
        pausedAt: null,
        totalPausedMs: 0,
        endedAt: row.last_capture,
        audioRecordingStartedAt: null,
        audioRecordingTotalMs: 0,
        finalSummary: story?.narrative ?? null,
        keyActivities: null,
        accomplishments: null,
        blockers: null,
        timeBreakdown: null,
        taskBreakdown: null,
        exportPath: null,
        createdAt: row.first_capture,
        updatedAt: row.last_capture,
      });
    }

    tracked.sort((a, b) => a.startedAt - b.startedAt);
    return tracked;
  }

  getAllMonitoringSessionsForUser(userId: string): LocalMonitoringSession[] {
    if (!db) return [];
    return mapRows<LocalMonitoringSession>(
      db
        .prepare(
          `
        SELECT * FROM monitoring_sessions
        WHERE user_id = ?
        ORDER BY started_at DESC
      `
        )
        .all(userId)
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

  // ── Feedback ──────────────────────────────────────────────────────────────

  insertFeedback(feedback: Omit<LocalFeedback, "createdAt">): void {
    if (!db) {
      logger.error("insertFeedback: DB unavailable");
      return;
    }
    try {
      const stmt = db.prepare(`
        INSERT INTO feedback (id, message, log_analysis, user_name, user_email, email_sent)
        VALUES (@id, @message, @logAnalysis, @userName, @userEmail, @emailSent)
      `);
      stmt.run({
        ...feedback,
        emailSent: feedback.emailSent ? 1 : 0,
      });
    } catch (err) {
      logger.error("insertFeedback failed:", String(err));
    }
  }

  markFeedbackEmailSent(id: string): void {
    if (!db) return;
    try {
      db.prepare("UPDATE feedback SET email_sent = 1 WHERE id = ?").run(id);
    } catch (err) {
      logger.error("markFeedbackEmailSent failed:", String(err));
    }
  }

  // ── User Preferences (key-value) ────────────────────────────────────────

  getUserPreference(userId: string, key: string): string | null {
    if (!db) {
      logger.warn("getUserPreference: DB unavailable");
      return null;
    }
    try {
      const row = db
        .prepare("SELECT value FROM user_preferences WHERE user_id = ? AND key = ?")
        .get(userId, key) as { value: string } | undefined;
      return row?.value ?? null;
    } catch (err) {
      logger.error(`getUserPreference(${key}) failed:`, String(err));
      return null;
    }
  }

  setUserPreference(userId: string, key: string, value: string): void {
    if (!db) {
      logger.warn("setUserPreference: DB unavailable");
      return;
    }
    try {
      db.prepare(
        `INSERT INTO user_preferences (user_id, key, value, updated_at)
         VALUES (?, ?, ?, unixepoch('now') * 1000)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run(userId, key, value);
    } catch (err) {
      logger.error(`setUserPreference(${key}) failed:`, String(err));
    }
  }

  // ── Local Accounts ──────────────────────────────────────────────────────

  createLocalAccount(account: {
    id: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }): void {
    if (!db) throw new Error("DB unavailable");
    db.prepare(
      `INSERT INTO local_accounts (id, email, password_hash, first_name, last_name)
       VALUES (?, ?, ?, ?, ?)`
    ).run(account.id, account.email, account.passwordHash, account.firstName, account.lastName);
  }

  getLocalAccountByEmail(email: string): {
    id: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  } | null {
    if (!db) return null;
    const row = db
      .prepare(
        "SELECT id, email, password_hash, first_name, last_name FROM local_accounts WHERE email = ?"
      )
      .get(email) as
      | { id: string; email: string; password_hash: string; first_name: string; last_name: string }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      firstName: row.first_name,
      lastName: row.last_name,
    };
  }

  getLocalAccountById(id: string): {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null {
    if (!db) return null;
    const row = db
      .prepare("SELECT id, email, first_name, last_name FROM local_accounts WHERE id = ?")
      .get(id) as { id: string; email: string; first_name: string; last_name: string } | undefined;
    if (!row) return null;
    return { id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name };
  }

  getAnyLocalAccount(): { id: string; email: string; firstName: string; lastName: string } | null {
    if (!db) return null;
    const row = db
      .prepare("SELECT id, email, first_name, last_name FROM local_accounts LIMIT 1")
      .get() as { id: string; email: string; first_name: string; last_name: string } | undefined;
    if (!row) return null;
    return { id: row.id, email: row.email, firstName: row.first_name, lastName: row.last_name };
  }

  getAllLocalAccounts(): Array<{ id: string; email: string; firstName: string; lastName: string }> {
    if (!db) return [];
    const rows = db
      .prepare(
        "SELECT id, email, first_name, last_name FROM local_accounts ORDER BY created_at DESC"
      )
      .all() as Array<{ id: string; email: string; first_name: string; last_name: string }>;
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
    }));
  }

  updateLocalAccountPassword(id: string, passwordHash: string): void {
    if (!db) throw new Error("DB unavailable");
    db.prepare(
      `UPDATE local_accounts SET password_hash = ?, updated_at = unixepoch('now') * 1000 WHERE id = ?`
    ).run(passwordHash, id);
  }

  // ── Agent Conversations ────────────────────────────────────────────────

  createAgentConversation(id: string, userId: string, title: string): LocalAgentConversation {
    if (!db) throw new Error("DB unavailable");
    const now = Date.now();
    db.prepare(
      `INSERT INTO agent_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
    ).run(id, userId, title, now, now);
    return { id, userId, title, createdAt: now, updatedAt: now };
  }

  listAgentConversations(userId: string): LocalAgentConversation[] {
    if (!db) return [];
    return mapRows<LocalAgentConversation>(
      db
        .prepare(`SELECT * FROM agent_conversations WHERE user_id = ? ORDER BY updated_at DESC`)
        .all(userId)
    );
  }

  getAgentConversation(id: string, userId: string): LocalAgentConversation | null {
    if (!db) return null;
    return mapRow<LocalAgentConversation>(
      db.prepare(`SELECT * FROM agent_conversations WHERE id = ? AND user_id = ?`).get(id, userId)
    );
  }

  updateAgentConversationTitle(id: string, userId: string, title: string): void {
    if (!db) return;
    db.prepare(
      `UPDATE agent_conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    ).run(title, Date.now(), id, userId);
  }

  touchAgentConversation(id: string): void {
    if (!db) return;
    db.prepare(`UPDATE agent_conversations SET updated_at = ? WHERE id = ?`).run(Date.now(), id);
  }

  deleteAgentConversation(id: string, userId: string): boolean {
    if (!db) return false;
    const result = db
      .prepare(`DELETE FROM agent_conversations WHERE id = ? AND user_id = ?`)
      .run(id, userId);
    return result.changes > 0;
  }

  // ── Agent Messages ─────────────────────────────────────────────────────

  addAgentMessage(
    id: string,
    conversationId: string,
    role: string,
    content: string,
    toolCalls: unknown[] = []
  ): LocalAgentMessage {
    if (!db) throw new Error("DB unavailable");
    const now = Date.now();
    db.prepare(
      `INSERT INTO agent_messages (id, conversation_id, role, content, tool_calls, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, conversationId, role, content, JSON.stringify(toolCalls), now);
    return {
      id,
      conversationId,
      role,
      content,
      toolCalls: JSON.stringify(toolCalls),
      createdAt: now,
    };
  }

  getAgentMessages(conversationId: string): LocalAgentMessage[] {
    if (!db) return [];
    return mapRows<LocalAgentMessage>(
      db
        .prepare(`SELECT * FROM agent_messages WHERE conversation_id = ? ORDER BY created_at ASC`)
        .all(conversationId)
    );
  }

  // ── Local Documents ────────────────────────────────────────────────────

  insertDocument(doc: Omit<LocalDocument, "createdAt" | "updatedAt">): LocalDocument {
    if (!db) throw new Error("DB unavailable");
    const now = Date.now();
    db.prepare(
      `INSERT INTO local_documents (id, user_id, file_path, file_name, file_type, file_size, page_count, chunk_count, status, error, content, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      doc.id,
      doc.userId,
      doc.filePath,
      doc.fileName,
      doc.fileType,
      doc.fileSize,
      doc.pageCount,
      doc.chunkCount,
      doc.status,
      doc.error,
      doc.content ?? null,
      doc.title ?? null,
      now,
      now
    );
    return { ...doc, createdAt: now, updatedAt: now };
  }

  updateDocumentStatus(
    id: string,
    status: string,
    extra?: { chunkCount?: number; pageCount?: number; error?: string | null }
  ): void {
    if (!db) return;
    const sets = ["status = ?", "updated_at = ?"];
    const vals: unknown[] = [status, Date.now()];
    if (extra?.chunkCount !== undefined) {
      sets.push("chunk_count = ?");
      vals.push(extra.chunkCount);
    }
    if (extra?.pageCount !== undefined) {
      sets.push("page_count = ?");
      vals.push(extra.pageCount);
    }
    if (extra?.error !== undefined) {
      sets.push("error = ?");
      vals.push(extra.error);
    }
    vals.push(id);
    db.prepare(`UPDATE local_documents SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }

  updateDocumentContent(id: string, content: string, title?: string): void {
    if (!db) return;
    const sets = ["content = ?", "updated_at = ?"];
    const vals: unknown[] = [content, Date.now()];
    if (title !== undefined) {
      sets.push("title = ?");
      vals.push(title);
    }
    vals.push(id);
    db.prepare(`UPDATE local_documents SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }

  listDocuments(userId: string): LocalDocument[] {
    if (!db) return [];
    return mapRows<LocalDocument>(
      db
        .prepare(`SELECT * FROM local_documents WHERE user_id = ? ORDER BY created_at DESC`)
        .all(userId)
    );
  }

  getDocument(id: string): LocalDocument | null {
    if (!db) return null;
    return mapRow<LocalDocument>(db.prepare(`SELECT * FROM local_documents WHERE id = ?`).get(id));
  }

  deleteDocument(id: string, userId: string): boolean {
    if (!db) return false;
    const result = db
      .prepare(`DELETE FROM local_documents WHERE id = ? AND user_id = ?`)
      .run(id, userId);
    return result.changes > 0;
  }

  // ── Document Chunks ────────────────────────────────────────────────────

  insertDocChunks(
    chunks: Array<{
      id: string;
      documentId: string;
      chunkIndex: number;
      content: string;
      charStart: number;
      charEnd: number;
    }>
  ): void {
    if (!db || chunks.length === 0) return;
    const stmt = db.prepare(
      `INSERT INTO local_doc_chunks (id, document_id, chunk_index, content, char_start, char_end, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const now = Date.now();
    const insertMany = db.transaction((rows: typeof chunks) => {
      for (const c of rows) {
        stmt.run(c.id, c.documentId, c.chunkIndex, c.content, c.charStart, c.charEnd, now);
      }
    });
    insertMany(chunks);
  }

  getDocChunks(documentId: string): LocalDocChunk[] {
    if (!db) return [];
    return mapRows<LocalDocChunk>(
      db
        .prepare(`SELECT * FROM local_doc_chunks WHERE document_id = ? ORDER BY chunk_index ASC`)
        .all(documentId)
    );
  }

  deleteDocChunks(documentId: string): void {
    if (!db) return;
    db.prepare(`DELETE FROM local_doc_chunks WHERE document_id = ?`).run(documentId);
  }

  searchDocChunks(
    query: string,
    userId: string,
    limit = 15
  ): Array<LocalDocChunk & { rank: number; documentName: string }> {
    if (!db) return [];
    return mapRows<LocalDocChunk & { rank: number; documentName: string }>(
      db
        .prepare(
          `
        SELECT c.*, fts.rank, d.file_name AS document_name
        FROM local_doc_chunks_fts fts
        JOIN local_doc_chunks c ON c.rowid = fts.rowid
        JOIN local_documents d ON d.id = c.document_id
        WHERE d.user_id = ?
          AND local_doc_chunks_fts MATCH ?
        ORDER BY fts.rank
        LIMIT ?
      `
        )
        .all(userId, query, limit)
    );
  }
}

export const localDb = new LocalDatabase();
