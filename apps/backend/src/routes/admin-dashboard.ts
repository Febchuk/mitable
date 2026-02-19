/**
 * Admin Dashboard API Routes
 *
 * Endpoints serving pre-computed data from the cron pipeline:
 *   - GET /admin/dashboard          → Org-wide metrics (from org_daily_metrics)
 *   - GET /admin/dashboard/people   → Per-user activity list (from user_daily_activities)
 *   - GET /admin/dashboard/people/:id → User detail with activity blocks
 */

import { Router, Request, Response } from "express";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { createLogger } from "../lib/logger";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../config";

const logger = createLogger({ context: "admin-dashboard-routes" });
const router = Router();

/**
 * Helper: Verify the requesting user is an admin and return their org ID.
 */
async function verifyAdmin(
  req: Request,
  res: Response
): Promise<{ organizationId: string; userId: string; firstName: string | null } | null> {
  const userId = req.userId!;

  const [user] = await db
    .select({
      id: schema.users.id,
      organizationId: schema.users.organizationId,
      role: schema.users.role,
      firstName: schema.users.firstName,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Forbidden", message: "Admin access required" });
    return null;
  }

  return { organizationId: user.organizationId, userId: user.id, firstName: user.firstName };
}

/**
 * Helper: Resolve date range from period query param.
 */
function resolveDateRange(period: string): { startDate: string; endDate: string; periodType: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0]!;

  switch (period) {
    case "week": {
      const monday = new Date(today);
      const dayOfWeek = monday.getDay();
      monday.setDate(monday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      return { startDate: monday.toISOString().split("T")[0]!, endDate: todayStr, periodType: "daily" };
    }
    case "month": {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: firstOfMonth.toISOString().split("T")[0]!, endDate: todayStr, periodType: "daily" };
    }
    case "ytd": {
      const firstOfYear = new Date(today.getFullYear(), 0, 1);
      return { startDate: firstOfYear.toISOString().split("T")[0]!, endDate: todayStr, periodType: "daily" };
    }
    default: // "today"
      return { startDate: todayStr, endDate: todayStr, periodType: "daily" };
  }
}

// ============================================================================
// Helper: Compute org-level aggregates on-the-fly from user_daily_activities
// Used for "today" so the dashboard is always as fresh as the last capture rollup.
// ============================================================================
interface LiveOrgMetrics {
  avgWorkMinutes: number;
  avgMeetingMinutes: number;
  avgActiveMinutes: number;
  avgWorkPercentage: number;
  avgMeetingPercentage: number;
  totalUsersTracked: number;
  totalTeamWorkMinutes: number;
  totalTeamMeetingMinutes: number;
  activityDistribution: { category: string; totalMinutes: number; percentage: number }[];
  topApps: { app: string; totalMinutes: number; userCount: number }[];
  userSummaries: { userId: string; name: string; activeMinutes: number; workPct: number; meetingPct: number }[];
}

