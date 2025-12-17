import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  decimal,
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
export const sessionCaptures = pgTable("session_captures", {
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
  activityDescription: text("activity_description"), // What Gemini detected
  confidence: decimal("confidence", { precision: 3, scale: 2 }), // 0.00-1.00
  detectedElements: jsonb("detected_elements").default("[]"), // UI elements if relevant

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
