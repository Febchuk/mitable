/**
 * CalendarView — Redesigned
 *
 * Minimal calendar page with centred content column.
 * WeekStrip is sticky at the top. Content scrolls beneath it.
 * Record/Stop/Pause controls in the page header.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, Square, Pause, Play, RefreshCw, Settings } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import WeekStrip from "./WeekStrip";
import ActivityBlock from "./ActivityBlock";
import CalendarViewSkeleton from "./CalendarViewSkeleton";
import type { ActivityDay } from "./types";
import {
  useCalendarDays,
  calendarKeys,
  type CalendarDateRange,
} from "../../../../hooks/queries/calendar";
import { useStartSession } from "../../../../hooks/useStartSession";
import { monitoringKeys } from "../../../../hooks/queries/monitoring";
import type { MonitoringSessionState } from "@mitable/shared";
import { authService } from "../../../../services/authService";
import { API_BASE_URL } from "../../../../lib/config";

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

export default function CalendarView() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekStart, setWeekStart] = useState<Date>(getStartOfWeek(today));
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("idle");
  const [summarizingBlockIds, setSummarizingBlockIds] = useState<Set<string>>(new Set());
  const [loadedRange, setLoadedRange] = useState<CalendarDateRange>(getInitialLoadedRange);

  const { startSession, isStarting, showProviderModal, dismissProviderModal } = useStartSession({
    navigateOnSuccess: false,
    showToasts: true,
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
      setSessionStatus(deriveStatus(state));
    });
  }, []);

  // Listen for session updates — refresh data AND track state
  // When session transitions from active→idle (ended), optimistically mark the block as summarizing
  useEffect(() => {
    let prevStatus: SessionStatus = sessionStatus;
    const unsub = window.consoleAPI?.onMonitoringSessionUpdate?.((state) => {
      const newStatus = deriveStatus(state);
      // Session just ended (was active/paused, now idle) — mark its block as optimistically summarizing
      if (
        (prevStatus === "active" || prevStatus === "paused") &&
        newStatus === "idle" &&
        state?.id
      ) {
        setSummarizingBlockIds((prev) => new Set(prev).add(state.id));
      }
      prevStatus = newStatus;
      setSessionStatus(newStatus);
      queryClient.invalidateQueries({ queryKey: calendarKeys.days() });
    });
    return () => unsub?.();
  }, [queryClient, sessionStatus]);

  const { data: realDays, isLoading, error } = useCalendarDays(loadedRange);
  const allDays = realDays || [];

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
    const blocks = selectedDayRaw.workBlocks.map((block) => {
      const isMeeting = block.source === "granola" || block.source === "fireflies";
      const hasTasks = block.taskBreakdown && block.taskBreakdown.length > 0;
      const hasSummary = !!block.summary && block.summary.length > 40;

      // Rule 1: "ready" without tasks or summary → still summarizing
      // On-device sessions produce narrative summaries without tasks, so
      // having a summary is sufficient to consider the block done.
      const endedRecently = block.endTime && Date.now() - block.endTime.getTime() < 5 * 60 * 1000;
      if (!isMeeting && block.status === "ready" && !hasTasks && !hasSummary && endedRecently) {
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
  }, [selectedDayRaw, summarizingBlockIds]);

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
    await startSession();
  }, [startSession]);

  const handleStop = useCallback(async () => {
    // 1. Optimistic UI: immediately show summarizing state
    const currentState = await window.consoleAPI?.getMonitoringSessionState();
    setSessionStatus("idle");
    if (currentState?.id) {
      setSummarizingBlockIds((prev) => new Set(prev).add(currentState.id));
    }
    queryClient.invalidateQueries({ queryKey: calendarKeys.days() });
    queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });

    // 2. Full end flow: stop captures + upload + POST /end (same as pill/SessionDetail)
    try {
      const result = await window.consoleAPI?.endSessionFull();
      if (result?.error) {
        console.error("[CalendarView] endSessionFull error:", result.error);
      }
    } catch (err) {
      console.error("[CalendarView] endSessionFull failed:", err);
    }

    // 3. Refresh data now that backend has started summarization
    queryClient.invalidateQueries({ queryKey: calendarKeys.days() });
    queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
  }, [queryClient]);

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

  const handleDeleteBlock = useCallback(
    async (blockId: string) => {
      try {
        // If deleting the currently recording block, stop the capture loop first
        const currentState = await window.consoleAPI?.getMonitoringSessionState();
        if (currentState && currentState.id === blockId) {
          setSessionStatus("idle");
          await window.consoleAPI?.endMonitoringSession();
        }

        const result = await window.consoleAPI?.deleteMonitoringSession(blockId);
        if (result && !result.success) {
          console.error("[CalendarView] deleteSession failed:", result.error);
        }
        queryClient.invalidateQueries({ queryKey: calendarKeys.days() });
        queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
      } catch (err) {
        console.error("[CalendarView] deleteSession failed:", err);
      }
    },
    [queryClient]
  );

  const isRecording = sessionStatus === "active" || sessionStatus === "paused";

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
        {isLoading && <CalendarViewSkeleton />}

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
                        onDelete={handleDeleteBlock}
                      />
                    ))}
                  </>
                )}
              </>
            );
          })()}
      </div>

      {/* No AI provider modal */}
      {showProviderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0, 0, 0, 0.5)" }}
          onClick={dismissProviderModal}
        >
          <div
            className="w-full max-w-sm rounded-xl p-6 space-y-4"
            style={{
              background: "var(--bg-raised)",
              border: "0.5px solid rgba(var(--ui-rgb), 0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: "rgba(var(--mi-accent-rgb), 0.12)" }}
              >
                <Settings size={20} style={{ color: "var(--mi-accent)" }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  AI Provider Required
                </h3>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Add your API key to get started
                </p>
              </div>
            </div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Sessions need an AI provider to analyze your work. Go to{" "}
              <strong style={{ color: "var(--text-primary)" }}>Settings</strong> and add your API
              key for Google, OpenAI, or Anthropic.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={dismissProviderModal}
                className="flex-1 px-4 py-2 text-sm rounded-lg transition-colors"
                style={{
                  background: "var(--bg-overlay)",
                  color: "var(--text-secondary)",
                  borderWidth: "0.5px",
                  borderStyle: "solid",
                  borderColor: "rgba(var(--ui-rgb), 0.10)",
                }}
              >
                Later
              </button>
              <button
                onClick={() => {
                  dismissProviderModal();
                  navigate("/profile");
                }}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{ background: "var(--mi-accent)", color: "var(--bg-base)" }}
              >
                Open Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