async function computeLiveOrgMetrics(organizationId: string, dateStr: string): Promise<LiveOrgMetrics | null> {
  // Fetch all user daily activities for this org on this date
  const userRows = await db
    .select({
      userId: schema.userDailyActivities.userId,
      totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
      totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
      totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
      workPercentage: schema.userDailyActivities.workPercentage,
      meetingPercentage: schema.userDailyActivities.meetingPercentage,
      appBreakdown: schema.userDailyActivities.appBreakdown,
      categoryBreakdown: schema.userDailyActivities.categoryBreakdown,
    })
    .from(schema.userDailyActivities)
    .where(
      and(
        eq(schema.userDailyActivities.organizationId, organizationId),
        eq(schema.userDailyActivities.activityDate, dateStr),
        eq(schema.userDailyActivities.periodType, "daily")
      )
    );

  if (userRows.length === 0) return null;

  const count = userRows.length;

  // Averages
  const avgWorkMinutes = Math.round((userRows.reduce((s, r) => s + r.totalWorkMinutes, 0) / count) * 10) / 10;
  const avgMeetingMinutes = Math.round((userRows.reduce((s, r) => s + r.totalMeetingMinutes, 0) / count) * 10) / 10;
  const avgActiveMinutes = Math.round((userRows.reduce((s, r) => s + r.totalActiveMinutes, 0) / count) * 10) / 10;

  // Totals
  const totalTeamWorkMinutes = userRows.reduce((s, r) => s + r.totalWorkMinutes, 0);
  const totalTeamMeetingMinutes = userRows.reduce((s, r) => s + r.totalMeetingMinutes, 0);
  const totalTeamActive = totalTeamWorkMinutes + totalTeamMeetingMinutes;

  // Activity distribution (aggregate category breakdowns)
  const categoryTotals = new Map<string, number>();
  for (const row of userRows) {
    const breakdown = (row.categoryBreakdown || []) as { category: string; minutes: number }[];
    for (const entry of breakdown) {
      categoryTotals.set(entry.category, (categoryTotals.get(entry.category) || 0) + entry.minutes);
    }
  }
  const activityDistribution = [...categoryTotals.entries()]
    .map(([category, totalMinutes]) => ({
      category,
      totalMinutes,
      percentage: totalTeamActive > 0 ? Math.round((totalMinutes / totalTeamActive) * 100) : 0,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  // Top apps (aggregate app breakdowns)
  const appTotals = new Map<string, { totalMinutes: number; users: Set<string> }>();
  for (const row of userRows) {
    const breakdown = (row.appBreakdown || []) as { app: string; minutes: number }[];
    for (const entry of breakdown) {
      const existing = appTotals.get(entry.app) || { totalMinutes: 0, users: new Set<string>() };
      existing.totalMinutes += entry.minutes;
      existing.users.add(row.userId);
      appTotals.set(entry.app, existing);
    }
  }
  const topApps = [...appTotals.entries()]
    .map(([app, data]) => ({ app, totalMinutes: Math.round(data.totalMinutes), userCount: data.users.size }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 15);

  // User summaries (fetch names)
  const userIds = userRows.map((r) => r.userId);
  const users = await db
    .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName })
    .from(schema.users)
    .where(
      sql`${schema.users.id} IN (${sql.join(userIds.map((id) => sql`${id}::uuid`), sql`, `)})`
    );
  const nameMap = new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown"]));

  const userSummaries = userRows.map((r) => ({
    userId: r.userId,
    name: nameMap.get(r.userId) || "Unknown",
    activeMinutes: r.totalActiveMinutes,
    workPct: r.workPercentage,
    meetingPct: r.meetingPercentage,
  }));

  return {
    avgWorkMinutes,
    avgMeetingMinutes,
    avgActiveMinutes,
    avgWorkPercentage: avgActiveMinutes > 0 ? Math.round((avgWorkMinutes / avgActiveMinutes) * 100) : 0,
    avgMeetingPercentage: avgActiveMinutes > 0 ? Math.round((avgMeetingMinutes / avgActiveMinutes) * 100) : 0,
    totalUsersTracked: count,
    totalTeamWorkMinutes,
    totalTeamMeetingMinutes,
    activityDistribution,
    topApps,
    userSummaries,
  };
}

// ============================================================================
// GET /admin/dashboard?period=today|week|month|ytd
// Returns org-wide metrics for the admin Dashboard view.
//   - "today": computed on-the-fly from user_daily_activities (always fresh)
//   - "week/month/ytd": historical days from org_daily_metrics + today on-the-fly
// ============================================================================
router.get("/dashboard", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const period = (req.query.period as string) || "today";
    const { startDate, endDate } = resolveDateRange(period);
    const todayStr = new Date().toISOString().split("T")[0]!;

    // ── "today" — always compute live from user_daily_activities ──
    if (period === "today") {
      const live = await computeLiveOrgMetrics(admin.organizationId, todayStr);

      if (!live) {
        res.json({
          period,
          hasData: false,
          metrics: {
            avgWorkMinutes: 0, avgMeetingMinutes: 0, avgActiveMinutes: 0,
            avgWorkPercentage: 0, avgMeetingPercentage: 0,
            totalUsersTracked: 0, totalTeamWorkMinutes: 0, totalTeamMeetingMinutes: 0,
          },
          activityDistribution: [],
          topApps: [],
          userSummaries: [],
          dailyTrend: [],
        });
        return;
      }

      res.json({
        period,
        hasData: true,
        metrics: {
          avgWorkMinutes: live.avgWorkMinutes,
          avgMeetingMinutes: live.avgMeetingMinutes,
          avgActiveMinutes: live.avgActiveMinutes,
          avgWorkPercentage: live.avgWorkPercentage,
          avgMeetingPercentage: live.avgMeetingPercentage,
          totalUsersTracked: live.totalUsersTracked,
          totalTeamWorkMinutes: live.totalTeamWorkMinutes,
          totalTeamMeetingMinutes: live.totalTeamMeetingMinutes,
        },
        activityDistribution: live.activityDistribution,
        topApps: live.topApps,
        userSummaries: live.userSummaries,
        dailyTrend: [{
          date: todayStr,
          avgActiveMinutes: live.avgActiveMinutes,
          avgWorkMinutes: live.avgWorkMinutes,
          avgMeetingMinutes: live.avgMeetingMinutes,
          usersTracked: live.totalUsersTracked,
        }],
      });
      return;
    }

    // ── Multi-day periods — historical from org_daily_metrics + today live ──

    // Fetch historical org metrics (past days, not including today)
    const historicalMetrics = await db
      .select()
      .from(schema.orgDailyMetrics)
      .where(
        and(
          eq(schema.orgDailyMetrics.organizationId, admin.organizationId),
          gte(schema.orgDailyMetrics.metricsDate, startDate),
          lte(schema.orgDailyMetrics.metricsDate, endDate),
          eq(schema.orgDailyMetrics.periodType, "daily")
        )
      )
      .orderBy(desc(schema.orgDailyMetrics.metricsDate));

    // Compute today's live data
    const todayLive = await computeLiveOrgMetrics(admin.organizationId, todayStr);

    // Build daily trend combining historical + today
    const dailyTrend: { date: string; avgActiveMinutes: number; avgWorkMinutes: number; avgMeetingMinutes: number; usersTracked: number }[] = [];

    for (const d of historicalMetrics) {
      // Skip today from historical if it exists (we'll use live data instead)
      if (d.metricsDate === todayStr) continue;
      dailyTrend.push({
        date: d.metricsDate,
        avgActiveMinutes: d.avgActiveMinutes,
        avgWorkMinutes: d.avgWorkMinutes,
        avgMeetingMinutes: d.avgMeetingMinutes,
        usersTracked: d.totalUsersTracked,
      });
    }

    if (todayLive) {
      dailyTrend.push({
        date: todayStr,
        avgActiveMinutes: todayLive.avgActiveMinutes,
        avgWorkMinutes: todayLive.avgWorkMinutes,
        avgMeetingMinutes: todayLive.avgMeetingMinutes,
        usersTracked: todayLive.totalUsersTracked,
      });
    }

    // Sort chronologically
    dailyTrend.sort((a, b) => a.date.localeCompare(b.date));

    // Aggregate across all days for the period summary
    const allDayMetrics = [
      ...historicalMetrics
        .filter((d) => d.metricsDate !== todayStr)
        .map((d) => ({
          avgWork: d.avgWorkMinutes,
          avgMeeting: d.avgMeetingMinutes,
          avgActive: d.avgActiveMinutes,
          totalWork: d.totalTeamWorkMinutes,
          totalMeeting: d.totalTeamMeetingMinutes,
          users: d.totalUsersTracked,
          activityDistribution: d.activityDistribution,
          topApps: d.topApps,
          userSummaries: d.userSummaries,
        })),
      ...(todayLive
        ? [{
            avgWork: todayLive.avgWorkMinutes,
            avgMeeting: todayLive.avgMeetingMinutes,
            avgActive: todayLive.avgActiveMinutes,
            totalWork: todayLive.totalTeamWorkMinutes,
            totalMeeting: todayLive.totalTeamMeetingMinutes,
            users: todayLive.totalUsersTracked,
            activityDistribution: todayLive.activityDistribution,
            topApps: todayLive.topApps,
            userSummaries: todayLive.userSummaries,
          }]
        : []),
    ];

    if (allDayMetrics.length === 0) {
      res.json({
        period,
        hasData: false,
        metrics: {
          avgWorkMinutes: 0, avgMeetingMinutes: 0, avgActiveMinutes: 0,
          avgWorkPercentage: 0, avgMeetingPercentage: 0,
          totalUsersTracked: 0, totalTeamWorkMinutes: 0, totalTeamMeetingMinutes: 0,
        },
        activityDistribution: [],
        topApps: [],
        userSummaries: [],
        dailyTrend: [],
      });
      return;
    }

    const dayCount = allDayMetrics.length;
    const avgWork = allDayMetrics.reduce((s, d) => s + d.avgWork, 0) / dayCount;
    const avgMeeting = allDayMetrics.reduce((s, d) => s + d.avgMeeting, 0) / dayCount;
    const avgActive = allDayMetrics.reduce((s, d) => s + d.avgActive, 0) / dayCount;
    const totalWork = allDayMetrics.reduce((s, d) => s + d.totalWork, 0);
    const totalMeeting = allDayMetrics.reduce((s, d) => s + d.totalMeeting, 0);
    const maxUsers = Math.max(...allDayMetrics.map((d) => d.users));

    // Use the most recent day's distribution (today if available, else latest historical)
    const latest = todayLive
      ? { activityDistribution: todayLive.activityDistribution, topApps: todayLive.topApps, userSummaries: todayLive.userSummaries }
      : historicalMetrics[0]
        ? { activityDistribution: historicalMetrics[0].activityDistribution, topApps: historicalMetrics[0].topApps, userSummaries: historicalMetrics[0].userSummaries }
        : { activityDistribution: [], topApps: [], userSummaries: [] };

    res.json({
      period,
      hasData: true,
      metrics: {
        avgWorkMinutes: Math.round(avgWork * 10) / 10,
        avgMeetingMinutes: Math.round(avgMeeting * 10) / 10,
        avgActiveMinutes: Math.round(avgActive * 10) / 10,
        avgWorkPercentage: avgActive > 0 ? Math.round((avgWork / avgActive) * 100) : 0,
        avgMeetingPercentage: avgActive > 0 ? Math.round((avgMeeting / avgActive) * 100) : 0,
        totalUsersTracked: maxUsers,
        totalTeamWorkMinutes: totalWork,
        totalTeamMeetingMinutes: totalMeeting,
      },
      activityDistribution: latest.activityDistribution,
      topApps: latest.topApps,
      userSummaries: latest.userSummaries,
      dailyTrend,
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching dashboard metrics");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch dashboard metrics" });
  }
});

