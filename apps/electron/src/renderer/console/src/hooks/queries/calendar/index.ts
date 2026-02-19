/**
 * Calendar Query Hooks
 *
 * React Query hooks for CalendarView - transforms sessions into WorkBlocks.
 * This bridges the MonitoringView session data model with the passive CalendarView model.
 */

import { useQuery } from "@tanstack/react-query";
import { useUser } from "../../../context/UserContext";
import { monitoringKeys, useSessions } from "../monitoring";
import * as monitoringService from "../../../services/monitoringService";
import type {
  WorkBlock,
  ActivityDay,
  Capture,
  ActivityType,
  WorkBlockStatus,
} from "../../../components/views/employee/CalendarView/types";
import type { SessionListItem, SessionCapture } from "../../../services/monitoringService";

// Query Keys
export const calendarKeys = {
  all: ["calendar"] as const,
  days: () => [...calendarKeys.all, "days"] as const,
  day: (date: string) => [...calendarKeys.days(), date] as const,
  week: (weekStart: string) => [...calendarKeys.all, "week", weekStart] as const,
  blockCaptures: (blockId: string) => [...calendarKeys.all, "blockCaptures", blockId] as const,
};

/**
 * Map app name to activity type
 */
function getActivityType(appName: string | null): ActivityType {
  if (!appName) return "other";

  const appLower = appName.toLowerCase();

  if (
    appLower.includes("code") ||
    appLower.includes("vim") ||
    appLower.includes("sublime") ||
    appLower.includes("intellij") ||
    appLower.includes("xcode") ||
    appLower.includes("android studio")
  ) {
    return "coding";
  }

  if (
    appLower.includes("chrome") ||
    appLower.includes("safari") ||
    appLower.includes("firefox") ||
    appLower.includes("edge") ||
    appLower.includes("arc") ||
    appLower.includes("brave")
  ) {
    return "browsing";
  }

  if (
    appLower.includes("slack") ||
    appLower.includes("discord") ||
    appLower.includes("teams") ||
    appLower.includes("messages") ||
    appLower.includes("telegram") ||
    appLower.includes("whatsapp")
  ) {
    return "communicating";
  }

  if (
    appLower.includes("figma") ||
    appLower.includes("sketch") ||
    appLower.includes("photoshop") ||
    appLower.includes("illustrator") ||
    appLower.includes("affinity") ||
    appLower.includes("canva")
  ) {
    return "designing";
  }

  if (
    appLower.includes("notion") ||
    appLower.includes("word") ||
    appLower.includes("docs") ||
    appLower.includes("pages") ||
    appLower.includes("obsidian") ||
    appLower.includes("typora")
  ) {
    return "writing";
  }

  if (appLower.includes("preview") || appLower.includes("pdf") || appLower.includes("kindle")) {
    return "reading";
  }

  if (
    appLower.includes("zoom") ||
    appLower.includes("meet") ||
    appLower.includes("facetime") ||
    appLower.includes("webex") ||
    appLower.includes("loom")
  ) {
    return "meeting";
  }

  if (
    appLower.includes("terminal") ||
    appLower.includes("iterm") ||
    appLower.includes("warp") ||
    appLower.includes("console") ||
    appLower.includes("hyper")
  ) {
    return "terminal";
  }

  return "other";
}

/**
 * Transform session captures to CalendarView captures
 */
function transformCaptures(
  sessionCaptures: SessionCapture[],
  prevAppName?: string | null
): Capture[] {
  let lastApp = prevAppName ?? "";

  return sessionCaptures.map((capture) => {
    const appName = capture.appName ?? "Unknown";
    const isSwitch = lastApp !== "" && lastApp !== appName;
    const switchedFrom = isSwitch ? lastApp : undefined;
    lastApp = appName;

    return {
      id: capture.id,
      timestamp: new Date(capture.capturedAt),
      appName,
      windowTitle: capture.windowTitle ?? "",
      activityType: getActivityType(capture.appName),
      activityDescription: capture.activityDescription ?? "Working",
      documentName: capture.windowTitle ?? undefined,
      isContextSwitch: isSwitch,
      switchedFrom,
      thumbnailUrl: capture.imageData ?? undefined,
    };
  });
}

