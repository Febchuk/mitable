import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq, and, desc, asc, gte, lte } from "drizzle-orm";
import { db } from "../../../../db/client.js";
import * as schema from "../../../../db/schema/index.js";

function resolveDateRange(period: string): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);

  switch (period) {
    case "today":
      return { startDate: endDate, endDate };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const d = y.toISOString().slice(0, 10);
      return { startDate: d, endDate: d };
    }
    case "week": {
      const w = new Date(now);
      w.setDate(w.getDate() - 7);
      return { startDate: w.toISOString().slice(0, 10), endDate };
    }
    case "month": {
      const m = new Date(now);
      m.setDate(m.getDate() - 30);
      return { startDate: m.toISOString().slice(0, 10), endDate };
    }
    default:
      return { startDate: "2024-01-01", endDate };
  }
}

export function registerMetricsTools(server: McpServer, organizationId: string) {
  // ─── get_team_metrics ───────────────────────────────────────────────
  server.registerTool(
    "get_team_metrics",
    {
      description:
        "Get organization-wide metrics including focus time, meeting load, app usage, and category breakdown.",
      inputSchema: {
        period: z
          .enum(["today", "yesterday", "week", "month", "all"])
          .default("today")
          .describe("Time period for metrics"),
      },
    },
    async ({ period }) => {
      const { startDate, endDate } = resolveDateRange(period);

      const activities = await db
        .select({
          userId: schema.userDailyActivities.userId,
          activityDate: schema.userDailyActivities.activityDate,
          totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
          totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
          totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
          workPercentage: schema.userDailyActivities.workPercentage,
          meetingPercentage: schema.userDailyActivities.meetingPercentage,
          categoryBreakdown: schema.userDailyActivities.categoryBreakdown,
          appBreakdown: schema.userDailyActivities.appBreakdown,
        })
        .from(schema.userDailyActivities)
        .where(
          and(
            eq(schema.userDailyActivities.organizationId, organizationId),
            eq(schema.userDailyActivities.periodType, "daily"),
            gte(schema.userDailyActivities.activityDate, startDate),
            lte(schema.userDailyActivities.activityDate, endDate)
          )
        )
        .limit(10000);

      if (activities.length === 0) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ period, hasData: false }) }],
        };
      }

      // Aggregate
      const uniqueUsers = new Set(activities.map((a) => a.userId));
      const totalWorkMin = activities.reduce((s, a) => s + (a.totalWorkMinutes ?? 0), 0);
      const totalMeetingMin = activities.reduce((s, a) => s + (a.totalMeetingMinutes ?? 0), 0);
      const totalActiveMin = activities.reduce((s, a) => s + (a.totalActiveMinutes ?? 0), 0);

      // Aggregate app breakdown
      const appTotals: Record<string, number> = {};
      for (const a of activities) {
        const breakdown = (a.appBreakdown as any[]) ?? [];
        for (const entry of breakdown) {
          const name = entry.app || entry.appName || "Unknown";
          appTotals[name] = (appTotals[name] ?? 0) + (entry.minutes || entry.totalMinutes || 0);
        }
      }
      const topApps = Object.entries(appTotals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 15)
        .map(([app, totalMinutes]) => ({ app, totalMinutes }));

      // Aggregate category breakdown
      const catTotals: Record<string, number> = {};
      for (const a of activities) {
        const breakdown = (a.categoryBreakdown as any[]) ?? [];
        for (const entry of breakdown) {
          const name = entry.category || "Other";
          catTotals[name] = (catTotals[name] ?? 0) + (entry.minutes || entry.totalMinutes || 0);
        }
      }
      const categories = Object.entries(catTotals)
        .sort(([, a], [, b]) => b - a)
        .map(([category, totalMinutes]) => ({ category, totalMinutes }));

      const numDays = new Set(activities.map((a) => a.activityDate)).size || 1;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              period,
              hasData: true,
              metrics: {
                totalUsersTracked: uniqueUsers.size,
                totalTeamWorkMinutes: totalWorkMin,
                totalTeamMeetingMinutes: totalMeetingMin,
                totalTeamActiveMinutes: totalActiveMin,
                avgWorkMinutesPerDay: Math.round(totalWorkMin / numDays),
                avgMeetingMinutesPerDay: Math.round(totalMeetingMin / numDays),
              },
              topApps,
              activityDistribution: categories,
            }),
          },
        ],
      };
    }
  );

  // ─── get_team_activity ──────────────────────────────────────────────
  server.registerTool(
    "get_team_activity",
    {
      description:
        "Get per-user activity breakdown for the team. Shows each user's work time, meeting time, and recent highlight.",
      inputSchema: {},
    },
    async () => {
      const orgUsers = await db
        .select({
          id: schema.users.id,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          email: schema.users.email,
          role: schema.users.role,
          jobTitle: schema.users.jobTitle,
          status: schema.users.status,
        })
        .from(schema.users)
        .where(eq(schema.users.organizationId, organizationId))
        .orderBy(asc(schema.users.firstName));

      // Last 30 days of activity
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const activities = await db
        .select({
          userId: schema.userDailyActivities.userId,
          totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
          totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
          totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
        })
        .from(schema.userDailyActivities)
        .where(
          and(
            eq(schema.userDailyActivities.organizationId, organizationId),
            eq(schema.userDailyActivities.periodType, "daily"),
            gte(schema.userDailyActivities.activityDate, thirtyDaysAgo.toISOString().slice(0, 10))
          )
        );

      // Aggregate per user
      const userMetrics: Record<
        string,
        { work: number; meeting: number; active: number; days: Set<string> }
      > = {};
      for (const a of activities) {
        if (!userMetrics[a.userId])
          userMetrics[a.userId] = { work: 0, meeting: 0, active: 0, days: new Set() };
        userMetrics[a.userId].work += a.totalWorkMinutes ?? 0;
        userMetrics[a.userId].meeting += a.totalMeetingMinutes ?? 0;
        userMetrics[a.userId].active += a.totalActiveMinutes ?? 0;
      }

      const people = orgUsers.map((u) => {
        const m = userMetrics[u.id];
        return {
          userId: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
          email: u.email,
          role: u.role,
          jobTitle: u.jobTitle,
          status: u.status,
          totalWorkMinutes: m?.work ?? 0,
          totalMeetingMinutes: m?.meeting ?? 0,
          totalActiveMinutes: m?.active ?? 0,
        };
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ people }),
          },
        ],
      };
    }
  );

  // ─── get_user_activity ──────────────────────────────────────────────
  server.registerTool(
    "get_user_activity",
    {
      description: "Get detailed activity for a specific user over a time period.",
      inputSchema: {
        userId: z.string().uuid().describe("The user to query"),
        period: z
          .enum(["today", "yesterday", "week", "month", "all"])
          .default("week")
          .describe("Time period"),
      },
    },
    async ({ userId, period }) => {
      // Verify user belongs to org
      const [user] = await db
        .select({
          id: schema.users.id,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          email: schema.users.email,
        })
        .from(schema.users)
        .where(and(eq(schema.users.id, userId), eq(schema.users.organizationId, organizationId)))
        .limit(1);

      if (!user) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "User not found in this organization" }),
            },
          ],
        };
      }

      const { startDate, endDate } = resolveDateRange(period);

      const dailyActivities = await db
        .select({
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
            eq(schema.userDailyActivities.userId, userId),
            eq(schema.userDailyActivities.periodType, "daily"),
            gte(schema.userDailyActivities.activityDate, startDate),
            lte(schema.userDailyActivities.activityDate, endDate)
          )
        )
        .orderBy(desc(schema.userDailyActivities.activityDate));

      // Recent sessions
      const recentSessions = await db
        .select({
          id: schema.monitoringSessions.id,
          name: schema.monitoringSessions.name,
          startedAt: schema.monitoringSessions.startedAt,
          endedAt: schema.monitoringSessions.endedAt,
          finalSummary: schema.monitoringSessions.finalSummary,
          taskBreakdown: schema.monitoringSessions.taskBreakdown,
        })
        .from(schema.monitoringSessions)
        .where(
          and(
            eq(schema.monitoringSessions.userId, userId),
            eq(schema.monitoringSessions.organizationId, organizationId)
          )
        )
        .orderBy(desc(schema.monitoringSessions.startedAt))
        .limit(10);

      const totalWork = dailyActivities.reduce((s, a) => s + (a.totalWorkMinutes ?? 0), 0);
      const totalMeeting = dailyActivities.reduce((s, a) => s + (a.totalMeetingMinutes ?? 0), 0);
      const totalActive = dailyActivities.reduce((s, a) => s + (a.totalActiveMinutes ?? 0), 0);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              user: {
                id: user.id,
                name: [user.firstName, user.lastName].filter(Boolean).join(" "),
                email: user.email,
              },
              period,
              summary: {
                totalWorkMinutes: totalWork,
                totalMeetingMinutes: totalMeeting,
                totalActiveMinutes: totalActive,
                daysTracked: dailyActivities.length,
              },
              dailyActivities,
              recentSessions: recentSessions.map((s) => ({
                id: s.id,
                name: s.name,
                startedAt: s.startedAt,
                endedAt: s.endedAt,
                summary: s.finalSummary,
                taskBreakdown: s.taskBreakdown,
              })),
            }),
          },
        ],
      };
    }
  );
}