// ============================================================================
// GET /admin/dashboard/people?period=today|week|month|ytd
// Returns per-user activity summaries for the People tab
// ============================================================================
router.get("/dashboard/people", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const period = (req.query.period as string) || "today";
    const { startDate, endDate } = resolveDateRange(period);

    // Fetch all user daily activities for this org in the date range
    const activities = await db
      .select({
        id: schema.userDailyActivities.id,
        userId: schema.userDailyActivities.userId,
        activityDate: schema.userDailyActivities.activityDate,
        totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
        totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
        totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
        workPercentage: schema.userDailyActivities.workPercentage,
        meetingPercentage: schema.userDailyActivities.meetingPercentage,
        appBreakdown: schema.userDailyActivities.appBreakdown,
        categoryBreakdown: schema.userDailyActivities.categoryBreakdown,
        daySummary: schema.userDailyActivities.daySummary,
        keyAccomplishments: schema.userDailyActivities.keyAccomplishments,
        status: schema.userDailyActivities.status,
      })
      .from(schema.userDailyActivities)
      .where(
        and(
          eq(schema.userDailyActivities.organizationId, admin.organizationId),
          eq(schema.userDailyActivities.periodType, "daily"),
          gte(schema.userDailyActivities.activityDate, startDate),
          lte(schema.userDailyActivities.activityDate, endDate)
        )
      )
      .orderBy(desc(schema.userDailyActivities.activityDate));

    // Group by user and aggregate
    const userMap = new Map<string, typeof activities>();
    for (const act of activities) {
      const existing = userMap.get(act.userId) || [];
      existing.push(act);
      userMap.set(act.userId, existing);
    }

    // Fetch user profiles
    const userIds = [...userMap.keys()];
    const users =
      userIds.length > 0
        ? await db
            .select({
              id: schema.users.id,
              firstName: schema.users.firstName,
              lastName: schema.users.lastName,
              email: schema.users.email,
              role: schema.users.role,
              jobTitle: schema.users.jobTitle,
              avatarUrl: schema.users.avatarUrl,
            })
            .from(schema.users)
            .where(eq(schema.users.organizationId, admin.organizationId))
        : [];

    const userProfileMap = new Map(users.map((u) => [u.id, u]));

    // Build per-user response
    const people = userIds.map((userId) => {
      const rows = userMap.get(userId)!;
      const profile = userProfileMap.get(userId);

      const totalWork = rows.reduce((s, r) => s + r.totalWorkMinutes, 0);
      const totalMeeting = rows.reduce((s, r) => s + r.totalMeetingMinutes, 0);
      const totalActive = rows.reduce((s, r) => s + r.totalActiveMinutes, 0);

      // Use most recent day's summary
      const latestDay = rows[0]!;

      return {
        userId,
        name: profile
          ? [profile.firstName, profile.lastName].filter(Boolean).join(" ")
          : "Unknown",
        email: profile?.email,
        role: profile?.role,
        jobTitle: profile?.jobTitle,
        avatarUrl: profile?.avatarUrl,
        totalWorkMinutes: totalWork,
        totalMeetingMinutes: totalMeeting,
        totalActiveMinutes: totalActive,
        workPercentage: totalActive > 0 ? Math.round((totalWork / totalActive) * 100) : 0,
        meetingPercentage: totalActive > 0 ? Math.round((totalMeeting / totalActive) * 100) : 0,
        daySummary: latestDay.daySummary,
        keyAccomplishments: latestDay.keyAccomplishments,
        categoryBreakdown: latestDay.categoryBreakdown,
        appBreakdown: latestDay.appBreakdown,
        daysTracked: rows.length,
      };
    });

    // Sort by active minutes descending
    people.sort((a, b) => b.totalActiveMinutes - a.totalActiveMinutes);

    res.json({ period, people });
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching people data");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch people data" });
  }
});

