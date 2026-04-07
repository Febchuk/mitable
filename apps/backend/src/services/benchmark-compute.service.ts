/**
 * Benchmark Compute Service
 *
 * Core scoring engine for benchmarks. Gathers activity data from
 * userDailyActivities and activityBlocks, computes scores (direct metrics
 * or AI-weighted parameters), calculates percentiles and trends, then
 * persists results back to benchmark_assignments, snapshots, suggestions,
 * and accomplishments.
 *
 * @module benchmark-compute
 */

import { eq, and, gte, lte, lt, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  benchmarks,
  benchmarkParameters,
  benchmarkAssignments,
  benchmarkSnapshots,
  benchmarkSuggestions,
  benchmarkAccomplishments,
  benchmarkParameterScores,
  type BenchmarkParameter,
} from "../db/schema/benchmarks.schema.js";
import {
  userDailyActivities,
  activityBlocks,
  type AppBreakdownEntry,
  type CategoryBreakdownEntry,
} from "../db/schema/daily-activities.schema.js";
import { users } from "../db/schema/users.schema.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ context: "benchmark-compute" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PercentileTier = "top_1" | "top_10" | "top_25" | "top_50" | "bottom_half";
type TrendDirection = "improving" | "declining" | "stable" | "new";

export interface PeriodActivitySummary {
  totalWorkMinutes: number;
  totalMeetingMinutes: number;
  deepFocusMinutes: number;
  collaborationMinutes: number;
  avgWorkPercentage: number;
  onTaskRate: number;
  uniqueAppsUsed: string[];
  categoryBreakdown: Record<string, number>;
  accomplishmentCount: number;
  longestFocusBlockMinutes: number;
  contextSwitchCount: number;
  daysActive: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPeriodDays(frequency: string): number {
  switch (frequency) {
    case "daily":
      return 1;
    case "weekly":
      return 7;
    case "monthly":
      return 30;
    case "quarterly":
      return 90;
    default:
      return 30;
  }
}

function calculatePercentile(userProgress: number, allProgresses: number[]): PercentileTier {
  if (allProgresses.length <= 1) return "top_1";

  const sorted = [...allProgresses].sort((a, b) => b - a);
  const rank = sorted.indexOf(userProgress);
  const percentileRank = ((rank + 1) / sorted.length) * 100;

  if (percentileRank <= 1) return "top_1";
  if (percentileRank <= 10) return "top_10";
  if (percentileRank <= 25) return "top_25";
  if (percentileRank <= 50) return "top_50";
  return "bottom_half";
}

function calculateTrend(
  current: number,
  previous: number | null
): { trend: TrendDirection; trendDelta: number } {
  if (previous === null) return { trend: "new", trendDelta: 0 };
  const delta = current - previous;
  if (delta > 2) return { trend: "improving", trendDelta: Math.round(delta) };
  if (delta < -2) return { trend: "declining", trendDelta: Math.round(delta) };
  return { trend: "stable", trendDelta: Math.round(delta) };
}

function todayDateString(): string {
  return new Date().toISOString().split("T")[0]!;
}

function periodStartDate(frequency: string): string {
  const d = new Date();
  d.setDate(d.getDate() - getPeriodDays(frequency));
  return d.toISOString().split("T")[0]!;
}

// ---------------------------------------------------------------------------
// gatherPeriodActivity
// ---------------------------------------------------------------------------

async function gatherPeriodActivity(
  userId: string,
  frequency: string
): Promise<PeriodActivitySummary> {
  const startDate = periodStartDate(frequency);
  const endDate = todayDateString();

  // 1. Aggregate from userDailyActivities
  const dailyRows = await db
    .select({
      totalWorkMinutes: userDailyActivities.totalWorkMinutes,
      totalMeetingMinutes: userDailyActivities.totalMeetingMinutes,
      workPercentage: userDailyActivities.workPercentage,
      appBreakdown: userDailyActivities.appBreakdown,
      categoryBreakdown: userDailyActivities.categoryBreakdown,
      keyAccomplishments: userDailyActivities.keyAccomplishments,
      activityDate: userDailyActivities.activityDate,
    })
    .from(userDailyActivities)
    .where(
      and(
        eq(userDailyActivities.userId, userId),
        eq(userDailyActivities.periodType, "daily"),
        gte(userDailyActivities.activityDate, startDate),
        lte(userDailyActivities.activityDate, endDate)
      )
    );

  let totalWorkMinutes = 0;
  let totalMeetingMinutes = 0;
  let workPercentageSum = 0;
  let accomplishmentCount = 0;
  const allApps = new Set<string>();
  const categoryMinutes: Record<string, number> = {};
  const activeDates = new Set<string>();

  for (const row of dailyRows) {
    totalWorkMinutes += row.totalWorkMinutes ?? 0;
    totalMeetingMinutes += row.totalMeetingMinutes ?? 0;
    workPercentageSum += row.workPercentage ?? 0;
    activeDates.add(row.activityDate);

    // Parse app breakdown
    const apps = (row.appBreakdown ?? []) as AppBreakdownEntry[];
    for (const entry of apps) {
      if (entry.app) allApps.add(entry.app);
    }

    // Parse category breakdown
    const cats = (row.categoryBreakdown ?? []) as CategoryBreakdownEntry[];
    for (const entry of cats) {
      if (entry.category) {
        categoryMinutes[entry.category] =
          (categoryMinutes[entry.category] || 0) + (entry.minutes ?? 0);
      }
    }

    // Count accomplishments
    const accomplishments = (row.keyAccomplishments ?? []) as unknown[];
    accomplishmentCount += accomplishments.length;
  }

  const daysActive = activeDates.size || 1;
  const avgWorkPercentage = dailyRows.length > 0 ? workPercentageSum / dailyRows.length : 0;

  // 2. Query activityBlocks for deep focus and collaboration metrics
  const blockRows = await db
    .select({
      blockType: activityBlocks.blockType,
      durationMinutes: activityBlocks.durationMinutes,
      category: activityBlocks.category,
    })
    .from(activityBlocks)
    .where(
      and(
        eq(activityBlocks.userId, userId),
        gte(activityBlocks.startTime, new Date(startDate)),
        lte(activityBlocks.startTime, new Date(endDate + "T23:59:59Z"))
      )
    );

  let deepFocusMinutes = 0;
  let collaborationMinutes = 0;
  let longestFocusBlockMinutes = 0;

  for (const block of blockRows) {
    const dur = block.durationMinutes ?? 0;

    // Deep focus: work blocks >= 30 minutes
    if (block.blockType === "work" && dur >= 30) {
      deepFocusMinutes += dur;
      if (dur > longestFocusBlockMinutes) {
        longestFocusBlockMinutes = dur;
      }
    }

    // Collaboration: meeting blocks or communication-category blocks
    const cat = (block.category ?? "").toLowerCase();
    if (
      block.blockType === "meeting" ||
      block.blockType === "granola" ||
      block.blockType === "fireflies" ||
      cat.includes("meeting") ||
      cat.includes("communication")
    ) {
      collaborationMinutes += dur;
    }
  }

  return {
    totalWorkMinutes,
    totalMeetingMinutes,
    deepFocusMinutes,
    collaborationMinutes,
    avgWorkPercentage,
    onTaskRate: 0.7, // Default — not directly available from these tables
    uniqueAppsUsed: [...allApps],
    categoryBreakdown: categoryMinutes,
    accomplishmentCount,
    longestFocusBlockMinutes,
    contextSwitchCount: 0, // Default — not directly available from these tables
    daysActive,
  };
}

// ---------------------------------------------------------------------------
// computeDirectMetric
// ---------------------------------------------------------------------------

/**
 * Compute a direct metric and normalize it to a 1-5 scale so that all
 * benchmark scores are on a consistent range regardless of metric type.
 */
function computeDirectMetric(
  metric: string,
  unit: string,
  _category: string,
  summary: PeriodActivitySummary
): number {
  let raw: number;

  switch (metric) {
    case "minutes":
      if (unit === "min/day") {
        raw = summary.deepFocusMinutes / summary.daysActive;
      } else {
        raw = summary.totalWorkMinutes / summary.daysActive;
      }
      // Normalize: 0 min → 1, 240+ min (4 hrs) → 5
      return Math.max(1, Math.min(5, 1 + (raw / 240) * 4));

    case "percentage":
      raw = summary.avgWorkPercentage;
      // Normalize: 0% → 1, 100% → 5
      return Math.max(1, Math.min(5, 1 + (raw / 100) * 4));

    case "hours":
      if (unit === "hrs/day") {
        raw = summary.totalWorkMinutes / summary.daysActive / 60;
      } else {
        raw = summary.totalWorkMinutes / 60;
      }
      // Normalize: 0 hrs → 1, 8+ hrs → 5
      return Math.max(1, Math.min(5, 1 + (raw / 8) * 4));

    case "count":
      if (unit === "days/week") {
        raw = summary.daysActive;
        // Normalize: 0 days → 1, 5+ days → 5
        return Math.max(1, Math.min(5, 1 + (raw / 5) * 4));
      }
      raw = summary.accomplishmentCount;
      // Normalize: 0 accomplishments → 1, 10+ → 5
      return Math.max(1, Math.min(5, 1 + (raw / 10) * 4));

    default:
      raw = summary.avgWorkPercentage;
      return Math.max(1, Math.min(5, 1 + (raw / 100) * 4));
  }
}

// ---------------------------------------------------------------------------
// computeScores — main pipeline
// ---------------------------------------------------------------------------

async function computeScores(benchmarkId: string, organizationId: string): Promise<void> {
  try {
    logger.info({ benchmarkId, organizationId }, "Starting benchmark score computation");

    // 1. Load benchmark
    const [benchmark] = await db
      .select()
      .from(benchmarks)
      .where(and(eq(benchmarks.id, benchmarkId), eq(benchmarks.organizationId, organizationId)))
      .limit(1);

    if (!benchmark) {
      logger.warn({ benchmarkId }, "Benchmark not found");
      return;
    }

    // 2. Load parameters (for weighted_parameters metric)
    const parameters: BenchmarkParameter[] = await db
      .select()
      .from(benchmarkParameters)
      .where(eq(benchmarkParameters.benchmarkId, benchmarkId));

    // 3. Load assignments with user names
    const assignments = await db
      .select({
        id: benchmarkAssignments.id,
        userId: benchmarkAssignments.userId,
        targetValue: benchmarkAssignments.targetValue,
        currentValue: benchmarkAssignments.currentValue,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(benchmarkAssignments)
      .innerJoin(users, eq(benchmarkAssignments.userId, users.id))
      .where(eq(benchmarkAssignments.benchmarkId, benchmarkId));

    if (assignments.length === 0) {
      logger.info({ benchmarkId }, "No assignments found, skipping");
      return;
    }

    const today = todayDateString();
    const pStart = periodStartDate(benchmark.frequency);

    // Collect computed results before batch updates
    const results: Array<{
      assignmentId: string;
      userId: string;
      userName: string;
      currentValue: number;
      progress: number;
      parameterScores: Array<{ parameterId: string; score: number; reasoning: string }>;
      periodSummary: PeriodActivitySummary;
    }> = [];

    // 4. Score each assignment
    for (const assignment of assignments) {
      const userName =
        [assignment.firstName, assignment.lastName].filter(Boolean).join(" ") || "User";

      const periodSummary = await gatherPeriodActivity(assignment.userId, benchmark.frequency);

      let currentValue: number;
      let parameterScores: Array<{
        parameterId: string;
        score: number;
        reasoning: string;
      }> = [];

      if (benchmark.metric === "weighted_parameters" && parameters.length > 0) {
        // AI-scored weighted parameters
        try {
          const { benchmarkAIService } = await import("./benchmark-ai.service.js");
          // Map to AI service's BenchmarkParameter shape (description: string, not null)
          const aiParams = parameters.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description ?? "",
            importance: p.importance,
          }));
          const scores: Array<{ parameterId: string; score: number; reasoning: string }> =
            await benchmarkAIService.scoreParameters(aiParams, periodSummary);
          parameterScores = scores;

          const totalWeight = parameters.reduce((sum, p) => sum + p.importance, 0);
          currentValue =
            parameters.reduce((sum, p) => {
              const paramScore =
                scores.find((s: { parameterId: string }) => s.parameterId === p.id)?.score ?? 3;
              return sum + paramScore * p.importance;
            }, 0) / totalWeight;
        } catch (err) {
          logger.error(
            { err, benchmarkId, assignmentId: assignment.id },
            "AI parameter scoring failed, falling back to rule-based"
          );
          // Fallback: use avgWorkPercentage mapped to 1-5 scale
          currentValue = Math.max(1, Math.min(5, (periodSummary.avgWorkPercentage / 100) * 5));
        }
      } else {
        // Direct metric computation
        currentValue = computeDirectMetric(
          benchmark.metric,
          benchmark.unit,
          benchmark.category,
          periodSummary
        );
      }

      // Score is always 0-100: AI grades each parameter 1-5, weighted average maps to 0-100
      const progress = Math.min(100, Math.max(0, (currentValue / 5) * 100));

      results.push({
        assignmentId: assignment.id,
        userId: assignment.userId,
        userName,
        currentValue,
        progress,
        parameterScores,
        periodSummary,
      });
    }

    // 5. Calculate percentiles
    const allProgresses = results.map((r) => r.progress);

    // 6. Calculate trends and persist everything
    for (const result of results) {
      const percentile = calculatePercentile(result.progress, allProgresses);

      // Get previous snapshot for trend calculation (before today, not including today)
      const [previousSnapshot] = await db
        .select({ value: benchmarkSnapshots.value })
        .from(benchmarkSnapshots)
        .where(
          and(
            eq(benchmarkSnapshots.assignmentId, result.assignmentId),
            lt(benchmarkSnapshots.date, today)
          )
        )
        .orderBy(desc(benchmarkSnapshots.date))
        .limit(1);

      const { trend, trendDelta } = calculateTrend(
        result.currentValue,
        previousSnapshot?.value ?? null
      );

      // 7. Update assignment row
      await db
        .update(benchmarkAssignments)
        .set({
          currentValue: result.currentValue,
          progress: result.progress,
          percentile,
          trend,
          trendDelta,
          updatedAt: new Date(),
        })
        .where(eq(benchmarkAssignments.id, result.assignmentId));

      // 8. Insert parameter scores (for weighted_parameters)
      if (benchmark.metric === "weighted_parameters" && result.parameterScores.length > 0) {
        // Delete old scores for this period
        await db
          .delete(benchmarkParameterScores)
          .where(
            and(
              eq(benchmarkParameterScores.assignmentId, result.assignmentId),
              eq(benchmarkParameterScores.periodStart, pStart)
            )
          );

        await db.insert(benchmarkParameterScores).values(
          result.parameterScores.map((ps) => ({
            assignmentId: result.assignmentId,
            parameterId: ps.parameterId,
            score: ps.score,
            reasoning: ps.reasoning,
            periodStart: pStart,
          }))
        );
      }

      // 9. Upsert snapshot (store progress 0-100 so charts are consistent)
      // Delete any existing snapshot for today to avoid duplicates on re-run
      await db
        .delete(benchmarkSnapshots)
        .where(
          and(
            eq(benchmarkSnapshots.assignmentId, result.assignmentId),
            eq(benchmarkSnapshots.date, today)
          )
        );
      await db.insert(benchmarkSnapshots).values({
        assignmentId: result.assignmentId,
        date: today,
        value: result.progress,
        target: 100,
      });

      // 10. Generate suggestions and accomplishments via AI
      try {
        const { benchmarkAIService } = await import("./benchmark-ai.service.js");

        // Map parameters to PriorityParam shape expected by the AI service
        const priorities = parameters.map((p) => {
          const paramScore = result.parameterScores.find((ps) => ps.parameterId === p.id);
          const score = paramScore?.score ?? 3;
          return {
            name: p.name,
            description: p.description ?? "",
            score,
            importance: p.importance,
            gap: 5 - score, // Gap from maximum score of 5
          };
        });

        const [suggestions, accomplishments]: [
          Array<{ text: string; category: string }>,
          Array<{ text: string }>,
        ] = await Promise.all([
          benchmarkAIService.generateSuggestions(priorities, result.periodSummary, result.userName),
          benchmarkAIService.detectAccomplishments(result.periodSummary, result.userName),
        ]);

        // Delete old suggestions and accomplishments for this assignment
        await Promise.all([
          db
            .delete(benchmarkSuggestions)
            .where(eq(benchmarkSuggestions.assignmentId, result.assignmentId)),
          db
            .delete(benchmarkAccomplishments)
            .where(eq(benchmarkAccomplishments.assignmentId, result.assignmentId)),
        ]);

        // Insert new suggestions
        if (suggestions.length > 0) {
          await db.insert(benchmarkSuggestions).values(
            suggestions.map((s: { text: string; category: string }) => ({
              assignmentId: result.assignmentId,
              text: s.text,
              category: s.category,
            }))
          );
        }

        // Insert new accomplishments
        if (accomplishments.length > 0) {
          await db.insert(benchmarkAccomplishments).values(
            accomplishments.map((a: { text: string }) => ({
              assignmentId: result.assignmentId,
              text: a.text,
              date: today,
            }))
          );
        }
      } catch (err) {
        logger.error(
          { err, assignmentId: result.assignmentId },
          "Failed to generate AI suggestions/accomplishments, skipping"
        );
      }
    }

    logger.info(
      {
        benchmarkId,
        assignmentCount: results.length,
      },
      "Benchmark score computation completed"
    );
  } catch (error) {
    logger.error(
      {
        benchmarkId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Benchmark score computation failed"
    );
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const benchmarkComputeService = {
  computeScores,
  gatherPeriodActivity,
};
