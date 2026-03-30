import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  real,
  boolean,
  date,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations.schema";
import { users } from "./users.schema";

/**
 * Benchmarks
 *
 * Benchmark definitions scoped to an organization. A benchmark represents a
 * measurable performance target (e.g. "Focus Hours", "PR Merge Rate") that
 * can be assigned to employees and tracked over time.
 *
 * Metrics: 'score' | 'minutes' | 'percentage' | 'count' | 'hours' | 'weighted_parameters'
 * Categories: 'productivity' | 'collaboration' | 'growth' | 'quality'
 * Frequencies: 'weekly' | 'monthly' | 'quarterly'
 */
export const benchmarks = pgTable(
  "benchmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 50 }).notNull(),
    metric: varchar("metric", { length: 50 }).notNull(),
    targetValue: real("target_value").notNull(),
    unit: varchar("unit", { length: 50 }).notNull(),
    frequency: varchar("frequency", { length: 20 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    organizationIdIdx: index("idx_benchmarks_organization_id").on(table.organizationId),
  })
);

/**
 * Benchmark Parameters
 *
 * The axes/dimensions by which a benchmark is scored when the metric type
 * is 'weighted_parameters'. Each parameter has an importance weight (1-5)
 * that influences the final composite score.
 */
export const benchmarkParameters = pgTable(
  "benchmark_parameters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    benchmarkId: uuid("benchmark_id")
      .notNull()
      .references(() => benchmarks.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    importance: integer("importance").notNull().default(3),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    benchmarkIdIdx: index("idx_benchmark_parameters_benchmark_id").on(table.benchmarkId),
  })
);

/**
 * Benchmark Assignments
 *
 * Links a user to a benchmark and tracks their current score, progress
 * toward target, percentile ranking, and trend direction.
 *
 * Percentile: 'top_1' | 'top_10' | 'top_25' | 'top_50' | 'bottom_half'
 * Trend: 'improving' | 'declining' | 'stable' | 'new'
 */
export const benchmarkAssignments = pgTable(
  "benchmark_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    benchmarkId: uuid("benchmark_id")
      .notNull()
      .references(() => benchmarks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetValue: real("target_value"),
    currentValue: real("current_value").notNull().default(0),
    progress: real("progress").notNull().default(0),
    percentile: varchar("percentile", { length: 20 }).default("bottom_half"),
    trend: varchar("trend", { length: 20 }).default("new"),
    trendDelta: real("trend_delta").default(0),
    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueBenchmarkUser: unique().on(table.benchmarkId, table.userId),
    userIdIdx: index("idx_benchmark_assignments_user_id").on(table.userId),
    benchmarkIdIdx: index("idx_benchmark_assignments_benchmark_id").on(table.benchmarkId),
  })
);

/**
 * Benchmark Snapshots
 *
 * Immutable historical data points for an assignment. One row is written
 * at the end of each scoring period so trend lines and sparkcharts can be
 * rendered over time.
 */
export const benchmarkSnapshots = pgTable(
  "benchmark_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => benchmarkAssignments.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    value: real("value").notNull(),
    target: real("target").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    assignmentDateIdx: index("idx_benchmark_snapshots_assignment_date").on(
      table.assignmentId,
      table.date
    ),
  })
);

/**
 * Benchmark Suggestions
 *
 * AI-generated coaching suggestions surfaced to an employee for a given
 * benchmark assignment. New suggestions are generated each scoring period.
 *
 * Categories: 'scheduling' | 'habits' | 'encouragement'
 */
export const benchmarkSuggestions = pgTable(
  "benchmark_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => benchmarkAssignments.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    assignmentIdIdx: index("idx_benchmark_suggestions_assignment_id").on(table.assignmentId),
  })
);

/**
 * Benchmark Accomplishments
 *
 * Notable achievements detected by the AI for a given assignment period.
 * Displayed as positive reinforcement in the employee benchmark view.
 */
export const benchmarkAccomplishments = pgTable(
  "benchmark_accomplishments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => benchmarkAssignments.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    date: date("date").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    assignmentIdIdx: index("idx_benchmark_accomplishments_assignment_id").on(table.assignmentId),
  })
);