// ============================================================================
// GET /admin/dashboard/people/:id?period=today|week|month|ytd
// Returns detailed activity for a specific user including activity blocks
// ============================================================================
router.get(
  "/dashboard/people/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      const targetUserId = req.params.id;
      const period = (req.query.period as string) || "today";
      const { startDate, endDate } = resolveDateRange(period);

      // Verify target user belongs to same org
      const [targetUser] = await db
        .select({
          id: schema.users.id,
          organizationId: schema.users.organizationId,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          email: schema.users.email,
          role: schema.users.role,
          jobTitle: schema.users.jobTitle,
          avatarUrl: schema.users.avatarUrl,
        })
        .from(schema.users)
        .where(eq(schema.users.id, targetUserId))
        .limit(1);

      if (!targetUser || targetUser.organizationId !== admin.organizationId) {
        res.status(404).json({ error: "Not Found", message: "User not found" });
        return;
      }

      // Fetch daily activities for the period
      const dailyActivities = await db
        .select()
        .from(schema.userDailyActivities)
        .where(
          and(
            eq(schema.userDailyActivities.userId, targetUserId),
            eq(schema.userDailyActivities.periodType, "daily"),
            gte(schema.userDailyActivities.activityDate, startDate),
            lte(schema.userDailyActivities.activityDate, endDate)
          )
        )
        .orderBy(desc(schema.userDailyActivities.activityDate));

      // Fetch activity blocks for these daily activities
      const dailyActivityIds = dailyActivities.map((d) => d.id);
      let blocks: (typeof schema.activityBlocks.$inferSelect)[] = [];

      if (dailyActivityIds.length > 0) {
        blocks = await db
          .select()
          .from(schema.activityBlocks)
          .where(eq(schema.activityBlocks.userId, targetUserId))
          .orderBy(asc(schema.activityBlocks.startTime));

        // Filter to only blocks belonging to fetched daily activities
        const idSet = new Set(dailyActivityIds);
        blocks = blocks.filter((b) => idSet.has(b.dailyActivityId));
      }

      // Fetch session-level classified activities for the timeline
      const dayStart = new Date(startDate + "T00:00:00");
      const dayEnd = new Date(endDate + "T23:59:59.999");

      const sessionActivities = await db
        .select({
          id: schema.monitoringSessions.id,
          name: schema.monitoringSessions.name,
          startedAt: schema.monitoringSessions.startedAt,
          endedAt: schema.monitoringSessions.endedAt,
          totalPausedMs: schema.monitoringSessions.totalPausedMs,
          keyActivities: schema.monitoringSessions.keyActivities,
          finalSummary: schema.monitoringSessions.finalSummary,
        })
        .from(schema.monitoringSessions)
        .where(
          and(
            eq(schema.monitoringSessions.userId, targetUserId),
            gte(schema.monitoringSessions.startedAt, dayStart),
            lte(schema.monitoringSessions.startedAt, dayEnd)
          )
        )
        .orderBy(desc(schema.monitoringSessions.startedAt));

      // Aggregate totals
      const totalWork = dailyActivities.reduce((s, d) => s + d.totalWorkMinutes, 0);
      const totalMeeting = dailyActivities.reduce((s, d) => s + d.totalMeetingMinutes, 0);
      const totalActive = dailyActivities.reduce((s, d) => s + d.totalActiveMinutes, 0);

      // Group blocks by date
      const blocksByDate = new Map<string, typeof blocks>();
      for (const block of blocks) {
        const dateKey = new Date(block.startTime).toISOString().split("T")[0]!;
        const existing = blocksByDate.get(dateKey) || [];
        existing.push(block);
        blocksByDate.set(dateKey, existing);
      }

      res.json({
        period,
        user: {
          id: targetUser.id,
          name: [targetUser.firstName, targetUser.lastName].filter(Boolean).join(" "),
          email: targetUser.email,
          role: targetUser.role,
          jobTitle: targetUser.jobTitle,
          avatarUrl: targetUser.avatarUrl,
        },
        summary: {
          totalWorkMinutes: totalWork,
          totalMeetingMinutes: totalMeeting,
          totalActiveMinutes: totalActive,
          workPercentage: totalActive > 0 ? Math.round((totalWork / totalActive) * 100) : 0,
          meetingPercentage: totalActive > 0 ? Math.round((totalMeeting / totalActive) * 100) : 0,
          daysTracked: dailyActivities.length,
        },
        dailyActivities: dailyActivities.map((d) => ({
          date: d.activityDate,
          totalWorkMinutes: d.totalWorkMinutes,
          totalMeetingMinutes: d.totalMeetingMinutes,
          totalActiveMinutes: d.totalActiveMinutes,
          workPercentage: d.workPercentage,
          meetingPercentage: d.meetingPercentage,
          daySummary: d.daySummary,
          keyAccomplishments: d.keyAccomplishments,
          categoryBreakdown: d.categoryBreakdown,
          appBreakdown: d.appBreakdown,
        })),
        blocks: blocks.map((b) => ({
          id: b.id,
          type: b.blockType,
          name: b.name,
          startTime: b.startTime,
          endTime: b.endTime,
          durationMinutes: b.durationMinutes,
          description: b.description,
          apps: b.apps,
          category: b.category,
          participants: b.participants,
          sequenceNumber: b.sequenceNumber,
        })),
        blocksByDate: Object.fromEntries(
          [...blocksByDate.entries()].map(([date, dateBlocks]) => [
            date,
            dateBlocks.map((b) => ({
              id: b.id,
              type: b.blockType,
              name: b.name,
              startTime: b.startTime,
              endTime: b.endTime,
              durationMinutes: b.durationMinutes,
              description: b.description,
              apps: b.apps,
              category: b.category,
              participants: b.participants,
            })),
          ])
        ),
        // Session-level classified activities (Groq-inferred from captures)
        sessionActivities: sessionActivities.map((s) => {
          const startMs = new Date(s.startedAt).getTime();
          const endMs = s.endedAt ? new Date(s.endedAt).getTime() : startMs;
          const activeMs = Math.max(0, endMs - startMs - (s.totalPausedMs || 0));
          return {
            sessionId: s.id,
            sessionName: s.name,
            startedAt: s.startedAt,
            endedAt: s.endedAt,
            durationMinutes: Math.round(activeMs / 60000),
            summary: s.finalSummary,
            activities: (s.keyActivities as any[]) || [],
          };
        }),
      });
    } catch (error) {
      logger.error({ error: String(error) }, "Error fetching user activity detail");
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch user activity details",
      });
    }
  }
);

