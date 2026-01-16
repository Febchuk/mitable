/**
 * TimelineEntry
 *
 * Individual capture entry in the timeline.
 * Shows timestamp, activity description, and expandable inline screenshot.
 */

import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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

  // Reset image loaded state when collapsed
  useEffect(() => {
    if (!isExpanded) {
      setImageLoaded(false);
    }
  }, [isExpanded]);

  const hasImage = !!capture.imageData;
  const activityText = capture.activityDescription || capture.windowTitle || "Activity captured";

  return (
    <div ref={entryRef} className={`relative ${!isLast ? "pb-3" : ""}`}>
      {/* Timeline connector line */}
      {!isLast && <div className="absolute left-[7px] top-6 bottom-0 w-[2px] bg-border-subtle" />}

      {/* Entry row */}
      <div
        className={`flex items-start gap-3 cursor-pointer group ${
          hasImage ? "hover:bg-background-tertiary/50" : ""
        } rounded-md p-1 -ml-1 transition-colors`}
        onClick={() => hasImage && setIsExpanded(!isExpanded)}
      >
        {/* Timeline dot */}
        <div className="relative flex-shrink-0 mt-1.5">
          <div className="w-4 h-4 rounded-full border-2 border-border-default bg-background-primary flex items-center justify-center">
            {hasImage &&
              (isExpanded ? (
                <ChevronDown className="w-2.5 h-2.5 text-text-tertiary" />
              ) : (
                <ChevronRight className="w-2.5 h-2.5 text-text-tertiary" />
              ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Timestamp */}
            <span className="text-text-tertiary text-xs font-mono flex-shrink-0">
              {formatTime(capture.capturedAt)}
            </span>

            {/* Confidence badge */}
            {capture.confidence !== null && capture.confidence > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-background-tertiary text-text-secondary">
                {Math.round(capture.confidence * 100)}%
              </span>
            )}
          </div>

          {/* Activity description */}
          <p className="text-text-secondary text-sm mt-0.5 line-clamp-2">{activityText}</p>

          {/* Window title if different from activity */}
          {capture.windowTitle &&
            capture.activityDescription &&
            capture.windowTitle !== capture.activityDescription && (
              <p className="text-text-tertiary text-xs mt-0.5 truncate">{capture.windowTitle}</p>
            )}
        </div>
      </div>

      {/* Expanded screenshot */}
      {isExpanded && hasImage && (
        <div className="ml-7 mt-2 mb-3">
          <div className="relative rounded-lg overflow-hidden border border-border-subtle bg-background-tertiary">
            {/* Loading skeleton */}
            {!imageLoaded && (
              <div className="absolute inset-0 animate-pulse bg-background-tertiary" />
            )}

            {/* Screenshot image */}
            <img
              src={capture.imageData!}
              alt={activityText}
              className={`w-full h-auto transition-opacity duration-200 ${
                imageLoaded ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setImageLoaded(true)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
