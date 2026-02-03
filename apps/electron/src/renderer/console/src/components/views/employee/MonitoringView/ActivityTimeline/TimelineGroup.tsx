/**
 * TimelineGroup
 *
 * Expandable group of captures for a single application/time block.
 * Shows summary when collapsed, individual entries when expanded.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { TimelineGroup as TimelineGroupType } from "@/console/src/hooks/useTimelineTransform";
import TimelineEntry from "./TimelineEntry";

interface TimelineGroupProps {
  group: TimelineGroupType;
  isLast?: boolean;
}

function formatTimeRange(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  // If start and end are the same (single capture), just show start time
  if (start.getTime() === end.getTime()) {
    return formatTime(start);
  }

  return `${formatTime(start)} - ${formatTime(end)}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export default function TimelineGroup({ group, isLast = false }: TimelineGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const timeRange = formatTimeRange(group.startTime, group.endTime);
  const duration = formatDuration(group.durationMinutes);

  return (
    <div className={`${!isLast ? "mb-4" : ""}`}>
      {/* Group header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-canvas-muted/50 transition-colors text-left"
      >
        {/* App initial */}
        <div className="w-9 h-9 rounded-full bg-indigo/10 flex items-center justify-center flex-shrink-0">
          <span className="text-indigo text-sm font-medium">
            {group.appName?.charAt(0).toUpperCase() || "?"}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* App name and metadata row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-medium text-ink-primary truncate">
              {group.appName || "Unknown App"}
            </span>
            <span className="text-xs text-ink-tertiary tabular-nums">{duration}</span>
            <span className="text-xs text-ink-tertiary tabular-nums">
              {group.captureCount} captures
            </span>
          </div>

          {/* Time range */}
          <span className="text-ink-tertiary text-xs tabular-nums mt-0.5 block">{timeRange}</span>

          {/* Dominant activity */}
          <p className="text-ink-secondary text-sm mt-1 line-clamp-2">{group.dominantActivity}</p>
        </div>

        {/* Expand/collapse chevron */}
        <div className="flex-shrink-0 text-ink-tertiary">
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {/* Expanded entries */}
      {isExpanded && (
        <div className="ml-6 mt-2 pl-4 border-l border-stroke-subtle">
          {group.captures.map((capture, index) => (
            <TimelineEntry
              key={capture.id}
              capture={capture}
              isLast={index === group.captures.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
