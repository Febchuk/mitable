/**
 * SegmentDetailPanel
 *
 * Layer 4: Expandable detail panel with screenshot carousel and activity log.
 */

import { useRef, useEffect } from "react";
import { X } from "lucide-react";
import type { Workstream } from "./utils/types";
import { WORKSTREAM_COLOR_MAP } from "./utils/types";
import { formatTimeRange, formatDuration } from "./utils/formatDuration";
import ScreenshotCarousel from "./ScreenshotCarousel";
import ActivityLogList from "./ActivityLogList";

interface SegmentDetailPanelProps {
  workstream: Workstream | null;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export default function SegmentDetailPanel({
  workstream,
  isOpen,
  onClose,
  className = "",
}: SegmentDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Scroll into view when opened
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!workstream || !isOpen) {
    return null;
  }

  const colorClasses = WORKSTREAM_COLOR_MAP[workstream.color];

  // Build overall time range from all segments
  const firstSegment = workstream.segments[0];
  const lastSegment = workstream.segments[workstream.segments.length - 1];
  const overallTimeRange = firstSegment && lastSegment
    ? formatTimeRange(firstSegment.startTime, lastSegment.endTime)
    : "";

  return (
    <div
      ref={panelRef}
      className={`
        bg-background-elevated rounded-lg border border-border-subtle
        overflow-hidden
        animate-in slide-in-from-top-2 duration-250
        ${className}
      `}
      style={{
        borderLeftWidth: "4px",
        borderLeftColor: `var(--${workstream.color}-500, #8B5CF6)`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border-subtle">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${colorClasses.bg}`} />
            <h3 className="text-lg font-semibold text-text-primary">
              {workstream.name}
            </h3>
          </div>
          <div className="text-sm text-text-secondary mt-1">
            {overallTimeRange}
            <span className="mx-2">·</span>
            {formatDuration(workstream.totalDurationMinutes)}
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-background-tertiary text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Close detail panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Screenshot Carousel - 60% width on large screens */}
          <div className="lg:col-span-3">
            <ScreenshotCarousel captures={workstream.captures} />
          </div>

          {/* Activity Log - 40% width on large screens */}
          <div className="lg:col-span-2">
            <ActivityLogList captures={workstream.captures} />
          </div>
        </div>

        {/* Apps used */}
        {workstream.appsUsed.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border-subtle">
            <div className="text-xs text-text-tertiary">
              Apps: {workstream.appsUsed.join(" · ")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
