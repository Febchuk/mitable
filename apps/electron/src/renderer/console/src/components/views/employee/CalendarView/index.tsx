/**
 * CalendarView — Redesigned
 *
 * Minimal calendar page with centred content column.
 * WeekStrip is sticky at the top. Content scrolls beneath it.
 * Record/Stop/Pause controls in the page header.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, Square, Pause, Play, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import WeekStrip from "./WeekStrip";
import ActivityBlock from "./ActivityBlock";
import type { ActivityDay, WorkBlock } from "./types";
import {
  useCalendarDays,
  calendarKeys,
  type CalendarDateRange,
} from "../../../../hooks/queries/calendar";
import { useStartSession } from "../../../../hooks/useStartSession";
import { deleteSession } from "../../../../services/monitoringService";
import { monitoringKeys } from "../../../../hooks/queries/monitoring";
import type { MonitoringSessionState } from "@mitable/shared";
import { authService } from "../../../../services/authService";
import { API_BASE_URL } from "../../../../lib/config";
import { usePreferences } from "../../../../hooks/usePreferences";

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayHeading(date: Date): string {
  const today = new Date();
  if (isSameDay(date, today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatRecordedTime(minutes: number): string {
  if (minutes === 0) return "No time recorded";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m recorded`;
  if (mins === 0) return `${hours}h recorded`;
  return `${hours}h ${mins}m recorded`;
}

type SessionStatus = "idle" | "active" | "paused";

function deriveStatus(state: MonitoringSessionState | null): SessionStatus {
  if (!state) return "idle";
  if (state.status === "active") return "active";
  if (state.status === "paused") return "paused";
  return "idle";
}

/** Build the initial loaded range: 3 weeks back from today → end of today */
function getInitialLoadedRange(): CalendarDateRange {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 21);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function buildSyntheticActiveBlock(id: string, startTime: Date): WorkBlock {
  return {
    id,
    startTime,
    endTime: null,
    duration: 0,
    idleGapBefore: null,
    summary: "Starting…",
    captures: [],
    appBreakdown: [],
    taskBreakdown: [],
    isActive: true,
    status: "active",
  };
}

/** Insert or replace a local “recording” block until the server list includes it. */
function mergeOptimisticActiveIntoDays(
  days: ActivityDay[],
  optimistic: { id: string; startTime: Date } | null
): ActivityDay[] {
  if (!optimistic) return days;

  const targetDate = optimistic.startTime;
  const serverHasBlock = days.some((d) =>
    d.workBlocks.some(
      (b) =>
        b.id === optimistic.id &&
        (b.status === "active" || b.status === "paused" || b.isActive)
    )
  );
  if (serverHasBlock) return days;

  const synthetic = buildSyntheticActiveBlock(optimistic.id, optimistic.startTime);
  const idx = days.findIndex((d) => isSameDay(d.date, targetDate));

  if (idx >= 0) {
    const day = days[idx];
    const withoutDup = day.workBlocks.filter((b) => b.id !== optimistic.id);
    return days.map((d, i) =>
      i === idx
        ? {
            ...d,
            workBlocks: [...withoutDup, synthetic].sort(
              (a, b) => a.startTime.getTime() - b.startTime.getTime()
            ),
          }
        : d
    );
  }

  const dateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;
  const newDay: ActivityDay = {
    id: `day-${dateKey}`,
    date: new Date(dateKey + "T00:00:00"),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    totalWorkTime: 0,
    workBlocks: [synthetic],
    summary: "",
    topApps: [],
  };
  return [...days, newDay].sort((a, b) => b.date.getTime() - a.date.getTime());
}

function filterPendingDeletesFromDays(days: ActivityDay[], pendingIds: Set<string>): ActivityDay[] {
  if (pendingIds.size === 0) return days;
  return days.map((d) => ({
    ...d,
    workBlocks: d.workBlocks.filter((b) => !pendingIds.has(b.id)),
  }));
}

