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
import { eq, and, desc, asc, gte, lte, inArray, isNotNull, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requireManagerOrAdmin, requireAccessToUser, getScopedVisibleUserIds } from "../middleware/authorization.js";
import { createLogger } from "../lib/logger";
import { normalizeName } from "../services/normalize-name.js";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../config";
import { graphRetrievalService } from "../services/graph/graph-retrieval.service";
import { graphSyncService } from "../services/graph/graph-sync.service";
// DEPRECATED — Ask RLM only (callAskLLM, parseAskResponse, /admin/ask/*). Slated for deletion.
import { AskEnvironment } from "../services/rlm/ask-environment";
import { getAskToolByName } from "../services/rlm/ask-tools";
import { getAskSystemPrompt } from "../services/rlm/ask-rlm-prompts";
import { parseJsonResponse } from "../lib/parse-json";

const logger = createLogger({ context: "admin-dashboard-routes" });
const router = Router();

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
  // Also match variants like "Internal / Unattributed" vs "internal/unattributed"
  const collapsed = normalized.replace(/\s+/g, "");
  return EXCLUDED_SUBSCRIBERS.has(collapsed);
}

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
  totalTeamSessionMinutes: number;
  activityDistribution: { category: string; totalMinutes: number; percentage: number }[];
  topApps: { app: string; totalMinutes: number; userCount: number }[];
  userSummaries: {
    userId: string;
    name: string;
    activeMinutes: number;
    workPct: number;
    meetingPct: number;
  }[];
  subscriberDistribution: { subscriberName: string; totalMinutes: number; percentage: number }[];
}

