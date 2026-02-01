/**
 * SessionStats
 *
 * Layer 1: At-a-glance metrics for the entire session.
 * Shows Total Time, Deep Work, Interruptions, and Longest Focus.
 */

import { Clock, Brain, AlertTriangle, Target } from "lucide-react";
import type { SessionStats as SessionStatsType } from "./utils/types";
import { formatDuration } from "./utils/formatDuration";

interface SessionStatsProps {
  stats: SessionStatsType;
  className?: string;
}

export default function SessionStats({ stats, className = "" }: SessionStatsProps) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className}`}>
      {/* Total Time */}
      <StatCard
        icon={<Clock className="w-5 h-5" />}
        label="Total Time"
        value={formatDuration(stats.totalTimeMinutes)}
        iconColor="text-text-secondary"
      />

      {/* Deep Work */}
      <StatCard
        icon={<Brain className="w-5 h-5" />}
        label="Deep Work"
        value={formatDuration(stats.deepWorkMinutes)}
        subValue={`${stats.deepWorkPercent}%`}
        iconColor="text-violet-500"
        valueColor="text-violet-400"
      />

      {/* Interruptions */}
      <StatCard
        icon={<AlertTriangle className="w-5 h-5" />}
        label="Interruptions"
        value={String(stats.interruptionCount)}
        subValue={stats.interruptionMinutes > 0 ? formatDuration(stats.interruptionMinutes) : undefined}
        iconColor="text-amber-500"
      />

      {/* Longest Focus */}
      <StatCard
        icon={<Target className="w-5 h-5" />}
        label="Longest Focus"
        value={formatDuration(stats.longestFocusMinutes)}
        subValue={stats.longestFocusWorkstream || undefined}
        iconColor="text-emerald-500"
        valueColor="text-emerald-400"
      />
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  iconColor?: string;
  valueColor?: string;
}

function StatCard({
  icon,
  label,
  value,
  subValue,
  iconColor = "text-text-secondary",
  valueColor = "text-text-primary",
}: StatCardProps) {
  return (
    <div className="bg-background-elevated rounded-lg border border-border-subtle p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={iconColor}>{icon}</span>
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <div className={`text-2xl font-mono font-semibold ${valueColor}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-text-tertiary mt-1 truncate" title={subValue}>
          {subValue}
        </div>
      )}
    </div>
  );
}
