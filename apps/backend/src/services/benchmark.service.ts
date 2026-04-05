import { eq, and, avg, count, asc, desc, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  benchmarks,
  benchmarkParameters,
  benchmarkAssignments,
  benchmarkSnapshots,
  benchmarkSuggestions,
  benchmarkAccomplishments,
} from "../db/schema/benchmarks.schema.js";
import { users } from "../db/schema/users.schema.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ context: "benchmark-service" });

// ---------------------------------------------------------------------------
// Payload / return types
// ---------------------------------------------------------------------------

interface CreateBenchmarkPayload {
  name: string;
  description: string;
  frequency: string;
  parameters: {
    id: string;
    name: string;
    description: string;
    importance: number;
  }[];
}

interface BenchmarkWithAggregates {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  category: string;
  metric: string;
  targetValue: number;
  unit: string;
  frequency: string;
  isActive: boolean;
  assignedCount: number;
  avgProgress: number;
  trend: string;
  trendDelta: number;
  createdAt: string;
  updatedAt: string;
}

interface AssignmentDetail {
  id: string;
  benchmarkId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  currentValue: number;
  targetValue: number;
  progress: number;
  percentile: string | null;
  trend: string | null;
  trendDelta: number | null;
  assignedAt: string;
}

interface BenchmarkDetailResult extends BenchmarkWithAggregates {
  assignments: AssignmentDetail[];
  teamAverage: number;
  improvingCount: number;
}

interface BenchmarkSnapshotDTO {
  date: string;
  value: number;
  target: number;
}

interface AISuggestionDTO {
  id: string;
  text: string;
  category: string;
}

interface AccomplishmentDTO {
  id: string;
  text: string;
  date: string;
}

interface PersonBenchmarkDetail {
  benchmarkId: string;
  benchmarkName: string;
  benchmarkDescription: string | null;
  benchmarkCategory: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  currentValue: number;
  targetValue: number;
  unit: string;
  progress: number;
  percentile: string | null;
  trend: string | null;
  trendDelta: number | null;
  frequency: string;
  history: BenchmarkSnapshotDTO[];
  suggestions: AISuggestionDTO[];
  accomplishments: AccomplishmentDTO[];
}

interface MyBenchmark {
  id: string;
  benchmarkId: string;
  name: string;
  description: string | null;
  category: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  progress: number;
  percentile: string | null;
  trend: string | null;
  trendDelta: number | null;
  frequency: string;
  topAccomplishment: string | null;
}

