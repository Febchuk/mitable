import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  decimal,
  boolean,
  real,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.schema";
import { organizations } from "./organizations.schema";

/**
 * Monitoring Sessions
 *
 * Represents a work monitoring session where the user tracks activity
 * across selected windows. Sessions capture periodic screenshots and
 * generate AI summaries that can be delivered to Slack.
 *
 * Flow: Start Session → Select Windows → Periodic Captures → End Session → Summary → Deliver
 */
export const monitoringSessions = pgTable("monitoring_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Session metadata
  name: varchar("name", { length: 255 }), // Optional user-provided session name
  sessionGoal: text("session_goal"), // Optional: "Working on LIN-341: Add JWT auth" - improves on_task detection

  // Goal context (optional - for enhanced analysis)
  linearIssueId: varchar("linear_issue_id", { length: 100 }), // e.g., "LIN-341"
  linearIssueTitle: text("linear_issue_title"), // e.g., "Add JWT authentication"
  linearIssueDescription: text("linear_issue_description"), // Full issue description
  additionalContext: text("additional_context"), // User's free-text context about what they're working on
  relatedDocsContext: text("related_docs_context"), // RAG-retrieved docs at session start

  // Session state
  status: varchar("status", { length: 50 }).notNull().default("active"),
  // States:
  //   - 'active': Session in progress, capturing screenshots
  //   - 'paused': Temporarily paused, not capturing
  //   - 'ended': Session finished, ready for summary
  //   - 'summarizing': AI is generating summary
  //   - 'ready': Summary ready for delivery
  //   - 'delivered': Summary sent to channel

  // Configuration
  captureIntervalMs: integer("capture_interval_ms").notNull().default(30000), // Default 30 seconds
  selectedWindows: jsonb("selected_windows").notNull().default("[]"),
  // Array of: { windowId: string, appName: string, windowTitle: string }

  // Timing
  startedAt: timestamp("started_at").defaultNow().notNull(),
  pausedAt: timestamp("paused_at"), // Last pause timestamp
  totalPausedMs: integer("total_paused_ms").notNull().default(0), // Cumulative pause duration
  endedAt: timestamp("ended_at"),

  // Summary (populated at session end)
  rawActivitySummary: text("raw_activity_summary"), // Initial AI-generated summary
  finalSummary: text("final_summary"), // User-edited final summary
  keyActivities: jsonb("key_activities").default("[]"),
  // Array of: { activity: string, timestamp: string, confidence: number }
  accomplishments: jsonb("accomplishments").default("[]"),
  blockers: jsonb("blockers").default("[]"),
  timeBreakdown: jsonb("time_breakdown"), // { appName: durationMs }

  // Delivery tracking
  deliveryStatus: varchar("delivery_status", { length: 50 }),
  // States: null | 'pending' | 'sent' | 'failed'
  deliveryChannel: varchar("delivery_channel", { length: 50 }),
  // Channels: 'slack' | 'email' (future)
  deliveryTarget: jsonb("delivery_target"),
  // For Slack: { channelId: string, channelName: string }
  // For Email: { email: string } (future)
  deliveredAt: timestamp("delivered_at"),
  deliveryError: text("delivery_error"),
  slackMessageTs: varchar("slack_message_ts", { length: 50 }), // Slack message timestamp for updates

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Session Captures
 *
 * Individual screenshot captures during a monitoring session.
 * Captures are stored to disk (not in DB) and cleaned up after summary generation.
 * Only metadata and analysis results are persisted long-term.
 */
export const sessionCaptures = pgTable(
  "session_captures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => monitoringSessions.id, { onDelete: "cascade" }),

    // Capture metadata
    sequenceNumber: integer("sequence_number").notNull(), // Order within session
    captureTrigger: varchar("capture_trigger", { length: 50 }).notNull(),
    // Triggers:
    //   - 'periodic': Regular interval capture
    //   - 'focus_change': User switched to watched window
    //   - 'manual': User manually triggered capture
    capturedAt: timestamp("captured_at").defaultNow().notNull(),

    // Window context
    windowId: varchar("window_id", { length: 255 }),
    appName: varchar("app_name", { length: 255 }),
    windowTitle: text("window_title"),

    // Screenshot storage
    screenshotPath: text("screenshot_path"), // Original local path (for reference only)
    screenshotHash: varchar("screenshot_hash", { length: 64 }), // SHA-256 for deduplication
    imageData: text("image_data"), // Base64 encoded full image for AI analysis
    thumbnailData: text("thumbnail_data"), // Small base64 thumbnail for UI preview (optional)

    // Analysis results (populated during or after capture)
    analysisStatus: varchar("analysis_status", { length: 50 }).default("pending"),
    // States: 'pending' | 'analyzed' | 'skipped' | 'duplicate'
    activityDescription: text("activity_description"), // Human-readable activity summary
    confidence: decimal("confidence", { precision: 3, scale: 2 }), // 0.00-1.00
    detectedElements: jsonb("detected_elements").default("[]"), // UI elements if relevant
    classifierData: jsonb("classifier_data"), // Full Classifier RLM output (events, entities, metrics, actionType)

    // Delta detection (what changed between frames)
    deltaChanged: boolean("delta_changed").default(false),
    deltaChangeType: varchar("delta_change_type", { length: 20 }),
    // Types: 'content_edit' | 'navigation' | 'scroll' | 'file_switch' | 'focus_change' | 'none'
    deltaChangeDescription: text("delta_change_description"),
    deltaUserAction: varchar("delta_user_action", { length: 20 }),
    // Actions: 'typing' | 'clicking' | 'scrolling' | 'viewing' | 'unknown'

    // Per-window task relevance (replaces group-level correlation)
    onTask: boolean("on_task").default(true),
    taskRelevance: text("task_relevance"), // e.g., "Implementing JWT auth for LIN-341"

    // Importance scoring for Top-K selection
    importanceScore: real("importance_score").default(0), // 0-1, higher = more important
    importanceReason: text("importance_reason"), // e.g., "Active code editing with visible changes"

    // Flag for Top-K selected frames (uploaded to cloud)
    selectedForExport: boolean("selected_for_export").default(false),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    // Indexes for common queries
    importanceIdx: index("idx_captures_importance").on(table.sessionId, table.importanceScore),
    onTaskIdx: index("idx_captures_on_task").on(table.sessionId, table.onTask),
    deltaIdx: index("idx_captures_delta").on(table.sessionId, table.deltaChanged),
  })
);

