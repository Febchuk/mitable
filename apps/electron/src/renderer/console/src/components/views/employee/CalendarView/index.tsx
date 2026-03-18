/**
 * CalendarView — Redesigned
 *
 * Minimal calendar page with centred content column.
 * WeekStrip is sticky at the top. Content scrolls beneath it.
 * Record/Stop/Pause controls in the page header.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, Square, Pause, Play } from "lucide-react";
import WeekStrip from "./WeekStrip";
import ActivityBlock from "./ActivityBlock";
import type { ActivityDay } from "./types";
import { useCalendarDays, calendarKeys } from "../../../../hooks/queries/calendar";
import { useStartSession } from "../../../../hooks/useStartSession";
import { deleteSession } from "../../../../services/monitoringService";
import { monitoringKeys } from "../../../../hooks/queries/monitoring";
import type { MonitoringSessionState } from "@mitable/shared";

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

export default function CalendarView() {
  const queryClient = useQueryClient();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekStart, setWeekStart] = useState<Date>(getStartOfWeek(today));
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("idle");

  const { startSession, isStarting } = useStartSession({
    navigateOnSuccess: false,
    showToasts: true,
  });

  // Hydrate session state on mount
  useEffect(() => {
    window.consoleAPI?.getMonitoringSessionState().then((state) => {
      setSessionStatus(deriveStatus(state));
    });
  }, []);

  // Listen for session updates — refresh data AND track state
  useEffect(() => {
    const unsub = window.consoleAPI?.onMonitoringSessionUpdate?.((state) => {
      setSessionStatus(deriveStatus(state));
      queryClient.invalidateQueries({ queryKey: calendarKeys.days() });
    });
    return () => unsub?.();
  }, [queryClient]);

  const { data: realDays, isLoading, error } = useCalendarDays();
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

  const selectedDay = useMemo(() => {
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
    try {
      setSessionStatus("idle");
      const result = await window.consoleAPI?.endMonitoringSession();
      if (result?.error) {
        console.error("[CalendarView] endMonitoringSession error:", result.error);
      }
    } catch (err) {
      console.error("[CalendarView] endMonitoringSession failed:", err);
    }
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

        await deleteSession(blockId);
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
          background: "#1A1916",
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
              color: "#ECE8E0",
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
              color: "#6B665C",
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
                color: "#9B9689",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#ECE8E0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#9B9689";
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
                border: "0.5px solid rgba(232, 116, 116, 0.25)",
                background: "rgba(232, 116, 116, 0.06)",
                color: "#E87474",
                fontSize: 12,
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(232, 116, 116, 0.12)";
                e.currentTarget.style.borderColor = "rgba(232, 116, 116, 0.35)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(232, 116, 116, 0.06)";
                e.currentTarget.style.borderColor = "rgba(232, 116, 116, 0.25)";
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
                border: "0.5px solid rgba(236, 232, 224, 0.12)",
                background: "transparent",
                color: "#ECE8E0",
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
                  e.currentTarget.style.background = "rgba(236, 232, 224, 0.05)";
                  e.currentTarget.style.borderColor = "rgba(236, 232, 224, 0.2)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "rgba(236, 232, 224, 0.12)";
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
                    background: "#E87474",
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
            <Loader2 size={24} style={{ color: "#9B84E8", animation: "spin 1s linear infinite" }} />
            <p style={{ color: "#6B665C", fontSize: 13, marginTop: 12 }}>
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
            <AlertCircle size={24} style={{ color: "#E87474", marginBottom: 12 }} />
            <p style={{ color: "#ECE8E0", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              Failed to load activity data
            </p>
            <p style={{ color: "#6B665C", fontSize: 12 }}>
              {error instanceof Error ? error.message : "An error occurred"}
            </p>
          </div>
        )}

        {!isLoading && !error && selectedDay.workBlocks.length > 0 && (
          <>
            {/* Section label */}
            <div
              style={{
                fontSize: 10,
                color: "#6B665C",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              Activity
            </div>

            {/* Blocks */}
            {selectedDay.workBlocks.map((block, index) => (
              <ActivityBlock
                key={block.id}
                block={block}
                blockNumber={index + 1}
                defaultExpanded={
                  !block.isActive &&
                  index === selectedDay.workBlocks.length - 1 &&
                  selectedDay.workBlocks.length <= 3
                }
                onDelete={handleDeleteBlock}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
