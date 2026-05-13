/**
 * Me Activity IPC Handlers
 *
 * Serves local activity data from PGlite for the Me tab.
 */

import { ipcMain } from "electron";
import { pgDb } from "../../services/on-device/pgDb";

const IPC_CHANNELS = {
  ME_ACTIVITY_GET: "me-activity:get",
  ME_ACTIVITY_BLOCKS: "me-activity:blocks",
  ME_ACTIVITY_DAILY_SUMMARIES: "me-activity:daily-summaries",
} as const;

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface TrendBucket {
  label: string;
  hours: number;
}

function buildTrendData(
  period: string,
  blocks: { startMs: number; endMs: number; durationMs: number; date: string }[],
  summaries: { date: string; totalActiveMs: number }[]
): TrendBucket[] {
  switch (period) {
    case "yesterday": {
      // 24 hourly buckets (6 AM – 11 PM shown, but allocate all 24)
      const buckets = Array.from({ length: 24 }, (_, i) => ({
        label: `${i === 0 ? 12 : i > 12 ? i - 12 : i}${i < 12 ? "a" : "p"}`,
        hours: 0,
      }));
      for (const b of blocks) {
        // Split block time across hour boundaries
        let cursor = b.startMs;
        const end = b.endMs || cursor + b.durationMs;
        while (cursor < end) {
          const hour = new Date(cursor).getHours();
          const nextHourMs = new Date(cursor).setMinutes(0, 0, 0) + 3_600_000;
          const sliceEnd = Math.min(end, nextHourMs);
          buckets[hour]!.hours += (sliceEnd - cursor) / 3_600_000;
          cursor = sliceEnd;
        }
      }
      return buckets
        .filter((b) => b.hours > 0 || true)
        .map((b) => ({
          ...b,
          hours: Math.round(b.hours * 100) / 100,
        }));
    }
    case "week": {
      const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const buckets: TrendBucket[] = dayNames.map((d) => ({ label: d, hours: 0 }));
      for (const s of summaries) {
        const d = new Date(s.date + "T12:00:00");
        const jsDay = d.getDay(); // 0=Sun
        const idx = jsDay === 0 ? 6 : jsDay - 1; // Mon=0
        buckets[idx]!.hours += s.totalActiveMs / 3_600_000;
      }
      return buckets.map((b) => ({ ...b, hours: Math.round(b.hours * 100) / 100 }));
    }
    case "month": {
      // Weeks of the month (Week 1 – Week 5)
      const weekBuckets = new Map<number, number>();
      for (const s of summaries) {
        const d = new Date(s.date + "T12:00:00");
        const weekNum = Math.ceil(d.getDate() / 7);
        weekBuckets.set(weekNum, (weekBuckets.get(weekNum) ?? 0) + s.totalActiveMs / 3_600_000);
      }
      const maxWeek = Math.max(5, ...weekBuckets.keys());
      return Array.from({ length: maxWeek }, (_, i) => ({
        label: `Wk ${i + 1}`,
        hours: Math.round((weekBuckets.get(i + 1) ?? 0) * 100) / 100,
      }));
    }
    case "quarter": {
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const now = new Date();
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      const buckets: TrendBucket[] = Array.from({ length: 3 }, (_, i) => ({
        label: monthNames[qStart + i]!,
        hours: 0,
      }));
      for (const s of summaries) {
        const d = new Date(s.date + "T12:00:00");
        const mIdx = d.getMonth() - qStart;
        if (mIdx >= 0 && mIdx < 3) {
          buckets[mIdx]!.hours += s.totalActiveMs / 3_600_000;
        }
      }
      return buckets.map((b) => ({ ...b, hours: Math.round(b.hours * 100) / 100 }));
    }
    default:
      return [];
  }
}

function getDateRange(period: string): { startDate: string; endDate: string } {
  const now = new Date();

  switch (period) {
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { startDate: toIso(y), endDate: toIso(y) };
    }
    case "week": {
      // Calendar week: Monday–Sunday
      const day = now.getDay(); // 0=Sun, 1=Mon, ...
      const diffToMon = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMon);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { startDate: toIso(monday), endDate: toIso(sunday) };
    }
    case "month": {
      // Calendar month: 1st to last day
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: toIso(first), endDate: toIso(last) };
    }
    case "quarter": {
      // Calendar quarter: Q start to today
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const first = new Date(now.getFullYear(), qMonth, 1);
      return { startDate: toIso(first), endDate: toIso(now) };
    }
    default: {
      const monday = new Date(now);
      const day = now.getDay();
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { startDate: toIso(monday), endDate: toIso(sunday) };
    }
  }
}

