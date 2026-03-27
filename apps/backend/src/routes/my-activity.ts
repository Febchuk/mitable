/**
 * My Activity API Routes
 *
 * Mirrors the admin person-detail endpoints but scoped to the currently
 * authenticated user. No admin check required — users can only access
 * their own data via req.userId.
 *
 *   - GET /my-activity                              → User's own detail (mirrors /admin/dashboard/people/:id)
 *   - GET /my-activity/drill-down/:metric           → Per-user metric/category drill-down
 *   - GET /my-activity/category-activities/:category → Activity blocks filtered by category
 *   - GET /my-activity/subscriber-activities/:subscriber → Activity blocks filtered by subscriber
 */

import { Router, Request, Response } from "express";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { createLogger } from "../lib/logger";

const logger = createLogger({ context: "my-activity-routes" });
const router = Router();

// ============================================================================
// Constants & helpers
// ============================================================================

/** Subscriber names to exclude from pie charts / distributions */
const EXCLUDED_SUBSCRIBERS = new Set([
  "internal",
  "unattributed",
  "internal/unattributed",
  "internal / unattributed",
  "n/a",
  "none",
  "unknown",
  "self",
]);

function isExcludedSubscriber(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  if (EXCLUDED_SUBSCRIBERS.has(normalized)) return true;
  const collapsed = normalized.replace(/\s+/g, "");
  return EXCLUDED_SUBSCRIBERS.has(collapsed);
}

/**
 * Resolve date range from the period query param.
 * Mirrors resolveDateRange in admin-dashboard.ts exactly.
 */
function resolveDateRange(period: string): {
  startDate: string;
  endDate: string;
  periodType: string;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0]!;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0]!;

  switch (period) {
    case "today":
      return { startDate: todayStr, endDate: todayStr, periodType: "daily" };
    case "week": {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return {
        startDate: sevenDaysAgo.toISOString().split("T")[0]!,
        endDate: todayStr,
        periodType: "daily",
      };
    }
    case "month": {
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return {
        startDate: thirtyDaysAgo.toISOString().split("T")[0]!,
        endDate: todayStr,
        periodType: "daily",
      };
    }
    case "ytd": {
      const firstOfYear = new Date(today.getFullYear(), 0, 1);
      return {
        startDate: firstOfYear.toISOString().split("T")[0]!,
        endDate: todayStr,
        periodType: "daily",
      };
    }
    case "all": {
      const allTimeStart = new Date(today.getFullYear() - 5, 0, 1);
      return {
        startDate: allTimeStart.toISOString().split("T")[0]!,
        endDate: todayStr,
        periodType: "daily",
      };
    }
    default: // "yesterday" (default)
      return { startDate: yesterdayStr, endDate: yesterdayStr, periodType: "daily" };
  }
}

/**
 * Resolve the previous comparable period for trend comparison.
 * Mirrors resolvePreviousPeriod in admin-dashboard.ts exactly.
 */
function resolvePreviousPeriod(period: string): { startDate: string; endDate: string } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (period) {
    case "yesterday": {
      const dayBefore = new Date(today);
      dayBefore.setDate(dayBefore.getDate() - 2);
      return {
        startDate: dayBefore.toISOString().split("T")[0]!,
        endDate: dayBefore.toISOString().split("T")[0]!,
      };
    }
    case "today": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        startDate: yesterday.toISOString().split("T")[0]!,
        endDate: yesterday.toISOString().split("T")[0]!,
      };
    }
    case "week": {
      const lastWeekEnd = new Date(today);
      const dayOfWeek = lastWeekEnd.getDay();
      lastWeekEnd.setDate(lastWeekEnd.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 1);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekStart.getDate() - 6);
      return {
        startDate: lastWeekStart.toISOString().split("T")[0]!,
        endDate: lastWeekEnd.toISOString().split("T")[0]!,
      };
    }
    case "month": {
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return {
        startDate: lastMonthStart.toISOString().split("T")[0]!,
        endDate: lastMonthEnd.toISOString().split("T")[0]!,
      };
    }
    default:
      return null; // No comparison for ytd / all
  }
}

