/**
 * Calendar Query Hooks
 *
 * React Query hooks for CalendarView - transforms sessions into WorkBlocks.
 * This bridges the MonitoringView session data model with the passive CalendarView model.
 */

import { useQuery } from "@tanstack/react-query";
import { useUser } from "../../../context/UserContext";
import { monitoringKeys } from "../monitoring";
import * as monitoringService from "../../../services/monitoringService";
import type {
  WorkBlock,
  ActivityDay,
  Capture,
  ActivityType,
  WorkBlockStatus,
} from "../../../components/views/employee/CalendarView/types";
import { apiRequest } from "../../../services/api";
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

  // Prefer timeBreakdown from backend (stored on session) over capture-based calculation
  let appBreakdown: { app: string; minutes: number; percentage: number }[] = [];
  const tb = session.timeBreakdown as Record<string, number> | null;
  if (tb && Object.keys(tb).length > 0) {
    const totalMs = Object.values(tb).reduce((a, b) => a + b, 0);
    appBreakdown = Object.entries(tb)
      .map(([app, ms]) => ({
        app,
        minutes: Math.round(ms / 60000),
        percentage: totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0,
      }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);
  } else if (transformedCaptures.length > 0) {
    appBreakdown = calculateAppBreakdown(transformedCaptures, durationMinutes);
  }

  return {
    id: session.id,
    startTime,
    endTime,
    duration: Math.round(durationMinutes),
    idleGapBefore,
    summary: session.finalSummary || session.rawActivitySummary || "",
    captures: transformedCaptures,
    appBreakdown,
    taskBreakdown:
      (session.taskBreakdown as Array<{
        shortTitle: string;
        description: string;
        minutes: number;
      }>) || [],
    isActive: session.status === "active",
    isFocusedSession: !!session.name, // Named sessions are focused sessions
    goal: session.name ?? undefined,
    name: session.name ?? undefined,
    status: (() => {
      const mapped = mapStatus(session.status);
      // A block is NOT "ready" until tasks exist — keep it as "summarizing" until then
      const tasks = session.taskBreakdown as Array<unknown> | null;
      if (mapped === "ready" && (!tasks || tasks.length === 0)) {
        return "summarizing" as const;
      }
      return mapped;
    })(),
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
  const MIN_SESSION_DURATION_MS = 3 * 60 * 1000; // 3 minutes — same gate as summarization pipeline

  // Filter out noise/short sessions (same gate as backend summarization)
  const meaningful = sessions.filter((s) => {
    if (s.name === "Short session") return false;
    if (s.status === "active" || s.status === "paused") return true; // keep active sessions
    return s.duration.activeMs >= MIN_SESSION_DURATION_MS;
  });

  const dayMap = new Map<string, SessionListItem[]>();

  // Group sessions by day
  for (const session of meaningful) {
    const d = new Date(session.startedAt);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

// ─── Integration Blocks (Granola + Fireflies) ──────────────────────────────

interface IntegrationBlockResponse {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description: string | null;
  category: string;
  topicName: string | null;
  subscriberName: string | null;
  participants: unknown;
}

function parseIntegrationBlocks(
  blocks: IntegrationBlockResponse[],
  source: "granola" | "fireflies",
  prefixToStrip: RegExp,
  appLabel: string
): WorkBlock[] {
  return blocks.map((b) => {
    const startTime = new Date(b.startTime);
    const endTime = new Date(b.endTime);
    const title = b.name?.replace(prefixToStrip, "") || "Meeting";
    let participants: { name: string; email: string }[] = [];
    if (Array.isArray(b.participants)) {
      participants = b.participants as { name: string; email: string }[];
    } else if (typeof b.participants === "string") {
      try {
        participants = JSON.parse(b.participants);
      } catch {
        /* ignore */
      }
    }
    return {
      id: b.id,
      startTime,
      endTime,
      duration: b.durationMinutes,
      idleGapBefore: null,
      summary: b.description || "",
      captures: [],
      appBreakdown: [{ app: appLabel, minutes: b.durationMinutes, percentage: 100 }],
      taskBreakdown: [],
      isActive: false,
      isFocusedSession: false,
      goal: title,
      name: title,
      status: "ready" as WorkBlockStatus,
      source,
      subscriberName: b.subscriberName || undefined,
      participants,
    };
  });
}

async function fetchGranolaBlocks(): Promise<WorkBlock[]> {
  try {
    const data = await apiRequest<{ blocks: IntegrationBlockResponse[] }>(
      "/integrations/granola/blocks"
    );
    return parseIntegrationBlocks(data.blocks || [], "granola", /^\[Granola\]\s*/, "Granola");
  } catch {
    return [];
  }
}

async function fetchFirefliesBlocks(): Promise<WorkBlock[]> {
  try {
    const data = await apiRequest<{ blocks: IntegrationBlockResponse[] }>(
      "/integrations/fireflies/blocks"
    );
    return parseIntegrationBlocks(data.blocks || [], "fireflies", /^\[Fireflies\]\s*/, "Fireflies");
  } catch {
    return [];
  }
}

function isMeetingSource(source?: string): boolean {
  return source === "granola" || source === "fireflies";
}

function mergeIntegrationBlocksIntoDays(
  days: ActivityDay[],
  integrationBlocks: WorkBlock[]
): ActivityDay[] {
  if (integrationBlocks.length === 0) return days;

  const dayMap = new Map<string, ActivityDay>();
  for (const day of days) {
    const key = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, "0")}-${String(day.date.getDate()).padStart(2, "0")}`;
    dayMap.set(key, day);
  }

  for (const block of integrationBlocks) {
    const d = block.startTime;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    let day = dayMap.get(key);
    if (!day) {
      day = {
        id: `day-${key}`,
        date: new Date(key + "T00:00:00"),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        totalWorkTime: 0,
        workBlocks: [],
        summary: "",
        topApps: [],
      };
      dayMap.set(key, day);
    }

    day.workBlocks.push(block);
  }

  // Sort: meeting blocks first (granola + fireflies), then work blocks by start time
  for (const day of dayMap.values()) {
    day.workBlocks.sort((a, b) => {
      const aIsMeeting = isMeetingSource(a.source) ? 0 : 1;
      const bIsMeeting = isMeetingSource(b.source) ? 0 : 1;
      if (aIsMeeting !== bIsMeeting) return aIsMeeting - bIsMeeting;
      return a.startTime.getTime() - b.startTime.getTime();
    });
  }

  // Return sorted by date (most recent first)
  return [...dayMap.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Hook to fetch all calendar days (transformed from sessions + integration blocks)
 * Returns ActivityDay[] sorted by date (most recent first)
 */
export function useCalendarDays() {
  const { user } = useUser();

  return useQuery({
    queryKey: calendarKeys.days(),
    queryFn: async () => {
      const [sessions, granolaBlocks, firefliesBlocks] = await Promise.all([
        monitoringService.fetchAllSessions(),
        fetchGranolaBlocks(),
        fetchFirefliesBlocks(),
      ]);

      const emptyCaptures = new Map<string, SessionCapture[]>();
      const days = sessions.length ? groupSessionsByDay(sessions, emptyCaptures) : [];

      const allIntegrationBlocks = [...granolaBlocks, ...firefliesBlocks];
      return mergeIntegrationBlocksIntoDays(days, allIntegrationBlocks);
    },
    enabled: !!user,
    staleTime: 5000,
    // Poll frequency based on block status:
    //   active/paused   → 5s  (detect session changes)
    //   summarizing     → 2s  (catch summary completion + show spinner)
    //   ready/other     → 60s (idle)
    refetchInterval: (query) => {
      const days = query.state.data;
      if (!days) return 60000;
      const hasSummarizing = days.some((d) => d.workBlocks.some((b) => b.status === "summarizing"));
      if (hasSummarizing) return 2000;
      const hasActive = days.some((d) =>
        d.workBlocks.some((b) => b.status === "active" || b.status === "paused")
      );
      return hasActive ? 5000 : 60000;
    },
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