// ============================================================================
// POST /admin/dashboard/chat
// AI assistant that answers questions about dashboard data
// ============================================================================

// LLM clients (lazy init)
let anthropicClient: Anthropic | null = null;
let deepseekClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic | null {
  if (!anthropicClient && config.anthropic.apiKey) {
    anthropicClient = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return anthropicClient;
}

function getDeepseekClient(): OpenAI | null {
  if (!deepseekClient && config.deepseek.apiKey) {
    deepseekClient = new OpenAI({
      apiKey: config.deepseek.apiKey,
      baseURL: "https://api.deepseek.com",
    });
  }
  return deepseekClient;
}

const DASHBOARD_CHAT_SYSTEM = `You are Mitable AI, an analytics assistant embedded in a team productivity dashboard.

Your role:
- Answer questions about the dashboard metrics, trends, and team activity data provided below.
- Compare periods, explain changes, and surface insights.
- Be concise and data-driven. Reference actual numbers from the data.
- If the data doesn't contain enough information to answer, say so honestly.
- Keep responses under 150 words unless the question requires more detail.
- Do NOT make up data. Only reference what's in the context below.
- Format numbers nicely (e.g., "2.5h" not "150 minutes").`;

function buildDashboardContext(dashboardData: any, peopleData: any[]): string {
  const m = dashboardData?.metrics || {};
  const workH = Math.round((m.avgWorkMinutes || 0) / 60 * 10) / 10;
  const meetH = Math.round((m.avgMeetingMinutes || 0) / 60 * 10) / 10;
  const activeH = Math.round((m.avgActiveMinutes || 0) / 60 * 10) / 10;

  let ctx = `## Current Dashboard Data (period: ${dashboardData?.period || "unknown"})

### Org Metrics
- Avg Focus Time: ${workH}h per person
- Avg Active Time: ${activeH}h per person
- Avg Meeting Load: ${meetH}h per person
- Work/Meeting Split: ${m.avgWorkPercentage || 0}% work / ${m.avgMeetingPercentage || 0}% meetings
- People Tracked: ${m.totalUsersTracked || 0}
- Total Team Work: ${Math.round((m.totalTeamWorkMinutes || 0) / 60)}h
- Total Team Meetings: ${Math.round((m.totalTeamMeetingMinutes || 0) / 60)}h`;

  if (dashboardData?.activityDistribution?.length > 0) {
    ctx += `\n\n### Activity Distribution`;
    for (const cat of dashboardData.activityDistribution) {
      ctx += `\n- ${cat.category}: ${Math.round(cat.totalMinutes / 60 * 10) / 10}h (${cat.percentage}%)`;
    }
  }

  if (dashboardData?.dailyTrend?.length > 0) {
    ctx += `\n\n### Daily Trend`;
    for (const day of dashboardData.dailyTrend) {
      ctx += `\n- ${day.date}: ${Math.round(day.avgWorkMinutes / 60 * 10) / 10}h work, ${Math.round(day.avgMeetingMinutes / 60 * 10) / 10}h meetings (${day.usersTracked} users)`;
    }
  }

  if (peopleData.length > 0) {
    ctx += `\n\n### Per-Person Summary (${peopleData.length} entries)`;
    for (const p of peopleData.slice(0, 10)) {
      const pH = Math.round(p.totalActiveMinutes / 60 * 10) / 10;
      const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || "Unknown";
      ctx += `\n- ${name} (${p.activityDate}): ${pH}h active, ${p.workPercentage}% work / ${p.meetingPercentage}% meetings`;
    }
  }

  return ctx;
}

async function callDashboardLLM(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const claude = getAnthropicClient();
  if (claude) {
    try {
      const response = await claude.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      });
      for (const block of response.content) {
        if (block.type === "text") return block.text.trim();
      }
      throw new Error("No text block in Claude response");
    } catch (error) {
      logger.warn({ error: String(error) }, "Claude dashboard chat failed, trying DeepSeek");
      anthropicClient = null;
    }
  }

  const deepseek = getDeepseekClient();
  if (deepseek) {
    const completion = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });
    return completion.choices[0]?.message?.content?.trim() || "I couldn't generate a response.";
  }

  throw new Error("No LLM available — need ANTHROPIC_API_KEY or DEEPSEEK_API_KEY");
}

