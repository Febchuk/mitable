/**
 * PGlite Database (Postgres WASM)
 *
 * On-device Postgres database using PGlite (WebAssembly).
 * Includes pgvector for embedding search.
 *
 * Location: {userData}/on-device/mitable-pg/
 */

import { app } from "electron";
import { join } from "path";
import { createLogger } from "../../lib/logger";

const logger = createLogger("PgDb");

// PGlite types and instance
let PGlite: typeof import("@electric-sql/pglite").PGlite | null = null;
let vectorExtension: unknown = null;
let db: import("@electric-sql/pglite").PGlite | null = null;

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
  embedding: number[] | null;
  createdAt: number;
}

export interface LocalAccount {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentConversation {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  toolCalls: string;
  createdAt: number;
}

export interface LocalMonitoringSession {
  id: string;
  userId: string;
  organizationId: string;
  status: "active" | "paused" | "summarizing" | "ended" | "ready" | "failed";
  sessionType: string;
  startedAt: number;
  endedAt: number | null;
  totalPausedMs: number;
  finalSummary: string | null;
  sessionGoal: string | null;
  name: string | null;
  exportPath?: string | null;
}

export interface LocalUser {
  id: string;
  organizationId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  avatarUrl: string | null;
  currentWeek: number;
  startDate: string | null;
  status: string;
  jobTitle: string | null;
  regularTasks: string;
  regularApps: string;
  additionalContext: string | null;
  managerId: string | null;
  teamId: string | null;
  department: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface LocalOrganization {
  id: string;
  name: string;
  domain: string | null;
  settings: string;
  isInternal: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LocalActivityBlock {
  id: string;
  sessionId: string;
  userId: string;
  date: string;
  category: string;
  appName: string;
  description: string;
  clientName: string | null;
  startMs: number;
  endMs: number;
  durationMs: number;
  blockType: string;
  createdAt: number;
}

export interface LocalDailySummary {
  id: string;
  userId: string;
  date: string;
  totalActiveMs: number;
  sessionCount: number;
  categoryBreakdown: string;
  appBreakdown: string;
  updatedAt: number;
}

// ── Postgres Schema ─────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS captures (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  frame_id TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  captured_at BIGINT NOT NULL,
  window_id TEXT NOT NULL,
  app_name TEXT NOT NULL DEFAULT '',
  window_title TEXT NOT NULL DEFAULT '',
  sensor_output TEXT NOT NULL DEFAULT '',
  delta_changed BOOLEAN NOT NULL DEFAULT FALSE,
  change_type TEXT,
  user_action TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
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
  on_task BOOLEAN NOT NULL DEFAULT FALSE,
  task_relevance TEXT,
  importance_score REAL NOT NULL DEFAULT 0,
  raw_output TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_classifications_session ON classifications(session_id);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  narrative TEXT NOT NULL DEFAULT '',
  tasks TEXT NOT NULL DEFAULT '[]',
  time_breakdown TEXT,
  model_used TEXT NOT NULL DEFAULT 'local',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_stories_session ON stories(session_id);

CREATE TABLE IF NOT EXISTS transcriptions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  speaker_id INTEGER NOT NULL DEFAULT 0,
  transcript TEXT NOT NULL DEFAULT '',
  start_time_ms BIGINT NOT NULL,
  end_time_ms BIGINT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  source TEXT NOT NULL DEFAULT 'user',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_transcriptions_session ON transcriptions(session_id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_session_time ON transcriptions(session_id, start_time_ms);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  domain TEXT,
  settings TEXT DEFAULT '{}',
  is_internal BOOLEAN DEFAULT FALSE,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
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
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
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
  started_at BIGINT NOT NULL,
  paused_at BIGINT,
  total_paused_ms BIGINT NOT NULL DEFAULT 0,
  ended_at BIGINT,
  audio_recording_started_at BIGINT,
  audio_recording_total_ms BIGINT NOT NULL DEFAULT 0,
  final_summary TEXT,
  key_activities TEXT DEFAULT '[]',
  accomplishments TEXT DEFAULT '[]',
  blockers TEXT DEFAULT '[]',
  time_breakdown TEXT,
  task_breakdown TEXT,
  export_path TEXT,
  ingestion_status TEXT DEFAULT 'pending',
  delivery_status TEXT,
  delivery_channel TEXT,
  delivery_target TEXT,
  delivered_at BIGINT,
  delivery_error TEXT,
  slack_message_ts TEXT,
  intermediate_summary TEXT,
  intermediate_summary_status TEXT,
  summarization_progress TEXT,
  raw_activity_summary TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
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
  email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS local_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_local_accounts_email ON local_accounts(email);

CREATE TABLE IF NOT EXISTS agent_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_user ON agent_conversations(user_id);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_calls TEXT NOT NULL DEFAULT '[]',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_convo ON agent_messages(conversation_id);

CREATE TABLE IF NOT EXISTS local_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_path TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 1,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  content TEXT,
  title TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_local_documents_user ON local_documents(user_id);

CREATE TABLE IF NOT EXISTS local_doc_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES local_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  char_start INTEGER NOT NULL DEFAULT 0,
  char_end INTEGER NOT NULL DEFAULT 0,
  embedding vector(1536),
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_local_doc_chunks_doc ON local_doc_chunks(document_id);

CREATE TABLE IF NOT EXISTS activity_blocks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  app_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  client_name TEXT,
  start_ms BIGINT NOT NULL,
  end_ms BIGINT NOT NULL,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  block_type TEXT NOT NULL DEFAULT 'work',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_activity_blocks_session ON activity_blocks(session_id);
CREATE INDEX IF NOT EXISTS idx_activity_blocks_user_date ON activity_blocks(user_id, date);
CREATE INDEX IF NOT EXISTS idx_activity_blocks_date ON activity_blocks(date);

CREATE TABLE IF NOT EXISTS daily_summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL UNIQUE,
  total_active_ms BIGINT NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  category_breakdown TEXT NOT NULL DEFAULT '{}',
  app_breakdown TEXT NOT NULL DEFAULT '{}',
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_user_date ON daily_summaries(user_id, date);
`;

// Vector index SQL (created separately after extension is loaded)
const VECTOR_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_doc_chunks_embedding 
ON local_doc_chunks USING hnsw (embedding vector_cosine_ops);
`;

// ── Utility Functions ───────────────────────────────────────────────────────

function snakeToCamel(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = val;
  }
  return out;
}

function mapRows<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => snakeToCamel(r) as T);
}

function mapRow<T>(row: Record<string, unknown> | undefined): T | null {
  if (!row) return null;
  return snakeToCamel(row) as T;
}

// ── Service ─────────────────────────────────────────────────────────────────

class PgDatabase {
  private dbPath: string = "";

  async initialize(): Promise<void> {
    // Use separate paths for dev vs prod
    const dbFolder = app.isPackaged ? "mitable-pg" : "mitable-dev-pg";
    this.dbPath = join(app.getPath("userData"), "on-device", dbFolder);

    const { mkdirSync } = await import("fs");
    mkdirSync(this.dbPath, { recursive: true });

    await this.tryOpen();
  }