// ============================================================================
// DayRow type shared by the drill-down builders
// ============================================================================

type DayRow = {
  activityDate: string;
  totalWorkMinutes: number;
  totalMeetingMinutes: number;
  totalActiveMinutes: number;
  categoryBreakdown: unknown;
  appBreakdown: unknown;
  totalSessions: number;
  userId: string;
};

/**
 * Build drill-down for a top-level metric (focus_time, active_time, meeting_load, days_tracked).
 * Mirrors buildMetricDrillDown in admin-dashboard.ts — averaged over a single user's rows.
 */
function buildMetricDrillDown(
  metric: string,
  currentDays: DayRow[],
  prevDays: DayRow[],
  period: string
) {
  const periodLabel =
    {
      yesterday: "Yesterday",
      today: "Today",
      week: "This Week",
      month: "This Month",
      ytd: "Year to Date",
      all: "All Time",
    }[period] || period;

  const prevLabel =
    { yesterday: "Day Before", today: "Yesterday", week: "Last Week", month: "Last Month" }[
      period
    ] || "";

  const getMinutes = (row: DayRow): number => {
    switch (metric) {
      case "focus_time":
        return row.totalWorkMinutes;
      case "meeting_load":
        return row.totalMeetingMinutes;
      case "active_time":
        return row.totalActiveMinutes;
      default:
        return row.totalActiveMinutes;
    }
  };

  // Aggregate by date for trend (single user so no per-user averaging needed)
  const dayTotals = new Map<string, { total: number; users: Set<string> }>();
  for (const row of currentDays) {
    const existing = dayTotals.get(row.activityDate) || { total: 0, users: new Set<string>() };
    existing.total += getMinutes(row);
    existing.users.add(row.userId);
    dayTotals.set(row.activityDate, existing);
  }

  const trend = [...dayTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, data]) => ({
      label: date,
      value: Math.round((data.total / data.users.size / 60) * 10) / 10,
    }));

  const uniqueUsers = new Set(currentDays.map((r) => r.userId));
  const totalMinutes = currentDays.reduce((s, r) => s + getMinutes(r), 0);
  const uniqueDays = new Set(currentDays.map((r) => r.activityDate)).size;
  const currentAvg =
    uniqueUsers.size > 0 && uniqueDays > 0
      ? Math.round((totalMinutes / uniqueUsers.size / uniqueDays / 60) * 10) / 10
      : 0;

  const prevUsers = new Set(prevDays.map((r) => r.userId));
  const prevTotal = prevDays.reduce((s, r) => s + getMinutes(r), 0);
  const prevUniqueDays = new Set(prevDays.map((r) => r.activityDate)).size;
  const prevAvg =
    prevUsers.size > 0 && prevUniqueDays > 0
      ? Math.round((prevTotal / prevUsers.size / prevUniqueDays / 60) * 10) / 10
      : 0;

  let bestDay = { label: "—", value: 0 };
  let lowestDay = { label: "—", value: Infinity };
  for (const [date, data] of dayTotals) {
    const avg = data.total / data.users.size / 60;
    if (avg > bestDay.value) bestDay = { label: date, value: Math.round(avg * 10) / 10 };
    if (avg < lowestDay.value) lowestDay = { label: date, value: Math.round(avg * 10) / 10 };
  }
  if (lowestDay.value === Infinity) lowestDay = { label: "—", value: 0 };

  const stats = [
    { label: `${periodLabel} Avg`, value: `${currentAvg}h` },
    ...(prevLabel ? [{ label: `${prevLabel} Avg`, value: `${prevAvg}h` }] : []),
    { label: "Best Day", value: `${bestDay.label} (${bestDay.value}h)` },
    { label: "Lowest Day", value: `${lowestDay.label} (${lowestDay.value}h)` },
  ];

  const categoryTotals = new Map<string, number>();
  for (const row of currentDays) {
    const breakdown = (row.categoryBreakdown || []) as { category: string; minutes: number }[];
    for (const entry of breakdown) {
      if (metric === "meeting_load" && entry.category !== "meeting") continue;
      if (metric === "focus_time" && entry.category === "meeting") continue;
      categoryTotals.set(entry.category, (categoryTotals.get(entry.category) || 0) + entry.minutes);
    }
  }

  const maxCatMinutes = Math.max(...categoryTotals.values(), 1);
  const breakdown = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cat, mins]) => ({
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
      value: `${Math.round((mins / 60) * 10) / 10}h avg`,
      bar: Math.round((mins / maxCatMinutes) * 100),
    }));

  if (metric === "days_tracked") {
    return {
      title: "Days Tracked",
      subtitle: `${uniqueDays} days with recorded activity ${periodLabel.toLowerCase()}`,
      stats: [
        { label: `${periodLabel}`, value: `${uniqueDays} days` },
        ...(prevLabel ? [{ label: `${prevLabel}`, value: `${prevUniqueDays} days` }] : []),
        {
          label: "Total Sessions",
          value: `${currentDays.reduce((s, r) => s + r.totalSessions, 0)}`,
        },
      ],
      breakdown: [],
      trend,
    };
  }

  const titles: Record<string, { title: string; subtitle: string }> = {
    focus_time: {
      title: "Avg Focus Time",
      subtitle: `Deep work hours per day ${periodLabel.toLowerCase()}`,
    },
    active_time: {
      title: "Avg Active Time",
      subtitle: `Total tracked time per day ${periodLabel.toLowerCase()}`,
    },
    meeting_load: {
      title: "Avg Meeting Load",
      subtitle: `Meeting hours per day ${periodLabel.toLowerCase()}`,
    },
  };

  return {
    ...(titles[metric] || { title: metric, subtitle: "" }),
    stats,
    breakdown,
    trend,
  };
}

