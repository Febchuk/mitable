/**
 * CalendarView
 *
 * Main calendar/journal view for passive activity tracking.
 * Shows day-level view with week navigation and work blocks.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Sparkles,
  MoreVertical,
  Plus,
  Send,
  X,
  Target,
  Check,
  Mail,
  MessageSquare,
  Copy,
  ExternalLink,
} from "lucide-react";
import { mockDays, getMockWeekDays } from "./mockData";
import DayCard from "./DayCard";
import DaySummary from "./DaySummary";
import WorkBlockList from "./WorkBlockList";
import type { WorkBlock } from "./types";

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

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// Generate recap content from selected blocks
function generateRecapContent(blocks: WorkBlock[]): string {
  if (blocks.length === 0) return "";

  const totalMinutes = blocks.reduce((acc, b) => acc + b.duration, 0);

  let content = `**Work Update** (${formatDuration(totalMinutes)} total)\n\n`;

  blocks.forEach((block, idx) => {
    const timeRange = `${formatTime(block.startTime)} - ${block.endTime ? formatTime(block.endTime) : "ongoing"}`;
    content += `**Block ${idx + 1}** (${timeRange}, ${formatDuration(block.duration)})\n`;
    if (block.goal) {
      content += `Goal: ${block.goal}\n`;
    }
    content += `${block.summary}\n\n`;
  });

  return content.trim();
}

export default function CalendarView() {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [weekStart, setWeekStart] = useState<Date>(getStartOfWeek(today));

  // Menu and dialog states
  const [showMenu, setShowMenu] = useState(false);
  const [showNewBlockDialog, setShowNewBlockDialog] = useState(false);
  const [showSendUpdateDialog, setShowSendUpdateDialog] = useState(false);
  const [newBlockGoal, setNewBlockGoal] = useState("");
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());

  const menuRef = useRef<HTMLDivElement>(null);

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

  // Check if there's an active work block
  const hasActiveBlock = selectedDay.workBlocks.some((b) => b.isActive);

  // Initialize selected blocks when opening send update dialog
  const openSendUpdateDialog = () => {
    // Default select all blocks from today
    const todayBlockIds = new Set(selectedDay.workBlocks.map((b) => b.id));
    setSelectedBlockIds(todayBlockIds);
    setShowSendUpdateDialog(true);
    setShowMenu(false);
  };

  // Toggle block selection
  const toggleBlockSelection = (blockId: string) => {
    const next = new Set(selectedBlockIds);
    if (next.has(blockId)) {
      next.delete(blockId);
    } else {
      next.add(blockId);
    }
    setSelectedBlockIds(next);
  };

  // Get selected blocks
  const selectedBlocks = selectedDay.workBlocks.filter((b) => selectedBlockIds.has(b.id));
  const recapContent = generateRecapContent(selectedBlocks);

  // Navigate weeks
  const goToPreviousWeek = () => {
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

  const goToToday = () => {
    setWeekStart(getStartOfWeek(today));
    setSelectedDate(today);
  };

  // Handle actions
  const handleStartNewBlock = () => {
    console.log("Starting new block with goal:", newBlockGoal || "(no goal)");
    setShowNewBlockDialog(false);
    setNewBlockGoal("");
  };

  const handleSendUpdate = (destination: "slack" | "gmail" | "copy" | "linear") => {
    console.log(`Sending update to ${destination}:`, recapContent);
    // In real implementation, would send to the selected destination
    setShowSendUpdateDialog(false);
  };

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
                    onClick={openSendUpdateDialog}
                    disabled={selectedDay.workBlocks.length === 0}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-canvas-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={16} className="text-indigo" />
                    <span className="text-sm text-ink-primary">Send Update</span>
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
      <div className="px-8 pb-24">
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
                    Begin a focused work session
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

      {/* ═══════════════════════════════════════════════════════════════════
          SEND UPDATE DIALOG
          ═══════════════════════════════════════════════════════════════════ */}
      {showSendUpdateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSendUpdateDialog(false)}
          />
          <div className="relative bg-canvas-overlay rounded-2xl border border-stroke-subtle shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stroke-subtle flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo/10">
                  <Send size={18} className="text-indigo" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink-primary">
                    Send Update
                  </h3>
                  <p className="text-xs text-ink-tertiary">
                    Share your work progress
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSendUpdateDialog(false)}
                className="p-2 rounded-lg hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Block selection */}
              <div className="px-6 py-4 border-b border-stroke-subtle">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
                  Select work blocks to include
                </h4>
                <div className="space-y-2">
                  {selectedDay.workBlocks.map((block, idx) => (
                    <button
                      key={block.id}
                      onClick={() => toggleBlockSelection(block.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                        selectedBlockIds.has(block.id)
                          ? "border-indigo bg-indigo/5"
                          : "border-stroke-subtle hover:border-stroke"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                          selectedBlockIds.has(block.id)
                            ? "bg-indigo text-white"
                            : "border border-stroke-subtle"
                        }`}
                      >
                        {selectedBlockIds.has(block.id) && <Check size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink-primary">
                            Block {idx + 1}
                          </span>
                          <span className="text-xs text-ink-tertiary">
                            {formatTime(block.startTime)} - {block.endTime ? formatTime(block.endTime) : "now"}
                          </span>
                          <span className="text-xs text-ink-tertiary">
                            ({formatDuration(block.duration)})
                          </span>
                          {block.isFocusedSession && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo/10 text-indigo">
                              Focused
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-ink-secondary truncate mt-0.5">
                          {block.summary}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="px-6 py-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
                  Update Preview
                </h4>
                <div className="rounded-lg border border-stroke-subtle bg-canvas-muted/30 p-4">
                  {selectedBlocks.length > 0 ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <pre className="whitespace-pre-wrap text-sm text-ink-secondary font-sans">
                        {recapContent}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-sm text-ink-tertiary text-center py-4">
                      Select at least one block to generate an update
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer - Send options */}
            <div className="px-6 py-4 border-t border-stroke-subtle bg-canvas-muted/30 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-tertiary">
                  {selectedBlocks.length} block{selectedBlocks.length !== 1 ? "s" : ""} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSendUpdate("copy")}
                    disabled={selectedBlocks.length === 0}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stroke-subtle hover:bg-canvas-muted text-ink-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Copy size={16} />
                    <span className="text-sm">Copy</span>
                  </button>
                  <button
                    onClick={() => handleSendUpdate("slack")}
                    disabled={selectedBlocks.length === 0}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stroke-subtle hover:bg-canvas-muted text-ink-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <MessageSquare size={16} />
                    <span className="text-sm">Slack</span>
                  </button>
                  <button
                    onClick={() => handleSendUpdate("gmail")}
                    disabled={selectedBlocks.length === 0}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stroke-subtle hover:bg-canvas-muted text-ink-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Mail size={16} />
                    <span className="text-sm">Gmail</span>
                  </button>
                  <button
                    onClick={() => handleSendUpdate("linear")}
                    disabled={selectedBlocks.length === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo text-white font-medium text-sm hover:bg-indigo/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ExternalLink size={16} />
                    <span>Linear</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
