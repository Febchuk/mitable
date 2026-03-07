/**
 * CalendarView
 *
 * Main calendar/journal view for passive activity tracking.
 * Shows day-level view with week navigation and work blocks.
 *
 * Data flow:
 * - Uses real session data from backend via useCalendarDays hook
 * - Falls back to mock data in development when no real sessions exist
 * - Sessions are transformed into WorkBlocks with status tracking
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  CalendarDays,
  Circle,
  Square,
  LayoutGrid,
  List,
  Loader2,
  AlertCircle,
  Pause,
  Play,
} from "lucide-react";
import DayCard from "./DayCard";
import WorkBlockList from "./WorkBlockList";
import {
  Calendar as UntitledCalendar,
  type CalendarEvent,
} from "@/components/application/calendar/calendar";
import type { ActivityDay } from "./types";
import { useCalendarDays, calendarKeys } from "../../../../hooks/queries/calendar";
import { useStartSession } from "../../../../hooks/useStartSession";
import {
  useSessions,
  monitoringKeys,
  useUpdateSession,
  useDeleteSession,
} from "../../../../hooks/queries/monitoring";
import {
  endSession,
  uploadCaptures,
  pauseMonitoringSession,
  resumeMonitoringSession,
} from "../../../../services/monitoringService";

// Helper functions
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
  d.setDate(d.getDate() - day); // Go back to Sunday
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEndOfWeek(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d;
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function isSameMonth(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth();
}

function formatDateRange(start: Date, end: Date): string {
  const startMonth = start.toLocaleDateString("en-US", { month: "short" });
  const endMonth = end.toLocaleDateString("en-US", { month: "short" });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = end.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDayHeader(date: Date): string {
  const today = new Date();
  if (isSameDay(date, today)) {
    return "Today";
  }
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return "Yesterday";
  }
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// Convert WorkBlocks to CalendarEvents for the untitledui Calendar
function workBlocksToCalendarEvents(days: ActivityDay[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  days.forEach((day) => {
    day.workBlocks.forEach((block) => {
      const endTime = block.endTime || new Date();
      events.push({
        id: block.id,
        title: block.goal || block.appBreakdown[0]?.app || "Work Block",
        start: new Date(block.startTime),
        end: new Date(endTime),
        color: block.isActive ? "green" : "gray",
        dot: block.isActive,
      });
    });
  });

  return events;
}

type ViewMode = "detail" | "week" | "month";

export default function CalendarView() {
  const queryClient = useQueryClient();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekStart, setWeekStart] = useState<Date>(getStartOfWeek(today));
  const [viewMode, setViewMode] = useState<ViewMode>("detail");

  // Session start/stop — use Electron-local state for immediate UI updates
  const { startSession, isStarting } = useStartSession({ navigateOnSuccess: false });
  const { data: monitoringData } = useSessions();
  const backendActiveSession = monitoringData?.sessions?.find(
    (s: any) => s.status === "active" || s.status === "paused"
  );
  const [isStopping, setIsStopping] = useState(false);
  const [isPauseLoading, setIsPauseLoading] = useState(false);
  const [electronSessionActive, setElectronSessionActive] = useState<boolean | null>(null);
  const [electronSessionId, setElectronSessionId] = useState<string | null>(null);
  const [electronSessionStatus, setElectronSessionStatus] = useState<string | null>(null);
  const updateSessionMutation = useUpdateSession();

  // Listen to Electron-local session state for immediate button response
  useEffect(() => {
    // Check initial state
    window.consoleAPI?.getMonitoringSessionState?.().then((state) => {
      setElectronSessionActive(state?.status === "active" || state?.status === "paused");
      setElectronSessionId(state?.id || null);
      setElectronSessionStatus(state?.status || null);
    });
    // Listen for updates
    const unsub = window.consoleAPI?.onMonitoringSessionUpdate?.((state) => {
      const isActive = state?.status === "active" || state?.status === "paused";
      setElectronSessionActive(isActive);
      setElectronSessionId(state?.id || null);
      setElectronSessionStatus(state?.status || null);
    });
    return () => unsub?.();
  }, []);

  // Use Electron state for button, fall back to backend query
  const activeSession =
    electronSessionActive !== null
      ? electronSessionActive
        ? backendActiveSession || { id: electronSessionId }
        : undefined
      : backendActiveSession;

  // Invalidate both calendar and sessions caches so UI updates immediately
  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: calendarKeys.days() });
    queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
  }, [queryClient]);

  // Fetch real data from backend
  const { data: realDays, isLoading: isLoadingDays, error: daysError } = useCalendarDays();

  const deleteSession = useDeleteSession();

  // Apply optimistic UI based on Electron state
  // This instantly hides/updates blocks when "End Session" is clicked, masking backend delays
  const allDays = useMemo(() => {
    if (!realDays) return [];

    // If Electron says session is ended, but backend still says active/paused
    if (electronSessionActive === false) {
      return realDays.map((day) => {
        const optimisticBlocks = day.workBlocks
          .map((block) => {
            // Check if the block is being deleted
            const isDeleting = deleteSession.variables === block.id && deleteSession.isPending;

            if ((block.status === "active" || block.status === "paused") && !isDeleting) {
              // Optimistic update for regular session end, NOT for deletion
              return {
                ...block,
                status: "summarizing" as const,
              };
            }
            if (isDeleting) {
              return {
                ...block,
                status: "deleting" as const,
              };
            }
            return block;
          })
          .filter((block) => {
            // If it was originally an active/paused block and < 3 mins, filter it out
            // We check the original block in day.workBlocks, or just its current optimistic summarizing state with the id
            const originalBlock = day.workBlocks.find((b) => b.id === block.id);
            if (
              originalBlock &&
              (originalBlock.status === "active" || originalBlock.status === "paused") &&
              block.duration < 3
            ) {
              return false;
            }
            return true;
          });

        // Recalculate total duration
        const newTotalWorkTime = optimisticBlocks.reduce((sum, b) => sum + b.duration, 0);

        return {
          ...day,
          workBlocks: optimisticBlocks,
          totalWorkTime: newTotalWorkTime,
        };
      });
    }

    return realDays;
  }, [realDays, electronSessionActive]);

  // Get week days with activity data
  const weekDays = useMemo(() => {
    const days: ActivityDay[] = [];
    const current = new Date(weekStart);

    for (let i = 0; i < 7; i++) {
      const existingDay = allDays.find((d) => isSameDay(d.date, current));

      if (existingDay) {
        days.push(existingDay);
      } else {
        // Create empty day placeholder
        days.push({
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

    return days;
  }, [weekStart, allDays]);

  // Convert all days to calendar events for the Calendar component
  const calendarEvents = useMemo(() => workBlocksToCalendarEvents(allDays), [allDays]);

  // Get selected day data
  const selectedDay = useMemo(() => {
    return (
      allDays.find((day) => isSameDay(day.date, selectedDate)) || {
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

  // Check navigation constraints
  const isCurrentWeek = isSameDay(weekStart, getStartOfWeek(today));
  const isCurrentMonth = isSameMonth(selectedDate, today);
  const canNavigateNext = viewMode === "month" ? !isCurrentMonth : !isCurrentWeek;

  // Check if there's an active work block
  const hasActiveBlock = !!activeSession;

  // Navigate based on view mode
  const goToPrevious = () => {
    if (viewMode === "month") {
      const newDate = new Date(selectedDate);
      newDate.setMonth(newDate.getMonth() - 1);
      setSelectedDate(newDate);
      setWeekStart(getStartOfWeek(newDate));
    } else {
      const newStart = new Date(weekStart);
      newStart.setDate(newStart.getDate() - 7);
      setWeekStart(newStart);
      const dayOffset = Math.floor(
        (selectedDate.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      const newSelected = new Date(newStart);
      newSelected.setDate(newSelected.getDate() + dayOffset);
      setSelectedDate(newSelected);
    }
  };

  const goToNext = () => {
    if (viewMode === "month") {
      const newDate = new Date(selectedDate);
      newDate.setMonth(newDate.getMonth() + 1);
      setSelectedDate(newDate);
      setWeekStart(getStartOfWeek(newDate));
    } else {
      const newStart = new Date(weekStart);
      newStart.setDate(newStart.getDate() + 7);
      setWeekStart(newStart);
      const dayOffset = Math.floor(
        (selectedDate.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      const newSelected = new Date(newStart);
      newSelected.setDate(newSelected.getDate() + dayOffset);
      setSelectedDate(newSelected);
    }
  };

  const goToToday = () => {
    setWeekStart(getStartOfWeek(today));
    setSelectedDate(today);
  };

  // Get the display text for the current period
  const getPeriodDisplay = () => {
    if (viewMode === "month") {
      return formatMonthYear(selectedDate);
    }
    return formatDateRange(weekStart, getEndOfWeek(weekStart));
  };

  // Derive whether the session is paused
  const isSessionPaused =
    electronSessionStatus === "paused" ||
    (backendActiveSession && (backendActiveSession as any).status === "paused");

  // Handle pause/resume
  const handlePauseSession = async () => {
    const sessionId = activeSession?.id;
    if (!sessionId) return;
    setIsPauseLoading(true);
    try {
      await pauseMonitoringSession();
      await updateSessionMutation.mutateAsync({ sessionId, action: "pause" });
      refreshData();
    } catch (error) {
      console.error("Failed to pause session:", error);
    } finally {
      setIsPauseLoading(false);
    }
  };

  const handleResumeSession = async () => {
    const sessionId = activeSession?.id;
    if (!sessionId) return;
    setIsPauseLoading(true);
    try {
      await resumeMonitoringSession();
      await updateSessionMutation.mutateAsync({ sessionId, action: "resume" });
      refreshData();
    } catch (error) {
      console.error("Failed to resume session:", error);
    } finally {
      setIsPauseLoading(false);
    }
  };

  // Handle record toggle
  const handleRecord = async () => {
    if (activeSession && activeSession.id) {
      const sessionId = activeSession.id;
      setIsStopping(true);
      try {
        // 1. Stop Electron capture loop and get remaining captures
        const electronResult = await window.consoleAPI.endMonitoringSession();

        // 2. Upload any remaining captures
        if (electronResult.captures && electronResult.captures.length > 0) {
          await uploadCaptures(sessionId, electronResult.captures);
        }

        // 3. End session on backend (triggers storyteller + classification)
        await endSession(sessionId);
        refreshData();
      } catch (error) {
        console.error("Failed to end session:", error);
      } finally {
        setIsStopping(false);
      }
    } else {
      await startSession();
      refreshData();
    }
  };

  // Is this a calendar grid view (week or month)?
  const isGridView = viewMode === "week" || viewMode === "month";

  return (
    <div
      className={`app-no-drag ${isGridView ? "h-full flex flex-col overflow-hidden" : "h-full overflow-auto"}`}
    >
      {/* ═══════════════════════════════════════════════════════════════════
          HEADER - Navigation and View Controls
          ═══════════════════════════════════════════════════════════════════ */}
      <div className={`px-8 pt-8 pb-4 ${isGridView ? "flex-shrink-0" : ""}`}>
        <div className="stagger-1">
          {/* Title and actions row */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo/10">
                <Calendar size={20} className="text-indigo" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold text-ink-primary tracking-tight">
                  Activity Journal
                </h1>
                <p className="text-ink-tertiary text-sm">
                  Passive tracking{" "}
                  {hasActiveBlock && !isSessionPaused && (
                    <span className="text-emerald">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald mr-1 animate-pulse" />
                      recording
                    </span>
                  )}
                  {hasActiveBlock && isSessionPaused && (
                    <span className="text-amber">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber mr-1" />
                      paused
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* View toggle and menu */}
            <div className="flex items-center gap-3">
              {/* View mode toggle */}
              <div className="flex items-center rounded-lg border border-stroke-subtle overflow-hidden">
                <button
                  onClick={() => setViewMode("detail")}
                  className={`px-3 py-2 text-xs font-medium transition-colors ${
                    viewMode === "detail"
                      ? "bg-indigo/10 text-indigo"
                      : "text-ink-tertiary hover:text-ink-primary hover:bg-canvas-muted"
                  }`}
                  title="Detail view"
                >
                  <List size={14} className="inline mr-1.5" />
                  Detail
                </button>
                <button
                  onClick={() => setViewMode("week")}
                  className={`px-3 py-2 text-xs font-medium transition-colors border-l border-stroke-subtle ${
                    viewMode === "week"
                      ? "bg-indigo/10 text-indigo"
                      : "text-ink-tertiary hover:text-ink-primary hover:bg-canvas-muted"
                  }`}
                  title="Week view"
                >
                  <LayoutGrid size={14} className="inline mr-1.5" />
                  Week
                </button>
                <button
                  onClick={() => setViewMode("month")}
                  className={`px-3 py-2 text-xs font-medium transition-colors border-l border-stroke-subtle ${
                    viewMode === "month"
                      ? "bg-indigo/10 text-indigo"
                      : "text-ink-tertiary hover:text-ink-primary hover:bg-canvas-muted"
                  }`}
                  title="Month view"
                >
                  <CalendarDays size={14} className="inline mr-1.5" />
                  Month
                </button>
              </div>

              {/* Session controls */}
              {activeSession ? (
                <div className="flex items-center gap-2">
                  {/* Pause / Resume button */}
                  {isSessionPaused ? (
                    <button
                      onClick={handleResumeSession}
                      disabled={isPauseLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all bg-emerald/10 text-emerald border border-emerald/20 hover:bg-emerald/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isPauseLoading ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Play size={14} className="fill-current" />
                      )}
                      Resume
                    </button>
                  ) : (
                    <button
                      onClick={handlePauseSession}
                      disabled={isPauseLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all bg-amber/10 text-amber border border-amber/20 hover:bg-amber/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isPauseLoading ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Pause size={14} className="fill-current" />
                      )}
                      Pause
                    </button>
                  )}

                  {/* Stop button */}
                  <button
                    onClick={handleRecord}
                    disabled={isStopping}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all bg-rose/10 text-rose border border-rose/20 hover:bg-rose/20 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isStopping ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Square size={14} className="fill-current" />
                    )}
                    {isStopping ? "Stopping..." : "Stop"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleRecord}
                  disabled={isStarting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all bg-indigo text-white hover:bg-indigo/90 shadow-sm hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isStarting ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Circle size={14} className="fill-current" />
                  )}
                  {isStarting ? "Starting..." : "Record"}
                </button>
              )}
            </div>
          </div>

          {/* Navigation strip */}
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={goToPrevious}
              className="p-2 rounded-lg hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary transition-colors"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex-1 flex items-center justify-center gap-3">
              <span className="text-sm font-medium text-ink-primary">{getPeriodDisplay()}</span>
              {((viewMode !== "month" && !isCurrentWeek) ||
                (viewMode === "month" && !isCurrentMonth)) && (
                <button
                  onClick={goToToday}
                  className="px-2 py-1 text-xs font-medium text-indigo hover:bg-indigo/10 rounded transition-colors"
                >
                  Today
                </button>
              )}
            </div>

            <button
              onClick={goToNext}
              disabled={!canNavigateNext}
              className={`p-2 rounded-lg transition-colors ${
                !canNavigateNext
                  ? "text-ink-tertiary/30 cursor-not-allowed"
                  : "hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary"
              }`}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Week day cards - only shown in detail view */}
          {viewMode === "detail" && (
            <div className="flex items-center gap-2 justify-center">
              {weekDays.map((day) => (
                <DayCard
                  key={day.id}
                  day={day}
                  isSelected={isSameDay(day.date, selectedDate)}
                  isToday={isSameDay(day.date, today)}
                  onClick={() => setSelectedDate(day.date)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN CONTENT - Detail view or Calendar grid view
          ═══════════════════════════════════════════════════════════════════ */}
      <div className={`px-8 ${isGridView ? "flex-1 flex flex-col min-h-0 pb-4" : "pb-8"}`}>
        {/* Loading State */}
        {isLoadingDays && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 size={32} className="text-indigo animate-spin mb-4" />
            <p className="text-ink-tertiary text-sm">Loading activity data...</p>
          </div>
        )}

        {/* Error State */}
        {daysError && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="p-3 rounded-full bg-rose/10 mb-4">
              <AlertCircle size={24} className="text-rose" />
            </div>
            <p className="text-ink-primary font-medium mb-1">Failed to load activity data</p>
            <p className="text-ink-tertiary text-sm">
              {daysError instanceof Error ? daysError.message : "An error occurred"}
            </p>
          </div>
        )}

        {/* Main Content */}
        {!isLoadingDays && !daysError && (
          <>
            {isGridView ? (
              /* Calendar Grid View - Using untitledui Calendar */
              <div className="stagger-2 flex-1 min-h-0 flex flex-col mitable-calendar">
                <UntitledCalendar
                  events={calendarEvents}
                  view={viewMode}
                  currentDate={selectedDate}
                  hideHeader={true}
                  className="flex-1 min-h-0"
                  onEventClick={(event) => {
                    // Switch to detail view and set the date to the event's date
                    setSelectedDate(event.start);
                    setWeekStart(getStartOfWeek(event.start));
                    setViewMode("detail");
                  }}
                />
              </div>
            ) : (
              /* Detail View */
              <div className="stagger-2">
                {/* Day header */}
                <div className="flex items-center justify-between mb-4 pt-4 border-t border-stroke-subtle">
                  <h2 className="font-display text-xl font-semibold text-ink-primary">
                    {formatDayHeader(selectedDate)}
                  </h2>
                </div>

                {/* Work blocks */}
                <WorkBlockList
                  blocks={selectedDay.workBlocks}
                  totalWorkTime={selectedDay.totalWorkTime}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