/**
 * Build drill-down for an activity category (e.g. "development", "communication").
 * Mirrors buildCategoryDrillDown in admin-dashboard.ts — scoped to a single user.
 */
function buildCategoryDrillDown(
  category: string,
  currentDays: DayRow[],
  prevDays: DayRow[],
  period: string
) {
  const periodLabel =
    {
      yesterday: "Yesterday",
      today: "Today",
      week: "This Week",
      month: "This Month",
      ytd: "Year to Date",
      all: "All Time",
    }[period] || period;

  const catLower = category.toLowerCase();
  const catLabel = category.charAt(0).toUpperCase() + category.slice(1);

  let totalMinutes = 0;
  const contributors = new Set<string>();
  const dayMinutes = new Map<string, number>();

  for (const row of currentDays) {
    const breakdown = (row.categoryBreakdown || []) as { category: string; minutes: number }[];
    for (const entry of breakdown) {
      if (entry.category.toLowerCase() === catLower) {
        totalMinutes += entry.minutes;
        contributors.add(row.userId);
        dayMinutes.set(row.activityDate, (dayMinutes.get(row.activityDate) || 0) + entry.minutes);
      }
    }
  }

  let prevTotalMinutes = 0;
  for (const row of prevDays) {
    const breakdown = (row.categoryBreakdown || []) as { category: string; minutes: number }[];
    for (const entry of breakdown) {
      if (entry.category.toLowerCase() === catLower) {
        prevTotalMinutes += entry.minutes;
      }
    }
  }

  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const prevHours = Math.round((prevTotalMinutes / 60) * 10) / 10;
  const avgPerDay =
    dayMinutes.size > 0 ? Math.round((totalMinutes / dayMinutes.size / 60) * 10) / 10 : 0;

  // App breakdown — distribute proportionally based on category share
  const appMinutes = new Map<string, number>();
  for (const row of currentDays) {
    const apps = (row.appBreakdown || []) as { app: string; minutes: number }[];
    const cats = (row.categoryBreakdown || []) as { category: string; minutes: number }[];
    const catEntry = cats.find((c) => c.category.toLowerCase() === catLower);
    if (!catEntry || catEntry.minutes === 0) continue;
    const rowTotal = cats.reduce((s, c) => s + c.minutes, 0);
    const catRatio = rowTotal > 0 ? catEntry.minutes / rowTotal : 0;

    for (const app of apps) {
      const estimated = Math.round(app.minutes * catRatio);
      if (estimated > 0) {
        appMinutes.set(app.app, (appMinutes.get(app.app) || 0) + estimated);
      }
    }
  }

  const maxAppMin = Math.max(...appMinutes.values(), 1);
  const breakdown = [...appMinutes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([app, mins]) => ({
      label: app,
      value: `${Math.round((mins / 60) * 10) / 10}h`,
      bar: Math.round((mins / maxAppMin) * 100),
    }));

  const trend = [...dayMinutes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, mins]) => ({
      label: date,
      value: Math.round((mins / 60) * 10) / 10,
    }));

  const prevLabel =
    { yesterday: "Day Before", today: "Yesterday", week: "Last Week", month: "Last Month" }[
      period
    ] || "";

  return {
    title: catLabel,
    subtitle: `${totalHours}h ${periodLabel.toLowerCase()}`,
    stats: [
      { label: "Total Hours", value: `${totalHours}h` },
      ...(prevLabel ? [{ label: `${prevLabel}`, value: `${prevHours}h` }] : []),
      { label: "Active Days", value: `${contributors.size} day(s)` },
      { label: "Avg per Day", value: `${avgPerDay}h` },
    ],
    breakdown,
    trend,
  };
}