export default function CalendarView() {
  const queryClient = useQueryClient();
  const { hidePillOnSessionEnd, dontAskHidePillAgain } = usePreferences();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekStart, setWeekStart] = useState<Date>(getStartOfWeek(today));
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("idle");
  const [summarizingBlockIds, setSummarizingBlockIds] = useState<Set<string>>(new Set());
  const [loadedRange, setLoadedRange] = useState<CalendarDateRange>(getInitialLoadedRange);
  const [optimisticActive, setOptimisticActive] = useState<{ id: string; startTime: Date } | null>(
    null
  );
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [optimisticDeleteIds, setOptimisticDeleteIds] = useState(() => new Set<string>());
  const [deleteFailedIds, setDeleteFailedIds] = useState(() => new Set<string>());

  const lastActiveSessionIdRef = useRef<string | null>(null);
  const prevSessionStatusRef = useRef<SessionStatus>("idle");

  const { startSession, isStarting } = useStartSession({
    navigateOnSuccess: false,
    showToasts: true,
    onSessionCreated: (sessionId) => {
      setOptimisticActive((prev) => (prev ? { ...prev, id: sessionId } : null));
      lastActiveSessionIdRef.current = sessionId;
    },
    onStartFlowFailed: () => setOptimisticActive(null),
  });

  // Integration sync state — only show button if connected
  const [hasGranola, setHasGranola] = useState(false);
  const [hasFireflies, setHasFireflies] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const token = authService.getAccessToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${API_BASE_URL}/api/integrations/granola/status`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.connected) setHasGranola(true);
      })
      .catch(() => {});
    fetch(`${API_BASE_URL}/api/integrations/fireflies/status`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.connected) setHasFireflies(true);
      })
      .catch(() => {});
  }, []);

  const handleSyncMeetings = useCallback(async () => {
    const token = authService.getAccessToken();
    if (!token) return;
    setIsSyncing(true);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const promises: Promise<void>[] = [];
      if (hasGranola) {
        promises.push(
          fetch(`${API_BASE_URL}/api/integrations/granola/sync`, { method: "POST", headers }).then(
            () => {}
          )
        );
      }
      if (hasFireflies) {
        promises.push(
          fetch(`${API_BASE_URL}/api/integrations/fireflies/sync`, {
            method: "POST",
            headers,
          }).then(() => {})
        );
      }
      await Promise.all(promises);
      queryClient.invalidateQueries({ queryKey: calendarKeys.days() });
    } catch (err) {
      console.error("[CalendarView] sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [hasGranola, hasFireflies, queryClient]);

  // Hydrate session state on mount
  useEffect(() => {
    window.consoleAPI?.getMonitoringSessionState().then((state) => {
      const s = deriveStatus(state);
      setSessionStatus(s);
      prevSessionStatusRef.current = s;
      if (state?.status === "active" || state?.status === "paused") {
        lastActiveSessionIdRef.current = state.id ?? null;
      }
    });
  }, []);

  // Listen for session updates — refresh data AND track state
  useEffect(() => {
    const unsub = window.consoleAPI?.onMonitoringSessionUpdate?.((state) => {
      const newStatus = deriveStatus(state);
      const prev = prevSessionStatusRef.current;
      if (
        (prev === "active" || prev === "paused") &&
        newStatus === "idle" &&
        state?.id
      ) {
        setSummarizingBlockIds((p) => new Set(p).add(state.id));
      }
      prevSessionStatusRef.current = newStatus;
      if (state?.status === "active" || state?.status === "paused") {
        lastActiveSessionIdRef.current = state.id ?? null;
      }
      setSessionStatus(newStatus);
      queryClient.invalidateQueries({ queryKey: calendarKeys.days() });
    });
    return () => unsub?.();
  }, [queryClient]);

  const { data: realDays, isLoading, error } = useCalendarDays(loadedRange);
  const allDays = useMemo(() => {
    const merged = mergeOptimisticActiveIntoDays(realDays || [], optimisticActive);
    return filterPendingDeletesFromDays(merged, optimisticDeleteIds);
  }, [realDays, optimisticActive, optimisticDeleteIds]);

  useEffect(() => {
    if (optimisticDeleteIds.size === 0 || !realDays?.length) return;
    setOptimisticDeleteIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of prev) {
        const stillThere = realDays.some((d) => d.workBlocks.some((b) => b.id === id));
        if (!stillThere) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [realDays, optimisticDeleteIds]);

  useEffect(() => {
    if (!optimisticActive || !realDays?.length) return;
    const has = realDays.some((d) =>
      d.workBlocks.some((b) => b.id === optimisticActive.id)
    );
    if (has) setOptimisticActive(null);
  }, [realDays, optimisticActive]);

  const weekDays = useMemo(() => {
    const days: ActivityDay[] = [];
    const current = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
      const existing = allDays.find((d) => isSameDay(d.date, current));
      days.push(
        existing || {
          id: `day-empty-${current.toISOString()}`,
          date: new Date(current),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          totalWorkTime: 0,
          workBlocks: [],
          summary: "",
          topApps: [],
        }
      );
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [weekStart, allDays]);

  const selectedDayRaw = useMemo(() => {
    return (
      allDays.find((d) => isSameDay(d.date, selectedDate)) || {
        id: "empty",
        date: selectedDate,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        totalWorkTime: 0,
        workBlocks: [],
        summary: "",
        topApps: [],
      }
    );
  }, [selectedDate, allDays]);

  // Two rules enforced here:
  // 1. A work block is NEVER "ready" without tasks — show "summarizing" until tasks arrive
  // 2. Optimistic flip: if user just ended a session, show "summarizing" instead of stale "active"
  const selectedDay = useMemo(() => {
    const clearedIds: string[] = [];
    const blocks = selectedDayRaw.workBlocks.map((original) => {
      let block =
        deleteFailedIds.has(original.id) && original.source !== "granola" && original.source !== "fireflies"
          ? { ...original, status: "error" as const, isActive: false }
          : original;

      const isMeeting = block.source === "granola" || block.source === "fireflies";
      const hasTasks = block.taskBreakdown && block.taskBreakdown.length > 0;

      // Rule 1: "ready" without tasks on a work block → still summarizing
      // Safety valve: accept "ready" without tasks if session ended >5 min ago (AI didn't generate tasks)
      const endedRecently = block.endTime && Date.now() - block.endTime.getTime() < 5 * 60 * 1000;
      if (!isMeeting && block.status === "ready" && !hasTasks && endedRecently) {
        return { ...block, status: "summarizing" as const };
      }

      // Rule 2: optimistic flip — block in our set but backend still says "active"
      if (summarizingBlockIds.has(block.id)) {
        if (block.status === "active") {
          return { ...block, status: "summarizing" as const };
        }
        // Backend caught up — clear from optimistic set
        clearedIds.push(block.id);
      }

      return block;
    });

    if (clearedIds.length > 0) {
      setTimeout(() => {
        setSummarizingBlockIds((prev) => {
          const next = new Set(prev);
          clearedIds.forEach((id) => next.delete(id));
          return next;
        });
      }, 0);
    }

    return { ...selectedDayRaw, workBlocks: blocks };
  }, [selectedDayRaw, summarizingBlockIds, deleteFailedIds]);

  const isCurrentWeek = isSameDay(weekStart, getStartOfWeek(today));

  const goToPrevWeek = () => {
    const newStart = new Date(weekStart);
    newStart.setDate(newStart.getDate() - 7);
    setWeekStart(newStart);
    const dayOffset = Math.floor(
      (selectedDate.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const newSelected = new Date(newStart);
    newSelected.setDate(newSelected.getDate() + dayOffset);
    setSelectedDate(newSelected);

    // Expand loaded range if navigating before current start
    const rangeStart = new Date(loadedRange.start);
    if (newStart < rangeStart) {
      const expandedStart = new Date(newStart);
      expandedStart.setHours(0, 0, 0, 0);
      setLoadedRange((prev) => ({ ...prev, start: expandedStart.toISOString() }));
    }
  };

  const goToNextWeek = () => {
    const newStart = new Date(weekStart);
    newStart.setDate(newStart.getDate() + 7);
    setWeekStart(newStart);
    const dayOffset = Math.floor(
      (selectedDate.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    const newSelected = new Date(newStart);
    newSelected.setDate(newSelected.getDate() + dayOffset);
    setSelectedDate(newSelected);
  };

  // ── Session controls ──────────────────────────────────────────
  const handleRecord = useCallback(async () => {
    const startTime = new Date();
    setOptimisticActive({ id: `pending-${startTime.getTime()}`, startTime });
    const sessionId = await startSession();
    if (!sessionId) {
      setOptimisticActive(null);
    }
  }, [startSession]);

  const handleStop = useCallback(async () => {
    const sid = lastActiveSessionIdRef.current;
    if (sid) {
      setSummarizingBlockIds((prev) => new Set(prev).add(sid));
    }
    setSessionStatus("idle");
    prevSessionStatusRef.current = "idle";
    lastActiveSessionIdRef.current = null;
    setOptimisticActive(null);

    if (hidePillOnSessionEnd || dontAskHidePillAgain) {
      window.consoleAPI?.hidePill?.();
    }

    queryClient.invalidateQueries({ queryKey: calendarKeys.days() });
    queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });

    try {
      const result = await window.consoleAPI?.endSessionFull();
      if (result?.error) {
        console.error("[CalendarView] endSessionFull error:", result.error);
      }
    } catch (err) {
      console.error("[CalendarView] endSessionFull failed:", err);
    } finally {
      const state = await window.consoleAPI?.getMonitoringSessionState();
      const s = deriveStatus(state);
      setSessionStatus(s);
      prevSessionStatusRef.current = s;
      if (state?.status === "active" || state?.status === "paused") {
        lastActiveSessionIdRef.current = state.id ?? null;
      } else {
        lastActiveSessionIdRef.current = null;
      }
    }

    queryClient.invalidateQueries({ queryKey: calendarKeys.days() });
    queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
  }, [queryClient, hidePillOnSessionEnd, dontAskHidePillAgain]);

  const handlePause = useCallback(async () => {
    try {
      setSessionStatus("paused");
      await window.consoleAPI?.pauseMonitoringSession();
    } catch (err) {
      console.error("[CalendarView] pauseMonitoringSession failed:", err);
    }
  }, []);

  const handleResume = useCallback(async () => {
    try {
      setSessionStatus("active");
      await window.consoleAPI?.resumeMonitoringSession();
    } catch (err) {
      console.error("[CalendarView] resumeMonitoringSession failed:", err);
    }
  }, []);

  const executeDeleteBlock = useCallback(
    async (blockId: string): Promise<boolean> => {
      try {
        const currentState = await window.consoleAPI?.getMonitoringSessionState();
        if (currentState && currentState.id === blockId) {
          setSessionStatus("idle");
          prevSessionStatusRef.current = "idle";
          lastActiveSessionIdRef.current = null;
          const endRes = await window.consoleAPI?.stopLocalMonitoringSessionForDelete();
          if (endRes?.error) {
            console.error("[CalendarView] stopLocalMonitoringSessionForDelete before delete:", endRes.error);
            return false;
          }
        }

        await deleteSession(blockId);
        queryClient.invalidateQueries({ queryKey: calendarKeys.days() });
        queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
        return true;
      } catch (err) {
        console.error("[CalendarView] deleteSession failed:", err);
        return false;
      }
    },
    [queryClient]
  );

  const retryDeleteBlock = useCallback(
    async (blockId: string) => {
      setDeleteFailedIds((prev) => {
        const n = new Set(prev);
        n.delete(blockId);
        return n;
      });
      setOptimisticDeleteIds((prev) => new Set(prev).add(blockId));
      const ok = await executeDeleteBlock(blockId);
      if (!ok) {
        setOptimisticDeleteIds((prev) => {
          const n = new Set(prev);
          n.delete(blockId);
          return n;
        });
        setDeleteFailedIds((prev) => new Set(prev).add(blockId));
      }
    },
    [executeDeleteBlock]
  );

  const isRecording = sessionStatus === "active" || sessionStatus === "paused";

  const confirmDeleteBlock = useCallback(async () => {
    const id = deleteTargetId;
    if (!id) return;
    setDeleteTargetId(null);
    setDeleteFailedIds((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    setOptimisticDeleteIds((prev) => new Set(prev).add(id));
    const ok = await executeDeleteBlock(id);
    if (!ok) {
      setOptimisticDeleteIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      setDeleteFailedIds((prev) => new Set(prev).add(id));
    }
  }, [deleteTargetId, executeDeleteBlock]);

  return (
    <div className="app-no-drag" style={{ display: "flex", flexDirection: "column" }}>
      {/* Sticky WeekStrip */}
      <div
        style={{
          position: "sticky",
          top: -20,
          zIndex: 10,
          background: "var(--bg-base)",
          paddingTop: 20,
          paddingBottom: 20,
        }}
      >
        <WeekStrip
          weekStart={weekStart}
          weekDays={weekDays}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onPrevWeek={goToPrevWeek}
          onNextWeek={goToNextWeek}
          canGoNext={!isCurrentWeek}
        />
      </div>

      {/* Page header row — date left, controls right */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        {/* Left: date + recorded time */}
        <div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 32,
              color: "var(--text-primary)",
              fontWeight: 400,
              letterSpacing: "-0.4px",
              lineHeight: 1,
              margin: 0,
            }}
          >
            {formatDayHeading(selectedDate)}
          </h1>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 15,
              color: "var(--text-tertiary)",
              fontWeight: 400,
              fontStyle: "italic",
              margin: "12px 0 0",
            }}
          >
            {formatRecordedTime(selectedDay.totalWorkTime)}
          </p>
        </div>

        {/* Right: session controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 4 }}>
          {/* Sync meetings — only visible if Granola or Fireflies is connected */}
          {(hasGranola || hasFireflies) && (
            <button
              onClick={handleSyncMeetings}
              disabled={isSyncing}
              title="Sync meetings from connected integrations"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 10px",
                borderRadius: 8,
                border: "0.5px solid rgba(var(--mi-accent-rgb, 130,192,204), 0.2)",
                background: "transparent",
                color: "var(--mi-accent)",
                fontSize: 12,
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
                cursor: isSyncing ? "default" : "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
                opacity: isSyncing ? 0.6 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSyncing) {
                  e.currentTarget.style.background =
                    "rgba(var(--mi-accent-rgb, 130,192,204), 0.06)";
                  e.currentTarget.style.borderColor =
                    "rgba(var(--mi-accent-rgb, 130,192,204), 0.3)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "rgba(var(--mi-accent-rgb, 130,192,204), 0.2)";
              }}
            >
              <RefreshCw
                size={11}
                strokeWidth={1.8}
                style={isSyncing ? { animation: "spin 1s linear infinite" } : undefined}
              />
              {isSyncing ? "Syncing..." : "Sync Meetings"}
            </button>
          )}
          {/* Pause / Play — only visible during a session */}
          {isRecording && (
            <button
              onClick={sessionStatus === "active" ? handlePause : handleResume}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: "none",
                background: "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--text-secondary)",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              {sessionStatus === "active" ? (
                <Pause size={14} strokeWidth={1.5} />
              ) : (
                <Play size={14} strokeWidth={1.5} />
              )}
            </button>
          )}

          {/* Record / Stop button */}
          {isRecording ? (
            <button
              onClick={handleStop}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 8,
                border: "0.5px solid rgba(var(--status-error-rgb), 0.25)",
                background: "rgba(var(--status-error-rgb), 0.06)",
                color: "var(--status-error)",
                fontSize: 12,
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(var(--status-error-rgb), 0.12)";
                e.currentTarget.style.borderColor = "rgba(var(--status-error-rgb), 0.35)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(var(--status-error-rgb), 0.06)";
                e.currentTarget.style.borderColor = "rgba(var(--status-error-rgb), 0.25)";
              }}
            >
              <Square size={10} fill="currentColor" strokeWidth={0} />
              Stop
            </button>
          ) : (
            <button
              onClick={handleRecord}
              disabled={isStarting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 8,
                border: "var(--border-subtle)",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: 12,
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
                cursor: isStarting ? "default" : "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
                opacity: isStarting ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isStarting) {
                  e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.05)";
                  e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.2)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.12)";
              }}
            >
              {isStarting ? (
                <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--status-error)",
                    flexShrink: 0,
                  }}
                />
              )}
              {isStarting ? "Starting..." : "Record"}
            </button>
          )}
        </div>
      </div>

      {/* Activity section */}
      <div>
        {isLoading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "64px 0",
            }}
          >
            <Loader2
              size={24}
              style={{ color: "var(--mi-accent)", animation: "spin 1s linear infinite" }}
            />
            <p style={{ color: "var(--text-tertiary)", fontSize: 13, marginTop: 12 }}>
              Loading activity data...
            </p>
          </div>
        )}

        {error && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "64px 0",
            }}
          >
            <AlertCircle size={24} style={{ color: "var(--status-error)", marginBottom: 12 }} />
            <p
              style={{
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              Failed to load activity data
            </p>
            <p style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
              {error instanceof Error ? error.message : "An error occurred"}
            </p>
          </div>
        )}

        {!isLoading && !error && selectedDay.workBlocks.length === 0 && (
          <div style={{ padding: "48px 0" }}>
            <EmptyState
              title="No activity recorded"
              description="Work blocks will appear here as activity is detected throughout the day."
            />
          </div>
        )}

        {!isLoading &&
          !error &&
          selectedDay.workBlocks.length > 0 &&
          (() => {
            const meetingBlocks = selectedDay.workBlocks.filter(
              (b) => b.source === "granola" || b.source === "fireflies"
            );
            const workBlocks = selectedDay.workBlocks.filter(
              (b) => b.source !== "granola" && b.source !== "fireflies"
            );

            return (
              <>
                {/* Meetings section (Granola + Fireflies) */}
                {meetingBlocks.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-tertiary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 10,
                      }}
                    >
                      Meetings
                    </div>
                    {meetingBlocks.map((block) => (
                      <ActivityBlock
                        key={block.id}
                        block={block}
                        blockNumber={0}
                        defaultExpanded={false}
                      />
                    ))}
                  </>
                )}

                {/* Divider between meetings and activity */}
                {meetingBlocks.length > 0 && workBlocks.length > 0 && (
                  <div style={{ margin: "12px 0 8px" }}>
                    <div style={{ height: "0.5px", background: "var(--divider)" }} />
                  </div>
                )}

                {/* Activity section (work blocks) */}
                {workBlocks.length > 0 && (
                  <>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-tertiary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 10,
                      }}
                    >
                      Activity
                    </div>
                    {workBlocks.map((block, index) => (
                      <ActivityBlock
                        key={block.id}
                        block={block}
                        blockNumber={index + 1}
                        defaultExpanded={
                          !block.isActive &&
                          index === workBlocks.length - 1 &&
                          workBlocks.length <= 3
                        }
                        onDelete={(bid) => setDeleteTargetId(bid)}
                        onRetry={
                          block.status === "error"
                            ? () => void retryDeleteBlock(block.id)
                            : undefined
                        }
                      />
                    ))}
                  </>
                )}
              </>
            );
          })()}
      </div>

      {deleteTargetId && (
        <div
          role="presentation"
          onClick={() => setDeleteTargetId(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-block-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              background: "var(--bg-overlay)",
              border: "var(--border-hairline)",
              borderRadius: 12,
              padding: "22px 20px 18px",
              boxShadow: "0 8px 28px rgba(0, 0, 0, 0.22)",
            }}
          >
            <h2
              id="delete-block-title"
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 400,
                fontFamily: "var(--font-serif)",
                letterSpacing: "-0.35px",
                lineHeight: 1.2,
                color: "var(--text-primary)",
              }}
            >
              Delete this activity block?
            </h2>
            <p
              style={{
                margin: "14px 0 0",
                fontSize: 14,
                lineHeight: 1.5,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-sans)",
                fontWeight: 400,
              }}
            >
              This activity block will be permanently deleted. This cannot be undone.
            </p>
            <div
              style={{
                height: "0.5px",
                background: "var(--divider)",
                margin: "20px 0 16px",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 6,
              }}
            >
              <button
                type="button"
                onClick={() => setDeleteTargetId(null)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "var(--border-subtle)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.05)";
                  e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.12)";
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteBlock()}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "0.5px solid rgba(var(--status-error-rgb), 0.25)",
                  background: "rgba(var(--status-error-rgb), 0.06)",
                  color: "var(--status-error)",
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(var(--status-error-rgb), 0.12)";
                  e.currentTarget.style.borderColor = "rgba(var(--status-error-rgb), 0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(var(--status-error-rgb), 0.06)";
                  e.currentTarget.style.borderColor = "rgba(var(--status-error-rgb), 0.25)";
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
