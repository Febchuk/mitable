/**
 * TimelineEntry
 *
 * Individual capture entry in the timeline.
 * Shows timestamp (local time) and semantic activity description.
 */

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import type { SessionCapture } from "@/console/src/services/monitoringService";

interface TimelineEntryProps {
  capture: SessionCapture;
  isLast?: boolean;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function TimelineEntry({ capture, isLast = false }: TimelineEntryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const entryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isExpanded) setImageLoaded(false);
  }, [isExpanded]);

  const hasImage = !!capture.imageData;

  // Prefer the Classifier output, fallback to Sensor delta, then Window title
  const activityText =
    capture.activityDescription ||
    capture.deltaChangeDescription ||
    capture.windowTitle ||
    "Activity captured";

  // Visual style based on confidence/type
  const isPending = !capture.activityDescription && !capture.deltaChangeDescription;

  return (
    <div ref={entryRef} className={`relative ${!isLast ? "pb-2" : ""}`}>
      {/* Connector Line */}
      {!isLast && <div className="absolute left-[7px] top-6 bottom-0 w-px bg-stroke-subtle/50" />}

      <div
        className={`flex items-start gap-3 group rounded-lg p-1.5 -ml-1.5 transition-colors ${
          hasImage ? "hover:bg-canvas-muted/30 cursor-pointer" : ""
        }`}
        onClick={() => hasImage && setIsExpanded(!isExpanded)}
      >
        {/* Timestamp Column */}
        <div className="w-14 flex-shrink-0 pt-0.5 text-right">
          <span className="text-ink-tertiary text-xs tabular-nums">
            {formatTime(capture.capturedAt)}
          </span>
        </div>

        {/* Dot Marker */}
        <div className="relative flex-shrink-0 mt-1.5">
          <div
            className={`w-3 h-3 rounded-full border border-stroke bg-canvas-overlay ${isPending ? "animate-pulse" : ""}`}
          />
        </div>

        {/* Content Column */}
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm ${isPending ? "text-ink-tertiary italic" : "text-ink-secondary"}`}
            >
              {isPending ? "Analyzing..." : activityText}
            </span>

            {hasImage && (
              <span className="text-xs text-ink-tertiary opacity-0 group-hover:opacity-100 transition-opacity">
                view
              </span>
            )}
          </div>

          {/* Debug/Metadata info (optional, can be hidden in prod) */}
          {capture.confidence !== null && capture.confidence < 0.8 && capture.confidence > 0 && (
            <span className="text-[10px] text-ink-tertiary mt-0.5 block tabular-nums">
              Low confidence: {Math.round(capture.confidence * 100)}%
            </span>
          )}
        </div>

        {/* Expand/Collapse Indicator */}
        {hasImage && (
          <div className="pt-1 text-ink-tertiary opacity-0 group-hover:opacity-50">
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </div>
        )}
      </div>

      {/* Expanded Screenshot */}
      {isExpanded && hasImage && (
        <div className="ml-[4.5rem] mt-2 mb-3">
          <div className="relative rounded-xl bg-canvas-base border border-stroke-subtle overflow-hidden max-w-lg shadow-lg">
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-canvas-muted h-32">
                <Loader2 className="w-4 h-4 text-ink-tertiary animate-spin" />
              </div>
            )}
            <img
              src={capture.imageData!}
              alt="Screen capture"
              className={`w-full h-auto transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setImageLoaded(true)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
