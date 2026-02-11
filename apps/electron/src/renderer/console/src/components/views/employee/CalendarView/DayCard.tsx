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
// Returns: [bgClass, needsLightText]
function getActivityStyle(minutes: number): { bg: string; light: boolean } {
  if (minutes === 0) return { bg: "bg-canvas-overlay/40", light: false };
  if (minutes < 60) return { bg: "bg-emerald-900/20", light: false };      // < 1h - subtle
  if (minutes < 180) return { bg: "bg-emerald-700/40", light: false };     // < 3h - light
  if (minutes < 360) return { bg: "bg-emerald-600/70", light: true };      // < 6h - medium
  if (minutes < 480) return { bg: "bg-emerald-600/90", light: true };      // < 8h - heavy
  return { bg: "bg-emerald-500", light: true };                             // 8h+ - vivid
}

export default function DayCard({ day, isSelected, isToday, onClick }: DayCardProps) {
  const { bg: activityBg, light: useLightText } = getActivityStyle(day.totalWorkTime);
  const hasActivity = day.totalWorkTime > 0;

  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center min-w-[72px] h-[80px] rounded-xl
        transition-all duration-200 group overflow-hidden
        ${activityBg}
        ${
          isSelected
            ? "ring-2 ring-indigo ring-offset-2 ring-offset-canvas-base"
            : "hover:ring-1 hover:ring-stroke-subtle"
        }
      `}
    >
      {/* Subtle inner glow for depth on active days */}
      {hasActivity && (
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Today dot indicator */}
        {isToday && (
          <div className={`absolute -top-2.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${
            useLightText ? "bg-white" : "bg-indigo"
          }`} />
        )}

        {/* Day name */}
        <span
          className={`text-[10px] font-semibold uppercase tracking-widest ${
            isSelected
              ? "text-indigo"
              : useLightText
                ? "text-white/70"
                : isToday
                  ? "text-indigo"
                  : "text-ink-tertiary"
          }`}
        >
          {formatDayName(day.date)}
        </span>

        {/* Day number - the hero */}
        <span
          className={`text-2xl font-bold leading-none mt-1 ${
            isSelected
              ? "text-ink-primary"
              : useLightText
                ? "text-white"
                : isToday
                  ? "text-ink-primary"
                  : hasActivity
                    ? "text-ink-primary"
                    : "text-ink-secondary"
          }`}
        >
          {formatDayNumber(day.date)}
        </span>

        {/* Duration */}
        <span
          className={`text-[10px] font-medium mt-1.5 tabular-nums ${
            useLightText
              ? "text-white/60"
              : hasActivity
                ? "text-ink-secondary"
                : "text-ink-tertiary/50"
          }`}
        >
          {hasActivity ? formatDuration(day.totalWorkTime) : "—"}
        </span>
      </div>
    </button>
  );
}