router.post("/dashboard/chat", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const { messages, period = "month" } = req.body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      period?: string;
    };

    if (!messages || messages.length === 0) {
      res.status(400).json({ error: "Bad Request", message: "messages array is required" });
      return;
    }

    // Fetch the same dashboard data the frontend sees
    const { startDate, endDate } = resolveDateRange(period);

    const [orgMetrics, userActivities] = await Promise.all([
      db.select().from(schema.orgDailyMetrics).where(
        and(
          eq(schema.orgDailyMetrics.organizationId, admin.organizationId),
          gte(schema.orgDailyMetrics.metricsDate, startDate),
          lte(schema.orgDailyMetrics.metricsDate, endDate),
          eq(schema.orgDailyMetrics.periodType, "daily")
        )
      ).orderBy(desc(schema.orgDailyMetrics.metricsDate)),

      db.select({
        userId: schema.userDailyActivities.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
        totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
        totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
        workPercentage: schema.userDailyActivities.workPercentage,
        meetingPercentage: schema.userDailyActivities.meetingPercentage,
        daySummary: schema.userDailyActivities.daySummary,
        activityDate: schema.userDailyActivities.activityDate,
      }).from(schema.userDailyActivities)
        .innerJoin(schema.users, eq(schema.userDailyActivities.userId, schema.users.id))
        .where(
        and(
          eq(schema.userDailyActivities.organizationId, admin.organizationId),
          eq(schema.userDailyActivities.periodType, "daily"),
          eq(schema.userDailyActivities.status, "completed"),
          gte(schema.userDailyActivities.activityDate, startDate),
          lte(schema.userDailyActivities.activityDate, endDate)
        )
      ).orderBy(desc(schema.userDailyActivities.totalActiveMinutes)),
    ]);

    // Build aggregated dashboard data (same logic as GET /dashboard)
    let dashboardData: any = { period, hasData: false, metrics: {} };
    if (orgMetrics.length > 0) {
      const count = orgMetrics.length;
      const latest = orgMetrics[0]!;
      dashboardData = {
        period,
        hasData: true,
        metrics: count === 1 ? {
          avgWorkMinutes: latest.avgWorkMinutes,
          avgMeetingMinutes: latest.avgMeetingMinutes,
          avgActiveMinutes: latest.avgActiveMinutes,
          avgWorkPercentage: latest.avgWorkPercentage,
          avgMeetingPercentage: latest.avgMeetingPercentage,
          totalUsersTracked: latest.totalUsersTracked,
          totalTeamWorkMinutes: latest.totalTeamWorkMinutes,
          totalTeamMeetingMinutes: latest.totalTeamMeetingMinutes,
        } : {
          avgWorkMinutes: orgMetrics.reduce((s, m) => s + m.avgWorkMinutes, 0) / count,
          avgMeetingMinutes: orgMetrics.reduce((s, m) => s + m.avgMeetingMinutes, 0) / count,
          avgActiveMinutes: orgMetrics.reduce((s, m) => s + m.avgActiveMinutes, 0) / count,
          avgWorkPercentage: Math.round(orgMetrics.reduce((s, m) => s + m.avgWorkMinutes, 0) / Math.max(orgMetrics.reduce((s, m) => s + m.avgActiveMinutes, 0), 1) * 100),
          avgMeetingPercentage: Math.round(orgMetrics.reduce((s, m) => s + m.avgMeetingMinutes, 0) / Math.max(orgMetrics.reduce((s, m) => s + m.avgActiveMinutes, 0), 1) * 100),
          totalUsersTracked: Math.max(...orgMetrics.map((m) => m.totalUsersTracked)),
          totalTeamWorkMinutes: orgMetrics.reduce((s, m) => s + m.totalTeamWorkMinutes, 0),
          totalTeamMeetingMinutes: orgMetrics.reduce((s, m) => s + m.totalTeamMeetingMinutes, 0),
        },
        activityDistribution: latest.activityDistribution,
        dailyTrend: orgMetrics.map((d) => ({
          date: d.metricsDate,
          avgWorkMinutes: d.avgWorkMinutes,
          avgMeetingMinutes: d.avgMeetingMinutes,
          usersTracked: d.totalUsersTracked,
        })).reverse(),
      };
    }

    // Build system prompt with data context
    const systemPrompt = DASHBOARD_CHAT_SYSTEM + "\n\n" + buildDashboardContext(dashboardData, userActivities);

    // Call LLM
    const aiResponse = await callDashboardLLM(systemPrompt, messages);

    res.json({ message: aiResponse });
  } catch (error) {
    logger.error({ error: String(error) }, "Error in dashboard chat");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to process chat request" });
  }
});

// ============================================================================
// POST /admin/ask/chat
// Full-featured AI assistant for org-wide questions and report generation
// ============================================================================

const ASK_SYSTEM_PROMPT = `You are Mitable AI, an advanced analytics assistant for organization leaders.

You have access to comprehensive team productivity data. Your capabilities:

1. **Answer questions** about team metrics, individual performance, trends, and comparisons.
2. **Generate formal reports** when asked. Reports should be in HTML format wrapped in <report> tags.
3. **Compare** team members, periods, and metrics.
4. **Surface insights** proactively when relevant.

## Response rules:
- For greetings or casual messages (like "hello", "hi", "hey"), respond with a brief, friendly greeting using the admin's first name if available. Example: "Hey Sarah! What can I help you with today?" Do NOT dump data or metrics in a greeting — keep it to 1-2 sentences max.
- Be data-driven. Reference actual numbers from the context below.
- Do NOT fabricate data. If something isn't available, say so.
- Format responses with markdown: bold for emphasis, tables for comparisons, bullet lists for insights.
- Keep normal responses concise but thorough (200-400 words max).

## Report generation:
When the user asks you to generate, create, draft, or put together a report, formal document, or exportable summary:
- Respond with a brief message explaining what you've prepared
- Then include the full report HTML inside <report title="..." subtitle="...">...</report> tags
- The HTML should include: h2 title, h3 sections, tables with thead/tbody, ul/ol lists, p paragraphs
- Use inline styles for colors: green (#22c55e) for positive, yellow (#f59e0b) for neutral, red (#ef4444) for negative
- Include sections like: Executive Summary, Key Metrics, Strengths, Areas for Improvement, Recommendations, Overall Assessment
- Make the report professional and ready to share with stakeholders`;

