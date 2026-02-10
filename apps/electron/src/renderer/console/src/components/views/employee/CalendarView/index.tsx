/**
 * CalendarView
 *
 * Main calendar/journal view for passive activity tracking.
 * Shows day-level view with week navigation and work blocks.
 */

import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Sparkles,
  Settings,
  Target,
} from "lucide-react";
import { mockDays, getMockWeekDays } from "./mockData";
import DayCard from "./DayCard";
import WorkBlockList from "./WorkBlockList";

// Helper functions
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  d.setDate(diff);
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

export default function CalendarView() {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekStart, setWeekStart] = useState<Date>(getStartOfWeek(today));

  // Get week days with activity data
  const weekDays = useMemo(() => getMockWeekDays(weekStart), [weekStart]);

  // Get selected day data
  const selectedDay = useMemo(() => {
    return mockDays.find((day) => isSameDay(day.date, selectedDate)) || {
      id: "empty",
      date: selectedDate,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      totalWorkTime: 0,
      workBlocks: [],
      summary: "",
      topApps: [],
    };
  }, [selectedDate]);

  // Check if current week is this week
  const isCurrentWeek = isSameDay(weekStart, getStartOfWeek(today));

  // Navigate weeks
  const goToPreviousWeek = () => {
    const newStart = new Date(weekStart);
    newStart.setDate(newStart.getDate() - 7);
    setWeekStart(newStart);
    // Also select the same day of week in the new week
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

  const goToToday = () => {
    setWeekStart(getStartOfWeek(today));
    setSelectedDate(today);
  };

  // Check if there's an active work block
  const hasActiveBlock = selectedDay.workBlocks.some((b) => b.isActive);

  return (
    <div className="min-h-full app-no-drag">
      {/* ═══════════════════════════════════════════════════════════════════
          HEADER - Week Navigation
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="px-8 pt-8 pb-4">
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

            <div className="flex items-center gap-2">
              {/* Start Focused Session button */}
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo text-white font-medium text-sm hover:bg-indigo/90 transition-colors"
              >
                <Target size={16} />
                Start Focused Session
              </button>

              {/* Settings */}
              <button className="p-2 rounded-lg hover:bg-canvas-muted text-ink-tertiary hover:text-ink-secondary transition-colors">
                <Settings size={18} />
              </button>
            </div>
          </div>

          {/* Week navigation */}
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={goToPreviousWeek}
              className="p-2 rounded-lg hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary transition-colors"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex-1 flex items-center justify-center gap-3">
              <span className="text-sm font-medium text-ink-primary">
                {formatDateRange(weekStart, getEndOfWeek(weekStart))}
              </span>
              {!isCurrentWeek && (
                <button
                  onClick={goToToday}
                  className="px-2 py-1 text-xs font-medium text-indigo hover:bg-indigo/10 rounded transition-colors"
                >
                  Today
                </button>
              )}
            </div>

            <button
              onClick={goToNextWeek}
              disabled={isCurrentWeek}
              className={`p-2 rounded-lg transition-colors ${
                isCurrentWeek
                  ? "text-ink-tertiary/30 cursor-not-allowed"
                  : "hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary"
              }`}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Week day cards */}
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
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DAY DETAIL - Selected day content
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="px-8 pb-8">
        <div className="stagger-2">
          {/* Day header */}
          <div className="flex items-center justify-between mb-6 pt-4 border-t border-stroke-subtle">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink-primary">
                {formatDayHeader(selectedDate)}
              </h2>
              {selectedDay.summary && (
                <p className="text-ink-secondary text-sm mt-1 max-w-2xl">
                  {selectedDay.summary}
                </p>
              )}
            </div>

            {/* AI Summary button */}
            {selectedDay.workBlocks.length > 0 && (
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stroke-subtle hover:border-indigo/30 hover:bg-indigo/5 text-ink-secondary hover:text-indigo transition-all">
                <Sparkles size={16} />
                <span className="text-sm font-medium">Generate Summary</span>
              </button>
            )}
          </div>

          {/* Work blocks */}
          <WorkBlockList
            blocks={selectedDay.workBlocks}
            totalWorkTime={selectedDay.totalWorkTime}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          PASSIVE TRACKING STATUS BAR (at bottom)
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="fixed bottom-0 left-0 right-0 px-8 py-3 bg-canvas-base/95 backdrop-blur-sm border-t border-stroke-subtle">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${hasActiveBlock ? "bg-emerald animate-pulse" : "bg-ink-tertiary"}`} />
              <span className="text-sm text-ink-secondary">
                {hasActiveBlock ? "Tracking active" : "Tracking paused"}
              </span>
            </div>
            <span className="text-ink-tertiary">·</span>
            <span className="text-sm text-ink-tertiary">
              30 min idle threshold
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-ink-tertiary">
              0 apps excluded
            </span>
            <button className="text-xs text-indigo hover:text-indigo/80 transition-colors">
              Configure
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