// ============================================================================
// GET /my-activity?period=today|yesterday|week|month|ytd|all
// Returns detailed activity for the authenticated user.
// Mirrors GET /admin/dashboard/people/:id
// ============================================================================
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const period = (req.query.period as string) || "yesterday";
    const { startDate, endDate } = resolveDateRange(period);

    // Fetch authenticated user's own profile
    const [user] = await db
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
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "Not Found", message: "User profile not found" });
      return;
    }

    // Fetch daily activities for the period
    const dailyActivities = await db
      .select()
      .from(schema.userDailyActivities)
      .where(
        and(
          eq(schema.userDailyActivities.userId, userId),
          eq(schema.userDailyActivities.periodType, "daily"),
          gte(schema.userDailyActivities.activityDate, startDate),
          lte(schema.userDailyActivities.activityDate, endDate)
        )
      )
      .orderBy(desc(schema.userDailyActivities.activityDate));

    // Fetch activity blocks for the daily activities in this period
    const dailyActivityIds = dailyActivities.map((d) => d.id);
    let blocks: (typeof schema.activityBlocks.$inferSelect)[] = [];

    if (dailyActivityIds.length > 0) {
      blocks = await db
        .select()
        .from(schema.activityBlocks)
        .where(eq(schema.activityBlocks.userId, userId))
        .orderBy(asc(schema.activityBlocks.startTime));

      // Filter to only blocks belonging to the fetched daily activity records
      const idSet = new Set(dailyActivityIds);
      blocks = blocks.filter((b) => idSet.has(b.dailyActivityId));
    }

    // Fetch recent sessions — always fresh, not period-gated
    // Gate: >= 3 min active duration and not a noise "Short session" label
    const allSessionActivities = await db
      .select({
        id: schema.monitoringSessions.id,
        name: schema.monitoringSessions.name,
        startedAt: schema.monitoringSessions.startedAt,
        endedAt: schema.monitoringSessions.endedAt,
        totalPausedMs: schema.monitoringSessions.totalPausedMs,
        keyActivities: schema.monitoringSessions.keyActivities,
        finalSummary: schema.monitoringSessions.finalSummary,
        taskBreakdown: schema.monitoringSessions.taskBreakdown,
      })
      .from(schema.monitoringSessions)
      .where(eq(schema.monitoringSessions.userId, userId))
      .orderBy(desc(schema.monitoringSessions.startedAt))
      .limit(50);

    const MIN_SESSION_DURATION_MS = 3 * 60 * 1000; // 3 minutes
    const sessionActivities = allSessionActivities
      .filter((s) => {
        if (s.name === "Short session") return false;
        if (!s.endedAt) return true; // still active
        const activeMs = Math.max(
          0,
          new Date(s.endedAt).getTime() -
            new Date(s.startedAt).getTime() -
            (s.totalPausedMs || 0)
        );
        return activeMs >= MIN_SESSION_DURATION_MS;
      })
      .slice(0, 20);

    // Fetch user's documents (most recent 10, excluding in-progress ones)
    const userDocs = await db
      .select({
        id: schema.documents.id,
        title: schema.documents.title,
        docType: schema.documents.docType,
        status: schema.documents.status,
        content: schema.documents.content,
        description: schema.documents.description,
        createdAt: schema.documents.createdAt,
        updatedAt: schema.documents.updatedAt,
      })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.createdBy, userId),
          sql`${schema.documents.title} NOT LIKE 'Generating:%'`
        )
      )
      .orderBy(desc(schema.documents.createdAt))
      .limit(10);

    // Aggregate period totals
    const totalWork = dailyActivities.reduce((s, d) => s + d.totalWorkMinutes, 0);
    const totalMeeting = dailyActivities.reduce((s, d) => s + d.totalMeetingMinutes, 0);
    const totalActive = dailyActivities.reduce((s, d) => s + d.totalActiveMinutes, 0);

    // Aggregate topic & subscriber distributions across the period
    const topicMinutes = new Map<string, number>();
    const subscriberMinutes = new Map<string, number>();
    for (const day of dailyActivities) {
      for (const t of (day.topicBreakdown || []) as { topicName: string; minutes: number }[]) {
        if (t.topicName)
          topicMinutes.set(t.topicName, (topicMinutes.get(t.topicName) || 0) + t.minutes);
      }
      for (const s of (day.subscriberBreakdown || []) as {
        subscriberName: string;
        minutes: number;
      }[]) {
        if (s.subscriberName && !isExcludedSubscriber(s.subscriberName))
          subscriberMinutes.set(
            s.subscriberName,
            (subscriberMinutes.get(s.subscriberName) || 0) + s.minutes
          );
      }
    }

    const totalTopicMin = [...topicMinutes.values()].reduce((a, b) => a + b, 0);
    const topicDistribution = [...topicMinutes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([topicName, mins]) => ({
        topicName,
        totalMinutes: mins,
        percentage: totalTopicMin > 0 ? Math.round((mins / totalTopicMin) * 100) : 0,
      }));

    const totalSubMin = [...subscriberMinutes.values()].reduce((a, b) => a + b, 0);
    const subscriberDistribution = [...subscriberMinutes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([subscriberName, mins]) => ({
        subscriberName,
        totalMinutes: mins,
        percentage: totalSubMin > 0 ? Math.round((mins / totalSubMin) * 100) : 0,
      }));

    // Group blocks by calendar date for quick lookup on the client
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
        id: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(" "),
        email: user.email,
        role: user.role,
        jobTitle: user.jobTitle,
        avatarUrl: user.avatarUrl,
      },
      summary: {
        totalWorkMinutes: totalWork,
        totalMeetingMinutes: totalMeeting,
        totalActiveMinutes: totalActive,
        workPercentage: totalActive > 0 ? Math.round((totalWork / totalActive) * 100) : 0,
        meetingPercentage: totalActive > 0 ? Math.round((totalMeeting / totalActive) * 100) : 0,
        daysTracked: dailyActivities.length,
      },
      topicDistribution,
      subscriberDistribution,
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
        topicBreakdown: d.topicBreakdown,
        subscriberBreakdown: d.subscriberBreakdown,
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
          taskBreakdown: (s.taskBreakdown as any[]) || [],
          activities: (s.keyActivities as any[]) || [],
        };
      }),
      documents: userDocs.map((d) => ({
        id: d.id,
        title: d.title,
        docType: d.docType,
        status: d.status,
        content: d.content,
        description: d.description,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching my activity detail");
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to fetch activity details",
    });
  }
});