async function computeLiveOrgMetrics(
  organizationId: string,
  dateStr: string,
  scopedUserIds?: string[]
): Promise<LiveOrgMetrics | null> {
  // Fetch user daily activities — scoped to specific users if provided, else org-wide
  const userRows = await db
    .select({
      userId: schema.userDailyActivities.userId,
      totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
      totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
      totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
      totalSessionMinutes: schema.userDailyActivities.totalSessionMinutes,
      workPercentage: schema.userDailyActivities.workPercentage,
      meetingPercentage: schema.userDailyActivities.meetingPercentage,
      appBreakdown: schema.userDailyActivities.appBreakdown,
      categoryBreakdown: schema.userDailyActivities.categoryBreakdown,
      subscriberBreakdown: schema.userDailyActivities.subscriberBreakdown,
    })
    .from(schema.userDailyActivities)
    .where(
      and(
        scopedUserIds
          ? inArray(schema.userDailyActivities.userId, scopedUserIds)
          : eq(schema.userDailyActivities.organizationId, organizationId),
        eq(schema.userDailyActivities.activityDate, dateStr),
        eq(schema.userDailyActivities.periodType, "daily")
      )
    );

  if (userRows.length === 0) return null;

  const count = userRows.length;

  // Averages
  const avgWorkMinutes =
    Math.round((userRows.reduce((s, r) => s + r.totalWorkMinutes, 0) / count) * 10) / 10;
  const avgMeetingMinutes =
    Math.round((userRows.reduce((s, r) => s + r.totalMeetingMinutes, 0) / count) * 10) / 10;
  const avgActiveMinutes =
    Math.round((userRows.reduce((s, r) => s + r.totalActiveMinutes, 0) / count) * 10) / 10;

  // Totals
  const totalTeamWorkMinutes = userRows.reduce((s, r) => s + r.totalWorkMinutes, 0);
  const totalTeamMeetingMinutes = userRows.reduce((s, r) => s + r.totalMeetingMinutes, 0);
  const totalTeamSessionMinutes = userRows.reduce((s, r) => s + r.totalSessionMinutes, 0);
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
    .map(([app, data]) => ({
      app,
      totalMinutes: Math.round(data.totalMinutes),
      userCount: data.users.size,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 15);

  // User summaries (fetch names)
  const userIds = userRows.map((r) => r.userId);
  const users =
    userIds.length > 0
      ? await db
          .select({
            id: schema.users.id,
            firstName: schema.users.firstName,
            lastName: schema.users.lastName,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, userIds))
      : [];
  const nameMap = new Map(
    users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown"])
  );

  const userSummaries = userRows.map((r) => ({
    userId: r.userId,
    name: nameMap.get(r.userId) || "Unknown",
    activeMinutes: r.totalActiveMinutes,
    workPct: r.workPercentage,
    meetingPct: r.meetingPercentage,
  }));

  // Subscriber distribution (aggregate subscriber breakdowns)
  const subscriberTotals = new Map<string, number>();
  const subscriberNames = new Map<string, string>();
  for (const row of userRows) {
    const breakdown = (row.subscriberBreakdown || []) as {
      subscriberName: string;
      minutes: number;
    }[];
    for (const entry of breakdown) {
      if (isExcludedSubscriber(entry.subscriberName)) continue;
      const key = normalizeName(entry.subscriberName);
      subscriberTotals.set(key, (subscriberTotals.get(key) || 0) + entry.minutes);
      const prev = subscriberNames.get(key);
      if (!prev || entry.subscriberName.length > prev.length)
        subscriberNames.set(key, entry.subscriberName);
    }
  }
  const subscriberDistribution = [...subscriberTotals.entries()]
    .map(([key, totalMinutes]) => ({
      subscriberName: subscriberNames.get(key) || key,
      totalMinutes,
      percentage: totalTeamActive > 0 ? Math.round((totalMinutes / totalTeamActive) * 100) : 0,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  return {
    avgWorkMinutes,
    avgMeetingMinutes,
    avgActiveMinutes,
    avgWorkPercentage:
      avgActiveMinutes > 0 ? Math.round((avgWorkMinutes / avgActiveMinutes) * 100) : 0,
    avgMeetingPercentage:
      avgActiveMinutes > 0 ? Math.round((avgMeetingMinutes / avgActiveMinutes) * 100) : 0,
    totalUsersTracked: count,
    totalTeamWorkMinutes,
    totalTeamMeetingMinutes,
    totalTeamSessionMinutes,
    activityDistribution,
    topApps,
    userSummaries,
    subscriberDistribution,
  };
}

// ============================================================================
// GET /admin/dashboard?period=today|week|month|ytd
// Returns org-wide metrics for the admin Dashboard view.
//   - "today": computed on-the-fly from user_daily_activities (always fresh)
//   - "week/month/ytd": historical days from org_daily_metrics + today on-the-fly
// ============================================================================
router.get("/dashboard", requireAuth, requireManagerOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    // Resolve scoped user IDs based on ?scope param (direct/all-reports/org-wide)
    const scopedUserIds = await getScopedVisibleUserIds(req);

    const period = (req.query.period as string) || "yesterday";
    const { startDate, endDate } = resolveDateRange(period);
    const todayStr = new Date().toISOString().split("T")[0]!;

    // ── Single-day views (today/yesterday) — compute live from user_daily_activities ──
    if (period === "today" || period === "yesterday") {
      const targetDate = period === "today" ? todayStr : startDate;
      const live = await computeLiveOrgMetrics(req.organizationId!, targetDate, scopedUserIds);

      if (!live) {
        res.json({
          period,
          hasData: false,
          metrics: {
            avgWorkMinutes: 0,
            avgMeetingMinutes: 0,
            avgActiveMinutes: 0,
            avgWorkPercentage: 0,
            avgMeetingPercentage: 0,
            totalUsersTracked: 0,
            totalTeamWorkMinutes: 0,
            totalTeamMeetingMinutes: 0,
            totalTeamSessionMinutes: 0,
          },
          activityDistribution: [],
          topApps: [],
          userSummaries: [],
          subscriberDistribution: [],
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
          totalTeamSessionMinutes: live.totalTeamSessionMinutes,
        },
        activityDistribution: live.activityDistribution,
        topApps: live.topApps,
        userSummaries: live.userSummaries,
        subscriberDistribution: live.subscriberDistribution,
        dailyTrend: [
          {
            date: todayStr,
            avgActiveMinutes: live.avgActiveMinutes,
            avgWorkMinutes: live.avgWorkMinutes,
            avgMeetingMinutes: live.avgMeetingMinutes,
            usersTracked: live.totalUsersTracked,
          },
        ],
      });
      return;
    }

    // ── Multi-day periods — compute everything from user_daily_activities ──

    // Single query: fetch all user daily rows in the date range
    const MAX_DASHBOARD_ROWS = 10000; // Safety limit for large orgs on wide date ranges
    const allUserRows = await db
      .select({
        userId: schema.userDailyActivities.userId,
        activityDate: schema.userDailyActivities.activityDate,
        totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
        totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
        totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
        totalSessionMinutes: schema.userDailyActivities.totalSessionMinutes,
        workPercentage: schema.userDailyActivities.workPercentage,
        meetingPercentage: schema.userDailyActivities.meetingPercentage,
        categoryBreakdown: schema.userDailyActivities.categoryBreakdown,
        appBreakdown: schema.userDailyActivities.appBreakdown,
        subscriberBreakdown: schema.userDailyActivities.subscriberBreakdown,
      })
      .from(schema.userDailyActivities)
      .where(
        and(
          inArray(schema.userDailyActivities.userId, scopedUserIds),
          eq(schema.userDailyActivities.periodType, "daily"),
          gte(schema.userDailyActivities.activityDate, startDate),
          lte(schema.userDailyActivities.activityDate, endDate)
        )
      )
      .limit(MAX_DASHBOARD_ROWS);

    if (allUserRows.length === 0) {
      res.json({
        period,
        hasData: false,
        metrics: {
          avgWorkMinutes: 0,
          avgMeetingMinutes: 0,
          avgActiveMinutes: 0,
          avgWorkPercentage: 0,
          avgMeetingPercentage: 0,
          totalUsersTracked: 0,
          totalTeamWorkMinutes: 0,
          totalTeamMeetingMinutes: 0,
          totalTeamSessionMinutes: 0,
        },
        activityDistribution: [],
        topApps: [],
        userSummaries: [],
        subscriberDistribution: [],
        dailyTrend: [],
      });
      return;
    }

    // ── Group by date for daily trend + per-day averages ──
    const byDate = new Map<string, typeof allUserRows>();
    for (const row of allUserRows) {
      const existing = byDate.get(row.activityDate) || [];
      existing.push(row);
      byDate.set(row.activityDate, existing);
    }

    // Build daily trend: per-day averages across users
    const dailyTrend: {
      date: string;
      avgActiveMinutes: number;
      avgWorkMinutes: number;
      avgMeetingMinutes: number;
      usersTracked: number;
    }[] = [];
    let totalTeamWorkMinutes = 0;
    let totalTeamMeetingMinutes = 0;
    let totalTeamSessionMinutes = 0;
    let maxUsers = 0;
    let sumAvgWork = 0;
    let sumAvgMeeting = 0;
    let sumAvgActive = 0;

    for (const [date, rows] of byDate.entries()) {
      const userCount = rows.length;
      const dayWork = rows.reduce((s, r) => s + r.totalWorkMinutes, 0);
      const dayMeeting = rows.reduce((s, r) => s + r.totalMeetingMinutes, 0);
      const dayActive = rows.reduce((s, r) => s + r.totalActiveMinutes, 0);

      const avgDayWork = dayWork / userCount;
      const avgDayMeeting = dayMeeting / userCount;
      const avgDayActive = dayActive / userCount;

      dailyTrend.push({
        date,
        avgWorkMinutes: Math.round(avgDayWork * 10) / 10,
        avgMeetingMinutes: Math.round(avgDayMeeting * 10) / 10,
        avgActiveMinutes: Math.round(avgDayActive * 10) / 10,
        usersTracked: userCount,
      });

      totalTeamWorkMinutes += dayWork;
      totalTeamMeetingMinutes += dayMeeting;
      totalTeamSessionMinutes += rows.reduce((s, r) => s + r.totalSessionMinutes, 0);
      sumAvgWork += avgDayWork;
      sumAvgMeeting += avgDayMeeting;
      sumAvgActive += avgDayActive;
      if (userCount > maxUsers) maxUsers = userCount;
    }

    dailyTrend.sort((a, b) => a.date.localeCompare(b.date));

    // Period-level averages: average of per-day averages
    const dayCount = byDate.size;
    const avgWork = sumAvgWork / dayCount;
    const avgMeeting = sumAvgMeeting / dayCount;
    const avgActive = sumAvgActive / dayCount;

    // ── Activity distribution (category totals across all days) ──
    const catTotals = new Map<string, number>();
    let totalTeamActive = 0;
    for (const row of allUserRows) {
      totalTeamActive += row.totalActiveMinutes;
      for (const entry of (row.categoryBreakdown || []) as {
        category: string;
        minutes: number;
      }[]) {
        catTotals.set(entry.category, (catTotals.get(entry.category) || 0) + entry.minutes);
      }
    }
    const activityDistribution = [...catTotals.entries()]
      .map(([category, totalMinutes]) => ({
        category,
        totalMinutes,
        percentage: totalTeamActive > 0 ? Math.round((totalMinutes / totalTeamActive) * 100) : 0,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    // ── Top apps across all days ──
    const appTotals = new Map<string, { totalMinutes: number; users: Set<string> }>();
    for (const row of allUserRows) {
      for (const entry of (row.appBreakdown || []) as { app: string; minutes: number }[]) {
        const existing = appTotals.get(entry.app) || { totalMinutes: 0, users: new Set<string>() };
        existing.totalMinutes += entry.minutes;
        existing.users.add(row.userId);
        appTotals.set(entry.app, existing);
      }
    }
    const topApps = [...appTotals.entries()]
      .map(([app, data]) => ({ app, totalMinutes: data.totalMinutes, userCount: data.users.size }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 10);

    // ── User summaries (aggregate per user across all days) ──
    const userTotals = new Map<string, { work: number; meeting: number; active: number }>();
    for (const row of allUserRows) {
      const existing = userTotals.get(row.userId) || { work: 0, meeting: 0, active: 0 };
      existing.work += row.totalWorkMinutes;
      existing.meeting += row.totalMeetingMinutes;
      existing.active += row.totalActiveMinutes;
      userTotals.set(row.userId, existing);
    }
    const userIds = [...userTotals.keys()];
    const userProfiles =
      userIds.length > 0
        ? await db
            .select({
              id: schema.users.id,
              firstName: schema.users.firstName,
              lastName: schema.users.lastName,
            })
            .from(schema.users)
            .where(inArray(schema.users.id, userIds))
        : [];
    const nameMap = new Map(
      userProfiles.map((u) => [
        u.id,
        [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown",
      ])
    );

    const userSummaries = [...userTotals.entries()].map(([userId, totals]) => ({
      userId,
      name: nameMap.get(userId) || "Unknown",
      activeMinutes: totals.active,
      workPct: totals.active > 0 ? Math.round((totals.work / totals.active) * 100) : 0,
      meetingPct: totals.active > 0 ? Math.round((totals.meeting / totals.active) * 100) : 0,
    }));

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
        totalTeamWorkMinutes: totalTeamWorkMinutes,
        totalTeamMeetingMinutes: totalTeamMeetingMinutes,
        totalTeamSessionMinutes: totalTeamSessionMinutes,
      },
      activityDistribution,
      topApps,
      userSummaries,
      subscriberDistribution: (() => {
        const subscriberTotals = new Map<string, number>();
        const subscriberNames = new Map<string, string>();
        for (const row of allUserRows) {
          const breakdown = (row.subscriberBreakdown || []) as {
            subscriberName: string;
            minutes: number;
          }[];
          for (const entry of breakdown) {
            if (isExcludedSubscriber(entry.subscriberName)) continue;
            const key = normalizeName(entry.subscriberName);
            subscriberTotals.set(key, (subscriberTotals.get(key) || 0) + entry.minutes);
            const prev = subscriberNames.get(key);
            if (!prev || entry.subscriberName.length > prev.length)
              subscriberNames.set(key, entry.subscriberName);
          }
        }
        return [...subscriberTotals.entries()]
          .map(([key, totalMinutes]) => ({
            subscriberName: subscriberNames.get(key) || key,
            totalMinutes,
            percentage:
              totalTeamActive > 0 ? Math.round((totalMinutes / totalTeamActive) * 100) : 0,
          }))
          .sort((a, b) => b.totalMinutes - a.totalMinutes);
      })(),
      dailyTrend,
    });
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching dashboard metrics");
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to fetch dashboard metrics" });
  }
});

// ============================================================================
// GET /admin/dashboard/people
// Returns ALL org users with lifetime activity summaries for the People tab.
// Date filtering is NOT applied here — it belongs in the per-user drill-down.
// ============================================================================
router.get("/dashboard/people", requireAuth, requireManagerOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    // Resolve scoped user IDs based on ?scope param
    const scopedUserIds = await getScopedVisibleUserIds(req);

    // Step 1: Fetch users scoped to visible set
    const orgUsers = scopedUserIds.length > 0
      ? await db
          .select({
            id: schema.users.id,
            firstName: schema.users.firstName,
            lastName: schema.users.lastName,
            email: schema.users.email,
            role: schema.users.role,
            jobTitle: schema.users.jobTitle,
            avatarUrl: schema.users.avatarUrl,
            status: schema.users.status,
            createdAt: schema.users.createdAt,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, scopedUserIds))
          .orderBy(asc(schema.users.firstName))
      : [];

    // Step 2a: Fetch daily activities for scoped users (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const activitiesCutoff = ninetyDaysAgo.toISOString().slice(0, 10);

    const activities = scopedUserIds.length > 0
      ? await db
          .select({
            userId: schema.userDailyActivities.userId,
            activityDate: schema.userDailyActivities.activityDate,
            totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
            totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
            totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
            appBreakdown: schema.userDailyActivities.appBreakdown,
            categoryBreakdown: schema.userDailyActivities.categoryBreakdown,
          })
          .from(schema.userDailyActivities)
          .where(
            and(
              inArray(schema.userDailyActivities.userId, scopedUserIds),
              eq(schema.userDailyActivities.periodType, "daily"),
              gte(schema.userDailyActivities.activityDate, activitiesCutoff)
            )
          )
          .orderBy(desc(schema.userDailyActivities.activityDate))
      : [];

    // Step 2b: Fetch latest session per user for "Recent Highlight"
    const userIds = orgUsers.map((u) => u.id);
    const latestSessions =
      userIds.length > 0
        ? await db
            .select({
              userId: schema.monitoringSessions.userId,
              name: schema.monitoringSessions.name,
              finalSummary: schema.monitoringSessions.finalSummary,
              rawActivitySummary: schema.monitoringSessions.rawActivitySummary,
              endedAt: schema.monitoringSessions.endedAt,
            })
            .from(schema.monitoringSessions)
            .where(
              and(
                inArray(schema.monitoringSessions.userId, userIds),
                isNotNull(schema.monitoringSessions.endedAt)
              )
            )
            .orderBy(desc(schema.monitoringSessions.endedAt))
        : [];

    // Build map: userId → most recent session
    const latestSessionMap = new Map<
      string,
      { name: string | null; summary: string | null; endedAt: Date | null }
    >();
    for (const s of latestSessions) {
      if (!latestSessionMap.has(s.userId)) {
        latestSessionMap.set(s.userId, {
          name: s.name,
          summary: s.finalSummary || s.rawActivitySummary || null,
          endedAt: s.endedAt,
        });
      }
    }

    // Step 2c: Fetch latest document created per user
    const latestDocs =
      userIds.length > 0
        ? await db
            .select({
              userId: schema.documents.createdBy,
              createdAt: schema.documents.createdAt,
            })
            .from(schema.documents)
            .where(
              and(
                inArray(schema.documents.createdBy, userIds),
                isNotNull(schema.documents.createdBy)
              )
            )
            .orderBy(desc(schema.documents.createdAt))
        : [];

    const latestDocMap = new Map<string, Date>();
    for (const d of latestDocs) {
      if (d.userId && !latestDocMap.has(d.userId)) {
        latestDocMap.set(d.userId, d.createdAt);
      }
    }

    // Step 2d: Fetch latest agent conversation activity per user
    const latestAgentChats =
      userIds.length > 0
        ? await db
            .select({
              userId: schema.agentConversations.userId,
              updatedAt: schema.agentConversations.updatedAt,
            })
            .from(schema.agentConversations)
            .where(inArray(schema.agentConversations.userId, userIds))
            .orderBy(desc(schema.agentConversations.updatedAt))
        : [];

    const latestAgentChatMap = new Map<string, Date>();
    for (const c of latestAgentChats) {
      if (!latestAgentChatMap.has(c.userId)) {
        latestAgentChatMap.set(c.userId, c.updatedAt);
      }
    }

    // Step 3: Group activities by user
    const activityMap = new Map<string, typeof activities>();
    for (const act of activities) {
      const existing = activityMap.get(act.userId) || [];
      existing.push(act);
      activityMap.set(act.userId, existing);
    }

    // Step 4: Build response — every user appears, activity data is optional
    const people = orgUsers.map((user) => {
      const rows = activityMap.get(user.id) || [];
      const hasActivity = rows.length > 0;

      const totalWork = rows.reduce((s, r) => s + r.totalWorkMinutes, 0);
      const totalMeeting = rows.reduce((s, r) => s + r.totalMeetingMinutes, 0);
      const totalActive = rows.reduce((s, r) => s + r.totalActiveMinutes, 0);
      const daysTracked = rows.length;

      // Aggregate categoryBreakdown across all days
      const catMap = new Map<string, { minutes: number }>();
      for (const row of rows) {
        for (const entry of (row.categoryBreakdown || []) as {
          category: string;
          minutes: number;
        }[]) {
          const existing = catMap.get(entry.category) || { minutes: 0 };
          existing.minutes += entry.minutes;
          catMap.set(entry.category, existing);
        }
      }
      const aggregatedCategories = [...catMap.entries()]
        .map(([category, data]) => ({
          category,
          minutes: data.minutes,
          percentage: totalActive > 0 ? Math.round((data.minutes / totalActive) * 100) : 0,
        }))
        .sort((a, b) => b.minutes - a.minutes);

      // Aggregate appBreakdown across all days
      const appMap = new Map<string, number>();
      for (const row of rows) {
        for (const entry of (row.appBreakdown || []) as { app: string; minutes: number }[]) {
          appMap.set(entry.app, (appMap.get(entry.app) || 0) + entry.minutes);
        }
      }
      const aggregatedApps = [...appMap.entries()]
        .map(([app, minutes]) => ({ app, minutes }))
        .sort((a, b) => b.minutes - a.minutes);

      // Use latest session summary for "Recent Highlight"
      const latestSession = latestSessionMap.get(user.id);

      // lastActiveAt = most recent of: session end, doc creation, agent chat
      const candidates: Date[] = [];
      if (latestSession?.endedAt) candidates.push(new Date(latestSession.endedAt));
      const latestDoc = latestDocMap.get(user.id);
      if (latestDoc) candidates.push(new Date(latestDoc));
      const latestChat = latestAgentChatMap.get(user.id);
      if (latestChat) candidates.push(new Date(latestChat));

      const lastActiveAt =
        candidates.length > 0
          ? new Date(Math.max(...candidates.map((d) => d.getTime()))).toISOString()
          : null;

      return {
        userId: user.id,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unknown",
        email: user.email,
        role: user.role,
        jobTitle: user.jobTitle,
        avatarUrl: user.avatarUrl,
        userStatus: user.status,
        createdAt: user.createdAt,
        totalWorkMinutes: totalWork,
        totalMeetingMinutes: totalMeeting,
        totalActiveMinutes: totalActive,
        avgActiveMinutesPerDay: daysTracked > 0 ? Math.round(totalActive / daysTracked) : 0,
        workPercentage: totalActive > 0 ? Math.round((totalWork / totalActive) * 100) : 0,
        meetingPercentage: totalActive > 0 ? Math.round((totalMeeting / totalActive) * 100) : 0,
        recentHighlight: latestSession?.summary || latestSession?.name || null,
        lastActiveAt,
        categoryBreakdown: aggregatedCategories,
        appBreakdown: aggregatedApps,
        daysTracked,
        hasActivity,
      };
    });

    // Sort: users with activity first (by active minutes desc), then inactive users alphabetically
    people.sort((a, b) => {
      if (a.hasActivity && !b.hasActivity) return -1;
      if (!a.hasActivity && b.hasActivity) return 1;
      if (a.hasActivity && b.hasActivity) return b.totalActiveMinutes - a.totalActiveMinutes;
      return a.name.localeCompare(b.name);
    });

    res.json({ people });
  } catch (error) {
    logger.error({ error: String(error) }, "Error fetching people data");
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to fetch people data" });
  }
});

// ============================================================================
// GET /admin/dashboard/people/:id?period=today|week|month|ytd
// Returns detailed activity for a specific user including activity blocks
// ============================================================================
router.get(
  "/dashboard/people/:id",
  requireAuth,
  requireManagerOrAdmin,
  requireAccessToUser("id"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      const targetUserId = req.params.id;
      const period = (req.query.period as string) || "yesterday";
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

      // Fetch recent sessions + docs independent of the period filter
      // (admins should always see latest work without needing to switch to "all time")
      // Fetch recent sessions, excluding noise/short sessions (same gate as summarization:
      // sessions must be >= 3 min active duration OR have a real summary, not "Short session")
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
        .where(eq(schema.monitoringSessions.userId, targetUserId))
        .orderBy(desc(schema.monitoringSessions.startedAt))
        .limit(50);

      const MIN_SESSION_DURATION_MS = 3 * 60 * 1000; // 3 minutes
      const sessionActivities = allSessionActivities
        .filter((s) => {
          if (s.name === "Short session") return false;
          if (!s.endedAt) return true; // still active
          const activeMs = Math.max(
            0,
            new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime() - (s.totalPausedMs || 0)
          );
          return activeMs >= MIN_SESSION_DURATION_MS;
        })
        .slice(0, 20);

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
            eq(schema.documents.createdBy, targetUserId),
            sql`${schema.documents.title} NOT LIKE 'Generating:%'`
          )
        )
        .orderBy(desc(schema.documents.createdAt))
        .limit(10);

      // Aggregate totals
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
            taskBreakdown: (s.taskBreakdown as any[]) || [],
            activities: (s.keyActivities as any[]) || [],
          };
        }),
        // User-created documents in the period
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
      logger.error({ error: String(error) }, "Error fetching user activity detail");
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch user activity details",
      });
    }
  }
);

