/**
 * Ask RLM Environment
 *
 * Provides on-demand data access for the Ask AI assistant via tool calls.
 * Each tool queries the DB when invoked — no data is pre-loaded into context.
 * Date ranges are capped at 31 days per query.
 */

import { db } from "../../db/client";
import * as schema from "../../db/schema/index";
import { eq, and, gte, lte, desc } from "drizzle-orm";

const MAX_DATE_RANGE_DAYS = 31;

export class AskEnvironment {
  constructor(private organizationId: string) {}

  /**
   * Clamp date range to max 31 days (from endDate backwards)
   */
  private clampRange(startDate: string, endDate: string): { start: string; end: string } {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diffDays = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > MAX_DATE_RANGE_DAYS) {
      const clamped = new Date(e);
      clamped.setDate(clamped.getDate() - MAX_DATE_RANGE_DAYS);
      return { start: clamped.toISOString().split("T")[0]!, end: endDate };
    }

    return { start: startDate, end: endDate };
  }

  /**
   * Fuzzy-match a user name to a real user in the org
   */
  private async resolveUser(userName: string) {
    const users = await db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.users)
      .where(eq(schema.users.organizationId, this.organizationId));

    const needle = userName.toLowerCase();
    return users.find((u) => {
      const full = [u.firstName, u.lastName].filter(Boolean).join(" ").toLowerCase();
      return full.includes(needle) || needle.includes(full);
    });
  }

  // ── Tools ────────────────────────────────────────────────────────────

  async listTeamMembers() {
    const users = await db
      .select({
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(eq(schema.users.organizationId, this.organizationId));

    return {
      count: users.length,
      members: users.map((u) => ({
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown",
        email: u.email,
        role: u.role,
      })),
    };
  }

  async queryOrgMetrics(startDate: string, endDate: string) {
    const { start, end } = this.clampRange(startDate, endDate);

    const rows = await db
      .select({
        activityDate: schema.userDailyActivities.activityDate,
        totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
        totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
        totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
        categoryBreakdown: schema.userDailyActivities.categoryBreakdown,
      })
      .from(schema.userDailyActivities)
      .where(
        and(
          eq(schema.userDailyActivities.organizationId, this.organizationId),
          eq(schema.userDailyActivities.periodType, "daily"),
          gte(schema.userDailyActivities.activityDate, start),
          lte(schema.userDailyActivities.activityDate, end)
        )
      );

    // Group by date
    const byDate = new Map<string, typeof rows>();
    for (const row of rows) {
      const arr = byDate.get(row.activityDate) || [];
      arr.push(row);
      byDate.set(row.activityDate, arr);
    }

    const dailyTrend: { date: string; avgWorkH: number; avgMeetH: number; users: number }[] = [];
    let totalWork = 0;
    let totalMeeting = 0;
    let totalActive = 0;
    let maxUsers = 0;

    for (const [date, dateRows] of byDate.entries()) {
      const n = dateRows.length;
      const dw = dateRows.reduce((s, r) => s + r.totalWorkMinutes, 0);
      const dm = dateRows.reduce((s, r) => s + r.totalMeetingMinutes, 0);
      totalWork += dw;
      totalMeeting += dm;
      totalActive += dateRows.reduce((s, r) => s + r.totalActiveMinutes, 0);
      if (n > maxUsers) maxUsers = n;
      dailyTrend.push({
        date,
        avgWorkH: Math.round((dw / n / 60) * 10) / 10,
        avgMeetH: Math.round((dm / n / 60) * 10) / 10,
        users: n,
      });
    }

    // Category totals
    const cats = new Map<string, number>();
    for (const row of rows) {
      for (const e of (row.categoryBreakdown || []) as { category: string; minutes: number }[]) {
        cats.set(e.category, (cats.get(e.category) || 0) + e.minutes);
      }
    }

    const days = byDate.size || 1;

    return {
      period: `${start} to ${end}`,
      daysWithData: byDate.size,
      peopleTracked: maxUsers,
      avgFocusHPerDay: Math.round((totalWork / days / 60) * 10) / 10,
      avgMeetingHPerDay: Math.round((totalMeeting / days / 60) * 10) / 10,
      avgActiveHPerDay: Math.round((totalActive / days / 60) * 10) / 10,
      categories: [...cats.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([cat, mins]) => ({
          category: cat,
          hours: Math.round((mins / 60) * 10) / 10,
          pct: totalActive > 0 ? Math.round((mins / totalActive) * 100) : 0,
        })),
      dailyTrend: dailyTrend.sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async queryUserMetrics(userName: string, startDate: string, endDate: string) {
    const { start, end } = this.clampRange(startDate, endDate);
    const user = await this.resolveUser(userName);
    if (!user) {
      return {
        error: `No team member found matching "${userName}". Use list_team_members to see available names.`,
      };
    }

    const rows = await db
      .select({
        activityDate: schema.userDailyActivities.activityDate,
        totalActiveMinutes: schema.userDailyActivities.totalActiveMinutes,
        totalWorkMinutes: schema.userDailyActivities.totalWorkMinutes,
        totalMeetingMinutes: schema.userDailyActivities.totalMeetingMinutes,
        daySummary: schema.userDailyActivities.daySummary,
        categoryBreakdown: schema.userDailyActivities.categoryBreakdown,
        keyAccomplishments: schema.userDailyActivities.keyAccomplishments,
      })
      .from(schema.userDailyActivities)
      .where(
        and(
          eq(schema.userDailyActivities.userId, user.id),
          eq(schema.userDailyActivities.organizationId, this.organizationId),
          eq(schema.userDailyActivities.periodType, "daily"),
          gte(schema.userDailyActivities.activityDate, start),
          lte(schema.userDailyActivities.activityDate, end)
        )
      )
      .orderBy(desc(schema.userDailyActivities.activityDate));

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    const totalWork = rows.reduce((s, r) => s + r.totalWorkMinutes, 0);
    const totalMeeting = rows.reduce((s, r) => s + r.totalMeetingMinutes, 0);
    const totalActive = rows.reduce((s, r) => s + r.totalActiveMinutes, 0);
    const n = rows.length || 1;

    const cats = new Map<string, number>();
    for (const row of rows) {
      for (const e of (row.categoryBreakdown || []) as { category: string; minutes: number }[]) {
        cats.set(e.category, (cats.get(e.category) || 0) + e.minutes);
      }
    }

    return {
      name: fullName,
      period: `${start} to ${end}`,
      daysTracked: rows.length,
      totalFocusH: Math.round((totalWork / 60) * 10) / 10,
      totalMeetingH: Math.round((totalMeeting / 60) * 10) / 10,
      totalActiveH: Math.round((totalActive / 60) * 10) / 10,
      avgFocusHPerDay: Math.round((totalWork / n / 60) * 10) / 10,
      avgMeetingHPerDay: Math.round((totalMeeting / n / 60) * 10) / 10,
      workMeetingSplit: `${totalActive > 0 ? Math.round((totalWork / totalActive) * 100) : 0}% / ${totalActive > 0 ? Math.round((totalMeeting / totalActive) * 100) : 0}%`,
      categories: [...cats.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([cat, mins]) => ({ category: cat, hours: Math.round((mins / 60) * 10) / 10 })),
      dailyBreakdown: rows.map((r) => ({
        date: r.activityDate,
        focusH: Math.round((r.totalWorkMinutes / 60) * 10) / 10,
        meetH: Math.round((r.totalMeetingMinutes / 60) * 10) / 10,
        summary: r.daySummary || null,
        accomplishments: r.keyAccomplishments || null,
      })),
    };
  }

  async querySessionSummaries(userName: string, startDate: string, endDate: string) {
    const { start, end } = this.clampRange(startDate, endDate);
    const user = await this.resolveUser(userName);
    if (!user) {
      return {
        error: `No team member found matching "${userName}". Use list_team_members to see available names.`,
      };
    }

    const sessions = await db
      .select({
        name: schema.monitoringSessions.name,
        finalSummary: schema.monitoringSessions.finalSummary,
        rawActivitySummary: schema.monitoringSessions.rawActivitySummary,
        startedAt: schema.monitoringSessions.startedAt,
        endedAt: schema.monitoringSessions.endedAt,
      })
      .from(schema.monitoringSessions)
      .where(
        and(
          eq(schema.monitoringSessions.userId, user.id),
          gte(schema.monitoringSessions.startedAt, new Date(start)),
          lte(schema.monitoringSessions.startedAt, new Date(end + "T23:59:59"))
        )
      )
      .orderBy(desc(schema.monitoringSessions.startedAt))
      .limit(20);

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");

    return {
      name: fullName,
      period: `${start} to ${end}`,
      sessionCount: sessions.length,
      sessions: sessions.map((s) => {
        const durMin =
          s.endedAt && s.startedAt
            ? Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 60000)
            : null;
        return {
          title: s.name || "Work Session",
          date: s.startedAt.toISOString().split("T")[0],
          durationMin: durMin,
          summary: s.finalSummary || s.rawActivitySummary || null,
        };
      }),
    };
  }
}