async function buildAskContext(organizationId: string): Promise<string> {
  // Fetch month data for comprehensive context
  const { startDate, endDate } = resolveDateRange("month");

  const [orgMetrics, userActivities] = await Promise.all([
    db.select().from(schema.orgDailyMetrics).where(
      and(
        eq(schema.orgDailyMetrics.organizationId, organizationId),
        gte(schema.orgDailyMetrics.metricsDate, startDate),
        lte(schema.orgDailyMetrics.metricsDate, endDate),
        eq(schema.orgDailyMetrics.periodType, "daily")
      )
    ).orderBy(desc(schema.orgDailyMetrics.metricsDate)),

    db.select({
      userId: schema.userDailyActivities.userId,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
      totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
      totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
      workPercentage: schema.userDailyActivities.workPercentage,
      meetingPercentage: schema.userDailyActivities.meetingPercentage,
      daySummary: schema.userDailyActivities.daySummary,
      activityDate: schema.userDailyActivities.activityDate,
      categoryBreakdown: schema.userDailyActivities.categoryBreakdown,
      keyAccomplishments: schema.userDailyActivities.keyAccomplishments,
    }).from(schema.userDailyActivities)
      .innerJoin(schema.users, eq(schema.userDailyActivities.userId, schema.users.id))
      .where(
      and(
        eq(schema.userDailyActivities.organizationId, organizationId),
        eq(schema.userDailyActivities.periodType, "daily"),
        eq(schema.userDailyActivities.status, "completed"),
        gte(schema.userDailyActivities.activityDate, startDate),
        lte(schema.userDailyActivities.activityDate, endDate)
      )
    ).orderBy(desc(schema.userDailyActivities.totalActiveMinutes)),
  ]);

  let ctx = `## Organization Data (This Month: ${startDate} to ${endDate})\n`;

  if (orgMetrics.length > 0) {
    const count = orgMetrics.length;
    const avgWork = orgMetrics.reduce((s, m) => s + m.avgWorkMinutes, 0) / count;
    const avgMeeting = orgMetrics.reduce((s, m) => s + m.avgMeetingMinutes, 0) / count;
    const avgActive = orgMetrics.reduce((s, m) => s + m.avgActiveMinutes, 0) / count;
    const maxUsers = Math.max(...orgMetrics.map((m) => m.totalUsersTracked));

    ctx += `\n### Org Averages (${count} days of data)
- Avg Focus Time: ${Math.round(avgWork / 60 * 10) / 10}h/day per person
- Avg Meeting Load: ${Math.round(avgMeeting / 60 * 10) / 10}h/day per person
- Avg Active Time: ${Math.round(avgActive / 60 * 10) / 10}h/day per person
- Work/Meeting Split: ${avgActive > 0 ? Math.round(avgWork / avgActive * 100) : 0}% / ${avgActive > 0 ? Math.round(avgMeeting / avgActive * 100) : 0}%
- People Tracked: ${maxUsers}`;

    const latest = orgMetrics[0]!;
    if (latest.activityDistribution && Array.isArray(latest.activityDistribution) && (latest.activityDistribution as any[]).length > 0) {
      ctx += `\n\n### Activity Categories`;
      for (const cat of latest.activityDistribution as any[]) {
        ctx += `\n- ${cat.category}: ${Math.round(cat.totalMinutes / 60 * 10) / 10}h (${cat.percentage}%)`;
      }
    }

    if (orgMetrics.length > 1) {
      ctx += `\n\n### Daily Trend`;
      for (const day of [...orgMetrics].reverse()) {
        ctx += `\n- ${day.metricsDate}: ${Math.round(day.avgWorkMinutes / 60 * 10) / 10}h work, ${Math.round(day.avgMeetingMinutes / 60 * 10) / 10}h meetings (${day.totalUsersTracked} users)`;
      }
    }
  }

  // Aggregate per-user data
  if (userActivities.length > 0) {
    const userMap = new Map<string, { name: string; days: number; totalActive: number; totalWork: number; totalMeeting: number; summaries: string[]; categories: any[] }>();

    for (const ua of userActivities) {
      const name = [ua.firstName, ua.lastName].filter(Boolean).join(" ") || "Unknown";
      const key = ua.userId;
      const existing = userMap.get(key) || { name, days: 0, totalActive: 0, totalWork: 0, totalMeeting: 0, summaries: [], categories: [] };
      existing.days++;
      existing.totalActive += ua.totalActiveMinutes;
      existing.totalWork += ua.totalWorkMinutes;
      existing.totalMeeting += ua.totalMeetingMinutes;
      if (ua.daySummary) existing.summaries.push(ua.daySummary);
      if (ua.categoryBreakdown && Array.isArray(ua.categoryBreakdown)) {
        existing.categories.push(...(ua.categoryBreakdown as any[]));
      }
      userMap.set(key, existing);
    }

    ctx += `\n\n### Per-Person Details (${userMap.size} people)`;
    for (const [, user] of userMap) {
      const avgActiveH = Math.round(user.totalActive / Math.max(user.days, 1) / 60 * 10) / 10;
      const avgWorkH = Math.round(user.totalWork / Math.max(user.days, 1) / 60 * 10) / 10;
      const avgMeetH = Math.round(user.totalMeeting / Math.max(user.days, 1) / 60 * 10) / 10;
      const workPct = user.totalActive > 0 ? Math.round(user.totalWork / user.totalActive * 100) : 0;
      const meetPct = user.totalActive > 0 ? Math.round(user.totalMeeting / user.totalActive * 100) : 0;

      ctx += `\n\n**${user.name}** (${user.days} days tracked)`;
      ctx += `\n  - Avg: ${avgActiveH}h active, ${avgWorkH}h focus, ${avgMeetH}h meetings`;
      ctx += `\n  - Split: ${workPct}% work / ${meetPct}% meetings`;
      if (user.summaries.length > 0) {
        ctx += `\n  - Recent: ${user.summaries[0]}`;
      }
    }
  }

  return ctx;
}

function parseAskResponse(raw: string): { message: string; report?: { title: string; subtitle: string; html: string } } {
  // Try with closing tag first
  let reportMatch = raw.match(/<report\s+[^>]*?>([\s\S]*)<\/report>/i);

  // Fallback: handle truncated reports where </report> is missing (token limit hit)
  if (!reportMatch) {
    reportMatch = raw.match(/<report\s+[^>]*?>([\s\S]+)/i);
  }

  if (reportMatch) {
    const openTag = raw.match(/<report\s+[^>]*?>/i)?.[0] || "";
    const titleMatch = openTag.match(/title=["']([^"']*?)["']/);
    const subtitleMatch = openTag.match(/subtitle=["']([^"']*?)["']/);
    const message = raw.replace(/<report[\s\S]*/i, "").trim();
    return {
      message: message || "I've prepared the report. You can review and export it.",
      report: {
        title: titleMatch?.[1] || "Report",
        subtitle: subtitleMatch?.[1] || "",
        html: reportMatch[1].replace(/<\/report>/i, "").trim(),
      },
    };
  }
  return { message: raw.trim() };
}