interface MyBenchmarkDetail extends MyBenchmark {
  history: BenchmarkSnapshotDTO[];
  suggestions: AISuggestionDTO[];
  accomplishments: AccomplishmentDTO[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: Date | null): string {
  return ts ? ts.toISOString() : new Date().toISOString();
}

/**
 * Compute aggregate fields for a single benchmark from its assignments.
 */
async function computeAggregates(benchmarkId: string, scopedUserIds?: string[]) {
  const whereClause = scopedUserIds
    ? and(
        eq(benchmarkAssignments.benchmarkId, benchmarkId),
        inArray(benchmarkAssignments.userId, scopedUserIds)
      )
    : eq(benchmarkAssignments.benchmarkId, benchmarkId);

  const rows = await db
    .select({
      assignedCount: count(benchmarkAssignments.id),
      avgProgress: avg(benchmarkAssignments.progress),
      avgTrendDelta: avg(benchmarkAssignments.trendDelta),
    })
    .from(benchmarkAssignments)
    .where(whereClause);

  const row = rows[0];
  const assignedCount = Number(row?.assignedCount ?? 0);
  const avgProgress = Number(row?.avgProgress ?? 0);
  const avgTrendDelta = Number(row?.avgTrendDelta ?? 0);

  // Compute mode of trend
  let trend = "new";
  if (assignedCount > 0) {
    const trendRows = await db
      .select({
        trend: benchmarkAssignments.trend,
        cnt: count(benchmarkAssignments.id),
      })
      .from(benchmarkAssignments)
      .where(whereClause)
      .groupBy(benchmarkAssignments.trend)
      .orderBy(desc(count(benchmarkAssignments.id)))
      .limit(1);

    trend = trendRows[0]?.trend ?? "new";
  }

  return { assignedCount, avgProgress, trend, trendDelta: avgTrendDelta };
}

function toBenchmarkWithAggregates(
  bm: typeof benchmarks.$inferSelect,
  agg: { assignedCount: number; avgProgress: number; trend: string; trendDelta: number }
): BenchmarkWithAggregates {
  return {
    id: bm.id,
    organizationId: bm.organizationId,
    name: bm.name,
    description: bm.description,
    category: bm.category,
    metric: bm.metric,
    targetValue: bm.targetValue,
    unit: bm.unit,
    frequency: bm.frequency,
    isActive: bm.isActive,
    assignedCount: agg.assignedCount,
    avgProgress: agg.avgProgress,
    trend: agg.trend,
    trendDelta: agg.trendDelta,
    createdAt: formatTimestamp(bm.createdAt),
    updatedAt: formatTimestamp(bm.updatedAt),
  };
}

/**
 * Fetch snapshots, suggestions, and accomplishments for an assignment.
 */
async function getAssignmentExtras(assignmentId: string) {
  const [snapshotRows, suggestionRows, accomplishmentRows] = await Promise.all([
    db
      .select()
      .from(benchmarkSnapshots)
      .where(eq(benchmarkSnapshots.assignmentId, assignmentId))
      .orderBy(asc(benchmarkSnapshots.date)),
    db
      .select()
      .from(benchmarkSuggestions)
      .where(eq(benchmarkSuggestions.assignmentId, assignmentId)),
    db
      .select()
      .from(benchmarkAccomplishments)
      .where(eq(benchmarkAccomplishments.assignmentId, assignmentId))
      .orderBy(desc(benchmarkAccomplishments.date)),
  ]);

  const history: BenchmarkSnapshotDTO[] = snapshotRows.map((s) => ({
    date: s.date,
    value: s.value,
    target: s.target,
  }));

  const suggestions: AISuggestionDTO[] = suggestionRows.map((s) => ({
    id: s.id,
    text: s.text,
    category: s.category,
  }));

  const accomplishments: AccomplishmentDTO[] = accomplishmentRows.map((a) => ({
    id: a.id,
    text: a.text,
    date: a.date,
  }));

  return { history, suggestions, accomplishments };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const benchmarkService = {
  /**
   * List all benchmarks for an organization with aggregate assignment stats.
   */
  async listByOrg(
    organizationId: string,
    scopedUserIds?: string[]
  ): Promise<BenchmarkWithAggregates[]> {
    logger.info(
      { organizationId, scopedUsers: scopedUserIds?.length },
      "listing benchmarks for organization"
    );

    const rows = await db
      .select()
      .from(benchmarks)
      .where(eq(benchmarks.organizationId, organizationId));

    const results: BenchmarkWithAggregates[] = [];
    for (const bm of rows) {
      const agg = await computeAggregates(bm.id, scopedUserIds);
      // When scoping, only include benchmarks that have at least one scoped assignment
      if (scopedUserIds && agg.assignedCount === 0) continue;
      results.push(toBenchmarkWithAggregates(bm, agg));
    }

    return results;
  },

  /**
   * Get benchmark detail including all assignments with user info.
   */
  async getDetail(
    benchmarkId: string,
    organizationId: string
  ): Promise<BenchmarkDetailResult | null> {
    logger.info({ benchmarkId, organizationId }, "getting benchmark detail");

    const bmRows = await db
      .select()
      .from(benchmarks)
      .where(and(eq(benchmarks.id, benchmarkId), eq(benchmarks.organizationId, organizationId)))
      .limit(1);

    const bm = bmRows[0];
    if (!bm) return null;

    // Assignments joined with users
    const assignmentRows = await db
      .select({
        assignment: benchmarkAssignments,
        user: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(benchmarkAssignments)
      .innerJoin(users, eq(benchmarkAssignments.userId, users.id))
      .where(eq(benchmarkAssignments.benchmarkId, benchmarkId));

    const assignments: AssignmentDetail[] = assignmentRows.map((r) => ({
      id: r.assignment.id,
      benchmarkId: r.assignment.benchmarkId,
      userId: r.assignment.userId,
      userName: `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim() || r.user.email,
      userEmail: r.user.email,
      userAvatarUrl: r.user.avatarUrl,
      currentValue: r.assignment.currentValue,
      targetValue: r.assignment.targetValue ?? bm.targetValue,
      progress: r.assignment.progress,
      percentile: r.assignment.percentile,
      trend: r.assignment.trend,
      trendDelta: r.assignment.trendDelta,
      assignedAt: formatTimestamp(r.assignment.assignedAt),
    }));

    const teamAverage =
      assignments.length > 0
        ? assignments.reduce((sum, a) => sum + a.progress, 0) / assignments.length
        : 0;

    const improvingCount = assignments.filter((a) => a.trend === "improving").length;

    const agg = await computeAggregates(benchmarkId);

    return {
      ...toBenchmarkWithAggregates(bm, agg),
      assignments,
      teamAverage,
      improvingCount,
    };
  },

  /**
   * Create a new benchmark with parameters.
   */
  async create(
    organizationId: string,
    payload: CreateBenchmarkPayload
  ): Promise<BenchmarkWithAggregates> {
    logger.info({ organizationId, name: payload.name }, "creating benchmark");

    const [newBm] = await db
      .insert(benchmarks)
      .values({
        organizationId,
        name: payload.name,
        description: payload.description,
        category: "productivity",
        metric: "weighted_parameters",
        targetValue: 5,
        unit: "score",
        frequency: payload.frequency,
      })
      .returning();

    // Insert parameters
    if (payload.parameters.length > 0) {
      await db.insert(benchmarkParameters).values(
        payload.parameters.map((p) => ({
          benchmarkId: newBm.id,
          name: p.name,
          description: p.description,
          importance: p.importance,
        }))
      );
    }

    return toBenchmarkWithAggregates(newBm, {
      assignedCount: 0,
      avgProgress: 0,
      trend: "new",
      trendDelta: 0,
    });
  },

  /**
   * Update allowed fields on a benchmark.
   */
  async update(
    benchmarkId: string,
    organizationId: string,
    payload: {
      name?: string;
      description?: string;
      targetValue?: number;
      frequency?: string;
      isActive?: boolean;
    }
  ): Promise<BenchmarkWithAggregates | null> {
    logger.info({ benchmarkId, organizationId, payload }, "updating benchmark");

    // Verify ownership
    const existing = await db
      .select()
      .from(benchmarks)
      .where(and(eq(benchmarks.id, benchmarkId), eq(benchmarks.organizationId, organizationId)))
      .limit(1);

    if (!existing[0]) return null;

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (payload.name !== undefined) updateFields.name = payload.name;
    if (payload.description !== undefined) updateFields.description = payload.description;
    if (payload.targetValue !== undefined) updateFields.targetValue = payload.targetValue;
    if (payload.frequency !== undefined) updateFields.frequency = payload.frequency;
    if (payload.isActive !== undefined) updateFields.isActive = payload.isActive;

    const [updated] = await db
      .update(benchmarks)
      .set(updateFields)
      .where(eq(benchmarks.id, benchmarkId))
      .returning();

    const agg = await computeAggregates(benchmarkId);
    return toBenchmarkWithAggregates(updated, agg);
  },

  /**
   * Replace all parameters for a benchmark.
   */
  async updateParameters(
    benchmarkId: string,
    organizationId: string,
    parameters: { name: string; description: string; importance: number }[]
  ): Promise<void> {
    // Verify the benchmark belongs to this org
    const [benchmark] = await db
      .select()
      .from(benchmarks)
      .where(and(eq(benchmarks.id, benchmarkId), eq(benchmarks.organizationId, organizationId)))
      .limit(1);

    if (!benchmark) throw new Error("Benchmark not found");

    // Delete existing parameters
    await db.delete(benchmarkParameters).where(eq(benchmarkParameters.benchmarkId, benchmarkId));

    // Insert new parameters
    if (parameters.length > 0) {
      await db.insert(benchmarkParameters).values(
        parameters.map((p) => ({
          benchmarkId,
          name: p.name,
          description: p.description,
          importance: p.importance,
        }))
      );
    }
  },

  /**
   * Fetch parameters for a benchmark.
   */
  async getParameters(
    benchmarkId: string
  ): Promise<{ id: string; name: string; description: string | null; importance: number }[]> {
    return db
      .select({
        id: benchmarkParameters.id,
        name: benchmarkParameters.name,
        description: benchmarkParameters.description,
        importance: benchmarkParameters.importance,
      })
      .from(benchmarkParameters)
      .where(eq(benchmarkParameters.benchmarkId, benchmarkId));
  },

  /**
   * Assign users to a benchmark. Uses ON CONFLICT DO NOTHING.
   */
  async assign(
    benchmarkId: string,
    organizationId: string,
    userIds: string[],
    targetOverride?: number
  ): Promise<void> {
    logger.info({ benchmarkId, organizationId, userIds }, "assigning users to benchmark");

    // Verify org ownership
    const bmRows = await db
      .select()
      .from(benchmarks)
      .where(and(eq(benchmarks.id, benchmarkId), eq(benchmarks.organizationId, organizationId)))
      .limit(1);

    if (!bmRows[0]) {
      throw new Error(`Benchmark ${benchmarkId} not found for organization ${organizationId}`);
    }

    if (userIds.length === 0) return;

    await db
      .insert(benchmarkAssignments)
      .values(
        userIds.map((userId) => ({
          benchmarkId,
          userId,
          targetValue: targetOverride ?? null,
          currentValue: 0,
          progress: 0,
          percentile: "bottom_half" as const,
          trend: "new" as const,
          trendDelta: 0,
        }))
      )
      .onConflictDoNothing();
  },

  /**
   * Remove a user from a benchmark.
   */
  /**
   * Delete a benchmark and all its related data (cascade).
   */
  async deleteBenchmark(benchmarkId: string, organizationId: string): Promise<void> {
    logger.info({ benchmarkId, organizationId }, "deleting benchmark");

    await db
      .delete(benchmarks)
      .where(and(eq(benchmarks.id, benchmarkId), eq(benchmarks.organizationId, organizationId)));
  },

  async unassign(benchmarkId: string, userId: string): Promise<void> {
    logger.info({ benchmarkId, userId }, "unassigning user from benchmark");

    await db
      .delete(benchmarkAssignments)
      .where(
        and(
          eq(benchmarkAssignments.benchmarkId, benchmarkId),
          eq(benchmarkAssignments.userId, userId)
        )
      );
  },

  /**
   * Update assignment-level target override.
   */
  async updateAssignment(
    benchmarkId: string,
    userId: string,
    payload: { targetValue?: number }
  ): Promise<void> {
    logger.info({ benchmarkId, userId, payload }, "updating assignment");

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };
    if (payload.targetValue !== undefined) updateFields.targetValue = payload.targetValue;

    await db
      .update(benchmarkAssignments)
      .set(updateFields)
      .where(
        and(
          eq(benchmarkAssignments.benchmarkId, benchmarkId),
          eq(benchmarkAssignments.userId, userId)
        )
      );
  },

  /**
   * Get full detail for a single person's benchmark assignment.
   */
  async getPersonDetail(
    benchmarkId: string,
    userId: string,
    organizationId: string
  ): Promise<PersonBenchmarkDetail | null> {
    logger.info({ benchmarkId, userId, organizationId }, "getting person benchmark detail");

    // Assignment + benchmark + user in one query
    const rows = await db
      .select({
        assignment: benchmarkAssignments,
        benchmark: benchmarks,
        user: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(benchmarkAssignments)
      .innerJoin(benchmarks, eq(benchmarkAssignments.benchmarkId, benchmarks.id))
      .innerJoin(users, eq(benchmarkAssignments.userId, users.id))
      .where(
        and(
          eq(benchmarkAssignments.benchmarkId, benchmarkId),
          eq(benchmarkAssignments.userId, userId),
          eq(benchmarks.organizationId, organizationId)
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const { history, suggestions, accomplishments } = await getAssignmentExtras(row.assignment.id);

    return {
      benchmarkId: row.benchmark.id,
      benchmarkName: row.benchmark.name,
      benchmarkDescription: row.benchmark.description,
      benchmarkCategory: row.benchmark.category,
      userId: row.assignment.userId,
      userName: `${row.user.firstName ?? ""} ${row.user.lastName ?? ""}`.trim() || row.user.email,
      userEmail: row.user.email,
      userAvatarUrl: row.user.avatarUrl,
      currentValue: row.assignment.currentValue,
      targetValue: row.assignment.targetValue ?? row.benchmark.targetValue,
      unit: row.benchmark.unit,
      progress: row.assignment.progress,
      percentile: row.assignment.percentile,
      trend: row.assignment.trend,
      trendDelta: row.assignment.trendDelta,
      frequency: row.benchmark.frequency,
      history,
      suggestions,
      accomplishments,
    };
  },

  /**
   * Get all benchmark assignments for the current user.
   */
  async getMyBenchmarks(userId: string): Promise<MyBenchmark[]> {
    logger.info({ userId }, "getting user benchmarks");

    const rows = await db
      .select({
        assignment: benchmarkAssignments,
        benchmark: benchmarks,
      })
      .from(benchmarkAssignments)
      .innerJoin(benchmarks, eq(benchmarkAssignments.benchmarkId, benchmarks.id))
      .where(eq(benchmarkAssignments.userId, userId));

    const results: MyBenchmark[] = [];
    for (const row of rows) {
      // Get most recent accomplishment
      const accomplishmentRows = await db
        .select({ text: benchmarkAccomplishments.text })
        .from(benchmarkAccomplishments)
        .where(eq(benchmarkAccomplishments.assignmentId, row.assignment.id))
        .orderBy(desc(benchmarkAccomplishments.date))
        .limit(1);

      results.push({
        id: row.assignment.id,
        benchmarkId: row.benchmark.id,
        name: row.benchmark.name,
        description: row.benchmark.description,
        category: row.benchmark.category,
        currentValue: row.assignment.currentValue,
        targetValue: row.assignment.targetValue ?? row.benchmark.targetValue,
        unit: row.benchmark.unit,
        progress: row.assignment.progress,
        percentile: row.assignment.percentile,
        trend: row.assignment.trend,
        trendDelta: row.assignment.trendDelta,
        frequency: row.benchmark.frequency,
        topAccomplishment: accomplishmentRows[0]?.text ?? null,
      });
    }

    return results;
  },

  /**
   * Get detailed view of a single benchmark for the current user.
   */
  async getMyBenchmarkDetail(
    userId: string,
    benchmarkId: string
  ): Promise<MyBenchmarkDetail | null> {
    logger.info({ userId, benchmarkId }, "getting user benchmark detail");

    const rows = await db
      .select({
        assignment: benchmarkAssignments,
        benchmark: benchmarks,
      })
      .from(benchmarkAssignments)
      .innerJoin(benchmarks, eq(benchmarkAssignments.benchmarkId, benchmarks.id))
      .where(
        and(
          eq(benchmarkAssignments.userId, userId),
          eq(benchmarkAssignments.benchmarkId, benchmarkId)
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    const { history, suggestions, accomplishments } = await getAssignmentExtras(row.assignment.id);

    // Get most recent accomplishment for topAccomplishment field
    const topAccomplishment = accomplishments.length > 0 ? accomplishments[0].text : null;

    return {
      id: row.assignment.id,
      benchmarkId: row.benchmark.id,
      name: row.benchmark.name,
      description: row.benchmark.description,
      category: row.benchmark.category,
      currentValue: row.assignment.currentValue,
      targetValue: row.assignment.targetValue ?? row.benchmark.targetValue,
      unit: row.benchmark.unit,
      progress: row.assignment.progress,
      percentile: row.assignment.percentile,
      trend: row.assignment.trend,
      trendDelta: row.assignment.trendDelta,
      frequency: row.benchmark.frequency,
      topAccomplishment,
      history,
      suggestions,
      accomplishments,
    };
  },

  /**
   * Get snapshot history for a user's benchmark assignment.
   */
  async getMyBenchmarkHistory(
    userId: string,
    benchmarkId: string
  ): Promise<BenchmarkSnapshotDTO[]> {
    logger.info({ userId, benchmarkId }, "getting user benchmark history");

    // Find the assignment
    const assignmentRows = await db
      .select()
      .from(benchmarkAssignments)
      .where(
        and(
          eq(benchmarkAssignments.userId, userId),
          eq(benchmarkAssignments.benchmarkId, benchmarkId)
        )
      )
      .limit(1);

    const assignment = assignmentRows[0];
    if (!assignment) return [];

    const snapshotRows = await db
      .select()
      .from(benchmarkSnapshots)
      .where(eq(benchmarkSnapshots.assignmentId, assignment.id))
      .orderBy(asc(benchmarkSnapshots.date));

    return snapshotRows.map((s) => ({
      date: s.date,
      value: s.value,
      target: s.target,
    }));
  },
};