/**
 * Session Summaries
 *
 * Versioned summaries for a monitoring session.
 * Allows regeneration and tracks user edits.
 */
export const sessionSummaries = pgTable("session_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => monitoringSessions.id, { onDelete: "cascade" }),

  version: integer("version").notNull().default(1),
  summaryType: varchar("summary_type", { length: 50 }).notNull(),
  // Types:
  //   - 'auto': AI-generated
  //   - 'user_edited': User modified the summary
  //   - 'regenerated': User requested new summary

  // Content
  narrativeSummary: text("narrative_summary").notNull(), // "You started by working on..."
  activities: jsonb("activities").default("[]"), // Structured activity list
  timeBreakdown: jsonb("time_breakdown"), // { appName: durationMs }

  // Metadata
  modelUsed: varchar("model_used", { length: 100 }), // 'gemini-2.0-flash-exp' or 'groq-llama-3.1'
  tokenCount: integer("token_count"),
  generationTimeMs: integer("generation_time_ms"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const monitoringSessionsRelations = relations(monitoringSessions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [monitoringSessions.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [monitoringSessions.userId],
    references: [users.id],
  }),
  captures: many(sessionCaptures),
  summaries: many(sessionSummaries),
}));

export const sessionCapturesRelations = relations(sessionCaptures, ({ one }) => ({
  session: one(monitoringSessions, {
    fields: [sessionCaptures.sessionId],
    references: [monitoringSessions.id],
  }),
}));

export const sessionSummariesRelations = relations(sessionSummaries, ({ one }) => ({
  session: one(monitoringSessions, {
    fields: [sessionSummaries.sessionId],
    references: [monitoringSessions.id],
  }),
}));

// Export types
export type MonitoringSession = typeof monitoringSessions.$inferSelect;
export type NewMonitoringSession = typeof monitoringSessions.$inferInsert;
export type SessionCapture = typeof sessionCaptures.$inferSelect;
export type NewSessionCapture = typeof sessionCaptures.$inferInsert;
export type SessionSummary = typeof sessionSummaries.$inferSelect;
export type NewSessionSummary = typeof sessionSummaries.$inferInsert;

// Helper types for JSONB fields
export interface SelectedWindow {
  windowId: string;
  appName: string;
  windowTitle: string;
}

export interface KeyActivity {
  activity: string;
  timestamp: string;
  confidence: number;
}

export interface DeliveryTarget {
  channelId?: string;
  channelName?: string;
  email?: string;
}

export interface TimeBreakdown {
  [appName: string]: number; // durationMs
}

// Delta detection types
export type DeltaChangeType =
  | "content_edit"
  | "navigation"
  | "scroll"
  | "file_switch"
  | "focus_change"
  | "none";

export type DeltaUserAction = "typing" | "clicking" | "scrolling" | "viewing" | "unknown";

export interface DeltaAnalysis {
  changed: boolean;
  changeType: DeltaChangeType;
  changeDescription: string | null;
  userAction: DeltaUserAction;
}

export interface FrameAnalysisResult {
  delta: DeltaAnalysis;
  onTask: boolean;
  taskRelevance: string | null;
  importanceScore: number;
  importanceReason: string | null;
}
