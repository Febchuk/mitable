/**
 * DayCard
 *
 * Day summary card for the week navigation header.
 * Shows date, total work time, and activity indicator.
 */

import type { ActivityDay } from "./types";

interface DayCardProps {
  day: ActivityDay;
  isSelected: boolean;
  isToday: boolean;
  onClick: () => void;
}

function formatDayName(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function formatDayNumber(date: Date): string {
  return date.getDate().toString();
}

function formatDuration(minutes: number): string {
  if (minutes === 0) return "-";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// Activity level based on work time
function getActivityLevel(minutes: number): "none" | "light" | "medium" | "heavy" {
  if (minutes === 0) return "none";
  if (minutes < 180) return "light"; // < 3h
  if (minutes < 360) return "medium"; // < 6h
  return "heavy"; // 6h+
}

export default function DayCard({ day, isSelected, isToday, onClick }: DayCardProps) {
  const activityLevel = getActivityLevel(day.totalWorkTime);
  const hasActivity = day.totalWorkTime > 0;

  // Check for active/paused/summarizing blocks
  const hasActiveBlock = day.workBlocks.some(
    (b) => b.status === "active" || b.isActive
  );
  const hasPausedBlock = day.workBlocks.some((b) => b.status === "paused");
  const hasSummarizingBlock = day.workBlocks.some((b) => b.status === "summarizing");

  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center min-w-[72px] h-[80px] rounded-xl
        transition-all duration-200 group
        ${
          isSelected
            ? "bg-indigo/20 border-2 border-indigo shadow-lg shadow-indigo/10"
            : "bg-canvas-overlay/50 border border-transparent hover:bg-canvas-overlay hover:border-stroke-subtle"
        }
      `}
    >
      {/* Today indicator */}
      {isToday && !isSelected && (
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-indigo" />
      )}

      {/* Day name */}
      <span
        className={`text-xs font-medium uppercase tracking-wider ${
          isSelected ? "text-indigo" : isToday ? "text-indigo" : "text-ink-tertiary"
        }`}
      >
        {formatDayName(day.date)}
      </span>

      {/* Day number */}
      <span
        className={`text-xl font-semibold mt-0.5 ${
          isSelected ? "text-ink-primary" : isToday ? "text-ink-primary" : "text-ink-secondary"
        }`}
      >
        {formatDayNumber(day.date)}
      </span>

      {/* Activity indicator / duration */}
      <div className="mt-1 flex items-center gap-1">
        {hasActivity ? (
          <>
            {/* Status-aware activity dot */}
            {hasActiveBlock ? (
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald"></span>
              </div>
            ) : hasPausedBlock ? (
              <div className="w-2 h-2 rounded-full bg-amber" />
            ) : hasSummarizingBlock ? (
              <div className="w-2 h-2 rounded-full bg-indigo animate-pulse" />
            ) : (
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  activityLevel === "heavy"
                    ? "bg-emerald"
                    : activityLevel === "medium"
                      ? "bg-amber-400"
                      : "bg-ink-tertiary"
                }`}
              />
            )}
            <span className="text-[10px] text-ink-tertiary font-medium tabular-nums">
              {formatDuration(day.totalWorkTime)}
            </span>
          </>
        ) : (
          <span className="text-[10px] text-ink-tertiary/50">-</span>
        )}
      </div>
    </button>
  );
}
