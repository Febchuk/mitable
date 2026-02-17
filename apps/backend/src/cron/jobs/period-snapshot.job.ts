/**
 * Period Snapshot Job (Layer 3)
 *
 * Runs once daily at midnight.
 * Consolidates daily rollups into weekly and monthly snapshots.
 * Enables the Today / Week / Month / YTD time filters on the admin dashboard.
 *
 * Pure math — no AI / LLM calls. Aggregates existing daily rows.
 */

import { db } from "../../db/client";
import * as schema from "../../db/schema/index";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  AppBreakdownEntry,
  CategoryBreakdownEntry,
  OrgActivityDistributionEntry,
  OrgTopAppEntry,
} from "../../db/schema/daily-activities.schema";
import { createLogger } from "../../lib/logger";

const logger = createLogger({ context: "period-snapshot-job" });

/**
 * Run period snapshots for all orgs.
 * Creates/updates weekly and monthly rollups from daily data.
 */
export async function runPeriodSnapshots(): Promise<{
  weeklySnapshots: number;
  monthlySnapshots: number;
  totalTimeMs: number;
}> {
  const startTime = Date.now();
  const today = new Date();

  logger.info("Starting period snapshot job");

  // Get all orgs that have daily data
  const orgs = await db
    .selectDistinct({ organizationId: schema.userDailyActivities.organizationId })
    .from(schema.userDailyActivities)
    .where(eq(schema.userDailyActivities.periodType, "daily"));

  let weeklySnapshots = 0;
  let monthlySnapshots = 0;

  for (const { organizationId } of orgs) {
    try {
      const weekly = await createWeeklySnapshot(organizationId, today);
      if (weekly) weeklySnapshots++;

      const monthly = await createMonthlySnapshot(organizationId, today);
      if (monthly) monthlySnapshots++;
    } catch (error) {
      logger.error(
        { organizationId, error: String(error) },
        "Failed to create period snapshots"
      );
    }
  }

  const totalTimeMs = Date.now() - startTime;
  logger.info({ weeklySnapshots, monthlySnapshots, totalTimeMs }, "Period snapshot job completed");

  return { weeklySnapshots, monthlySnapshots, totalTimeMs };
}

/**
 * Create a weekly snapshot for the current week (Monday-Sunday).
 */