export function registerMeActivityHandlers() {
  // Full activity payload for a period
  ipcMain.handle(IPC_CHANNELS.ME_ACTIVITY_GET, async (_, userId: string, period: string) => {
    try {
      const { startDate, endDate } = getDateRange(period);
      const [blocks, summaries] = await Promise.all([
        pgDb.getActivityBlocksForDateRange(userId, startDate, endDate),
        pgDb.getDailySummariesForRange(userId, startDate, endDate),
      ]);

      // Aggregate totals
      let totalActiveMs = 0;
      const categoryMs: Record<string, number> = {};
      const appMs: Record<string, number> = {};

      for (const s of summaries) {
        totalActiveMs += s.totalActiveMs;
        const catBreakdown = JSON.parse(s.categoryBreakdown || "{}");
        for (const [cat, ms] of Object.entries(catBreakdown)) {
          categoryMs[cat] = (categoryMs[cat] ?? 0) + (ms as number);
        }
        const appBreakdown = JSON.parse(s.appBreakdown || "{}");
        for (const [appName, ms] of Object.entries(appBreakdown)) {
          appMs[appName] = (appMs[appName] ?? 0) + (ms as number);
        }
      }

      // Client breakdown from activity_blocks
      const clientMs: Record<string, number> = {};
      for (const b of blocks) {
        if (b.clientName) {
          clientMs[b.clientName] = (clientMs[b.clientName] ?? 0) + b.durationMs;
        }
      }

      // Build recent work from monitoring_sessions + stories
      const rangeStartMs = new Date(startDate).getTime();
      const rangeEndMs = new Date(endDate).getTime() + 86_400_000; // end of endDate
      const sessions = await pgDb.getMonitoringSessionsByDateRange(
        userId,
        rangeStartMs,
        rangeEndMs
      );

      const recentSessions: Array<{
        id: string;
        sessionId: string;
        narrative: string;
        startMs: number;
        endMs: number;
        durationMs: number;
        date: string;
        topCategory: string | null;
        topApp: string | null;
      }> = [];

      for (const sess of sessions) {
        if (sess.status !== "ended" && sess.status !== "ready") continue;
        const story = await pgDb.getStoryForSession(sess.id);
        if (!story?.narrative) continue;

        const sessBlocks = blocks.filter((b) => b.sessionId === sess.id);
        const dur = (sess.endedAt ?? 0) - sess.startedAt - (sess.totalPausedMs ?? 0);

        // Derive top category / app from this session's blocks
        const catCount = new Map<string, number>();
        const appCount = new Map<string, number>();
        for (const b of sessBlocks) {
          if (b.category) catCount.set(b.category, (catCount.get(b.category) ?? 0) + b.durationMs);
          if (b.appName) appCount.set(b.appName, (appCount.get(b.appName) ?? 0) + b.durationMs);
        }
        const topCat = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const topApp = [...appCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        const sessDate = new Date(sess.startedAt);
        recentSessions.push({
          id: sess.id,
          sessionId: sess.id,
          narrative: story.narrative,
          startMs: sess.startedAt,
          endMs: sess.endedAt ?? sess.startedAt,
          durationMs: Math.max(dur, 0),
          date: toIso(sessDate),
          topCategory: topCat,
          topApp: topApp,
        });
      }

      recentSessions.sort((a, b) => b.startMs - a.startMs);

      const trendData = buildTrendData(period, blocks, summaries);

      return {
        totalActiveMs,
        categoryBreakdown: categoryMs,
        appBreakdown: appMs,
        clientBreakdown: clientMs,
        dailySummaries: summaries.map((s) => ({
          date: s.date,
          totalActiveMs: s.totalActiveMs,
          sessionCount: s.sessionCount,
          categoryBreakdown: JSON.parse(s.categoryBreakdown || "{}"),
        })),
        trendData,
        recentBlocks: recentSessions.slice(0, 20),
        period,
        startDate,
        endDate,
      };
    } catch (err) {
      console.error("[me-activity:get] failed:", err);
      return {
        totalActiveMs: 0,
        categoryBreakdown: {},
        appBreakdown: {},
        clientBreakdown: {},
        dailySummaries: [],
        trendData: [],
        recentBlocks: [],
        period,
        startDate: "",
        endDate: "",
      };
    }
  });

  // Blocks for a specific date range
  ipcMain.handle(
    IPC_CHANNELS.ME_ACTIVITY_BLOCKS,
    async (_, userId: string, startDate: string, endDate: string) => {
      try {
        return await pgDb.getActivityBlocksForDateRange(userId, startDate, endDate);
      } catch (err) {
        console.error("[me-activity:blocks] failed:", err);
        return [];
      }
    }
  );

  // Daily summaries for a date range
  ipcMain.handle(
    IPC_CHANNELS.ME_ACTIVITY_DAILY_SUMMARIES,
    async (_, userId: string, startDate: string, endDate: string) => {
      try {
        return await pgDb.getDailySummariesForRange(userId, startDate, endDate);
      } catch (err) {
        console.error("[me-activity:daily-summaries] failed:", err);
        return [];
      }
    }
  );
}
