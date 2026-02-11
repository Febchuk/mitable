/**
 * DayCard
 *
 * Day summary card for the week navigation header.
 * GitHub-style heatmap: darker green = more activity, white text for contrast.
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

// Activity level determines which shade of green to use
// Soft, transparent greens - dark text always for legibility
function getActivityBg(minutes: number): string {
  if (minutes === 0) return "bg-canvas-overlay/40";
  if (minutes < 60) return "bg-emerald/5";       // < 1h - whisper
  if (minutes < 180) return "bg-emerald/10";     // < 3h - hint
  if (minutes < 360) return "bg-emerald/20";     // < 6h - soft
  if (minutes < 480) return "bg-emerald/30";     // < 8h - medium
  return "bg-emerald/40";                         // 8h+ - full (still soft)
}

export default function DayCard({ day, isSelected, isToday, onClick }: DayCardProps) {
  const activityBg = getActivityBg(day.totalWorkTime);
  const hasActivity = day.totalWorkTime > 0;

  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center min-w-[72px] h-[80px] rounded-xl
        transition-all duration-200
        ${activityBg}
        ${
          isSelected
            ? "ring-2 ring-indigo ring-offset-2 ring-offset-canvas-base"
            : "hover:ring-1 hover:ring-stroke-subtle"
        }
      `}
    >
      {/* Today dot indicator */}
      {isToday && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo" />
      )}

      {/* Day name */}
      <span
        className={`text-[10px] font-semibold uppercase tracking-widest ${
          isSelected || isToday ? "text-indigo" : "text-ink-tertiary"
        }`}
      >
        {formatDayName(day.date)}
      </span>

      {/* Day number */}
      <span
        className={`text-2xl font-bold leading-none mt-1 ${
          isSelected || isToday ? "text-ink-primary" : hasActivity ? "text-ink-primary" : "text-ink-secondary"
        }`}
      >
        {formatDayNumber(day.date)}
      </span>

      {/* Duration */}
      <span
        className={`text-[10px] font-medium mt-1.5 tabular-nums ${
          hasActivity ? "text-ink-secondary" : "text-ink-tertiary/50"
        }`}
      >
        {hasActivity ? formatDuration(day.totalWorkTime) : "—"}
      </span>
    </button>
  );
}
