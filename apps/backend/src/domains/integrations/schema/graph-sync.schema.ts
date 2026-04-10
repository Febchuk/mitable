import {
  pgTable,
  uuid,
  timestamp,
  integer,
  text,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Tracks each graph sync execution for observability and incident debugging.
 */
export const graphSyncRuns = pgTable(
  "graph_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    success: boolean("success").notNull().default(false),
    syncedUsers: integer("synced_users").notNull().default(0),
    syncedWorkstreams: integer("synced_workstreams").notNull().default(0),
    syncedPreferences: integer("synced_preferences").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    error: text("error"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    startedIdx: index("idx_graph_sync_runs_started").on(table.startedAt),
    successIdx: index("idx_graph_sync_runs_success").on(table.success),
  })
);

/**
 * Stores per-source watermark checkpoints for incremental graph sync.
 */
export const graphSyncWatermarks = pgTable(
  "graph_sync_watermarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull().unique(),
    watermarkTs: timestamp("watermark_ts", { withTimezone: true }),
    watermarkValue: text("watermark_value"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceIdx: index("idx_graph_sync_watermarks_source").on(table.source),
  })
);

/**
 * Pre-aggregated visibility snapshots used by management graph insight endpoints.
 */
export const workflowVisibilitySnapshots = pgTable(
  "workflow_visibility_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    userId: uuid("user_id"),
    window: text("window").notNull(), // 7d | 30d | 90d
    snapshotDate: timestamp("snapshot_date", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgWindowIdx: index("idx_workflow_visibility_org_window").on(
      table.organizationId,
      table.window
    ),
    userWindowIdx: index("idx_workflow_visibility_user_window").on(table.userId, table.window),
  })
);
