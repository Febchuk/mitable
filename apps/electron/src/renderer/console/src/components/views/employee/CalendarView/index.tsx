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

import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  CalendarDays,
  Sparkles,
  MoreVertical,
  Plus,
  FileText,
  X,
  Target,
  LayoutGrid,
  List,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { mockDays, getMockWeekDays } from "./mockData";
import DayCard from "./DayCard";
import DaySummary from "./DaySummary";
import WorkBlockList from "./WorkBlockList";
import { Calendar as UntitledCalendar, type CalendarEvent } from "@/components/application/calendar/calendar";
import type { ActivityDay } from "./types";
import { useCalendarDays } from "../../../../hooks/queries/calendar";

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
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth()
  );
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
  const navigate = useNavigate();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekStart, setWeekStart] = useState<Date>(getStartOfWeek(today));
  const [viewMode, setViewMode] = useState<ViewMode>("detail");

  // Menu and dialog states
  const [showMenu, setShowMenu] = useState(false);
  const [showNewBlockDialog, setShowNewBlockDialog] = useState(false);
  const [newBlockGoal, setNewBlockGoal] = useState("");

  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch real data from backend
  const {
    data: realDays,
    isLoading: isLoadingDays,
    error: daysError,
  } = useCalendarDays();

  // Use real data if available, fall back to mock data for development
  const useMockData = !realDays || realDays.length === 0;
  const allDays = useMockData ? mockDays : realDays;

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get week days with activity data
  const weekDays = useMemo(() => {
    if (useMockData) {
      return getMockWeekDays(weekStart);
    }

    // Build week days from real data
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
  }, [weekStart, useMockData, allDays]);

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
  const hasActiveBlock = selectedDay.workBlocks.some((b) => b.isActive);

  // Navigate to create recap with all blocks pre-selected
  const handleCreateRecap = () => {
    const blockIds = selectedDay.workBlocks.map((b) => b.id).join(",");
    const dateStr = selectedDay.date.toISOString().split("T")[0];
    navigate(`/recaps/new?blocks=${blockIds}&date=${dateStr}`);
    setShowMenu(false);
  };

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

  // Handle actions
  const handleStartNewBlock = () => {
    console.log("Starting new block with goal:", newBlockGoal || "(no goal)");
    setShowNewBlockDialog(false);
    setNewBlockGoal("");
  };

  // Is this a calendar grid view (week or month)?
  const isGridView = viewMode === "week" || viewMode === "month";

  return (
    <div className={`app-no-drag ${isGridView ? "h-full flex flex-col overflow-hidden" : "h-full overflow-auto"}`}>
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
                  {hasActiveBlock && (
                    <span className="text-emerald">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald mr-1 animate-pulse" />
                      recording
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

              {/* Three-dot menu */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 rounded-lg hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary transition-colors"
                >
                  <MoreVertical size={20} />
                </button>

                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-stroke-subtle bg-canvas-overlay shadow-xl overflow-hidden z-50">
                    <button
                      onClick={handleCreateRecap}
                      disabled={selectedDay.workBlocks.length === 0}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-canvas-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FileText size={16} className="text-indigo" />
                      <span className="text-sm text-ink-primary">Create Recap</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowNewBlockDialog(true);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-canvas-muted transition-colors border-t border-stroke-subtle"
                    >
                      <Plus size={16} className="text-ink-tertiary" />
                      <span className="text-sm text-ink-primary">Start New Block</span>
                    </button>
                  </div>
                )}
              </div>
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
              <span className="text-sm font-medium text-ink-primary">
                {getPeriodDisplay()}
              </span>
              {((viewMode !== "month" && !isCurrentWeek) || (viewMode === "month" && !isCurrentMonth)) && (
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
        {isLoadingDays && !useMockData && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 size={32} className="text-indigo animate-spin mb-4" />
            <p className="text-ink-tertiary text-sm">Loading activity data...</p>
          </div>
        )}

        {/* Error State */}
        {daysError && !useMockData && (
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

        {/* Data Source Indicator (dev only) */}
        {useMockData && !isLoadingDays && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-amber/10 border border-amber/20 text-amber text-xs flex items-center gap-2">
            <AlertCircle size={14} />
            <span>Showing mock data - no sessions found</span>
          </div>
        )}

        {/* Main Content */}
        {(!isLoadingDays || useMockData) && !daysError && (
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

                  {/* AI Summary button */}
                  {selectedDay.workBlocks.length > 0 && (
                    <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stroke-subtle hover:border-indigo/30 hover:bg-indigo/5 text-ink-secondary hover:text-indigo transition-all">
                      <Sparkles size={16} />
                      <span className="text-sm font-medium">Regenerate Summary</span>
                    </button>
                  )}
                </div>

                {/* Day Summary with toggle */}
                <DaySummary day={selectedDay} />

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

      {/* ═══════════════════════════════════════════════════════════════════
          NEW BLOCK DIALOG
          ═══════════════════════════════════════════════════════════════════ */}
      {showNewBlockDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowNewBlockDialog(false)}
          />
          <div className="relative bg-canvas-overlay rounded-2xl border border-stroke-subtle shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-subtle">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo/10">
                  <Target size={18} className="text-indigo" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink-primary">
                    Start New Block
                  </h3>
                  <p className="text-xs text-ink-tertiary">
                    Begin a new work session
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNewBlockDialog(false)}
                className="p-2 rounded-lg hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label
                  htmlFor="goal-input"
                  className="block text-sm font-medium text-ink-secondary mb-2"
                >
                  What are you working on? (optional)
                </label>
                <input
                  id="goal-input"
                  type="text"
                  value={newBlockGoal}
                  onChange={(e) => setNewBlockGoal(e.target.value)}
                  placeholder="e.g., Complete Calendar UI prototype"
                  className="w-full px-4 py-3 rounded-lg bg-canvas-muted border border-stroke-subtle text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-indigo focus:ring-1 focus:ring-indigo/20 transition-all"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-stroke-subtle bg-canvas-muted/30">
              <button
                onClick={() => setShowNewBlockDialog(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-ink-secondary hover:bg-canvas-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartNewBlock}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo text-white font-medium text-sm hover:bg-indigo/90 transition-colors"
              >
                <Plus size={16} />
                Start Block
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
