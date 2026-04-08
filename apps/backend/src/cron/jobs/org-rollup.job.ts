/**
 * Org Rollup Job (Layer 2)
 *
 * Runs every 30 minutes, AFTER the user rollup job.
 * Reads from user_daily_activities (Layer 1 output) and computes
 * org-wide averages and distributions for the admin Dashboard.
 *
 * Pure math — no AI / LLM calls. Fast execution.
 */

import { db } from "../../db/client";
import * as schema from "../../db/schema/index";
import { eq, and, sql } from "drizzle-orm";
import {
  AppBreakdownEntry,
  CategoryBreakdownEntry,
  OrgActivityDistributionEntry,
  OrgTopAppEntry,
  OrgUserSummaryEntry,
} from "../../db/schema/daily-activities.schema";
import { createLogger } from "../../lib/logger";

const logger = createLogger({ context: "org-rollup-job" });

/**
 * Run the org rollup for all organizations for a given date.
 * Pass a targetDate to backfill historical days.
 */
export async function runOrgRollup(targetDate?: Date): Promise<{
  orgsProcessed: number;
  totalTimeMs: number;
}> {
  const startTime = Date.now();
  const day = targetDate ? new Date(targetDate) : new Date();
  day.setHours(0, 0, 0, 0);
  const todayStr = day.toISOString().split("T")[0]!;

  logger.info({ date: todayStr }, "Starting org rollup job");

  // Find all orgs that have user rollups for today
  const orgsWithData = await db
    .selectDistinct({
      organizationId: schema.userDailyActivities.organizationId,
    })
    .from(schema.userDailyActivities)
    .where(
      and(
        eq(schema.userDailyActivities.activityDate, todayStr),
        eq(schema.userDailyActivities.periodType, "daily"),
        eq(schema.userDailyActivities.status, "completed")
      )
    );

  let orgsProcessed = 0;

  for (const { organizationId } of orgsWithData) {
    try {
      await processOrgDay(organizationId, todayStr);
      orgsProcessed++;
    } catch (error) {
      logger.error({ organizationId, error: String(error) }, "Failed to process org rollup");
    }
  }

  const totalTimeMs = Date.now() - startTime;
  logger.info({ orgsProcessed, totalTimeMs }, "Org rollup job completed");

  return { orgsProcessed, totalTimeMs };
}

/**
 * Compute org-wide metrics from user_daily_activities for a single org + date.
 */
async function processOrgDay(organizationId: string, todayStr: string): Promise<void> {
  // Fetch all completed user rollups for this org today
  const userRollups = await db
    .select()
    .from(schema.userDailyActivities)
    .where(
      and(
        eq(schema.userDailyActivities.organizationId, organizationId),
        eq(schema.userDailyActivities.activityDate, todayStr),
        eq(schema.userDailyActivities.periodType, "daily"),
        eq(schema.userDailyActivities.status, "completed")
      )
    );

  if (userRollups.length === 0) return;

  // Fetch user names for the summary
  const userIds = userRollups.map((r) => r.userId);
  const users = await db
    .select({
      id: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .where(
      sql`${schema.users.id} IN (${sql.join(
        userIds.map((id) => sql`${id}::uuid`),
        sql`, `
      )})`
    );

  const userNameMap = new Map(
    users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown"])
  );

  const count = userRollups.length;

  const totalTeamWorkMinutes = userRollups.reduce((sum, r) => sum + r.totalWorkMinutes, 0);
  const totalTeamMeetingMinutes = userRollups.reduce((sum, r) => sum + r.totalMeetingMinutes, 0);
  const totalTeamActiveMinutes = totalTeamWorkMinutes + totalTeamMeetingMinutes;

  // Aggregate activity distribution across all users
  const categoryTotals = new Map<string, number>();
  for (const rollup of userRollups) {
    const breakdown = (rollup.categoryBreakdown || []) as CategoryBreakdownEntry[];
    for (const entry of breakdown) {
      categoryTotals.set(entry.category, (categoryTotals.get(entry.category) || 0) + entry.minutes);
    }
  }
  const activityDistribution: OrgActivityDistributionEntry[] = [...categoryTotals.entries()]
    .map(([category, totalMinutes]) => ({
      category,
      totalMinutes,
      percentage:
        totalTeamActiveMinutes > 0 ? Math.round((totalMinutes / totalTeamActiveMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  // Aggregate top apps across all users
  const appTotals = new Map<string, { totalMinutes: number; users: Set<string> }>();
  for (const rollup of userRollups) {
    const breakdown = (rollup.appBreakdown || []) as AppBreakdownEntry[];
    for (const entry of breakdown) {
      const existing = appTotals.get(entry.app) || { totalMinutes: 0, users: new Set<string>() };
      existing.totalMinutes += entry.minutes;
      existing.users.add(rollup.userId);
      appTotals.set(entry.app, existing);
    }
  }
  const topApps: OrgTopAppEntry[] = [...appTotals.entries()]
    .map(([app, data]) => ({
      app,
      totalMinutes: Math.round(data.totalMinutes),
      userCount: data.users.size,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 15); // Top 15 apps

  // Per-user summaries
  const userSummaries: OrgUserSummaryEntry[] = userRollups.map((r) => ({
    userId: r.userId,
    name: userNameMap.get(r.userId) || "Unknown",
    activeMinutes: r.totalActiveMinutes,
    workPct: r.workPercentage,
    meetingPct: r.meetingPercentage,
  }));

  // Upsert org_daily_metrics
  const [existing] = await db
    .select({ id: schema.orgDailyMetrics.id })
    .from(schema.orgDailyMetrics)
    .where(
      and(
        eq(schema.orgDailyMetrics.organizationId, organizationId),
        eq(schema.orgDailyMetrics.metricsDate, todayStr),
        eq(schema.orgDailyMetrics.periodType, "daily")
      )
    )
    .limit(1);

  const metricsData = {
    avgWorkMinutes: 0,
    avgMeetingMinutes: 0,
    avgActiveMinutes: 0,
    avgWorkPercentage: 0,
    avgMeetingPercentage: 0,
    totalUsersTracked: count,
    totalTeamWorkMinutes,
    totalTeamMeetingMinutes,
    activityDistribution: JSON.stringify(activityDistribution),
    topApps: JSON.stringify(topApps),
    userSummaries: JSON.stringify(userSummaries),
    lastProcessedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(schema.orgDailyMetrics)
      .set(metricsData)
      .where(eq(schema.orgDailyMetrics.id, existing.id));
  } else {
    await db.insert(schema.orgDailyMetrics).values({
      organizationId,
      metricsDate: todayStr,
      periodType: "daily",
      ...metricsData,
    });
  }

  logger.info(
    {
      organizationId,
      date: todayStr,
      usersTracked: count,
      totalActiveMinutes: totalTeamActiveMinutes,
      topCategories: activityDistribution.slice(0, 3).map((d) => d.category),
    },
    "Wrote org daily metrics"
  );
}