// ============================================================================
// GET /admin/dashboard/drill-down/subscriber/:name?period=...
// Returns drill-down for a specific subscriber: projects, daily trend, stats
// ============================================================================
router.get(
  "/dashboard/drill-down/subscriber/:name",
  requireAuth,
  requireManagerOrAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      const subscriberName = decodeURIComponent(req.params.name);
      const period = (req.query.period as string) || "yesterday";
      const { startDate, endDate } = resolveDateRange(period);

      // Fetch all activity blocks for this subscriber within the org + period
      // Join through userDailyActivities to scope to org
      const dailyActivities = await db
        .select({
          id: schema.userDailyActivities.id,
          userId: schema.userDailyActivities.userId,
          activityDate: schema.userDailyActivities.activityDate,
        })
        .from(schema.userDailyActivities)
        .where(
          and(
            eq(schema.userDailyActivities.organizationId, admin.organizationId),
            eq(schema.userDailyActivities.periodType, "daily"),
            gte(schema.userDailyActivities.activityDate, startDate),
            lte(schema.userDailyActivities.activityDate, endDate)
          )
        );

      const dailyActivityIds = dailyActivities.map((d) => d.id);

      // Normalize the subscriber name for matching — the dashboard aggregation
      // uses normalizeName() to group variants, so drill-down must match the same way.
      const normalizedInput = normalizeName(subscriberName);

      let blocks: (typeof schema.activityBlocks.$inferSelect)[] = [];
      if (dailyActivityIds.length > 0) {
        blocks = await db
          .select()
          .from(schema.activityBlocks)
          .where(
            and(
              inArray(schema.activityBlocks.dailyActivityId, dailyActivityIds),
              sql`TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(${schema.activityBlocks.subscriberName}, '[^a-zA-Z0-9]+', '-', 'g'))) = ${normalizedInput}`
            )
          );
      }

      // Aggregate: total minutes, unique people, projects breakdown, daily trend
      const totalMinutes = blocks.reduce((s, b) => s + b.durationMinutes, 0);
      const uniqueUsers = new Set(blocks.map((b) => b.userId));

      // Group by topic/project
      const projectMap = new Map<string, number>();
      for (const b of blocks) {
        const topic = b.topicName || "Uncategorized";
        projectMap.set(topic, (projectMap.get(topic) || 0) + b.durationMinutes);
      }
      const projectBreakdown = [...projectMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, mins]) => ({
          label,
          value: `${Math.round((mins / 60) * 10) / 10}h`,
          bar: totalMinutes > 0 ? Math.round((mins / totalMinutes) * 100) : 0,
        }));

      const uniqueProjects = new Set(blocks.map((b) => b.topicName || "Uncategorized"));

      // Daily trend
      const dailyMap = new Map<string, number>();
      for (const b of blocks) {
        const dateKey = new Date(b.startTime).toISOString().split("T")[0]!;
        dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + b.durationMinutes);
      }
      const trend = [...dailyMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, mins]) => ({ label: date, value: Math.round((mins / 60) * 10) / 10 }));

      // Total across org for percentage
      const totalOrgMinutes = (
        await db
          .select()
          .from(schema.activityBlocks)
          .where(inArray(schema.activityBlocks.dailyActivityId, dailyActivityIds))
      ).reduce((s, b) => s + b.durationMinutes, 0);

      const teamPct = totalOrgMinutes > 0 ? Math.round((totalMinutes / totalOrgMinutes) * 100) : 0;

      // Group blocks by userId → topicName for team breakdown
      const userProjectMap = new Map<string, Map<string, number>>();
      const userTotalMap = new Map<string, number>();
      for (const b of blocks) {
        if (!userProjectMap.has(b.userId)) userProjectMap.set(b.userId, new Map());
        userTotalMap.set(b.userId, (userTotalMap.get(b.userId) || 0) + b.durationMinutes);
        const pm = userProjectMap.get(b.userId)!;
        const topic = b.topicName || "Uncategorized";
        pm.set(topic, (pm.get(topic) || 0) + b.durationMinutes);
      }

      // Fetch user profiles for team breakdown
      const userIds = [...userProjectMap.keys()];
      const userDetails =
        userIds.length > 0
          ? await db
              .select({
                id: schema.users.id,
                firstName: schema.users.firstName,
                lastName: schema.users.lastName,
                email: schema.users.email,
                jobTitle: schema.users.jobTitle,
                avatarUrl: schema.users.avatarUrl,
              })
              .from(schema.users)
              .where(inArray(schema.users.id, userIds))
          : [];

      // Build teamBreakdown sorted by hours desc
      const teamBreakdown = userDetails
        .map((u) => ({
          userId: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" "),
          email: u.email,
          jobTitle: u.jobTitle,
          avatarUrl: u.avatarUrl,
          totalHours: Math.round(((userTotalMap.get(u.id) || 0) / 60) * 10) / 10,
          projects: [...(userProjectMap.get(u.id) || new Map()).entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([topicName, mins]) => ({ topicName, hours: Math.round((mins / 60) * 10) / 10 })),
        }))
        .sort((a, b) => b.totalHours - a.totalHours);

      res.json({
        title: subscriberName,
        subtitle: `${Math.round((totalMinutes / 60) * 10) / 10}h total across the team`,
        stats: [
          { label: "Total", value: `${Math.round((totalMinutes / 60) * 10) / 10}h` },
          { label: "% Team", value: `${teamPct}%` },
          { label: "People", value: `${uniqueUsers.size}` },
          { label: "Projects", value: `${uniqueProjects.size}` },
        ],
        breakdown: projectBreakdown,
        trend,
        teamBreakdown,
      });
    } catch (error) {
      logger.error({ error: String(error) }, "Error fetching subscriber drill-down");
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch subscriber drill-down",
      });
    }
  }
);

