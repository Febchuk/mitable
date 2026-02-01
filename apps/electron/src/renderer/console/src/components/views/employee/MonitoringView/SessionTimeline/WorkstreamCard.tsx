/**
 * WorkstreamCard
 *
 * Individual workstream card showing aggregated stats, apps used, and time ranges.
 */

import type { Workstream } from "./utils/types";
import { WORKSTREAM_COLOR_MAP } from "./utils/types";
import { formatDuration, formatTimeRange } from "./utils/formatDuration";

interface WorkstreamCardProps {
  workstream: Workstream;
  isSelected: boolean;
  isDimmed: boolean;
  onClick: () => void;
}

export default function WorkstreamCard({
  workstream,
  isSelected,
  isDimmed,
  onClick,
}: WorkstreamCardProps) {
  const colorClasses = WORKSTREAM_COLOR_MAP[workstream.color];

  // Build time ranges display (compact format)
  const timeRanges = workstream.segments
    .map((seg) => formatTimeRange(seg.startTime, seg.endTime))
    .join(", ");

  // Apps used (dot-separated)
  const appsDisplay = workstream.appsUsed.join(" · ");

  return (
    <div
      onClick={onClick}
      className={`
        p-4 rounded-lg border cursor-pointer
        transition-all duration-200 ease-out
        ${isSelected
          ? `border-2 ${colorClasses.border} bg-${workstream.color}-500/5`
          : "border-border-subtle bg-background-elevated"
        }
        ${isDimmed ? "opacity-30" : "opacity-100"}
        ${!isSelected && !isDimmed ? "hover:shadow-md hover:scale-[1.02]" : ""}
      `}
    >
      {/* Row 1: Color dot + Name */}
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-3 h-3 rounded-full ${colorClasses.bg}`} />
        <span className="font-medium text-text-primary truncate">
          {workstream.name}
        </span>
      </div>

      {/* Row 2: Total duration */}
      <div className="text-text-secondary text-sm mb-2">
        {formatDuration(workstream.totalDurationMinutes)} total
      </div>

      {/* Row 3: Apps used */}
      {appsDisplay && (
        <div
          className="text-xs text-text-tertiary truncate mb-1"
          title={appsDisplay}
        >
          {appsDisplay}
        </div>
      )}

      {/* Row 4: Time ranges */}
      <div
        className="text-xs text-text-tertiary truncate font-mono"
        title={timeRanges}
      >
        {timeRanges}
      </div>
    </div>
  );
}