/**
 * Calculate app breakdown from captures
 */
function calculateAppBreakdown(
  captures: Capture[],
  durationMinutes: number
): { app: string; minutes: number; percentage: number }[] {
  const appCounts: Record<string, number> = {};

  for (const capture of captures) {
    appCounts[capture.appName] = (appCounts[capture.appName] || 0) + 1;
  }

  const total = Object.values(appCounts).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  return Object.entries(appCounts)
    .map(([app, count]) => ({
      app,
      minutes: Math.round((count / total) * durationMinutes),
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5); // Top 5 apps
}

/**
 * Map session status to WorkBlock status
 */
function mapStatus(sessionStatus: string): WorkBlockStatus {
  const statusMap: Record<string, WorkBlockStatus> = {
    active: "active",
    paused: "paused",
    ended: "ended",
    summarizing: "summarizing",
    ready: "ready",
    delivered: "delivered",
  };
  return statusMap[sessionStatus] || "ended";
}

/**
 * Transform a session list item into a WorkBlock
 */
function sessionToWorkBlock(
  session: SessionListItem,
  captures: SessionCapture[] = [],
  prevBlockEndTime?: Date
): WorkBlock {
  const startTime = new Date(session.startedAt);
  const endTime = session.endedAt ? new Date(session.endedAt) : null;
  const durationMinutes = session.duration.activeMs / 60000;

  // Calculate idle gap before this block
  let idleGapBefore: number | null = null;
  if (prevBlockEndTime) {
    const gapMs = startTime.getTime() - prevBlockEndTime.getTime();
    if (gapMs > 60000) {
      // More than 1 minute
      idleGapBefore = Math.round(gapMs / 60000);
    }
  }

  const transformedCaptures = transformCaptures(captures);
  const appBreakdown = calculateAppBreakdown(transformedCaptures, durationMinutes);

  return {
    id: session.id,
    startTime,
    endTime,
    duration: Math.round(durationMinutes),
    idleGapBefore,
    summary: "", // Will be populated from session detail if needed
    captures: transformedCaptures,
    appBreakdown,
    isActive: session.status === "active",
    isFocusedSession: !!session.name, // Named sessions are focused sessions
    goal: session.name ?? undefined,
    name: session.name ?? undefined,
    status: mapStatus(session.status),
    deliveryStatus:
      session.deliveryStatus === "pending" ||
      session.deliveryStatus === "sent" ||
      session.deliveryStatus === "failed"
        ? session.deliveryStatus
        : undefined,
  };
}

/**
 * Group sessions by date into ActivityDays
 */
function groupSessionsByDay(
  sessions: SessionListItem[],
  sessionsWithCaptures: Map<string, SessionCapture[]>
): ActivityDay[] {
  const dayMap = new Map<string, SessionListItem[]>();

  // Group sessions by day
  for (const session of sessions) {
    const dateKey = new Date(session.startedAt).toISOString().split("T")[0];
    const daySessions = dayMap.get(dateKey) || [];
    daySessions.push(session);
    dayMap.set(dateKey, daySessions);
  }

  // Convert to ActivityDay format
  const days: ActivityDay[] = [];

  for (const [dateKey, daySessions] of dayMap.entries()) {
    // Sort sessions by start time
    daySessions.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

    // Transform sessions to work blocks
    const workBlocks: WorkBlock[] = [];
    let prevEndTime: Date | undefined;

    for (const session of daySessions) {
      const captures = sessionsWithCaptures.get(session.id) || [];
      const block = sessionToWorkBlock(session, captures, prevEndTime);
      workBlocks.push(block);
      if (block.endTime) {
        prevEndTime = block.endTime;
      }
    }

    // Calculate totals
    const totalWorkTime = workBlocks.reduce((sum, b) => sum + b.duration, 0);

    // Aggregate top apps
    const appTotals: Record<string, number> = {};
    for (const block of workBlocks) {
      for (const app of block.appBreakdown) {
        appTotals[app.app] = (appTotals[app.app] || 0) + app.minutes;
      }
    }
    const topApps = Object.entries(appTotals)
      .map(([app, minutes]) => ({ app, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);

    days.push({
      id: `day-${dateKey}`,
      date: new Date(dateKey + "T00:00:00"),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      totalWorkTime,
      workBlocks,
      summary: "", // Could be generated from block summaries
      topApps,
    });
  }

  // Sort days by date (most recent first)
  days.sort((a, b) => b.date.getTime() - a.date.getTime());

  return days;
}

/**
 * Hook to fetch all calendar days (transformed from sessions)
 * Returns ActivityDay[] sorted by date (most recent first)
 */
export function useCalendarDays() {
  const { user } = useUser();
  const { data: sessionsData } = useSessions();
  const sessions = sessionsData?.sessions;

  return useQuery({
    queryKey: calendarKeys.days(),
    queryFn: async () => {
      if (!sessions) return [];

      // For now, create blocks without captures (we'll fetch captures on demand)
      const emptyCaptures = new Map<string, SessionCapture[]>();
      return groupSessionsByDay(sessions!, emptyCaptures);
    },
    enabled: !!user && !!sessions,
    // Poll for new blocks while we have any active sessions
    refetchInterval: sessions?.some((s: monitoringService.SessionListItem) => s.status === "active" || s.status === "paused")
      ? 10000
      : false,
  });
}

/**
 * Hook to fetch a specific day by date
 */
export function useCalendarDay(date: Date) {
  const { data: days, isLoading, error } = useCalendarDays();

  const day = days?.find((d) => {
    return (
      d.date.getFullYear() === date.getFullYear() &&
      d.date.getMonth() === date.getMonth() &&
      d.date.getDate() === date.getDate()
    );
  });

  // Return empty day if no data
  const emptyDay: ActivityDay = {
    id: `day-${date.toISOString().split("T")[0]}`,
    date,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    totalWorkTime: 0,
    workBlocks: [],
    summary: "",
    topApps: [],
  };

  return {
    data: day || emptyDay,
    isLoading,
    error,
  };
}

/**
 * Hook to fetch week days for a given week start date
 */
export function useCalendarWeek(weekStart: Date) {
  const { data: days, isLoading, error } = useCalendarDays();

  const weekDays: ActivityDay[] = [];
  const current = new Date(weekStart);

  for (let i = 0; i < 7; i++) {
    const existingDay = days?.find((d) => {
      return (
        d.date.getFullYear() === current.getFullYear() &&
        d.date.getMonth() === current.getMonth() &&
        d.date.getDate() === current.getDate()
      );
    });

    if (existingDay) {
      weekDays.push(existingDay);
    } else {
      // Create empty day placeholder
      weekDays.push({
        id: `day-empty-${current.toISOString()}`,
        date: new Date(current),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        totalWorkTime: 0,
        workBlocks: [],
        summary: "",
        topApps: [],
      });
    }
    current.setDate(current.getDate() + 1);
  }

  return {
    data: weekDays,
    isLoading,
    error,
  };
}

/**
 * Hook to fetch captures for a specific block (on demand)
 */
export function useBlockCaptures(blockId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: calendarKeys.blockCaptures(blockId),
    queryFn: async () => {
      const response = await monitoringService.fetchSessionCaptures(blockId);
      return transformCaptures(response.captures);
    },
    enabled: options?.enabled !== false && !!blockId,
  });
}

/**
 * Hook to fetch full block details (session detail with summary)
 */
export function useBlockDetail(blockId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: monitoringKeys.session(blockId),
    queryFn: async () => {
      const response = await monitoringService.fetchSession(blockId);
      return response.session;
    },
    enabled: options?.enabled !== false && !!blockId,
  });
}

/**
 * Hook to check if there's an active block
 */
export function useActiveBlock() {
  const { data: days } = useCalendarDays();

  // Find any active block across all days
  for (const day of days || []) {
    const activeBlock = day.workBlocks.find((b) => b.status === "active" || b.status === "paused");
    if (activeBlock) {
      return { data: activeBlock, day };
    }
  }

  return { data: null, day: null };
}