// ============================================================================
// GET /admin/dashboard/drill-down/:metric?period=yesterday|week|month|ytd|all
// Returns org-wide breakdown for a specific metric or activity category.
// Metrics: focus_time, active_time, meeting_load, people_tracked
// Categories: development, communication, meeting, browsing, design, etc.
// ============================================================================
router.get(
  "/dashboard/drill-down/:metric",
  requireAuth,
  requireManagerOrAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      const metric = req.params.metric;
      const period = (req.query.period as string) || "yesterday";
      const { startDate, endDate } = resolveDateRange(period);

      // Also resolve "previous period" for comparison
      const prevRange = resolvePreviousPeriod(period);

      // Fetch all user daily activities for this org in the current period
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
            eq(schema.userDailyActivities.organizationId, admin.organizationId),
            eq(schema.userDailyActivities.periodType, "daily"),
            gte(schema.userDailyActivities.activityDate, startDate),
            lte(schema.userDailyActivities.activityDate, endDate)
          )
        );

      // Fetch previous period for comparison
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
              eq(schema.userDailyActivities.organizationId, admin.organizationId),
              eq(schema.userDailyActivities.periodType, "daily"),
              gte(schema.userDailyActivities.activityDate, prevRange.startDate),
              lte(schema.userDailyActivities.activityDate, prevRange.endDate)
            )
          );
      }

      // Route to the right builder based on metric type
      const knownMetrics = ["focus_time", "active_time", "meeting_load", "people_tracked"];
      let result;

      if (knownMetrics.includes(metric)) {
        result = buildMetricDrillDown(metric, currentDays, prevDays, period);
      } else {
        // Treat as a category drill-down (e.g. "development", "communication")
        result = buildCategoryDrillDown(metric, currentDays, prevDays, period);
      }

      res.json(result);
    } catch (error) {
      logger.error({ error: String(error) }, "Error fetching drill-down data");
      res
        .status(500)
        .json({ error: "Internal Server Error", message: "Failed to fetch drill-down data" });
    }
  }
);