  async tryOpen(): Promise<boolean> {
    if (db) return true;

    try {
      const pgliteModule = await import("@electric-sql/pglite");
      PGlite = pgliteModule.PGlite;

      // Load vector extension
      try {
        const vectorModule = await import("@electric-sql/pglite/vector");
        vectorExtension = vectorModule.vector;
      } catch (err) {
        logger.warn("pgvector extension not available:", String(err));
      }

      // Initialize PGlite with file-system persistence and extensions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extensions: any = {};
      if (vectorExtension) {
        extensions.vector = vectorExtension;
      }

      db = new PGlite(`file://${this.dbPath}`, { extensions });

      // Wait for database to be ready
      await db.waitReady;

      // Enable vector extension if available
      if (vectorExtension) {
        try {
          await db.exec("CREATE EXTENSION IF NOT EXISTS vector;");
          logger.info("pgvector extension enabled");
        } catch (err) {
          logger.warn("Failed to create vector extension:", String(err));
        }
      }

      // Run schema
      await db.exec(SCHEMA_SQL);

      // Create vector index (may fail on first run if no data)
      if (vectorExtension) {
        try {
          await db.exec(VECTOR_INDEX_SQL);
        } catch {
          logger.debug("Vector index creation deferred (no data yet)");
        }
      }

      logger.info("PGlite database initialized at", this.dbPath);
      return true;
    } catch (err) {
      logger.error("Failed to initialize PGlite database:", String(err));
      return false;
    }
  }

  isAvailable(): boolean {
    return db !== null;
  }

  // ── Captures ────────────────────────────────────────────────────────────

  async insertCapture(capture: Omit<LocalCapture, "createdAt">): Promise<void> {
    if (!db) {
      logger.error("insertCapture: DB unavailable, dropping frame", capture.frameId);
      return;
    }
    try {
      await db.query(
        `INSERT INTO captures 
          (id, session_id, frame_id, sequence_number, captured_at, window_id,
           app_name, window_title, sensor_output, delta_changed, change_type, user_action)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           sensor_output = EXCLUDED.sensor_output,
           delta_changed = EXCLUDED.delta_changed,
           change_type = EXCLUDED.change_type,
           user_action = EXCLUDED.user_action`,
        [
          capture.id,
          capture.sessionId,
          capture.frameId,
          capture.sequenceNumber,
          capture.capturedAt,
          capture.windowId,
          capture.appName,
          capture.windowTitle,
          capture.sensorOutput,
          capture.deltaChanged,
          capture.changeType,
          capture.userAction,
        ]
      );
    } catch (err) {
      logger.error("insertCapture failed:", String(err), {
        session: capture.sessionId,
        frame: capture.frameId,
      });
    }
  }

  async getCapturesForSession(sessionId: string): Promise<LocalCapture[]> {
    if (!db) {
      logger.warn("getCapturesForSession: DB unavailable");
      return [];
    }
    const result = await db.query(
      `SELECT * FROM captures WHERE session_id = $1 ORDER BY sequence_number ASC`,
      [sessionId]
    );
    return mapRows<LocalCapture>(result.rows as Record<string, unknown>[]);
  }

  async getCaptureRange(
    sessionId: string,
    startSeq: number,
    endSeq: number
  ): Promise<LocalCapture[]> {
    if (!db) {
      logger.warn("getCaptureRange: DB unavailable");
      return [];
    }
    const result = await db.query(
      `SELECT * FROM captures 
       WHERE session_id = $1 AND sequence_number BETWEEN $2 AND $3
       ORDER BY sequence_number ASC`,
      [sessionId, startSeq, endSeq]
    );
    return mapRows<LocalCapture>(result.rows as Record<string, unknown>[]);
  }

  async getCaptureCount(sessionId: string): Promise<number> {
    if (!db) return 0;
    const result = await db.query(`SELECT COUNT(*) as cnt FROM captures WHERE session_id = $1`, [
      sessionId,
    ]);
    const row = result.rows[0] as { cnt: string } | undefined;
    return row ? parseInt(row.cnt, 10) : 0;
  }

  /**
   * All captures for a user that overlap a date range.
   * Used by blockAggregator to compute per-app "active capture time" for the
   * daily summary, since per-block durations are an unreliable proxy.
   *
   * `startMs` / `endMs` are inclusive epoch-ms bounds. The captures table
   * doesn't have a user_id column directly, so we join through
   * monitoring_sessions.
   */
  async getCapturesForUserDateRange(
    userId: string,
    startMs: number,
    endMs: number
  ): Promise<LocalCapture[]> {
    if (!db) return [];
    const result = await db.query(
      `SELECT c.* FROM captures c
       JOIN monitoring_sessions s ON s.id = c.session_id
       WHERE s.user_id = $1
         AND c.captured_at >= $2
         AND c.captured_at <= $3
       ORDER BY c.captured_at ASC`,
      [userId, startMs, endMs]
    );
    return mapRows<LocalCapture>(result.rows as Record<string, unknown>[]);
  }

  // ── Classifications ─────────────────────────────────────────────────────

  async insertClassification(
    classification: Omit<LocalClassification, "createdAt">
  ): Promise<void> {
    if (!db) {
      logger.error(
        "insertClassification: DB unavailable, dropping batch",
        String(classification.batchIndex)
      );
      return;
    }
    try {
      await db.query(
        `INSERT INTO classifications
          (id, session_id, batch_index, start_sequence, end_sequence,
           activity_description, activity_type, on_task, task_relevance,
           importance_score, raw_output)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           activity_description = EXCLUDED.activity_description,
           activity_type = EXCLUDED.activity_type,
           on_task = EXCLUDED.on_task,
           task_relevance = EXCLUDED.task_relevance,
           importance_score = EXCLUDED.importance_score,
           raw_output = EXCLUDED.raw_output`,
        [
          classification.id,
          classification.sessionId,
          classification.batchIndex,
          classification.startSequence,
          classification.endSequence,
          classification.activityDescription,
          classification.activityType,
          classification.onTask,
          classification.taskRelevance,
          classification.importanceScore,
          classification.rawOutput,
        ]
      );
    } catch (err) {
      logger.error("insertClassification failed:", String(err), {
        session: classification.sessionId,
        batch: classification.batchIndex,
      });
    }
  }

  async getClassificationsForSession(sessionId: string): Promise<LocalClassification[]> {
    if (!db) {
      logger.warn("getClassificationsForSession: DB unavailable");
      return [];
    }
    const result = await db.query(
      `SELECT * FROM classifications WHERE session_id = $1 ORDER BY batch_index ASC`,
      [sessionId]
    );
    return mapRows<LocalClassification>(result.rows as Record<string, unknown>[]);
  }