async function createWeeklySnapshot(
  organizationId: string,
  today: Date
): Promise<boolean> {
  // Get Monday of this week
  const monday = new Date(today);
  const dayOfWeek = monday.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday = 1
  monday.setDate(monday.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const mondayStr = monday.toISOString().split("T")[0]!;
  const sundayStr = sunday.toISOString().split("T")[0]!;

  // Aggregate user daily data for the week
  const userDailyRows = await db
    .select()
    .from(schema.userDailyActivities)
    .where(
      and(
        eq(schema.userDailyActivities.organizationId, organizationId),
        eq(schema.userDailyActivities.periodType, "daily"),
        eq(schema.userDailyActivities.status, "completed"),
        gte(schema.userDailyActivities.activityDate, mondayStr),
        lte(schema.userDailyActivities.activityDate, sundayStr)
      )
    );

  if (userDailyRows.length === 0) return false;

  // Group by user, aggregate across days
  const userWeekly = aggregateUserPeriod(userDailyRows);

  // Write per-user weekly rollups
  for (const entry of userWeekly) {
    await upsertUserPeriodRollup(entry, organizationId, mondayStr, "weekly");
  }

  // Compute org-level weekly metrics
  await upsertOrgPeriodMetrics(organizationId, mondayStr, "weekly", userWeekly);

  return true;
}

/**
 * Create a monthly snapshot for the current month.
 */
async function createMonthlySnapshot(
  organizationId: string,
  today: Date
): Promise<boolean> {
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const firstStr = firstOfMonth.toISOString().split("T")[0]!;
  const lastStr = lastOfMonth.toISOString().split("T")[0]!;

  const userDailyRows = await db
    .select()
    .from(schema.userDailyActivities)
    .where(
      and(
        eq(schema.userDailyActivities.organizationId, organizationId),
        eq(schema.userDailyActivities.periodType, "daily"),
        eq(schema.userDailyActivities.status, "completed"),
        gte(schema.userDailyActivities.activityDate, firstStr),
        lte(schema.userDailyActivities.activityDate, lastStr)
      )
    );

  if (userDailyRows.length === 0) return false;

  const userMonthly = aggregateUserPeriod(userDailyRows);

  for (const entry of userMonthly) {
    await upsertUserPeriodRollup(entry, organizationId, firstStr, "monthly");
  }

  await upsertOrgPeriodMetrics(organizationId, firstStr, "monthly", userMonthly);

  return true;
}

// ============================================================================
// Aggregation helpers
// ============================================================================

interface UserPeriodAggregate {
  userId: string;
  totalWorkMinutes: number;
  totalMeetingMinutes: number;
  totalActiveMinutes: number;
  totalSessions: number;
  totalCaptures: number;
  workPercentage: number;
  meetingPercentage: number;
  appBreakdown: AppBreakdownEntry[];
  categoryBreakdown: CategoryBreakdownEntry[];
  daySummary: string;
  daysTracked: number;
}

/**
 * Aggregate daily user rows into per-user period totals.
 */
function aggregateUserPeriod(
  dailyRows: (typeof schema.userDailyActivities.$inferSelect)[]
): UserPeriodAggregate[] {
  const byUser = new Map<string, (typeof schema.userDailyActivities.$inferSelect)[]>();

  for (const row of dailyRows) {
    const existing = byUser.get(row.userId) || [];
    existing.push(row);
    byUser.set(row.userId, existing);
  }

  const results: UserPeriodAggregate[] = [];

  for (const [userId, rows] of byUser) {
    const totalWorkMinutes = rows.reduce((s, r) => s + r.totalWorkMinutes, 0);
    const totalMeetingMinutes = rows.reduce((s, r) => s + r.totalMeetingMinutes, 0);
    const totalActiveMinutes = rows.reduce((s, r) => s + r.totalActiveMinutes, 0);
    const totalSessions = rows.reduce((s, r) => s + r.totalSessions, 0);
    const totalCaptures = rows.reduce((s, r) => s + r.totalCaptures, 0);

    // Merge app breakdowns
    const appMap = new Map<string, number>();
    for (const row of rows) {
      for (const entry of (row.appBreakdown || []) as AppBreakdownEntry[]) {
        appMap.set(entry.app, (appMap.get(entry.app) || 0) + entry.minutes);
      }
    }
    const appBreakdown = [...appMap.entries()]
      .map(([app, minutes]) => ({ app, minutes }))
      .sort((a, b) => b.minutes - a.minutes);

    // Merge category breakdowns
    const catMap = new Map<string, number>();
    for (const row of rows) {
      for (const entry of (row.categoryBreakdown || []) as CategoryBreakdownEntry[]) {
        catMap.set(entry.category, (catMap.get(entry.category) || 0) + entry.minutes);
      }
    }
    const categoryBreakdown = [...catMap.entries()]
      .map(([category, minutes]) => ({
        category,
        minutes,
        percentage:
          totalActiveMinutes > 0 ? Math.round((minutes / totalActiveMinutes) * 100) : 0,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    // Concatenate day summaries
    const daySummary = rows
      .filter((r) => r.daySummary)
      .map((r) => r.daySummary)
      .join(" ");

    results.push({
      userId,
      totalWorkMinutes,
      totalMeetingMinutes,
      totalActiveMinutes,
      totalSessions,
      totalCaptures,
      workPercentage:
        totalActiveMinutes > 0 ? Math.round((totalWorkMinutes / totalActiveMinutes) * 100) : 0,
      meetingPercentage:
        totalActiveMinutes > 0
          ? Math.round((totalMeetingMinutes / totalActiveMinutes) * 100)
          : 0,
      appBreakdown,
      categoryBreakdown,
      daySummary,
      daysTracked: rows.length,
    });
  }

  return results;
}

/**
 * Upsert a per-user period rollup (weekly or monthly).
 */
async function upsertUserPeriodRollup(
  entry: UserPeriodAggregate,
  organizationId: string,
  periodDate: string,
  periodType: string
): Promise<void> {
  const [existing] = await db
    .select({ id: schema.userDailyActivities.id })
    .from(schema.userDailyActivities)
    .where(
      and(
        eq(schema.userDailyActivities.userId, entry.userId),
        eq(schema.userDailyActivities.activityDate, periodDate),
        eq(schema.userDailyActivities.periodType, periodType)
      )
    )
    .limit(1);

  const data = {
    totalWorkMinutes: entry.totalWorkMinutes,
    totalMeetingMinutes: entry.totalMeetingMinutes,
    totalActiveMinutes: entry.totalActiveMinutes,
    totalSessions: entry.totalSessions,
    totalCaptures: entry.totalCaptures,
    workPercentage: entry.workPercentage,
    meetingPercentage: entry.meetingPercentage,
    appBreakdown: JSON.stringify(entry.appBreakdown),
    categoryBreakdown: JSON.stringify(entry.categoryBreakdown),
    daySummary: entry.daySummary,
    status: "completed" as const,
    lastProcessedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(schema.userDailyActivities)
      .set(data)
      .where(eq(schema.userDailyActivities.id, existing.id));
  } else {
    await db.insert(schema.userDailyActivities).values({
      userId: entry.userId,
      organizationId,
      activityDate: periodDate,
      periodType,
      ...data,
    });
  }
}

/**
 * Upsert org-level period metrics (weekly or monthly).
 */
async function upsertOrgPeriodMetrics(
  organizationId: string,
  periodDate: string,
  periodType: string,
  userAggregates: UserPeriodAggregate[]
): Promise<void> {
  const count = userAggregates.length;
  if (count === 0) return;

  const avgWorkMinutes =
    userAggregates.reduce((s, u) => s + u.totalWorkMinutes, 0) / count;
  const avgMeetingMinutes =
    userAggregates.reduce((s, u) => s + u.totalMeetingMinutes, 0) / count;
  const avgActiveMinutes =
    userAggregates.reduce((s, u) => s + u.totalActiveMinutes, 0) / count;
  const totalTeamWork = userAggregates.reduce((s, u) => s + u.totalWorkMinutes, 0);
  const totalTeamMeeting = userAggregates.reduce((s, u) => s + u.totalMeetingMinutes, 0);
  const totalTeamActive = totalTeamWork + totalTeamMeeting;

  // Activity distribution
  const catTotals = new Map<string, number>();
  for (const u of userAggregates) {
    for (const c of u.categoryBreakdown) {
      catTotals.set(c.category, (catTotals.get(c.category) || 0) + c.minutes);
    }
  }
  const activityDistribution: OrgActivityDistributionEntry[] = [...catTotals.entries()]
    .map(([category, totalMinutes]) => ({
      category,
      totalMinutes,
      percentage:
        totalTeamActive > 0 ? Math.round((totalMinutes / totalTeamActive) * 100) : 0,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  // Top apps
  const appTotals = new Map<string, { totalMinutes: number; users: Set<string> }>();
  for (const u of userAggregates) {
    for (const a of u.appBreakdown) {
      const e = appTotals.get(a.app) || { totalMinutes: 0, users: new Set<string>() };
      e.totalMinutes += a.minutes;
      e.users.add(u.userId);
      appTotals.set(a.app, e);
    }
  }
  const topApps: OrgTopAppEntry[] = [...appTotals.entries()]
    .map(([app, d]) => ({ app, totalMinutes: Math.round(d.totalMinutes), userCount: d.users.size }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 15);

  const metricsData = {
    avgWorkMinutes: Math.round(avgWorkMinutes * 10) / 10,
    avgMeetingMinutes: Math.round(avgMeetingMinutes * 10) / 10,
    avgActiveMinutes: Math.round(avgActiveMinutes * 10) / 10,
    avgWorkPercentage:
      avgActiveMinutes > 0 ? Math.round((avgWorkMinutes / avgActiveMinutes) * 100 * 10) / 10 : 0,
    avgMeetingPercentage:
      avgActiveMinutes > 0
        ? Math.round((avgMeetingMinutes / avgActiveMinutes) * 100 * 10) / 10
        : 0,
    totalUsersTracked: count,
    totalTeamWorkMinutes: totalTeamWork,
    totalTeamMeetingMinutes: totalTeamMeeting,
    activityDistribution: JSON.stringify(activityDistribution),
    topApps: JSON.stringify(topApps),
    userSummaries: JSON.stringify([]), // Summaries only meaningful for daily
    lastProcessedAt: new Date(),
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: schema.orgDailyMetrics.id })
    .from(schema.orgDailyMetrics)
    .where(
      and(
        eq(schema.orgDailyMetrics.organizationId, organizationId),
        eq(schema.orgDailyMetrics.metricsDate, periodDate),
        eq(schema.orgDailyMetrics.periodType, periodType)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(schema.orgDailyMetrics)
      .set(metricsData)
      .where(eq(schema.orgDailyMetrics.id, existing.id));
  } else {
    await db.insert(schema.orgDailyMetrics).values({
      organizationId,
      metricsDate: periodDate,
      periodType,
      ...metricsData,
    });
  }
}