/**
 * Resolve previous period for comparison (e.g. this week vs last week).
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
      return null; // No comparison for ytd/all
  }
}

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
 * Build drill-down for a top-level metric (focus_time, active_time, meeting_load, people_tracked).
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

  // Pick the right minute field based on metric
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

  // Aggregate by date for trend
  const dayTotals = new Map<string, { total: number; users: Set<string> }>();
  for (const row of currentDays) {
    const existing = dayTotals.get(row.activityDate) || { total: 0, users: new Set<string>() };
    existing.total += getMinutes(row);
    existing.users.add(row.userId);
    dayTotals.set(row.activityDate, existing);
  }

  // Compute averages per day (across users)
  const trend = [...dayTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, data]) => ({
      label: date,
      value: Math.round((data.total / data.users.size / 60) * 10) / 10,
    }));

  // Current period avg
  const uniqueUsers = new Set(currentDays.map((r) => r.userId));
  const totalMinutes = currentDays.reduce((s, r) => s + getMinutes(r), 0);
  const uniqueDays = new Set(currentDays.map((r) => r.activityDate)).size;
  const currentAvg =
    uniqueUsers.size > 0 && uniqueDays > 0
      ? Math.round((totalMinutes / uniqueUsers.size / uniqueDays / 60) * 10) / 10
      : 0;

  // Previous period avg
  const prevUsers = new Set(prevDays.map((r) => r.userId));
  const prevTotal = prevDays.reduce((s, r) => s + getMinutes(r), 0);
  const prevUniqueDays = new Set(prevDays.map((r) => r.activityDate)).size;
  const prevAvg =
    prevUsers.size > 0 && prevUniqueDays > 0
      ? Math.round((prevTotal / prevUsers.size / prevUniqueDays / 60) * 10) / 10
      : 0;

  // Best/lowest day
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

  // Breakdown by category (for focus_time/active_time) or by app
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

  // For people_tracked, override with user count per day
  if (metric === "people_tracked") {
    const usersPerDay = new Map<string, Set<string>>();
    for (const row of currentDays) {
      const existing = usersPerDay.get(row.activityDate) || new Set<string>();
      existing.add(row.userId);
      usersPerDay.set(row.activityDate, existing);
    }

    return {
      title: "People Tracked",
      subtitle: `${uniqueUsers.size} unique users ${periodLabel.toLowerCase()}`,
      stats: [
        { label: `${periodLabel}`, value: `${uniqueUsers.size} users` },
        ...(prevLabel ? [{ label: `${prevLabel}`, value: `${prevUsers.size} users` }] : []),
        {
          label: "Total Sessions",
          value: `${currentDays.reduce((s, r) => s + r.totalSessions, 0)}`,
        },
        { label: "Days with Data", value: `${uniqueDays}` },
      ],
      breakdown: [],
      trend: [...usersPerDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, users]) => ({ label: date, value: users.size })),
    };
  }

  const titles: Record<string, { title: string; subtitle: string }> = {
    focus_time: {
      title: "Avg Focus Time",
      subtitle: `Deep work hours per person per day ${periodLabel.toLowerCase()}`,
    },
    active_time: {
      title: "Avg Active Time",
      subtitle: `Total tracked time per person per day ${periodLabel.toLowerCase()}`,
    },
    meeting_load: {
      title: "Avg Meeting Load",
      subtitle: `Meeting hours per person per day ${periodLabel.toLowerCase()}`,
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

  // Extract minutes for this category from each user's categoryBreakdown
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

  // Previous period total
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
  const avgPerPerson =
    contributors.size > 0 ? Math.round((totalMinutes / contributors.size / 60) * 10) / 10 : 0;

  // Build app breakdown for this category from appBreakdown data
  const appMinutes = new Map<string, number>();
  for (const row of currentDays) {
    const apps = (row.appBreakdown || []) as { app: string; minutes: number }[];
    // We don't have per-category-per-app granularity in appBreakdown,
    // so we distribute proportionally based on category share
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
    subtitle: `${totalHours}h across the team ${periodLabel.toLowerCase()}`,
    stats: [
      { label: "Total Hours", value: `${totalHours}h` },
      ...(prevLabel ? [{ label: `${prevLabel}`, value: `${prevHours}h` }] : []),
      { label: "Contributors", value: `${contributors.size} people` },
      { label: "Avg per Person", value: `${avgPerPerson}h` },
    ],
    breakdown,
    trend,
  };
}

// ============================================================================
// GET /admin/dashboard/people/:id/drill-down/:metric?period=...
// Returns per-user breakdown for a specific metric or activity category.
// Same shape as org-wide drill-down but scoped to one user.
// ============================================================================
router.get(
  "/dashboard/people/:id/drill-down/:metric",
  requireAuth,
  requireManagerOrAdmin,
  requireAccessToUser("id"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      const targetUserId = req.params.id;
      const metric = req.params.metric;
      const period = (req.query.period as string) || "yesterday";
      const { startDate, endDate } = resolveDateRange(period);
      const prevRange = resolvePreviousPeriod(period);

      // Verify user belongs to same org
      const [targetUser] = await db
        .select({ id: schema.users.id, organizationId: schema.users.organizationId })
        .from(schema.users)
        .where(eq(schema.users.id, targetUserId))
        .limit(1);

      if (!targetUser || targetUser.organizationId !== admin.organizationId) {
        res.status(404).json({ error: "Not Found" });
        return;
      }

      // Fetch this user's daily activities for the period
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
            eq(schema.userDailyActivities.userId, targetUserId),
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
              eq(schema.userDailyActivities.userId, targetUserId),
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
      logger.error({ error: String(error) }, "Error fetching user drill-down data");
      res
        .status(500)
        .json({ error: "Internal Server Error", message: "Failed to fetch user drill-down data" });
    }
  }
);

// ============================================================================
// GET /admin/dashboard/people/:id/category-activities/:category?period=...
// Returns individual activity blocks for a user filtered by category + period.
// Used by the per-user Activity Breakdown drill-down panel.
// ============================================================================
router.get(
  "/dashboard/people/:id/category-activities/:category",
  requireAuth,
  requireManagerOrAdmin,
  requireAccessToUser("id"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      const targetUserId = req.params.id;
      const category = req.params.category.toLowerCase();
      const period = (req.query.period as string) || "all";

      // Verify user belongs to same org
      const [targetUser] = await db
        .select({ id: schema.users.id, organizationId: schema.users.organizationId })
        .from(schema.users)
        .where(eq(schema.users.id, targetUserId))
        .limit(1);

      if (!targetUser || targetUser.organizationId !== admin.organizationId) {
        res.status(404).json({ error: "Not Found" });
        return;
      }

      // Build date conditions
      const conditions = [eq(schema.activityBlocks.userId, targetUserId)];

      // Filter by category in SQL (case-insensitive)
      conditions.push(
        sql`LOWER(COALESCE(${schema.activityBlocks.category}, 'other')) = ${category}`
      );

      if (period !== "all") {
        const { startDate, endDate } = resolveDateRange(period);
        conditions.push(gte(schema.activityBlocks.startTime, new Date(startDate)));
        conditions.push(lte(schema.activityBlocks.startTime, new Date(endDate + "T23:59:59.999Z")));
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
      logger.error({ error: String(error) }, "Error fetching category activities");
      res
        .status(500)
        .json({ error: "Internal Server Error", message: "Failed to fetch category activities" });
    }
  }
);

// ============================================================================
// GET /admin/dashboard/people/:id/subscriber-activities/:subscriber?period=...
// Returns individual activity blocks for a user filtered by subscriber + period.
// Used by the per-user Customer / Client drill-down panel.
// ============================================================================
router.get(
  "/dashboard/people/:id/subscriber-activities/:subscriber",
  requireAuth,
  requireManagerOrAdmin,
  requireAccessToUser("id"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      const targetUserId = req.params.id;
      const subscriber = decodeURIComponent(req.params.subscriber);
      const period = (req.query.period as string) || "all";

      // Verify user belongs to same org
      const [targetUser] = await db
        .select({ id: schema.users.id, organizationId: schema.users.organizationId })
        .from(schema.users)
        .where(eq(schema.users.id, targetUserId))
        .limit(1);

      if (!targetUser || targetUser.organizationId !== admin.organizationId) {
        res.status(404).json({ error: "Not Found" });
        return;
      }

      // Build date conditions
      const conditions = [
        eq(schema.activityBlocks.userId, targetUserId),
        sql`LOWER(COALESCE(${schema.activityBlocks.subscriberName}, '')) = ${subscriber.toLowerCase()}`,
      ];

      if (period !== "all") {
        const { startDate, endDate } = resolveDateRange(period);
        conditions.push(gte(schema.activityBlocks.startTime, new Date(startDate)));
        conditions.push(lte(schema.activityBlocks.startTime, new Date(endDate + "T23:59:59.999Z")));
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
      logger.error({ error: String(error) }, "Error fetching subscriber activities");
      res
        .status(500)
        .json({ error: "Internal Server Error", message: "Failed to fetch subscriber activities" });
    }
  }
);

// ============================================================================
// POST /admin/dashboard/chat
// AI assistant that answers questions about dashboard data
// ============================================================================

// LLM clients (lazy init)
let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;
let deepseekClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic | null {
  if (!anthropicClient && config.anthropic.apiKey) {
    anthropicClient = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return anthropicClient;
}

function getOpenaiClient(): OpenAI | null {
  if (!openaiClient && config.openai.apiKey) {
    openaiClient = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return openaiClient;
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
- Answer questions about **org-level** dashboard metrics, trends, and activity breakdowns provided below.
- Compare periods, explain changes, and surface insights at the team/org level.
- Be concise and data-driven. Reference actual numbers from the data.
- If the data doesn't contain enough information to answer, say so honestly.
- Keep responses under 150 words unless the question requires more detail.
- Do NOT make up data. Only reference what's in the context below.
- Format numbers nicely (e.g., "2.5h" not "150 minutes").

**IMPORTANT:** You do NOT have access to individual user data. If the admin asks about a specific person, their sessions, docs, or per-user metrics, politely let them know that the **Ask** feature (available in the sidebar) is designed for those deeper, per-user and cross-org queries. Keep your answers focused on org-wide averages, distributions, and trends.`;

function buildDashboardContext(dashboardData: any, _peopleData?: any[]): string {
  const m = dashboardData?.metrics || {};
  const workH = Math.round(((m.avgWorkMinutes || 0) / 60) * 10) / 10;
  const meetH = Math.round(((m.avgMeetingMinutes || 0) / 60) * 10) / 10;
  const activeH = Math.round(((m.avgActiveMinutes || 0) / 60) * 10) / 10;

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
      ctx += `\n- ${cat.category}: ${Math.round((cat.totalMinutes / 60) * 10) / 10}h (${cat.percentage}%)`;
    }
  }

  if (dashboardData?.dailyTrend?.length > 0) {
    ctx += `\n\n### Daily Trend`;
    for (const day of dashboardData.dailyTrend) {
      ctx += `\n- ${day.date}: ${Math.round((day.avgWorkMinutes / 60) * 10) / 10}h work, ${Math.round((day.avgMeetingMinutes / 60) * 10) / 10}h meetings (${day.usersTracked} users)`;
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
      const errStr = String(error);
      const isFatal = /401|403|invalid.*key|billing|authentication/i.test(errStr);
      if (isFatal) {
        logger.error({ error: errStr }, "Claude auth/billing error — permanently disabling");
        anthropicClient = null;
      } else {
        logger.warn({ error: errStr }, "Claude dashboard chat failed (transient) — trying OpenAI");
      }
    }
  }

  const oai = getOpenaiClient();
  if (oai) {
    try {
      const completion = await oai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.7,
        max_completion_tokens: 1000,
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (content) return content;
    } catch (error) {
      logger.warn({ error: String(error) }, "OpenAI dashboard chat failed — trying DeepSeek");
    }
  }

  const deepseek = getDeepseekClient();
  if (deepseek) {
    const completion = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.7,
      max_tokens: 1000,
    });
    return completion.choices[0]?.message?.content?.trim() || "I couldn't generate a response.";
  }

  throw new Error("No LLM available — need ANTHROPIC_API_KEY or DEEPSEEK_API_KEY");
}

// =============================================================================
// DEPRECATED — Ask RLM (unused). Includes callAskLLM, parseAskResponse, /admin/ask/* routes.
// Scheduled for deletion in app cleanup. Do not extend.
// =============================================================================

async function callAskLLM(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const claude = getAnthropicClient();
  if (claude) {
    try {
      const response = await claude.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4000,
        system: systemPrompt,
        messages,
      });
      for (const block of response.content) {
        if (block.type === "text") return block.text.trim();
      }
    } catch (error) {
      const errStr = String(error);
      const isFatal = /401|403|invalid.*key|billing|authentication/i.test(errStr);
      if (isFatal) {
        logger.error({ error: errStr }, "Claude auth/billing error — permanently disabling");
        anthropicClient = null;
      } else {
        logger.warn({ error: errStr }, "Claude Ask RLM failed (transient) — trying OpenAI");
      }
    }
  }

  const oai = getOpenaiClient();
  if (oai) {
    try {
      const completion = await oai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.7,
        max_completion_tokens: 4000,
      });
      const content = completion.choices[0]?.message?.content?.trim();
      if (content) return content;
    } catch (error) {
      logger.warn({ error: String(error) }, "OpenAI Ask RLM failed — trying DeepSeek");
    }
  }

  const deepseek = getDeepseekClient();
  if (deepseek) {
    const completion = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature: 0.7,
      max_tokens: 4000,
    });
    return completion.choices[0]?.message?.content?.trim() || "I couldn't generate a response.";
  }

  throw new Error("No LLM available — all providers exhausted");
}

router.post("/dashboard/chat", requireAuth, requireManagerOrAdmin, async (req: Request, res: Response): Promise<void> => {
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

    // Fetch dashboard data from user_daily_activities (same source as GET /dashboard)
    const { startDate, endDate } = resolveDateRange(period);

    const userActivities = await db
      .select({
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
      })
      .from(schema.userDailyActivities)
      .innerJoin(schema.users, eq(schema.userDailyActivities.userId, schema.users.id))
      .where(
        and(
          eq(schema.userDailyActivities.organizationId, admin.organizationId),
          eq(schema.userDailyActivities.periodType, "daily"),
          gte(schema.userDailyActivities.activityDate, startDate),
          lte(schema.userDailyActivities.activityDate, endDate)
        )
      )
      .orderBy(desc(schema.userDailyActivities.totalActiveMinutes));

    // Build aggregated dashboard data from user_daily_activities
    let dashboardData: any = { period, hasData: false, metrics: {} };
    if (userActivities.length > 0) {
      // Group by date for per-day averages
      const byDate = new Map<string, typeof userActivities>();
      for (const row of userActivities) {
        const existing = byDate.get(row.activityDate) || [];
        existing.push(row);
        byDate.set(row.activityDate, existing);
      }

      let sumAvgWork = 0,
        sumAvgMeeting = 0,
        sumAvgActive = 0;
      let totalWork = 0,
        totalMeeting = 0,
        maxUsers = 0;
      const dailyTrend: any[] = [];

      for (const [date, rows] of byDate.entries()) {
        const n = rows.length;
        const dw = rows.reduce((s, r) => s + r.totalWorkMinutes, 0);
        const dm = rows.reduce((s, r) => s + r.totalMeetingMinutes, 0);
        const da = rows.reduce((s, r) => s + r.totalActiveMinutes, 0);
        sumAvgWork += dw / n;
        sumAvgMeeting += dm / n;
        sumAvgActive += da / n;
        totalWork += dw;
        totalMeeting += dm;
        if (n > maxUsers) maxUsers = n;
        dailyTrend.push({
          date,
          avgWorkMinutes: dw / n,
          avgMeetingMinutes: dm / n,
          usersTracked: n,
        });
      }

      const dayCount = byDate.size;
      const avgWork = sumAvgWork / dayCount;
      const avgMeeting = sumAvgMeeting / dayCount;
      const avgActive = sumAvgActive / dayCount;

      // Category distribution
      const catTotals = new Map<string, number>();
      let totalActive = 0;
      for (const row of userActivities) {
        totalActive += row.totalActiveMinutes;
        for (const entry of (row.categoryBreakdown || []) as {
          category: string;
          minutes: number;
        }[]) {
          catTotals.set(entry.category, (catTotals.get(entry.category) || 0) + entry.minutes);
        }
      }

      dashboardData = {
        period,
        hasData: true,
        metrics: {
          avgWorkMinutes: avgWork,
          avgMeetingMinutes: avgMeeting,
          avgActiveMinutes: avgActive,
          avgWorkPercentage: avgActive > 0 ? Math.round((avgWork / avgActive) * 100) : 0,
          avgMeetingPercentage: avgActive > 0 ? Math.round((avgMeeting / avgActive) * 100) : 0,
          totalUsersTracked: maxUsers,
          totalTeamWorkMinutes: totalWork,
          totalTeamMeetingMinutes: totalMeeting,
        },
        activityDistribution: [...catTotals.entries()]
          .map(([category, totalMinutes]) => ({
            category,
            totalMinutes,
            percentage: totalActive > 0 ? Math.round((totalMinutes / totalActive) * 100) : 0,
          }))
          .sort((a, b) => b.totalMinutes - a.totalMinutes),
        dailyTrend: dailyTrend.sort((a, b) => a.date.localeCompare(b.date)),
      };
    }

    // Build system prompt with data context
    const systemPrompt =
      DASHBOARD_CHAT_SYSTEM + "\n\n" + buildDashboardContext(dashboardData, userActivities);

    // Call LLM
    const aiResponse = await callDashboardLLM(systemPrompt, messages);

    res.json({ message: aiResponse });
  } catch (error) {
    logger.error({ error: String(error) }, "Error in dashboard chat");
    res
      .status(500)
      .json({ error: "Internal Server Error", message: "Failed to process chat request" });
  }
});

// ── Ask RLM (deprecated): response parsing for /admin/ask/chat ──────────────

function parseAskResponse(raw: string): {
  message: string;
  report?: { title: string; subtitle: string; html: string };
} {
  // Try with closing tag first
  let reportMatch = raw.match(/<report\s+[^>]*?>([\s\S]*)<\/report>/i);

  // Fallback: handle truncated reports where </report> is missing (token limit hit)
  if (!reportMatch) {
    reportMatch = raw.match(/<report\s+[^>]*?>([\s\S]+)/i);
  }

  if (reportMatch) {
    const openTag = raw.match(/<report\s+[^>]*?>([\s\S]*)<\/report>/i)?.[0] || "";
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

// ── DEPRECATED: /admin/ask/* — Ask RLM HTTP API (slated for deletion) ────────

// ── GET /admin/ask/threads — list all threads for this admin ──
router.get("/ask/threads", requireAuth, requireManagerOrAdmin, async (req: Request, res: Response): Promise<void> => {
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
router.get(
  "/ask/threads/:id/messages",
  requireAuth,
  requireManagerOrAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      const threadId = req.params.id;

      // Verify thread belongs to this user
      const [thread] = await db
        .select()
        .from(schema.askThreads)
        .where(and(eq(schema.askThreads.id, threadId), eq(schema.askThreads.userId, admin.userId)))
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
  }
);

// ── DELETE /admin/ask/threads/:id — delete a thread and its messages ──
router.delete(
  "/ask/threads/:id",
  requireAuth,
  requireManagerOrAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      const threadId = req.params.id;

      // Verify ownership then delete (cascade deletes messages)
      const deleted = await db
        .delete(schema.askThreads)
        .where(and(eq(schema.askThreads.id, threadId), eq(schema.askThreads.userId, admin.userId)))
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
  }
);

// ── PATCH /admin/ask/messages/:id/report — update report content (auto-save) ──
router.patch(
  "/ask/messages/:id/report",
  requireAuth,
  requireManagerOrAdmin,
  async (req: Request, res: Response): Promise<void> => {
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
          and(eq(schema.askThreads.id, msg.threadId), eq(schema.askThreads.userId, admin.userId))
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
  }
);

// ── POST /admin/ask/chat — RLM tool-calling loop ──
// The LLM fetches data on demand via tools (max 31 days per query)
// instead of receiving everything in a single context dump.
const ASK_MAX_ITERATIONS = 10;

router.post("/ask/chat", requireAuth, requireManagerOrAdmin, async (req: Request, res: Response): Promise<void> => {
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
      const [thread] = await db
        .select()
        .from(schema.askThreads)
        .where(
          and(eq(schema.askThreads.id, activeThreadId), eq(schema.askThreads.userId, admin.userId))
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

    // Load conversation history (only final messages, not tool calls)
    const dbMessages = await db
      .select()
      .from(schema.askMessages)
      .where(eq(schema.askMessages.threadId, activeThreadId))
      .orderBy(asc(schema.askMessages.createdAt));

    const conversationHistory = dbMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Initialize RLM environment + system prompt
    const environment = new AskEnvironment(admin.organizationId);
    const adminName = admin.firstName || "there";
    const systemPrompt = getAskSystemPrompt(adminName);

    // RLM conversation: conversation history + tool calls for this turn
    const rlmMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...conversationHistory,
    ];

    // RLM tool-calling loop
    let iterations = 0;
    let toolCalls = 0;
    let finalResponse = "";

    while (iterations < ASK_MAX_ITERATIONS) {
      iterations++;

      // Get LLM decision (Claude → OpenAI → DeepSeek fallback)
      const llmRaw = await callAskLLM(systemPrompt, rlmMessages);

      let llmDecision: {
        tool?: string;
        parameters?: any;
        reasoning?: string;
        done?: boolean;
        response?: string;
      };
      try {
        llmDecision = parseJsonResponse(llmRaw);
      } catch {
        // LLM returned plain text instead of JSON — treat as final response
        finalResponse = llmRaw;
        break;
      }

      // Append assistant response to RLM conversation
      rlmMessages.push({ role: "assistant", content: JSON.stringify(llmDecision) });

      // Check if LLM is done
      if (llmDecision.done && llmDecision.response) {
        finalResponse = llmDecision.response;
        break;
      }

      // Execute the tool
      if (llmDecision.tool && llmDecision.parameters !== undefined) {
        const tool = getAskToolByName(llmDecision.tool);
        if (!tool) {
          rlmMessages.push({
            role: "user",
            content: `Error: Unknown tool "${llmDecision.tool}". Available tools: list_team_members, query_org_metrics, query_user_metrics, query_session_summaries.`,
          });
          continue;
        }

        const toolResult = await tool.execute(llmDecision.parameters, environment);
        toolCalls++;

        rlmMessages.push({
          role: "user",
          content: `Tool "${llmDecision.tool}" returned:\n${JSON.stringify(toolResult, null, 2)}\n\nContinue with the next step.`,
        });
      } else {
        // No tool call and not done — break to avoid infinite loop
        if (llmDecision.response) finalResponse = llmDecision.response;
        break;
      }
    }

    if (!finalResponse) {
      finalResponse = "I wasn't able to generate a response. Please try rephrasing your question.";
    }

    logger.info({ threadId: activeThreadId, iterations, toolCalls }, "Ask RLM completed");

    const parsed = parseAskResponse(finalResponse);

    // Save assistant message (with report data if present)
    const [savedMsg] = await db
      .insert(schema.askMessages)
      .values({
        threadId: activeThreadId,
        role: "assistant",
        content: parsed.message,
        reportTitle: parsed.report?.title || null,
        reportSubtitle: parsed.report?.subtitle || null,
        reportHtml: parsed.report?.html || null,
      })
      .returning({ id: schema.askMessages.id });

    // Update thread timestamp
    await db
      .update(schema.askThreads)
      .set({ updatedAt: new Date() })
      .where(eq(schema.askThreads.id, activeThreadId));

    res.json({ ...parsed, threadId: activeThreadId, messageId: savedMsg.id });
  } catch (error) {
    logger.error({ error: String(error) }, "Error in ask chat");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to process request" });
  }
});

/**
 * GET /admin/graph/users/:userId/work-insights?window=7d|30d|90d
 * Returns graph-derived work profile for a single employee in the same org.
 * Now includes appBehaviors and populated patterns from V2 profile.
 */