// ============================================================================
// GET /my-activity/drill-down/:metric?period=...
// Returns per-user breakdown for a specific metric or activity category.
// Mirrors GET /admin/dashboard/people/:id/drill-down/:metric
// ============================================================================
router.get(
  "/drill-down/:metric",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const metric = req.params.metric;
      const period = (req.query.period as string) || "yesterday";
      const { startDate, endDate } = resolveDateRange(period);
      const prevRange = resolvePreviousPeriod(period);

      const currentDays = await db
        .select({
          activityDate: schema.userDailyActivities.activityDate,
          totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
          totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
          totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
          categoryBreakdown: schema.userDailyActivities.categoryBreakdown,
          appBreakdown: schema.userDailyActivities.appBreakdown,
          totalSessions: schema.userDailyActivities.totalSessions,
          userId: schema.userDailyActivities.userId,
        })
        .from(schema.userDailyActivities)
        .where(
          and(
            eq(schema.userDailyActivities.userId, userId),
            eq(schema.userDailyActivities.periodType, "daily"),
            gte(schema.userDailyActivities.activityDate, startDate),
            lte(schema.userDailyActivities.activityDate, endDate)
          )
        );

      let prevDays: typeof currentDays = [];
      if (prevRange) {
        prevDays = await db
          .select({
            activityDate: schema.userDailyActivities.activityDate,
            totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
            totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
            totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
            categoryBreakdown: schema.userDailyActivities.categoryBreakdown,
            appBreakdown: schema.userDailyActivities.appBreakdown,
            totalSessions: schema.userDailyActivities.totalSessions,
            userId: schema.userDailyActivities.userId,
          })
          .from(schema.userDailyActivities)
          .where(
            and(
              eq(schema.userDailyActivities.userId, userId),
              eq(schema.userDailyActivities.periodType, "daily"),
              gte(schema.userDailyActivities.activityDate, prevRange.startDate),
              lte(schema.userDailyActivities.activityDate, prevRange.endDate)
            )
          );
      }

      const knownMetrics = ["focus_time", "active_time", "meeting_load", "days_tracked"];
      let result;

      if (knownMetrics.includes(metric)) {
        result = buildMetricDrillDown(metric, currentDays, prevDays, period);
      } else {
        result = buildCategoryDrillDown(metric, currentDays, prevDays, period);
      }

      res.json(result);
    } catch (error) {
      logger.error({ error: String(error) }, "Error fetching my activity drill-down");
      res
        .status(500)
        .json({ error: "Internal Server Error", message: "Failed to fetch drill-down data" });
    }
  }
);