// ── GET /admin/ask/threads — list all threads for this admin ──
router.get("/ask/threads", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const threads = await db
      .select()
      .from(schema.askThreads)
      .where(
        and(
          eq(schema.askThreads.userId, admin.userId),
          eq(schema.askThreads.organizationId, admin.organizationId)
        )
      )
      .orderBy(desc(schema.askThreads.updatedAt));

    res.json(threads);
  } catch (error) {
    logger.error({ error: String(error) }, "Error listing ask threads");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── GET /admin/ask/threads/:id/messages — get messages for a thread ──
router.get("/ask/threads/:id/messages", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const threadId = req.params.id;

    // Verify thread belongs to this user
    const [thread] = await db
      .select()
      .from(schema.askThreads)
      .where(
        and(
          eq(schema.askThreads.id, threadId),
          eq(schema.askThreads.userId, admin.userId)
        )
      )
      .limit(1);

    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    const messages = await db
      .select()
      .from(schema.askMessages)
      .where(eq(schema.askMessages.threadId, threadId))
      .orderBy(asc(schema.askMessages.createdAt));

    res.json(messages);
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching thread messages");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── DELETE /admin/ask/threads/:id — delete a thread and its messages ──
router.delete("/ask/threads/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const threadId = req.params.id;

    // Verify ownership then delete (cascade deletes messages)
    const deleted = await db
      .delete(schema.askThreads)
      .where(
        and(
          eq(schema.askThreads.id, threadId),
          eq(schema.askThreads.userId, admin.userId)
        )
      )
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error({ error: String(error) }, "Error deleting thread");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── PATCH /admin/ask/messages/:id/report — update report content (auto-save) ──
router.patch("/ask/messages/:id/report", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const messageId = req.params.id;
    const { reportHtml } = req.body as { reportHtml: string };

    if (!reportHtml && reportHtml !== "") {
      res.status(400).json({ error: "reportHtml is required" });
      return;
    }

    // Verify the message belongs to a thread owned by this user
    const [msg] = await db
      .select({ threadId: schema.askMessages.threadId })
      .from(schema.askMessages)
      .where(eq(schema.askMessages.id, messageId))
      .limit(1);

    if (!msg) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    const [thread] = await db
      .select()
      .from(schema.askThreads)
      .where(
        and(
          eq(schema.askThreads.id, msg.threadId),
          eq(schema.askThreads.userId, admin.userId)
        )
      )
      .limit(1);

    if (!thread) {
      res.status(404).json({ error: "Thread not found" });
      return;
    }

    await db
      .update(schema.askMessages)
      .set({ reportHtml })
      .where(eq(schema.askMessages.id, messageId));

    res.json({ success: true });
  } catch (error) {
    logger.error({ error: String(error) }, "Error updating report");
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ── POST /admin/ask/chat — send message, get AI response, persist both ──
router.post("/ask/chat", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    const { threadId, message } = req.body as {
      threadId?: string;
      message: string;
    };

    if (!message || !message.trim()) {
      res.status(400).json({ error: "Bad Request", message: "message is required" });
      return;
    }

    // Create or verify thread
    let activeThreadId = threadId;
    if (!activeThreadId) {
      // Create a new thread
      const title = message.length > 40 ? message.slice(0, 40) + "…" : message;
      const [newThread] = await db
        .insert(schema.askThreads)
        .values({
          userId: admin.userId,
          organizationId: admin.organizationId,
          title,
        })
        .returning();
      activeThreadId = newThread.id;
    } else {
      // Verify thread belongs to user
      const [thread] = await db
        .select()
        .from(schema.askThreads)
        .where(
          and(
            eq(schema.askThreads.id, activeThreadId),
            eq(schema.askThreads.userId, admin.userId)
          )
        )
        .limit(1);

      if (!thread) {
        res.status(404).json({ error: "Thread not found" });
        return;
      }
    }

    // Save user message
    await db.insert(schema.askMessages).values({
      threadId: activeThreadId,
      role: "user",
      content: message.trim(),
    });

    // Load full conversation history for LLM context
    const dbMessages = await db
      .select()
      .from(schema.askMessages)
      .where(eq(schema.askMessages.threadId, activeThreadId))
      .orderBy(asc(schema.askMessages.createdAt));

    const llmMessages = dbMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Build comprehensive org context
    const orgContext = await buildAskContext(admin.organizationId);
    const adminName = admin.firstName || "there";
    const systemPrompt = ASK_SYSTEM_PROMPT + `\n\nThe admin you are speaking with is named **${adminName}**.` + "\n\n" + orgContext;

    // Call LLM
    const claude = getAnthropicClient();
    let rawResponse = "";

    if (claude) {
      try {
        const response = await claude.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 8000,
          system: systemPrompt,
          messages: llmMessages,
        });
        for (const block of response.content) {
          if (block.type === "text") {
            rawResponse = block.text.trim();
            break;
          }
        }
      } catch (error) {
        logger.warn({ error: String(error) }, "Claude ask chat failed, trying DeepSeek");
        anthropicClient = null;
      }
    }

    if (!rawResponse) {
      const deepseek = getDeepseekClient();
      if (deepseek) {
        const completion = await deepseek.chat.completions.create({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            ...llmMessages,
          ],
          temperature: 0.7,
          max_tokens: 8000,
        });
        rawResponse = completion.choices[0]?.message?.content?.trim() || "I couldn't generate a response.";
      } else {
        throw new Error("No LLM available");
      }
    }

    const parsed = parseAskResponse(rawResponse);

    // Save assistant message (with report data if present)
    await db.insert(schema.askMessages).values({
      threadId: activeThreadId,
      role: "assistant",
      content: parsed.message,
      reportTitle: parsed.report?.title || null,
      reportSubtitle: parsed.report?.subtitle || null,
      reportHtml: parsed.report?.html || null,
    });

    // Update thread timestamp
    await db
      .update(schema.askThreads)
      .set({ updatedAt: new Date() })
      .where(eq(schema.askThreads.id, activeThreadId));

    res.json({ ...parsed, threadId: activeThreadId });
  } catch (error) {
    logger.error({ error: String(error) }, "Error in ask chat");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to process request" });
  }
});

export default router;