router.get(
  "/graph/users/:userId/work-insights",
  requireAuth,
  requireManagerOrAdmin,
  requireAccessToUser("userId"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      if (!config.graph.enabled) {
        res.status(503).json({ error: "GraphDisabled", message: "Graph features are disabled" });
        return;
      }

      const targetUserId = req.params.userId;
      const [targetUser] = await db
        .select({ id: schema.users.id, organizationId: schema.users.organizationId })
        .from(schema.users)
        .where(eq(schema.users.id, targetUserId))
        .limit(1);

      if (!targetUser || targetUser.organizationId !== admin.organizationId) {
        res
          .status(404)
          .json({ error: "Not Found", message: "User not found in your organization" });
        return;
      }

      const profile = await graphRetrievalService.getUserGraphProfile(
        targetUser.id,
        targetUser.organizationId
      );

      // Extract app behavior summaries for the response
      const appBehaviors = ("appBehaviors" in profile ? profile.appBehaviors : []).map((b) => ({
        app: b.object,
        topActivities: b.topActivities,
        evidenceCount: b.evidenceCount,
      }));

      res.json({
        window: (req.query.window as string) || "30d",
        generatedAt: new Date().toISOString(),
        profile,
        appBehaviors,
      });
    } catch (error) {
      logger.error({ error: String(error) }, "Error fetching user graph work insights");
      res
        .status(500)
        .json({ error: "Internal Server Error", message: "Failed to fetch work insights" });
    }
  }
);

