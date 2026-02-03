/**
 * SessionStats
 *
 * Layer 1: At-a-glance metrics for the entire session.
 * Clean text-based stats without decorative icons.
 */

import type { SessionStats as SessionStatsType } from "./utils/types";
import { formatDuration } from "./utils/formatDuration";

interface SessionStatsProps {
  stats: SessionStatsType;
  className?: string;
}

export default function SessionStats({ stats, className = "" }: SessionStatsProps) {
  return (
    <div className={`flex flex-wrap items-center gap-x-8 gap-y-3 py-3 border-b border-stroke-subtle ${className}`}>
      {/* Total Time */}
      <StatItem
        label="Total Time"
        value={formatDuration(stats.totalTimeMinutes)}
      />

      {/* Deep Work */}
      <StatItem
        label="Deep Work"
        value={formatDuration(stats.deepWorkMinutes)}
        subValue={`${stats.deepWorkPercent}%`}
        accent
      />

      {/* Interruptions */}
      <StatItem
        label="Interruptions"
        value={String(stats.interruptionCount)}
        subValue={stats.interruptionMinutes > 0 ? formatDuration(stats.interruptionMinutes) : undefined}
      />

      {/* Longest Focus */}
      <StatItem
        label="Longest Focus"
        value={formatDuration(stats.longestFocusMinutes)}
        subValue={stats.longestFocusWorkstream || undefined}
      />
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: string;
  subValue?: string;
  accent?: boolean;
}

function StatItem({ label, value, subValue, accent }: StatItemProps) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-sm text-ink-tertiary">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${accent ? "text-indigo" : "text-ink-primary"}`}>
        {value}
      </span>
      {subValue && (
        <span className="text-xs text-ink-tertiary">({subValue})</span>
      )}
    </div>
  );
}
