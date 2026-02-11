/**
 * DayCard
 *
 * Day summary card for the week navigation header.
 * Uses GitHub-style heatmap with green shading based on activity level.
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
  if (minutes === 0) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h`;
}

// GitHub-style activity levels (5 levels like contribution graph)
// Returns opacity value for the green overlay
function getActivityOpacity(minutes: number): number {
  if (minutes === 0) return 0;
  if (minutes < 60) return 0.1;   // < 1h - barely visible
  if (minutes < 180) return 0.2;  // < 3h - light
  if (minutes < 360) return 0.35; // < 6h - medium
  if (minutes < 480) return 0.5;  // < 8h - heavy
  return 0.65;                     // 8h+ - max intensity
}

export default function DayCard({ day, isSelected, isToday, onClick }: DayCardProps) {
  const activityOpacity = getActivityOpacity(day.totalWorkTime);
  const hasActivity = day.totalWorkTime > 0;

  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center min-w-[72px] h-[80px] rounded-xl
        transition-all duration-200 group overflow-hidden
        ${
          isSelected
            ? "border-2 border-indigo shadow-lg shadow-indigo/10"
            : "border border-stroke-subtle/50 hover:border-stroke-subtle"
        }
      `}
    >
      {/* Activity heatmap background layer */}
      <div
        className="absolute inset-0 bg-emerald transition-opacity duration-200"
        style={{ opacity: isSelected ? activityOpacity * 0.7 : activityOpacity }}
      />

      {/* Base background (shows through when no activity) */}
      {!hasActivity && (
        <div className="absolute inset-0 bg-canvas-overlay/30" />
      )}

      {/* Content layer */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Today indicator */}
        {isToday && !isSelected && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-indigo" />
        )}

        {/* Day name */}
        <span
          className={`text-xs font-medium uppercase tracking-wider ${
            isSelected
              ? "text-indigo"
              : isToday
                ? "text-indigo"
                : hasActivity
                  ? "text-emerald-900/70"
                  : "text-ink-tertiary"
          }`}
        >
          {formatDayName(day.date)}
        </span>

        {/* Day number */}
        <span
          className={`text-xl font-semibold mt-0.5 ${
            isSelected
              ? "text-ink-primary"
              : hasActivity
                ? "text-emerald-900"
                : isToday
                  ? "text-ink-primary"
                  : "text-ink-secondary"
          }`}
        >
          {formatDayNumber(day.date)}
        </span>

        {/* Duration label */}
        <span
          className={`text-[10px] font-medium mt-1 tabular-nums ${
            hasActivity ? "text-emerald-900/60" : "text-ink-tertiary/40"
          }`}
        >
          {hasActivity ? formatDuration(day.totalWorkTime) : "—"}
        </span>
      </div>
    </button>
  );
}
