/**
 * WeekGridView
 *
 * Google Calendar-style week view showing work blocks as visual blocks
 * on a time grid with days as columns.
 */

import { useMemo } from "react";
import { Target } from "lucide-react";
import type { ActivityDay, WorkBlock } from "./types";

interface WeekGridViewProps {
  weekDays: ActivityDay[];
  onBlockClick?: (block: WorkBlock, day: ActivityDay) => void;
}

// Time grid configuration
const START_HOUR = 6; // 6 AM
const END_HOUR = 22; // 10 PM
const HOUR_HEIGHT = 48; // pixels per hour
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HEADER_HEIGHT = 88; // Fixed header height for alignment

// Get position and height for a work block
function getBlockStyle(block: WorkBlock): { top: number; height: number } | null {
  const start = new Date(block.startTime);
  const end = block.endTime ? new Date(block.endTime) : new Date();

  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;

  // Skip blocks outside our time range
  if (endHour < START_HOUR || startHour > END_HOUR) {
    return null;
  }

  // Clamp to visible range
  const clampedStart = Math.max(startHour, START_HOUR);
  const clampedEnd = Math.min(endHour, END_HOUR);

  const top = (clampedStart - START_HOUR) * HOUR_HEIGHT;
  const height = Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 24); // min 24px

  return { top, height };
}

// Format time for display
function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Format duration
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// Get block color based on status and type
function getBlockColors(block: WorkBlock): { bg: string; border: string; text: string } {
  // Status-based colors (priority over type)
  if (block.status === "active" || block.isActive) {
    return {
      bg: "bg-emerald/20",
      border: "border-emerald/40",
      text: "text-emerald",
    };
  }
  if (block.status === "paused") {
    return {
      bg: "bg-amber/20",
      border: "border-amber/40",
      text: "text-amber",
    };
  }
  if (block.status === "summarizing") {
    return {
      bg: "bg-indigo/20",
      border: "border-indigo/40",
      text: "text-indigo",
    };
  }
  if (block.status === "delivered") {
    return {
      bg: "bg-violet/20",
      border: "border-violet/40",
      text: "text-violet",
    };
  }
  if (block.status === "ready") {
    return {
      bg: "bg-cyan/20",
      border: "border-cyan/40",
      text: "text-cyan",
    };
  }
  // Default colors for ended blocks
  return {
    bg: "bg-canvas-muted",
    border: "border-stroke-subtle",
    text: "text-ink-secondary",
  };
}

// Work block component
function BlockItem({ block, onClick }: { block: WorkBlock; onClick?: () => void }) {
  const style = getBlockStyle(block);
  if (!style) return null;

  const colors = getBlockColors(block);
  const startTime = new Date(block.startTime);
  const topApp = block.appBreakdown[0]?.app;

  return (
    <button
      onClick={onClick}
      className={`absolute left-1 right-1 rounded-lg border ${colors.bg} ${colors.border} overflow-hidden transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer group`}
      style={{ top: style.top, height: style.height }}
    >
      <div className="p-2 h-full flex flex-col">
        {/* Time and duration */}
        <div className="flex items-center justify-between gap-1">
          <span className={`text-[10px] font-medium ${colors.text}`}>{formatTime(startTime)}</span>
          <span className="text-[10px] text-ink-tertiary">{formatDuration(block.duration)}</span>
        </div>

        {/* Goal or top app */}
        {style.height > 40 && (
          <div className="mt-1 flex-1 min-h-0">
            {block.goal ? (
              <div className="flex items-start gap-1">
                <Target size={10} className={`${colors.text} mt-0.5 shrink-0`} />
                <span className="text-[11px] text-ink-primary line-clamp-2 leading-tight">
                  {block.goal}
                </span>
              </div>
            ) : topApp ? (
              <span className="text-[11px] text-ink-secondary line-clamp-2">{topApp}</span>
            ) : null}
          </div>
        )}

        {/* Status indicator */}
        {(block.status === "active" || block.isActive) && (
          <div className="absolute top-2 right-2">
            <div className="w-2 h-2 rounded-full bg-emerald animate-pulse" />
          </div>
        )}
        {block.status === "paused" && (
          <div className="absolute top-2 right-2">
            <div className="w-2 h-2 rounded-full bg-amber" />
          </div>
        )}
        {block.status === "summarizing" && (
          <div className="absolute top-2 right-2">
            <div className="w-2 h-2 rounded-full bg-indigo animate-pulse" />
          </div>
        )}
      </div>
    </button>
  );
}