/**
 * Benchmark Parameter Scores
 *
 * Per-parameter LLM scores (1.0–5.0) for a given assignment and scoring
 * period. The weighted aggregate of these scores produces the composite
 * currentValue on the assignment when metric = 'weighted_parameters'.
 */
export const benchmarkParameterScores = pgTable(
  "benchmark_parameter_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => benchmarkAssignments.id, { onDelete: "cascade" }),
    parameterId: uuid("parameter_id")
      .notNull()
      .references(() => benchmarkParameters.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    reasoning: text("reasoning"),
    periodStart: date("period_start").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    assignmentPeriodIdx: index("idx_benchmark_parameter_scores_assignment_period").on(
      table.assignmentId,
      table.periodStart
    ),
  })
);

// Relations

export const benchmarksRelations = relations(benchmarks, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [benchmarks.organizationId],
    references: [organizations.id],
  }),
  parameters: many(benchmarkParameters),
  assignments: many(benchmarkAssignments),
}));

export const benchmarkParametersRelations = relations(benchmarkParameters, ({ one, many }) => ({
  benchmark: one(benchmarks, {
    fields: [benchmarkParameters.benchmarkId],
    references: [benchmarks.id],
  }),
  parameterScores: many(benchmarkParameterScores),
}));

export const benchmarkAssignmentsRelations = relations(benchmarkAssignments, ({ one, many }) => ({
  benchmark: one(benchmarks, {
    fields: [benchmarkAssignments.benchmarkId],
    references: [benchmarks.id],
  }),
  user: one(users, {
    fields: [benchmarkAssignments.userId],
    references: [users.id],
  }),
  snapshots: many(benchmarkSnapshots),
  suggestions: many(benchmarkSuggestions),
  accomplishments: many(benchmarkAccomplishments),
  parameterScores: many(benchmarkParameterScores),
}));

export const benchmarkSnapshotsRelations = relations(benchmarkSnapshots, ({ one }) => ({
  assignment: one(benchmarkAssignments, {
    fields: [benchmarkSnapshots.assignmentId],
    references: [benchmarkAssignments.id],
  }),
}));

export const benchmarkSuggestionsRelations = relations(benchmarkSuggestions, ({ one }) => ({
  assignment: one(benchmarkAssignments, {
    fields: [benchmarkSuggestions.assignmentId],
    references: [benchmarkAssignments.id],
  }),
}));

export const benchmarkAccomplishmentsRelations = relations(benchmarkAccomplishments, ({ one }) => ({
  assignment: one(benchmarkAssignments, {
    fields: [benchmarkAccomplishments.assignmentId],
    references: [benchmarkAssignments.id],
  }),
}));

export const benchmarkParameterScoresRelations = relations(
  benchmarkParameterScores,
  ({ one }) => ({
    assignment: one(benchmarkAssignments, {
      fields: [benchmarkParameterScores.assignmentId],
      references: [benchmarkAssignments.id],
    }),
    parameter: one(benchmarkParameters, {
      fields: [benchmarkParameterScores.parameterId],
      references: [benchmarkParameters.id],
    }),
  })
);

// Export types

export type Benchmark = typeof benchmarks.$inferSelect;
export type NewBenchmark = typeof benchmarks.$inferInsert;

export type BenchmarkParameter = typeof benchmarkParameters.$inferSelect;
export type NewBenchmarkParameter = typeof benchmarkParameters.$inferInsert;

export type BenchmarkAssignment = typeof benchmarkAssignments.$inferSelect;
export type NewBenchmarkAssignment = typeof benchmarkAssignments.$inferInsert;

export type BenchmarkSnapshot = typeof benchmarkSnapshots.$inferSelect;
export type NewBenchmarkSnapshot = typeof benchmarkSnapshots.$inferInsert;

export type BenchmarkSuggestion = typeof benchmarkSuggestions.$inferSelect;
export type NewBenchmarkSuggestion = typeof benchmarkSuggestions.$inferInsert;

export type BenchmarkAccomplishment = typeof benchmarkAccomplishments.$inferSelect;
export type NewBenchmarkAccomplishment = typeof benchmarkAccomplishments.$inferInsert;

export type BenchmarkParameterScore = typeof benchmarkParameterScores.$inferSelect;
export type NewBenchmarkParameterScore = typeof benchmarkParameterScores.$inferInsert;
