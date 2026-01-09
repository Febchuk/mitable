/**
 * TimelineGroup
 *
 * Expandable group of captures for a single application/time block.
 * Shows summary when collapsed, individual entries when expanded.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, Camera } from "lucide-react";
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
        className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-background-tertiary/50 transition-colors text-left"
      >
        {/* App icon */}
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="text-primary text-sm font-medium">
            {group.appName?.charAt(0).toUpperCase() || "?"}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* App name and badges row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-text-primary truncate">
              {group.appName || "Unknown App"}
            </span>

            {/* Duration badge */}
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-background-tertiary text-text-secondary">
              <Clock className="w-3 h-3" />
              {duration}
            </span>

            {/* Capture count badge */}
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-background-tertiary text-text-secondary">
              <Camera className="w-3 h-3" />
              {group.captureCount}
            </span>
          </div>

          {/* Time range */}
          <span className="text-text-tertiary text-xs font-mono mt-0.5 block">
            {timeRange}
          </span>

          {/* Dominant activity */}
          <p className="text-text-secondary text-sm mt-1 line-clamp-2">
            {group.dominantActivity}
          </p>
        </div>

        {/* Expand/collapse chevron */}
        <div className="flex-shrink-0 text-text-tertiary">
          {isExpanded ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </div>
      </button>

      {/* Expanded entries */}
      {isExpanded && (
        <div className="ml-6 mt-2 pl-4 border-l-2 border-border-subtle">
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