// Day column component
function DayColumn({
  day,
  isToday,
  onBlockClick,
}: {
  day: ActivityDay;
  isToday: boolean;
  onBlockClick?: (block: WorkBlock) => void;
}) {
  const dayName = day.date.toLocaleDateString("en-US", { weekday: "short" });
  const dayNum = day.date.getDate();

  return (
    <div className="flex-1 min-w-[100px] border-r border-stroke-subtle last:border-r-0">
      {/* Day header - fixed height for grid alignment */}
      <div
        className={`sticky top-0 z-10 px-2 text-center border-b border-stroke-subtle flex flex-col items-center justify-center ${
          isToday ? "bg-indigo/5" : "bg-canvas-base"
        }`}
        style={{ height: HEADER_HEIGHT }}
      >
        <div className="text-[10px] font-medium text-ink-tertiary uppercase tracking-wider">
          {dayName}
        </div>
        <div
          className={`mt-1 w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold ${
            isToday ? "bg-indigo text-white" : "text-ink-primary"
          }`}
        >
          {dayNum}
        </div>
        {day.totalWorkTime > 0 && (
          <div className="mt-1 text-[10px] text-ink-tertiary">
            {formatDuration(day.totalWorkTime)}
          </div>
        )}
      </div>

      {/* Time slots (relative positioning container) */}
      <div className="relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
        {/* Work blocks */}
        {day.workBlocks.map((block) => (
          <BlockItem key={block.id} block={block} onClick={() => onBlockClick?.(block)} />
        ))}
      </div>
    </div>
  );
}

export default function WeekGridView({ weekDays, onBlockClick }: WeekGridViewProps) {
  const today = useMemo(() => new Date(), []);

  // Generate time labels
  const timeLabels = useMemo(() => {
    const labels: string[] = [];
    for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
      const date = new Date();
      date.setHours(hour, 0, 0, 0);
      labels.push(
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          hour12: true,
        })
      );
    }
    return labels;
  }, []);

  return (
    <div className="rounded-xl border border-stroke-subtle bg-canvas-overlay/50 overflow-hidden relative">
      <div className="flex relative">
        {/* Time column */}
        <div className="w-14 shrink-0 border-r border-stroke-subtle bg-canvas-overlay/50 relative z-10">
          {/* Header spacer - matches day column header height */}
          <div
            className="border-b border-stroke-subtle bg-canvas-base"
            style={{ height: HEADER_HEIGHT }}
          />

          {/* Time labels */}
          <div className="relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
            {timeLabels.map((label, idx) => (
              <div
                key={idx}
                className="absolute right-2 -translate-y-1/2 text-[10px] text-ink-tertiary"
                style={{ top: idx * HOUR_HEIGHT }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Day columns */}
        <div className="flex-1 flex overflow-x-auto">
          {weekDays.map((day) => {
            const isToday =
              day.date.getFullYear() === today.getFullYear() &&
              day.date.getMonth() === today.getMonth() &&
              day.date.getDate() === today.getDate();

            return (
              <DayColumn
                key={day.id}
                day={day}
                isToday={isToday}
                onBlockClick={(block) => onBlockClick?.(block, day)}
              />
            );
          })}
        </div>
      </div>

      {/* Hour grid lines (behind everything) */}
      <div
        className="absolute left-14 right-0 pointer-events-none"
        style={{ top: HEADER_HEIGHT, height: TOTAL_HOURS * HOUR_HEIGHT }}
      >
        {Array.from({ length: TOTAL_HOURS + 1 }).map((_, idx) => (
          <div
            key={idx}
            className="absolute left-0 right-0 border-t border-stroke-subtle/50"
            style={{ top: idx * HOUR_HEIGHT }}
          />
        ))}
      </div>
    </div>
  );
}