/**
 * GET /admin/graph/orgs/:orgId/common-tasks?limit=20
 * Returns organization-level common tasks inferred from workstreams.
 */
router.get(
  "/graph/orgs/:orgId/common-tasks",
  requireAuth,
  requireManagerOrAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      if (!config.graph.enabled) {
        res.status(503).json({ error: "GraphDisabled", message: "Graph features are disabled" });
        return;
      }

      const orgId = req.params.orgId;
      if (orgId !== admin.organizationId) {
        res.status(403).json({ error: "Forbidden", message: "Cross-org access is not allowed" });
        return;
      }

      const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));

      const rows = await db
        .select({
          task: schema.sessionWorkstreams.name,
          totalDurationMinutes: sql<number>`sum(${schema.sessionWorkstreams.totalDurationMinutes})::int`,
          evidenceCount: sql<number>`count(*)::int`,
          distinctUsers: sql<number>`count(distinct ${schema.monitoringSessions.userId})::int`,
        })
        .from(schema.sessionWorkstreams)
        .innerJoin(
          schema.monitoringSessions,
          eq(schema.sessionWorkstreams.sessionId, schema.monitoringSessions.id)
        )
        .where(eq(schema.monitoringSessions.organizationId, orgId))
        .groupBy(schema.sessionWorkstreams.name)
        .orderBy(desc(sql`sum(${schema.sessionWorkstreams.totalDurationMinutes})`))
        .limit(limit);

      res.json({
        generatedAt: new Date().toISOString(),
        orgId,
        commonTasks: rows.map((row) => ({
          task: row.task,
          totalDurationMinutes: Number(row.totalDurationMinutes || 0),
          evidenceCount: Number(row.evidenceCount || 0),
          distinctUsers: Number(row.distinctUsers || 0),
        })),
      });
    } catch (error) {
      logger.error({ error: String(error) }, "Error fetching org common tasks");
      res
        .status(500)
        .json({ error: "Internal Server Error", message: "Failed to fetch common tasks" });
    }
  }
);

/**
 * GET /admin/graph/orgs/:orgId/workflow-insights?window=7d|30d|90d
 * Returns org-level workflow visibility metrics with distribution, confidence, and trend.
 */