// ============================================================================
// GET /my-activity/category-activities/:category?period=...
// Returns individual activity blocks for the authenticated user filtered by category.
// Mirrors GET /admin/dashboard/people/:id/category-activities/:category
// ============================================================================
router.get(
  "/category-activities/:category",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const category = req.params.category.toLowerCase();
      const period = (req.query.period as string) || "all";

      const conditions: ReturnType<typeof eq>[] = [
        eq(schema.activityBlocks.userId, userId),
        sql`LOWER(COALESCE(${schema.activityBlocks.category}, 'other')) = ${category}`,
      ];

      if (period !== "all") {
        const { startDate, endDate } = resolveDateRange(period);
        conditions.push(gte(schema.activityBlocks.startTime, new Date(startDate)) as any);
        conditions.push(
          lte(schema.activityBlocks.startTime, new Date(endDate + "T23:59:59.999Z")) as any
        );
      }

      const blocks = await db
        .select({
          id: schema.activityBlocks.id,
          name: schema.activityBlocks.name,
          description: schema.activityBlocks.description,
          category: schema.activityBlocks.category,
          blockType: schema.activityBlocks.blockType,
          startTime: schema.activityBlocks.startTime,
          endTime: schema.activityBlocks.endTime,
          durationMinutes: schema.activityBlocks.durationMinutes,
          apps: schema.activityBlocks.apps,
          sessionId: schema.activityBlocks.sessionId,
        })
        .from(schema.activityBlocks)
        .where(and(...conditions))
        .orderBy(desc(schema.activityBlocks.startTime));

      const totalMinutes = blocks.reduce((s, b) => s + b.durationMinutes, 0);

      res.json({
        category,
        period,
        totalMinutes,
        totalHours: Math.round((totalMinutes / 60) * 10) / 10,
        activityCount: blocks.length,
        activities: blocks.map((b) => ({
          id: b.id,
          name: b.name,
          description: b.description,
          blockType: b.blockType,
          startTime: b.startTime.toISOString(),
          endTime: b.endTime.toISOString(),
          durationMinutes: b.durationMinutes,
          apps: b.apps,
          sessionId: b.sessionId,
        })),
      });
    } catch (error) {
      logger.error({ error: String(error) }, "Error fetching my category activities");
      res
        .status(500)
        .json({ error: "Internal Server Error", message: "Failed to fetch category activities" });
    }
  }
);

