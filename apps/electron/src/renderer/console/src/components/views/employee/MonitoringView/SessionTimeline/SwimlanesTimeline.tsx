/**
 * SwimlanesTimeline
 *
 * Layer 2: Visual timeline with one horizontal lane per workstream.
 * Shows time segments with colors matching workstream assignments.
 */

import { useMemo, useState } from "react";
import type { Workstream } from "./utils/types";
import { WORKSTREAM_COLOR_MAP } from "./utils/types";
import {
  getTimelinePosition,
  getTimelineWidth,
  generateTimeLabels,
  formatTimeRange,
  formatDuration,
} from "./utils/formatDuration";

interface SwimlanesTimelineProps {
  workstreams: Workstream[];
  sessionStartTime: string;
  sessionEndTime: string;
  selectedWorkstreamId: string | null;
  onSegmentClick: (workstreamId: string) => void;
  className?: string;
}

export default function SwimlanesTimeline({
  workstreams,
  sessionStartTime,
  sessionEndTime,
  selectedWorkstreamId,
  onSegmentClick,
  className = "",
}: SwimlanesTimelineProps) {
  const [hoveredSegment, setHoveredSegment] = useState<{
    workstreamId: string;
    segmentIndex: number;
    x: number;
    y: number;
  } | null>(null);

  // Generate time labels for the axis
  const timeLabels = useMemo(() => {
    return generateTimeLabels(sessionStartTime, sessionEndTime, 6);
  }, [sessionStartTime, sessionEndTime]);

  return (
    <div className={`relative ${className}`}>
      {/* Time axis labels */}
      <div className="relative h-6 mb-2 ml-[100px] sm:ml-[140px]">
        {timeLabels.map((label, index) => (
          <span
            key={index}
            className="absolute text-xs text-ink-tertiary tabular-nums transform -translate-x-1/2"
            style={{ left: `${label.position}%` }}
          >
            {label.time}
          </span>
        ))}
      </div>

      {/* Swimlanes */}
      <div className="space-y-2">
        {workstreams.map((workstream) => (
          <SwimlaneRow
            key={workstream.id}
            workstream={workstream}
            sessionStartTime={sessionStartTime}
            sessionEndTime={sessionEndTime}
            isSelected={selectedWorkstreamId === workstream.id}
            isDimmed={selectedWorkstreamId !== null && selectedWorkstreamId !== workstream.id}
            onClick={() => onSegmentClick(workstream.id)}
            onHover={(segmentIndex, x, y) => {
              if (segmentIndex !== null) {
                setHoveredSegment({ workstreamId: workstream.id, segmentIndex, x, y });
              } else {
                setHoveredSegment(null);
              }
            }}
          />
        ))}
      </div>

      {/* Tooltip */}
      {hoveredSegment && (
        <SegmentTooltip
          workstream={workstreams.find((w) => w.id === hoveredSegment.workstreamId)!}
          segmentIndex={hoveredSegment.segmentIndex}
          x={hoveredSegment.x}
          y={hoveredSegment.y}
        />
      )}
    </div>
  );
}

interface SwimlaneRowProps {
  workstream: Workstream;
  sessionStartTime: string;
  sessionEndTime: string;
  isSelected: boolean;
  isDimmed: boolean;
  onClick: () => void;
  onHover: (segmentIndex: number | null, x: number, y: number) => void;
}

function SwimlaneRow({
  workstream,
  sessionStartTime,
  sessionEndTime,
  isSelected,
  isDimmed,
  onClick,
  onHover,
}: SwimlaneRowProps) {
  const colorClasses = WORKSTREAM_COLOR_MAP[workstream.color];

  return (
    <div
      className={`flex items-center gap-3 transition-opacity duration-200 ${
        isDimmed ? "opacity-30" : "opacity-100"
      }`}
    >
      {/* Workstream label */}
      <div
        className="w-[80px] sm:w-[120px] flex-shrink-0 truncate text-sm font-medium text-ink-primary"
        title={workstream.name}
      >
        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${colorClasses.bg}`} />
        {workstream.name}
      </div>

      {/* Timeline lane */}
      <div
        className="flex-1 h-8 relative bg-canvas-muted/30 rounded-md cursor-pointer"
        onClick={onClick}
      >
        {workstream.segments.map((segment, index) => {
          const left = getTimelinePosition(segment.startTime, sessionStartTime, sessionEndTime);
          const width = getTimelineWidth(
            segment.startTime,
            segment.endTime,
            sessionStartTime,
            sessionEndTime
          );

          return (
            <div
              key={index}
              className={`absolute top-1 bottom-1 rounded-md transition-all duration-150 ${
                colorClasses.bg
              } ${isSelected ? "ring-2 ring-white/50" : ""}`}
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 1)}%`,
              }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                onHover(index, rect.left + rect.width / 2, rect.top);
              }}
              onMouseLeave={() => onHover(null, 0, 0)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface SegmentTooltipProps {
  workstream: Workstream;
  segmentIndex: number;
  x: number;
  y: number;
}

function SegmentTooltip({ workstream, segmentIndex, x, y }: SegmentTooltipProps) {
  const segment = workstream.segments[segmentIndex];
  if (!segment) return null;

  return (
    <div
      className="fixed z-50 bg-canvas-raised border border-stroke-subtle rounded-lg shadow-lg px-3 py-2 text-sm pointer-events-none transform -translate-x-1/2 -translate-y-full -mt-2"
      style={{ left: x, top: y }}
    >
      <div className="font-medium text-ink-primary">{workstream.name}</div>
      <div className="text-ink-secondary tabular-nums">
        {formatTimeRange(segment.startTime, segment.endTime)}
      </div>
      <div className="text-ink-tertiary text-xs tabular-nums">
        {formatDuration(segment.durationMinutes)}
      </div>
    </div>
  );
}