router.get(
  "/graph/orgs/:orgId/workflow-insights",
  requireAuth,
  requireManagerOrAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      if (!config.graph.enabled) {
        res.status(503).json({ error: "GraphDisabled", message: "Graph features are disabled" });
        return;
      }

      const orgId = req.params.orgId;
      if (orgId !== admin.organizationId) {
        res.status(403).json({ error: "Forbidden", message: "Cross-org access is not allowed" });
        return;
      }

      const window = ((req.query.window as string) || "30d").toLowerCase();
      const lookbackDays = window === "7d" ? 7 : window === "90d" ? 90 : 30;
      const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      const prevSince = new Date(since.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
      const forceLive = String(req.query.forceLive || "false").toLowerCase() === "true";

      if (!forceLive) {
        const [latestSnapshot] = await db
          .select({
            payload: schema.workflowVisibilitySnapshots.payload,
            snapshotDate: schema.workflowVisibilitySnapshots.snapshotDate,
          })
          .from(schema.workflowVisibilitySnapshots)
          .where(
            and(
              eq(schema.workflowVisibilitySnapshots.organizationId, orgId),
              eq(schema.workflowVisibilitySnapshots.window, window),
              sql`${schema.workflowVisibilitySnapshots.userId} is null`
            )
          )
          .orderBy(desc(schema.workflowVisibilitySnapshots.snapshotDate))
          .limit(1);

        if (latestSnapshot?.payload) {
          const payload = latestSnapshot.payload as {
            generatedAt?: string;
            overview?: Record<string, unknown>;
            categories?: unknown[];
          };
          res.json({
            window,
            generatedAt: payload.generatedAt || new Date(latestSnapshot.snapshotDate).toISOString(),
            orgId,
            source: "snapshot",
            overview: payload.overview || {},
            categories: payload.categories || [],
            workflowDistribution: [],
            confidenceMetadata: {
              dataWindow: window,
              sourceTypes: ["snapshot"],
              confidenceLevel: "medium",
            },
            trend: { direction: "flat", delta: 0 },
          });
          return;
        }
      }

      // Current window overview
      const [overview] = await db
        .select({
          sessionCount: sql<number>`count(distinct ${schema.monitoringSessions.id})::int`,
          userCount: sql<number>`count(distinct ${schema.monitoringSessions.userId})::int`,
          workstreamCount: sql<number>`count(${schema.sessionWorkstreams.id})::int`,
          totalDurationMinutes: sql<number>`coalesce(sum(${schema.sessionWorkstreams.totalDurationMinutes}), 0)::int`,
        })
        .from(schema.monitoringSessions)
        .leftJoin(
          schema.sessionWorkstreams,
          eq(schema.monitoringSessions.id, schema.sessionWorkstreams.sessionId)
        )
        .where(
          and(
            eq(schema.monitoringSessions.organizationId, orgId),
            gte(schema.monitoringSessions.updatedAt, since)
          )
        );

      const byCategory = await db
        .select({
          category: schema.sessionWorkstreams.category,
          totalDurationMinutes: sql<number>`sum(${schema.sessionWorkstreams.totalDurationMinutes})::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.sessionWorkstreams)
        .innerJoin(
          schema.monitoringSessions,
          eq(schema.sessionWorkstreams.sessionId, schema.monitoringSessions.id)
        )
        .where(
          and(
            eq(schema.monitoringSessions.organizationId, orgId),
            gte(schema.sessionWorkstreams.updatedAt, since),
            isNotNull(schema.sessionWorkstreams.category)
          )
        )
        .groupBy(schema.sessionWorkstreams.category)
        .orderBy(desc(sql`sum(${schema.sessionWorkstreams.totalDurationMinutes})`));

      // Workflow distribution: top 20 tasks by duration + distinct users
      const workflowDistribution = await db
        .select({
          task: schema.sessionWorkstreams.name,
          totalDurationMinutes: sql<number>`sum(${schema.sessionWorkstreams.totalDurationMinutes})::int`,
          distinctUsers: sql<number>`count(distinct ${schema.monitoringSessions.userId})::int`,
        })
        .from(schema.sessionWorkstreams)
        .innerJoin(
          schema.monitoringSessions,
          eq(schema.sessionWorkstreams.sessionId, schema.monitoringSessions.id)
        )
        .where(
          and(
            eq(schema.monitoringSessions.organizationId, orgId),
            gte(schema.sessionWorkstreams.updatedAt, since)
          )
        )
        .groupBy(schema.sessionWorkstreams.name)
        .orderBy(desc(sql`sum(${schema.sessionWorkstreams.totalDurationMinutes})`))
        .limit(20);

      // Trend: compare current window total minutes vs previous equal window
      const [prevOverview] = await db
        .select({
          totalDurationMinutes: sql<number>`coalesce(sum(${schema.sessionWorkstreams.totalDurationMinutes}), 0)::int`,
        })
        .from(schema.sessionWorkstreams)
        .innerJoin(
          schema.monitoringSessions,
          eq(schema.sessionWorkstreams.sessionId, schema.monitoringSessions.id)
        )
        .where(
          and(
            eq(schema.monitoringSessions.organizationId, orgId),
            gte(schema.sessionWorkstreams.updatedAt, prevSince),
            sql`${schema.sessionWorkstreams.updatedAt} < ${since}`
          )
        );

      const currentMinutes = Number(overview?.totalDurationMinutes || 0);
      const prevMinutes = Number(prevOverview?.totalDurationMinutes || 0);
      const delta =
        prevMinutes > 0 ? Math.round(((currentMinutes - prevMinutes) / prevMinutes) * 100) : 0;
      const direction = delta > 5 ? "up" : delta < -5 ? "down" : "flat";

      // Confidence metadata
      const sourceTypes = ["session_capture", "workstream"];
      const dataPoints = Number(overview?.workstreamCount || 0);
      const confidenceLevel = dataPoints >= 50 ? "high" : dataPoints >= 10 ? "medium" : "low";

      res.json({
        window,
        generatedAt: new Date().toISOString(),
        orgId,
        source: "live",
        overview: {
          sessionCount: Number(overview?.sessionCount || 0),
          userCount: Number(overview?.userCount || 0),
          workstreamCount: Number(overview?.workstreamCount || 0),
          totalDurationMinutes: currentMinutes,
        },
        categories: byCategory.map((row) => ({
          category: row.category || "uncategorized",
          totalDurationMinutes: Number(row.totalDurationMinutes || 0),
          count: Number(row.count || 0),
        })),
        workflowDistribution: workflowDistribution.map((row) => ({
          task: row.task,
          totalDurationMinutes: Number(row.totalDurationMinutes || 0),
          distinctUsers: Number(row.distinctUsers || 0),
        })),
        confidenceMetadata: {
          dataWindow: window,
          sourceTypes,
          confidenceLevel,
        },
        trend: {
          direction,
          delta,
        },
      });
    } catch (error) {
      logger.error({ error: String(error) }, "Error fetching org workflow insights");
      res
        .status(500)
        .json({ error: "Internal Server Error", message: "Failed to fetch workflow insights" });
    }
  }
);

/**
 * POST /admin/graph/sync
 * Triggers a manual graph sync run for admin troubleshooting and refresh.
 */
router.post("/graph/sync", requireAuth, requireManagerOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const admin = await verifyAdmin(req, res);
    if (!admin) return;

    if (!config.graph.enabled) {
      res.status(503).json({ error: "GraphDisabled", message: "Graph features are disabled" });
      return;
    }

    const result = await graphSyncService.runNightlySync();
    if (!result.success) {
      res.status(500).json({
        error: "GraphSyncFailed",
        message: result.error || "Graph sync failed",
        result,
      });
      return;
    }

    res.json({ ok: true, result });
  } catch (error) {
    logger.error({ error: String(error) }, "Error triggering manual graph sync");
    res.status(500).json({ error: "Internal Server Error", message: "Failed to run graph sync" });
  }
});

/**
 * GET /admin/graph/users/:userId/workflow-patterns?limit=20
 * Returns recurring workflow patterns detected from the user's sessions.
 */
router.get(
  "/graph/users/:userId/workflow-patterns",
  requireAuth,
  requireManagerOrAdmin,
  requireAccessToUser("userId"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      if (!config.graph.enabled) {
        res.status(503).json({ error: "GraphDisabled", message: "Graph features are disabled" });
        return;
      }

      const targetUserId = req.params.userId;
      const [targetUser] = await db
        .select({ id: schema.users.id, organizationId: schema.users.organizationId })
        .from(schema.users)
        .where(eq(schema.users.id, targetUserId))
        .limit(1);

      if (!targetUser || targetUser.organizationId !== admin.organizationId) {
        res
          .status(404)
          .json({ error: "Not Found", message: "User not found in your organization" });
        return;
      }

      const patternFacts = await graphRetrievalService.getWorkflowPatterns(
        targetUser.id,
        targetUser.organizationId
      );

      const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));

      res.json({
        generatedAt: new Date().toISOString(),
        userId: targetUser.id,
        patterns: patternFacts.slice(0, limit).map((fact) => ({
          pattern: fact.object,
          occurrences: fact.evidenceCount,
          confidence: Math.min(1, fact.evidenceCount / 10),
          lastSeenAt: fact.lastSeenAt || null,
        })),
      });
    } catch (error) {
      logger.error({ error: String(error) }, "Error fetching user workflow patterns");
      res
        .status(500)
        .json({ error: "Internal Server Error", message: "Failed to fetch workflow patterns" });
    }
  }
);

// ============================================================================
// GET /admin/dashboard/subscribers?period=
// Detailed subscriber breakdown with per-user attribution
// ============================================================================
router.get(
  "/dashboard/subscribers",
  requireAuth,
  requireManagerOrAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const admin = await verifyAdmin(req, res);
      if (!admin) return;

      const period = (req.query.period as string) || "yesterday";
      const { startDate, endDate } = resolveDateRange(period);

      const userRows = await db
        .select({
          userId: schema.userDailyActivities.userId,
          subscriberBreakdown: schema.userDailyActivities.subscriberBreakdown,
          totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
        })
        .from(schema.userDailyActivities)
        .where(
          and(
            eq(schema.userDailyActivities.organizationId, admin.organizationId),
            eq(schema.userDailyActivities.periodType, "daily"),
            gte(schema.userDailyActivities.activityDate, startDate),
            lte(schema.userDailyActivities.activityDate, endDate)
          )
        );

      const subscriberData = new Map<
        string,
        { totalMinutes: number; displayName: string; users: Map<string, number> }
      >();
      let totalMinutesAll = 0;

      for (const row of userRows) {
        totalMinutesAll += row.totalActiveMinutes;
        const breakdown = (row.subscriberBreakdown || []) as {
          subscriberName: string;
          minutes: number;
        }[];
        for (const entry of breakdown) {
          if (isExcludedSubscriber(entry.subscriberName)) continue;
          const key = normalizeName(entry.subscriberName);
          const existing = subscriberData.get(key) || {
            totalMinutes: 0,
            displayName: entry.subscriberName,
            users: new Map<string, number>(),
          };
          existing.totalMinutes += entry.minutes;
          if (entry.subscriberName.length > existing.displayName.length)
            existing.displayName = entry.subscriberName;
          existing.users.set(row.userId, (existing.users.get(row.userId) || 0) + entry.minutes);
          subscriberData.set(key, existing);
        }
      }

      // Fetch user names
      const allUserIds = [...new Set(userRows.map((r) => r.userId))];
      const userProfiles =
        allUserIds.length > 0
          ? await db
              .select({
                id: schema.users.id,
                firstName: schema.users.firstName,
                lastName: schema.users.lastName,
              })
              .from(schema.users)
              .where(inArray(schema.users.id, allUserIds))
          : [];
      const nameMap = new Map(
        userProfiles.map((u) => [
          u.id,
          [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown",
        ])
      );

      // Calculate unattributed minutes
      const attributedMinutes = [...subscriberData.values()].reduce(
        (s, d) => s + d.totalMinutes,
        0
      );
      const unattributedMinutes = Math.max(0, totalMinutesAll - attributedMinutes);

      const subscribers = [...subscriberData.entries()]
        .map(([, data]) => ({
          subscriberName: data.displayName,
          totalMinutes: data.totalMinutes,
          percentage:
            totalMinutesAll > 0 ? Math.round((data.totalMinutes / totalMinutesAll) * 100) : 0,
          users: [...data.users.entries()].map(([userId, minutes]) => ({
            userId,
            name: nameMap.get(userId) || "Unknown",
            minutes,
          })),
        }))
        .sort((a, b) => b.totalMinutes - a.totalMinutes);

      res.json({
        period,
        subscribers,
        unattributed: {
          totalMinutes: unattributedMinutes,
          percentage:
            totalMinutesAll > 0 ? Math.round((unattributedMinutes / totalMinutesAll) * 100) : 0,
        },
      });
    } catch (error) {
      logger.error({ error: String(error) }, "Error fetching subscriber breakdown");
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

export default router;