// ============================================================================
// GET /my-activity/subscriber-activities/:subscriber?period=...
// Returns individual activity blocks for the authenticated user filtered by subscriber.
// Mirrors GET /admin/dashboard/people/:id/subscriber-activities/:subscriber
// ============================================================================
router.get(
  "/subscriber-activities/:subscriber",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId!;
      const subscriber = decodeURIComponent(req.params.subscriber);
      const period = (req.query.period as string) || "all";

      const conditions: ReturnType<typeof eq>[] = [
        eq(schema.activityBlocks.userId, userId),
        sql`LOWER(COALESCE(${schema.activityBlocks.subscriberName}, '')) = ${subscriber.toLowerCase()}`,
      ];

      if (period !== "all") {
        const { startDate, endDate } = resolveDateRange(period);
        conditions.push(gte(schema.activityBlocks.startTime, new Date(startDate)) as any);
        conditions.push(
          lte(schema.activityBlocks.startTime, new Date(endDate + "T23:59:59.999Z")) as any
        );
      }

      const blocks = await db
        .select({
          id: schema.activityBlocks.id,
          name: schema.activityBlocks.name,
          description: schema.activityBlocks.description,
          category: schema.activityBlocks.category,
          blockType: schema.activityBlocks.blockType,
          startTime: schema.activityBlocks.startTime,
          endTime: schema.activityBlocks.endTime,
          durationMinutes: schema.activityBlocks.durationMinutes,
          apps: schema.activityBlocks.apps,
          sessionId: schema.activityBlocks.sessionId,
          subscriberName: schema.activityBlocks.subscriberName,
        })
        .from(schema.activityBlocks)
        .where(and(...conditions))
        .orderBy(desc(schema.activityBlocks.startTime));

      const totalMinutes = blocks.reduce((s, b) => s + b.durationMinutes, 0);

      res.json({
        subscriber,
        period,
        totalMinutes,
        totalHours: Math.round((totalMinutes / 60) * 10) / 10,
        activityCount: blocks.length,
        activities: blocks.map((b) => ({
          id: b.id,
          name: b.name,
          description: b.description,
          category: b.category,
          blockType: b.blockType,
          startTime: b.startTime.toISOString(),
          endTime: b.endTime.toISOString(),
          durationMinutes: b.durationMinutes,
          apps: b.apps,
          sessionId: b.sessionId,
        })),
      });
    } catch (error) {
      logger.error({ error: String(error) }, "Error fetching my subscriber activities");
      res
        .status(500)
        .json({ error: "Internal Server Error", message: "Failed to fetch subscriber activities" });
    }
  }
);

export default router;