  async getClassificationCount(sessionId: string): Promise<number> {
    if (!db) return 0;
    const result = await db.query(
      `SELECT COUNT(*) as cnt FROM classifications WHERE session_id = $1`,
      [sessionId]
    );
    const row = result.rows[0] as { cnt: string } | undefined;
    return row ? parseInt(row.cnt, 10) : 0;
  }

  async updateClassificationDescription(id: string, description: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(`UPDATE classifications SET activity_description = $1 WHERE id = $2`, [
        description,
        id,
      ]);
    } catch (err) {
      logger.error("updateClassificationDescription failed:", String(err));
    }
  }

  // ── Stories ─────────────────────────────────────────────────────────────

  async insertStory(story: Omit<LocalStory, "createdAt">): Promise<void> {
    if (!db) {
      logger.error("insertStory: DB unavailable, dropping story for session", story.sessionId);
      return;
    }
    try {
      await db.query(
        `INSERT INTO stories (id, session_id, narrative, tasks, time_breakdown, model_used)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           narrative = EXCLUDED.narrative,
           tasks = EXCLUDED.tasks,
           time_breakdown = EXCLUDED.time_breakdown,
           model_used = EXCLUDED.model_used`,
        [
          story.id,
          story.sessionId,
          story.narrative,
          story.tasks,
          story.timeBreakdown,
          story.modelUsed,
        ]
      );
    } catch (err) {
      logger.error("insertStory failed:", String(err), { session: story.sessionId });
    }
  }

  async getStoryForSession(sessionId: string): Promise<LocalStory | null> {
    if (!db) {
      logger.warn("getStoryForSession: DB unavailable");
      return null;
    }
    const result = await db.query(`SELECT * FROM stories WHERE session_id = $1`, [sessionId]);
    return mapRow<LocalStory>(result.rows[0] as Record<string, unknown> | undefined);
  }

