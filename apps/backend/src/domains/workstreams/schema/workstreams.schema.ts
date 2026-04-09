import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { monitoringSessions, sessionCaptures } from "../../../db/schema/monitoring.schema";

/**
 * Session Workstreams
 *
 * Represents a logical unit of work within a monitoring session.
 * Workstreams are detected by RLM analysis and can span multiple apps
 * and non-contiguous time segments.
 *
 * Examples:
 * - "JWT Authentication Implementation" (coding + research + testing)
 * - "Communications" (Slack, email)
 * - "Design Review" (Figma + Slack)
 */
export const sessionWorkstreams = pgTable(
  "session_workstreams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => monitoringSessions.id, { onDelete: "cascade" }),

    // Identity
    name: text("name").notNull(), // "JWT Authentication Implementation"
    color: varchar("color", { length: 20 }).notNull(), // "violet", "blue", etc.
    category: varchar("category", { length: 50 }), // "development", "communication", "meeting", "research"

    // AI-generated content
    summary: text("summary"), // "Implemented JWT auth with token validation..."

    // State
    isProvisional: boolean("is_provisional").default(true).notNull(), // False after final analysis
    isMergedInto: uuid("is_merged_into"), // Points to target workstream if this was merged

    // Stats (denormalized for quick access)
    captureCount: integer("capture_count").default(0).notNull(),
    totalDurationMinutes: integer("total_duration_minutes").default(0).notNull(),
    appsUsed: text("apps_used").array().default([]).notNull(), // ["VS Code", "Terminal"]

    // Metadata
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    lastAnalysisAt: timestamp("last_analysis_at"),
  },
  (table) => ({
    sessionIdx: index("idx_session_workstreams_session").on(table.sessionId),
    mergedIdx: index("idx_session_workstreams_merged").on(table.isMergedInto),
  })
);

/**
 * Workstream Analysis Log
 *
 * Tracks each RLM analysis run for debugging and monitoring.
 */
export const workstreamAnalysisLog = pgTable(
  "workstream_analysis_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => monitoringSessions.id, { onDelete: "cascade" }),

    // Analysis metadata
    analysisNumber: integer("analysis_number").notNull(),
    triggerReason: varchar("trigger_reason", { length: 50 }), // "capture_threshold", "time_threshold", "context_switch", "manual"
    capturesAnalyzed: integer("captures_analyzed"),

    // RLM details
    modelUsed: varchar("model_used", { length: 100 }),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    executionTimeMs: integer("execution_time_ms"),

    // Results summary
    workstreamsCreated: integer("workstreams_created").default(0),
    workstreamsMerged: integer("workstreams_merged").default(0),
    capturesReassigned: integer("captures_reassigned").default(0),

    // Error tracking
    error: text("error"),
    success: boolean("success").default(true),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionIdx: index("idx_workstream_analysis_session").on(table.sessionId),
    createdIdx: index("idx_workstream_analysis_created").on(table.createdAt),
  })
);

// Relations
export const sessionWorkstreamsRelations = relations(sessionWorkstreams, ({ one, many }) => ({
  session: one(monitoringSessions, {
    fields: [sessionWorkstreams.sessionId],
    references: [monitoringSessions.id],
  }),
  mergedInto: one(sessionWorkstreams, {
    fields: [sessionWorkstreams.isMergedInto],
    references: [sessionWorkstreams.id],
    relationName: "merged",
  }),
  captures: many(sessionCaptures),
}));

export const workstreamAnalysisLogRelations = relations(workstreamAnalysisLog, ({ one }) => ({
  session: one(monitoringSessions, {
    fields: [workstreamAnalysisLog.sessionId],
    references: [monitoringSessions.id],
  }),
}));

// Export types
export type SessionWorkstream = typeof sessionWorkstreams.$inferSelect;
export type NewSessionWorkstream = typeof sessionWorkstreams.$inferInsert;
export type WorkstreamAnalysisLog = typeof workstreamAnalysisLog.$inferSelect;
export type NewWorkstreamAnalysisLog = typeof workstreamAnalysisLog.$inferInsert;

// Category types
export type WorkstreamCategory =
  | "development"
  | "communication"
  | "meeting"
  | "research"
  | "design"
  | "review"
  | "other";

// Trigger reason types
export type AnalysisTriggerReason =
  | "capture_threshold"
  | "time_threshold"
  | "context_switch"
  | "manual"
  | "session_end";