  async deleteStoryForSession(sessionId: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(`DELETE FROM stories WHERE session_id = $1`, [sessionId]);
    } catch (err) {
      logger.error("deleteStoryForSession failed:", String(err));
    }
  }

  async deleteCapturesForSession(sessionId: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(`DELETE FROM captures WHERE session_id = $1`, [sessionId]);
    } catch (err) {
      logger.error("deleteCapturesForSession failed:", String(err));
    }
  }

  async deleteClassificationsForSession(sessionId: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(`DELETE FROM classifications WHERE session_id = $1`, [sessionId]);
    } catch (err) {
      logger.error("deleteClassificationsForSession failed:", String(err));
    }
  }

  async getAllStories(): Promise<LocalStory[]> {
    if (!db) {
      logger.warn("getAllStories: DB unavailable");
      return [];
    }
    const result = await db.query(`SELECT * FROM stories ORDER BY created_at ASC`);
    return mapRows<LocalStory>(result.rows as Record<string, unknown>[]);
  }

  // ── Transcriptions ──────────────────────────────────────────────────────

  async insertTranscription(transcription: Omit<LocalTranscription, "createdAt">): Promise<void> {
    if (!db) {
      logger.error(
        "insertTranscription: DB unavailable, dropping chunk",
        String(transcription.chunkIndex)
      );
      return;
    }
    try {
      await db.query(
        `INSERT INTO transcriptions
          (id, session_id, chunk_index, speaker_id, transcript, start_time_ms,
           end_time_ms, confidence, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           transcript = EXCLUDED.transcript,
           confidence = EXCLUDED.confidence`,
        [
          transcription.id,
          transcription.sessionId,
          transcription.chunkIndex,
          transcription.speakerId,
          transcription.transcript,
          transcription.startTimeMs,
          transcription.endTimeMs,
          transcription.confidence,
          transcription.source,
        ]
      );
    } catch (err) {
      logger.error("insertTranscription failed:", String(err), {
        session: transcription.sessionId,
        chunk: transcription.chunkIndex,
      });
    }
  }

  async getTranscriptionsForSession(sessionId: string): Promise<LocalTranscription[]> {
    if (!db) {
      logger.warn("getTranscriptionsForSession: DB unavailable");
      return [];
    }
    const result = await db.query(
      `SELECT * FROM transcriptions WHERE session_id = $1 ORDER BY start_time_ms ASC`,
      [sessionId]
    );
    return mapRows<LocalTranscription>(result.rows as Record<string, unknown>[]);
  }

  async getTranscriptionCount(sessionId: string): Promise<number> {
    if (!db) return 0;
    const result = await db.query(
      `SELECT COUNT(*) as cnt FROM transcriptions WHERE session_id = $1`,
      [sessionId]
    );
    const row = result.rows[0] as { cnt: string } | undefined;
    return row ? parseInt(row.cnt, 10) : 0;
  }

  async deleteTranscriptionsForSession(sessionId: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(`DELETE FROM transcriptions WHERE session_id = $1`, [sessionId]);
    } catch (err) {
      logger.error("deleteTranscriptionsForSession failed:", String(err));
    }
  }

  // ── User Preferences ────────────────────────────────────────────────────

  async setUserPreference(userId: string, key: string, value: string): Promise<void> {
    if (!db) {
      logger.warn("setUserPreference: DB unavailable");
      return;
    }
    try {
      await db.query(
        `INSERT INTO user_preferences (user_id, key, value, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_at = EXCLUDED.updated_at`,
        [userId, key, value, Date.now()]
      );
    } catch (err) {
      logger.error("setUserPreference failed:", String(err));
    }
  }

  async getUserPreference(userId: string, key: string): Promise<string | null> {
    if (!db) {
      logger.warn("getUserPreference: DB unavailable");
      return null;
    }
    try {
      const result = await db.query(
        `SELECT value FROM user_preferences WHERE user_id = $1 AND key = $2`,
        [userId, key]
      );
      const row = result.rows[0] as { value: string } | undefined;
      return row?.value ?? null;
    } catch (err) {
      logger.error("getUserPreference failed:", String(err));
      return null;
    }
  }

  async deleteUserPreference(userId: string, key: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(`DELETE FROM user_preferences WHERE user_id = $1 AND key = $2`, [userId, key]);
    } catch (err) {
      logger.error("deleteUserPreference failed:", String(err));
    }
  }

  // ── Local Accounts ──────────────────────────────────────────────────────

  async createLocalAccount(account: Omit<LocalAccount, "createdAt" | "updatedAt">): Promise<void> {
    if (!db) {
      logger.error("createLocalAccount: DB unavailable");
      return;
    }
    try {
      const now = Date.now();
      await db.query(
        `INSERT INTO local_accounts (id, email, password_hash, first_name, last_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          account.id,
          account.email,
          account.passwordHash,
          account.firstName,
          account.lastName,
          now,
          now,
        ]
      );
    } catch (err) {
      logger.error("createLocalAccount failed:", String(err));
      throw err;
    }
  }

  /** For migration: insert account with all fields including timestamps */
  async createLocalAccountRaw(account: LocalAccount): Promise<void> {
    if (!db) {
      logger.error("createLocalAccountRaw: DB unavailable");
      return;
    }
    try {
      await db.query(
        `INSERT INTO local_accounts (id, email, password_hash, first_name, last_name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          account.id,
          account.email,
          account.passwordHash,
          account.firstName,
          account.lastName,
          account.createdAt,
          account.updatedAt,
        ]
      );
    } catch (err) {
      logger.error("createLocalAccountRaw failed:", String(err));
      throw err;
    }
  }

  async getLocalAccountByEmail(email: string): Promise<LocalAccount | null> {
    if (!db) {
      logger.warn("getLocalAccountByEmail: DB unavailable");
      return null;
    }
    const result = await db.query(`SELECT * FROM local_accounts WHERE LOWER(email) = LOWER($1)`, [
      email,
    ]);
    return mapRow<LocalAccount>(result.rows[0] as Record<string, unknown> | undefined);
  }

  async getLocalAccountById(id: string): Promise<LocalAccount | null> {
    if (!db) {
      logger.warn("getLocalAccountById: DB unavailable");
      return null;
    }
    const result = await db.query(`SELECT * FROM local_accounts WHERE id = $1`, [id]);
    return mapRow<LocalAccount>(result.rows[0] as Record<string, unknown> | undefined);
  }

  async getAllLocalAccounts(): Promise<LocalAccount[]> {
    if (!db) {
      logger.warn("getAllLocalAccounts: DB unavailable");
      return [];
    }
    const result = await db.query(`SELECT * FROM local_accounts ORDER BY created_at DESC`);
    return mapRows<LocalAccount>(result.rows as Record<string, unknown>[]);
  }

  // ── Agent Conversations ─────────────────────────────────────────────────

  async createAgentConversation(
    conversation: Omit<AgentConversation, "createdAt" | "updatedAt">
  ): Promise<void> {
    if (!db) {
      logger.error("createAgentConversation: DB unavailable");
      return;
    }
    try {
      const now = Date.now();
      await db.query(
        `INSERT INTO agent_conversations (id, user_id, title, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [conversation.id, conversation.userId, conversation.title, now, now]
      );
    } catch (err) {
      logger.error("createAgentConversation failed:", String(err));
    }
  }

  async getAgentConversation(id: string): Promise<AgentConversation | null> {
    if (!db) return null;
    const result = await db.query(`SELECT * FROM agent_conversations WHERE id = $1`, [id]);
    return mapRow<AgentConversation>(result.rows[0] as Record<string, unknown> | undefined);
  }

  async getAgentConversationsForUser(userId: string): Promise<AgentConversation[]> {
    if (!db) return [];
    const result = await db.query(
      `SELECT * FROM agent_conversations WHERE user_id = $1 ORDER BY updated_at DESC`,
      [userId]
    );
    return mapRows<AgentConversation>(result.rows as Record<string, unknown>[]);
  }

  async updateAgentConversationTitle(id: string, title: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(`UPDATE agent_conversations SET title = $1, updated_at = $2 WHERE id = $3`, [
        title,
        Date.now(),
        id,
      ]);
    } catch (err) {
      logger.error("updateAgentConversationTitle failed:", String(err));
    }
  }

  async deleteAgentConversation(id: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(`DELETE FROM agent_conversations WHERE id = $1`, [id]);
    } catch (err) {
      logger.error("deleteAgentConversation failed:", String(err));
    }
  }

  // ── Agent Messages ──────────────────────────────────────────────────────

  async insertAgentMessage(message: Omit<AgentMessage, "createdAt">): Promise<void> {
    if (!db) {
      logger.error("insertAgentMessage: DB unavailable");
      return;
    }
    try {
      await db.query(
        `INSERT INTO agent_messages (id, conversation_id, role, content, tool_calls, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          message.id,
          message.conversationId,
          message.role,
          message.content,
          message.toolCalls,
          Date.now(),
        ]
      );
      // Update conversation's updated_at
      await db.query(`UPDATE agent_conversations SET updated_at = $1 WHERE id = $2`, [
        Date.now(),
        message.conversationId,
      ]);
    } catch (err) {
      logger.error("insertAgentMessage failed:", String(err));
    }
  }

  async getAgentMessagesForConversation(conversationId: string): Promise<AgentMessage[]> {
    if (!db) return [];
    const result = await db.query(
      `SELECT * FROM agent_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId]
    );
    return mapRows<AgentMessage>(result.rows as Record<string, unknown>[]);
  }

  // ── Local Documents ─────────────────────────────────────────────────────

  async insertLocalDocument(doc: Omit<LocalDocument, "createdAt" | "updatedAt">): Promise<void> {
    if (!db) {
      logger.error("insertLocalDocument: DB unavailable");
      return;
    }
    try {
      const now = Date.now();
      await db.query(
        `INSERT INTO local_documents 
          (id, user_id, file_path, file_name, file_type, file_size, page_count, 
           chunk_count, status, error, content, title, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           error = EXCLUDED.error,
           chunk_count = EXCLUDED.chunk_count,
           content = EXCLUDED.content,
           title = EXCLUDED.title,
           updated_at = EXCLUDED.updated_at`,
        [
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
          doc.content,
          doc.title,
          now,
          now,
        ]
      );
    } catch (err) {
      logger.error("insertLocalDocument failed:", String(err));
    }
  }

  async getLocalDocument(id: string): Promise<LocalDocument | null> {
    if (!db) return null;
    const result = await db.query(`SELECT * FROM local_documents WHERE id = $1`, [id]);
    return mapRow<LocalDocument>(result.rows[0] as Record<string, unknown> | undefined);
  }

  async getLocalDocumentsForUser(userId: string): Promise<LocalDocument[]> {
    if (!db) return [];
    const result = await db.query(
      `SELECT * FROM local_documents WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return mapRows<LocalDocument>(result.rows as Record<string, unknown>[]);
  }

  async updateLocalDocumentStatus(id: string, status: string, error?: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(
        `UPDATE local_documents SET status = $1, error = $2, updated_at = $3 WHERE id = $4`,
        [status, error ?? null, Date.now(), id]
      );
    } catch (err) {
      logger.error("updateLocalDocumentStatus failed:", String(err));
    }
  }

  async deleteLocalDocument(id: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(`DELETE FROM local_documents WHERE id = $1`, [id]);
    } catch (err) {
      logger.error("deleteLocalDocument failed:", String(err));
    }
  }

  // ── Document Chunks ─────────────────────────────────────────────────────

  async insertDocChunk(chunk: Omit<LocalDocChunk, "createdAt">): Promise<void> {
    if (!db) {
      logger.error("insertDocChunk: DB unavailable");
      return;
    }
    try {
      const embeddingStr = chunk.embedding ? `[${chunk.embedding.join(",")}]` : null;
      await db.query(
        `INSERT INTO local_doc_chunks 
          (id, document_id, chunk_index, content, char_start, char_end, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
         ON CONFLICT (id) DO UPDATE SET
           content = EXCLUDED.content,
           embedding = EXCLUDED.embedding`,
        [
          chunk.id,
          chunk.documentId,
          chunk.chunkIndex,
          chunk.content,
          chunk.charStart,
          chunk.charEnd,
          embeddingStr,
        ]
      );
    } catch (err) {
      logger.error("insertDocChunk failed:", String(err));
    }
  }

  async getDocChunksForDocument(documentId: string): Promise<LocalDocChunk[]> {
    if (!db) return [];
    const result = await db.query(
      `SELECT id, document_id, chunk_index, content, char_start, char_end, 
              embedding::text, created_at 
       FROM local_doc_chunks WHERE document_id = $1 ORDER BY chunk_index ASC`,
      [documentId]
    );
    return mapRows<LocalDocChunk>(result.rows as Record<string, unknown>[]);
  }

  async deleteDocChunksForDocument(documentId: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(`DELETE FROM local_doc_chunks WHERE document_id = $1`, [documentId]);
    } catch (err) {
      logger.error("deleteDocChunksForDocument failed:", String(err));
    }
  }

  // ── Vector Search (RAG) ─────────────────────────────────────────────────

  async searchDocChunksByEmbedding(
    embedding: number[],
    userId: string,
    limit: number = 5
  ): Promise<Array<LocalDocChunk & { distance: number }>> {
    if (!db) {
      logger.warn("searchDocChunksByEmbedding: DB unavailable");
      return [];
    }
    if (!vectorExtension) {
      logger.warn("searchDocChunksByEmbedding: Vector extension not available, use keyword search");
      return [];
    }
    try {
      const embeddingStr = `[${embedding.join(",")}]`;
      const result = await db.query(
        `SELECT c.id, c.document_id, c.chunk_index, c.content, c.char_start, c.char_end,
                c.embedding::text, c.created_at,
                c.embedding <=> $1::vector AS distance
         FROM local_doc_chunks c
         JOIN local_documents d ON c.document_id = d.id
         WHERE d.user_id = $2 AND c.embedding IS NOT NULL
         ORDER BY distance ASC
         LIMIT $3`,
        [embeddingStr, userId, limit]
      );
      return result.rows.map((row) => {
        const mapped = snakeToCamel(row as Record<string, unknown>);
        return {
          ...mapped,
          distance: parseFloat(String(mapped.distance)),
        } as LocalDocChunk & { distance: number };
      });
    } catch (err) {
      logger.error("searchDocChunksByEmbedding failed:", String(err));
      return [];
    }
  }

  // ── Keyword Search (Full-Text) ──────────────────────────────────────────

  async searchDocChunksByKeyword(
    query: string,
    userId: string,
    limit: number = 10
  ): Promise<LocalDocChunk[]> {
    if (!db) {
      logger.warn("searchDocChunksByKeyword: DB unavailable");
      return [];
    }
    try {
      // Use ILIKE for simple keyword search (Postgres doesn't have FTS5)
      const pattern = `%${query}%`;
      const result = await db.query(
        `SELECT c.* FROM local_doc_chunks c
         JOIN local_documents d ON c.document_id = d.id
         WHERE d.user_id = $1 AND c.content ILIKE $2
         ORDER BY c.created_at DESC
         LIMIT $3`,
        [userId, pattern, limit]
      );
      return mapRows<LocalDocChunk>(result.rows as Record<string, unknown>[]);
    } catch (err) {
      logger.error("searchDocChunksByKeyword failed:", String(err));
      return [];
    }
  }

  // ── Monitoring Sessions ─────────────────────────────────────────────────

  async insertMonitoringSession(session: LocalMonitoringSession): Promise<void> {
    if (!db) {
      logger.error("insertMonitoringSession: DB unavailable");
      return;
    }
    try {
      const now = Date.now();
      await db.query(
        `INSERT INTO monitoring_sessions 
          (id, organization_id, user_id, status, session_type, started_at, 
           ended_at, total_paused_ms, final_summary, session_goal, name, export_path,
           created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           ended_at = EXCLUDED.ended_at,
           total_paused_ms = EXCLUDED.total_paused_ms,
           final_summary = EXCLUDED.final_summary,
           export_path = EXCLUDED.export_path,
           updated_at = EXCLUDED.updated_at`,
        [
          session.id,
          session.organizationId,
          session.userId,
          session.status,
          session.sessionType,
          session.startedAt,
          session.endedAt,
          session.totalPausedMs,
          session.finalSummary,
          session.sessionGoal,
          session.name,
          session.exportPath ?? null,
          now,
          now,
        ]
      );
    } catch (err) {
      logger.error("insertMonitoringSession failed:", String(err));
    }
  }

  async getMonitoringSession(id: string): Promise<LocalMonitoringSession | null> {
    if (!db) return null;
    const result = await db.query(`SELECT * FROM monitoring_sessions WHERE id = $1`, [id]);
    return mapRow<LocalMonitoringSession>(result.rows[0] as Record<string, unknown> | undefined);
  }

  async getMonitoringSessionsForUser(
    userId: string,
    limit: number = 50
  ): Promise<LocalMonitoringSession[]> {
    if (!db) return [];
    const result = await db.query(
      `SELECT * FROM monitoring_sessions WHERE user_id = $1 
       ORDER BY started_at DESC LIMIT $2`,
      [userId, limit]
    );
    return mapRows<LocalMonitoringSession>(result.rows as Record<string, unknown>[]);
  }

  async updateMonitoringSessionStatus(
    id: string,
    status: "active" | "paused" | "summarizing" | "ended" | "ready" | "failed",
    endedAt?: number,
    errorMessage?: string
  ): Promise<void> {
    if (!db) return;
    try {
      await db.query(
        `UPDATE monitoring_sessions SET status = $1, ended_at = $2, updated_at = $3, final_summary = COALESCE($4, final_summary) WHERE id = $5`,
        [status, endedAt ?? null, Date.now(), errorMessage ?? null, id]
      );
    } catch (err) {
      logger.error("updateMonitoringSessionStatus failed:", String(err));
    }
  }

  async updateMonitoringSessionSummary(id: string, summary: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(
        `UPDATE monitoring_sessions SET final_summary = $1, updated_at = $2 WHERE id = $3`,
        [summary, Date.now(), id]
      );
    } catch (err) {
      logger.error("updateMonitoringSessionSummary failed:", String(err));
    }
  }

  async setExportPath(sessionId: string, exportPath: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(
        `UPDATE monitoring_sessions SET export_path = $1, updated_at = $2 WHERE id = $3`,
        [exportPath, Date.now(), sessionId]
      );
    } catch (err) {
      logger.error("setExportPath failed:", String(err));
    }
  }

  async getExportPath(sessionId: string): Promise<string | null> {
    if (!db) return null;
    const result = await db.query(`SELECT export_path FROM monitoring_sessions WHERE id = $1`, [
      sessionId,
    ]);
    const row = result.rows[0] as { export_path: string | null } | undefined;
    return row?.export_path ?? null;
  }

  async deleteMonitoringSession(id: string): Promise<void> {
    if (!db) return;
    try {
      // Delete related data first
      await db.query(`DELETE FROM activity_blocks WHERE session_id = $1`, [id]);
      await db.query(`DELETE FROM captures WHERE session_id = $1`, [id]);
      await db.query(`DELETE FROM classifications WHERE session_id = $1`, [id]);
      await db.query(`DELETE FROM stories WHERE session_id = $1`, [id]);
      await db.query(`DELETE FROM transcriptions WHERE session_id = $1`, [id]);
      await db.query(`DELETE FROM monitoring_sessions WHERE id = $1`, [id]);
    } catch (err) {
      logger.error("deleteMonitoringSession failed:", String(err));
    }
  }

  // ── Activity Blocks ─────────────────────────────────────────────────────

  async insertActivityBlock(block: Omit<LocalActivityBlock, "createdAt">): Promise<void> {
    if (!db) {
      logger.error("insertActivityBlock: DB unavailable");
      return;
    }
    try {
      await db.query(
        `INSERT INTO activity_blocks
          (id, session_id, user_id, date, category, app_name, description,
           client_name, start_ms, end_ms, duration_ms, block_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           category = EXCLUDED.category,
           description = EXCLUDED.description,
           client_name = EXCLUDED.client_name,
           duration_ms = EXCLUDED.duration_ms`,
        [
          block.id,
          block.sessionId,
          block.userId,
          block.date,
          block.category,
          block.appName,
          block.description,
          block.clientName,
          block.startMs,
          block.endMs,
          block.durationMs,
          block.blockType,
        ]
      );
    } catch (err) {
      logger.error("insertActivityBlock failed:", String(err));
    }
  }

  async getActivityBlocksForDate(userId: string, date: string): Promise<LocalActivityBlock[]> {
    if (!db) return [];
    const result = await db.query(
      `SELECT * FROM activity_blocks WHERE user_id = $1 AND date = $2 ORDER BY start_ms ASC`,
      [userId, date]
    );
    return mapRows<LocalActivityBlock>(result.rows as Record<string, unknown>[]);
  }

  async getActivityBlocksForDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<LocalActivityBlock[]> {
    if (!db) return [];
    const result = await db.query(
      `SELECT * FROM activity_blocks
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       ORDER BY start_ms ASC`,
      [userId, startDate, endDate]
    );
    return mapRows<LocalActivityBlock>(result.rows as Record<string, unknown>[]);
  }

  async getActivityBlocksForSession(sessionId: string): Promise<LocalActivityBlock[]> {
    if (!db) return [];
    const result = await db.query(
      `SELECT * FROM activity_blocks WHERE session_id = $1 ORDER BY start_ms ASC`,
      [sessionId]
    );
    return mapRows<LocalActivityBlock>(result.rows as Record<string, unknown>[]);
  }

  async deleteActivityBlocksForSession(sessionId: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(`DELETE FROM activity_blocks WHERE session_id = $1`, [sessionId]);
    } catch (err) {
      logger.error("deleteActivityBlocksForSession failed:", String(err));
    }
  }

  // ── Daily Summaries ────────────────────────────────────────────────────

  async upsertDailySummary(summary: Omit<LocalDailySummary, "updatedAt">): Promise<void> {
    if (!db) {
      logger.error("upsertDailySummary: DB unavailable");
      return;
    }
    try {
      await db.query(
        `INSERT INTO daily_summaries
          (id, user_id, date, total_active_ms, session_count, category_breakdown, app_breakdown, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           total_active_ms = EXCLUDED.total_active_ms,
           session_count = EXCLUDED.session_count,
           category_breakdown = EXCLUDED.category_breakdown,
           app_breakdown = EXCLUDED.app_breakdown,
           updated_at = EXCLUDED.updated_at`,
        [
          summary.id,
          summary.userId,
          summary.date,
          summary.totalActiveMs,
          summary.sessionCount,
          summary.categoryBreakdown,
          summary.appBreakdown,
          Date.now(),
        ]
      );
    } catch (err) {
      logger.error("upsertDailySummary failed:", String(err));
    }
  }

  async getDailySummary(userId: string, date: string): Promise<LocalDailySummary | null> {
    if (!db) return null;
    const result = await db.query(
      `SELECT * FROM daily_summaries WHERE user_id = $1 AND date = $2`,
      [userId, date]
    );
    return mapRow<LocalDailySummary>(result.rows[0] as Record<string, unknown> | undefined);
  }

  async getDailySummariesForRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<LocalDailySummary[]> {
    if (!db) return [];
    const result = await db.query(
      `SELECT * FROM daily_summaries
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date ASC`,
      [userId, startDate, endDate]
    );
    return mapRows<LocalDailySummary>(result.rows as Record<string, unknown>[]);
  }

  // ── Feedback ────────────────────────────────────────────────────────────

  async insertFeedback(feedback: Omit<LocalFeedback, "createdAt">): Promise<void> {
    if (!db) {
      logger.error("insertFeedback: DB unavailable");
      return;
    }
    try {
      await db.query(
        `INSERT INTO feedback (id, message, log_analysis, user_name, user_email, email_sent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          feedback.id,
          feedback.message,
          feedback.logAnalysis,
          feedback.userName,
          feedback.userEmail,
          feedback.emailSent,
        ]
      );
    } catch (err) {
      logger.error("insertFeedback failed:", String(err));
    }
  }

  // ── Organizations ───────────────────────────────────────────────────────

  async upsertOrganization(org: LocalOrganization): Promise<void> {
    if (!db) return;
    try {
      await db.query(
        `INSERT INTO organizations (id, name, domain, settings, is_internal, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           domain = EXCLUDED.domain,
           settings = EXCLUDED.settings,
           updated_at = EXCLUDED.updated_at`,
        [org.id, org.name, org.domain, org.settings, org.isInternal, org.createdAt, org.updatedAt]
      );
    } catch (err) {
      logger.error("upsertOrganization failed:", String(err));
    }
  }

  async getOrganization(id: string): Promise<LocalOrganization | null> {
    if (!db) return null;
    const result = await db.query(`SELECT * FROM organizations WHERE id = $1`, [id]);
    return mapRow<LocalOrganization>(result.rows[0] as Record<string, unknown> | undefined);
  }

  // ── Users ───────────────────────────────────────────────────────────────

  async upsertUser(user: LocalUser): Promise<void> {
    if (!db) return;
    try {
      await db.query(
        `INSERT INTO users 
          (id, organization_id, email, first_name, last_name, role, avatar_url,
           current_week, start_date, status, job_title, regular_tasks, regular_apps,
           additional_context, manager_id, team_id, department, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           role = EXCLUDED.role,
           updated_at = EXCLUDED.updated_at`,
        [
          user.id,
          user.organizationId,
          user.email,
          user.firstName,
          user.lastName,
          user.role,
          user.avatarUrl,
          user.currentWeek,
          user.startDate,
          user.status,
          user.jobTitle,
          user.regularTasks,
          user.regularApps,
          user.additionalContext,
          user.managerId,
          user.teamId,
          user.department,
          user.createdAt,
          user.updatedAt,
        ]
      );
    } catch (err) {
      logger.error("upsertUser failed:", String(err));
    }
  }

  async getUser(id: string): Promise<LocalUser | null> {
    if (!db) return null;
    const result = await db.query(`SELECT * FROM users WHERE id = $1`, [id]);
    return mapRow<LocalUser>(result.rows[0] as Record<string, unknown> | undefined);
  }

  async getUserByEmail(email: string): Promise<LocalUser | null> {
    if (!db) return null;
    const result = await db.query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
    return mapRow<LocalUser>(result.rows[0] as Record<string, unknown> | undefined);
  }

  // ── Extended Session Methods ─────────────────────────────────────────────

  async getTranscriptionRange(
    sessionId: string,
    startMs: number,
    endMs: number
  ): Promise<LocalTranscription[]> {
    if (!db) {
      logger.warn("getTranscriptionRange: DB unavailable");
      return [];
    }
    const result = await db.query(
      `SELECT * FROM transcriptions
       WHERE session_id = $1 AND start_time_ms >= $2 AND end_time_ms <= $3
       ORDER BY start_time_ms ASC`,
      [sessionId, startMs, endMs]
    );
    return mapRows<LocalTranscription>(result.rows as Record<string, unknown>[]);
  }

  async getSessionsByStatus(status: string): Promise<LocalMonitoringSession[]> {
    if (!db) return [];
    const result = await db.query(
      `SELECT * FROM monitoring_sessions WHERE status = $1 ORDER BY started_at DESC`,
      [status]
    );
    return mapRows<LocalMonitoringSession>(result.rows as Record<string, unknown>[]);
  }

  async getMonitoringSessionsByDateRange(
    userId: string,
    startMs: number,
    endMs: number
  ): Promise<LocalMonitoringSession[]> {
    if (!db) return [];
    const result = await db.query(
      `SELECT * FROM monitoring_sessions
       WHERE user_id = $1 AND started_at >= $2 AND started_at < $3
       ORDER BY started_at ASC`,
      [userId, startMs, endMs]
    );
    return mapRows<LocalMonitoringSession>(result.rows as Record<string, unknown>[]);
  }

  async getAllSessionsByDateRange(
    startMs: number,
    endMs: number
  ): Promise<LocalMonitoringSession[]> {
    if (!db) return [];

    const result = await db.query(
      `SELECT * FROM monitoring_sessions
       WHERE started_at >= $1 AND started_at < $2
       ORDER BY started_at ASC`,
      [startMs, endMs]
    );
    const tracked = mapRows<LocalMonitoringSession>(result.rows as Record<string, unknown>[]);

    // Fallback: reconstruct from captures for legacy sessions that have
    // no monitoring_sessions row at all (pre-migration data only).
    const trackedIds = new Set(tracked.map((s) => s.id));
    const legacyResult = await db.query(
      `SELECT session_id,
              MIN(captured_at) as first_capture,
              MAX(captured_at) as last_capture
       FROM captures
       WHERE captured_at >= $1 AND captured_at < $2
       GROUP BY session_id
       ORDER BY MIN(captured_at) ASC`,
      [startMs, endMs]
    );

    for (const row of legacyResult.rows as Array<{
      session_id: string;
      first_capture: string;
      last_capture: string;
    }>) {
      if (trackedIds.has(row.session_id)) continue;

      // Skip if this session exists in monitoring_sessions (just outside date range)
      const existing = await this.getMonitoringSession(row.session_id);
      if (existing) continue;

      const story = await this.getStoryForSession(row.session_id);
      tracked.push({
        id: row.session_id,
        userId: "",
        organizationId: "",
        name: null,
        sessionGoal: null,
        sessionType: "monitoring",
        status: story ? "ended" : "ended",
        startedAt: parseInt(row.first_capture, 10),
        endedAt: parseInt(row.last_capture, 10),
        totalPausedMs: 0,
        finalSummary: story?.narrative ?? null,
      });
    }

    tracked.sort((a, b) => a.startedAt - b.startedAt);
    return tracked;
  }

  async getAllMonitoringSessionsForUser(userId: string): Promise<LocalMonitoringSession[]> {
    if (!db) return [];
    const result = await db.query(
      `SELECT * FROM monitoring_sessions WHERE user_id = $1 ORDER BY started_at DESC`,
      [userId]
    );
    return mapRows<LocalMonitoringSession>(result.rows as Record<string, unknown>[]);
  }

  // ── Text Search ─────────────────────────────────────────────────────────

  async searchSessions(
    query: string,
    limit = 20
  ): Promise<
    Array<{
      sessionId: string;
      text: string;
      source: "capture" | "classification" | "story" | "transcription";
      timestamp: number;
    }>
  > {
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

    const captures = await db.query(
      `SELECT session_id, sensor_output, captured_at
       FROM captures WHERE sensor_output ILIKE $1 LIMIT $2`,
      [likeQuery, limit]
    );
    for (const c of captures.rows as Array<{
      session_id: string;
      sensor_output: string;
      captured_at: string;
    }>) {
      results.push({
        sessionId: c.session_id,
        text: c.sensor_output,
        source: "capture",
        timestamp: parseInt(c.captured_at, 10),
      });
    }

    const classifications = await db.query(
      `SELECT session_id, activity_description, created_at
       FROM classifications WHERE activity_description ILIKE $1 LIMIT $2`,
      [likeQuery, limit]
    );
    for (const c of classifications.rows as Array<{
      session_id: string;
      activity_description: string;
      created_at: string;
    }>) {
      results.push({
        sessionId: c.session_id,
        text: c.activity_description,
        source: "classification",
        timestamp: parseInt(c.created_at, 10),
      });
    }

    const stories = await db.query(
      `SELECT session_id, narrative, created_at
       FROM stories WHERE narrative ILIKE $1 LIMIT $2`,
      [likeQuery, limit]
    );
    for (const s of stories.rows as Array<{
      session_id: string;
      narrative: string;
      created_at: string;
    }>) {
      results.push({
        sessionId: s.session_id,
        text: s.narrative,
        source: "story",
        timestamp: parseInt(s.created_at, 10),
      });
    }

    const transcriptions = await db.query(
      `SELECT session_id, transcript, start_time_ms
       FROM transcriptions WHERE transcript ILIKE $1 LIMIT $2`,
      [likeQuery, limit]
    );
    for (const t of transcriptions.rows as Array<{
      session_id: string;
      transcript: string;
      start_time_ms: string;
    }>) {
      results.push({
        sessionId: t.session_id,
        text: t.transcript,
        source: "transcription",
        timestamp: parseInt(t.start_time_ms, 10),
      });
    }

    return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  // ── Extended Feedback ───────────────────────────────────────────────────

  async markFeedbackEmailSent(id: string): Promise<void> {
    if (!db) return;
    try {
      await db.query(`UPDATE feedback SET email_sent = TRUE WHERE id = $1`, [id]);
    } catch (err) {
      logger.error("markFeedbackEmailSent failed:", String(err));
    }
  }

  // ── Extended Local Accounts ─────────────────────────────────────────────

  async getAnyLocalAccount(): Promise<LocalAccount | null> {
    if (!db) return null;
    const result = await db.query(`SELECT * FROM local_accounts LIMIT 1`);
    return mapRow<LocalAccount>(result.rows[0] as Record<string, unknown> | undefined);
  }

  async updateLocalAccountPassword(id: string, passwordHash: string): Promise<void> {
    if (!db) throw new Error("DB unavailable");
    await db.query(`UPDATE local_accounts SET password_hash = $1, updated_at = $2 WHERE id = $3`, [
      passwordHash,
      Date.now(),
      id,
    ]);
  }

  // ── Extended Agent Conversations ────────────────────────────────────────

  async listAgentConversations(userId: string): Promise<AgentConversation[]> {
    return this.getAgentConversationsForUser(userId);
  }

  async touchAgentConversation(id: string): Promise<void> {
    if (!db) return;
    await db.query(`UPDATE agent_conversations SET updated_at = $1 WHERE id = $2`, [
      Date.now(),
      id,
    ]);
  }

  // ── Extended Agent Messages ─────────────────────────────────────────────

  async addAgentMessage(
    id: string,
    conversationId: string,
    role: string,
    content: string,
    toolCalls: unknown[] = []
  ): Promise<AgentMessage> {
    if (!db) throw new Error("DB unavailable");
    const now = Date.now();
    await db.query(
      `INSERT INTO agent_messages (id, conversation_id, role, content, tool_calls, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, conversationId, role, content, JSON.stringify(toolCalls), now]
    );
    return {
      id,
      conversationId,
      role,
      content,
      toolCalls: JSON.stringify(toolCalls),
      createdAt: now,
    };
  }

  async getAgentMessages(conversationId: string): Promise<AgentMessage[]> {
    return this.getAgentMessagesForConversation(conversationId);
  }

  // ── Extended Documents ──────────────────────────────────────────────────

  async insertDocument(
    doc: Omit<LocalDocument, "createdAt" | "updatedAt">
  ): Promise<LocalDocument> {
    if (!db) throw new Error("DB unavailable");
    const now = Date.now();
    await db.query(
      `INSERT INTO local_documents 
        (id, user_id, file_path, file_name, file_type, file_size, page_count, 
         chunk_count, status, error, content, title, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
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
        now,
      ]
    );
    return { ...doc, createdAt: now, updatedAt: now };
  }

  async updateDocumentStatus(
    id: string,
    status: string,
    extra?: { chunkCount?: number; pageCount?: number; error?: string | null }
  ): Promise<void> {
    if (!db) return;
    let query = `UPDATE local_documents SET status = $1, updated_at = $2`;
    const params: unknown[] = [status, Date.now()];
    let paramIdx = 3;

    if (extra?.chunkCount !== undefined) {
      query += `, chunk_count = $${paramIdx++}`;
      params.push(extra.chunkCount);
    }
    if (extra?.pageCount !== undefined) {
      query += `, page_count = $${paramIdx++}`;
      params.push(extra.pageCount);
    }
    if (extra?.error !== undefined) {
      query += `, error = $${paramIdx++}`;
      params.push(extra.error);
    }

    query += ` WHERE id = $${paramIdx}`;
    params.push(id);

    await db.query(query, params);
  }

  async updateDocumentContent(id: string, content: string, title?: string): Promise<void> {
    if (!db) return;
    if (title !== undefined) {
      await db.query(
        `UPDATE local_documents SET content = $1, title = $2, updated_at = $3 WHERE id = $4`,
        [content, title, Date.now(), id]
      );
    } else {
      await db.query(`UPDATE local_documents SET content = $1, updated_at = $2 WHERE id = $3`, [
        content,
        Date.now(),
        id,
      ]);
    }
  }

  async listDocuments(userId: string): Promise<LocalDocument[]> {
    return this.getLocalDocumentsForUser(userId);
  }

  async getDocument(id: string): Promise<LocalDocument | null> {
    return this.getLocalDocument(id);
  }

  async deleteDocument(id: string, userId: string): Promise<boolean> {
    if (!db) return false;
    const result = await db.query(
      `DELETE FROM local_documents WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    return (result.rows?.length ?? 0) > 0;
  }

  // ── Extended Document Chunks ────────────────────────────────────────────

  async insertDocChunks(
    chunks: Array<{
      id: string;
      documentId: string;
      chunkIndex: number;
      content: string;
      charStart: number;
      charEnd: number;
    }>
  ): Promise<void> {
    if (!db || chunks.length === 0) return;
    const now = Date.now();

    // Insert chunks in a loop
    for (const c of chunks) {
      await db.query(
        `INSERT INTO local_doc_chunks (id, document_id, chunk_index, content, char_start, char_end, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [c.id, c.documentId, c.chunkIndex, c.content, c.charStart, c.charEnd, now]
      );
    }
  }

  async getDocChunks(documentId: string): Promise<LocalDocChunk[]> {
    return this.getDocChunksForDocument(documentId);
  }

  async deleteDocChunks(documentId: string): Promise<void> {
    return this.deleteDocChunksForDocument(documentId);
  }

  async searchDocChunks(
    query: string,
    userId: string,
    limit = 15
  ): Promise<Array<LocalDocChunk & { rank: number; documentName: string }>> {
    if (!db) return [];

    // Use ILIKE for keyword search (Postgres doesn't have built-in FTS5 like SQLite)
    // For better search, we'd use tsvector/tsquery or pg_trgm
    const pattern = `%${query}%`;
    const result = await db.query(
      `SELECT c.*, 1 as rank, d.file_name as document_name
       FROM local_doc_chunks c
       JOIN local_documents d ON d.id = c.document_id
       WHERE d.user_id = $1 AND c.content ILIKE $2
       ORDER BY c.created_at DESC
       LIMIT $3`,
      [userId, pattern, limit]
    );
    return mapRows<LocalDocChunk & { rank: number; documentName: string }>(
      result.rows as Record<string, unknown>[]
    );
  }

  // ── Database Size ───────────────────────────────────────────────────────

  async getDatabaseSize(): Promise<number> {
    if (!db) return 0;
    try {
      const result = await db.query(`SELECT pg_database_size(current_database()) as size`);
      const row = result.rows[0] as { size: string } | undefined;
      return row ? parseInt(row.size, 10) : 0;
    } catch {
      return 0;
    }
  }

  // ── Close ───────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    if (db) {
      await db.close();
      db = null;
      logger.info("PGlite database closed");
    }
  }
}

// Export singleton instance
export const pgDb = new PgDatabase();
