/**
 * TimelineEntry
 *
 * Individual capture entry in the timeline.
 * Shows timestamp (local time) and semantic activity description.
 */

import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  Activity,
  Terminal,
  Code,
  Globe,
  FileText,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
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

function getActivityIcon(appName: string | null, activity: string | null) {
  const text = (appName + " " + activity).toLowerCase();

  if (text.includes("code") || text.includes("cursor") || text.includes("vs"))
    return <Code className="w-3.5 h-3.5" />;
  if (text.includes("terminal") || text.includes("warp") || text.includes("iterm"))
    return <Terminal className="w-3.5 h-3.5" />;
  if (text.includes("chrome") || text.includes("browser") || text.includes("safari"))
    return <Globe className="w-3.5 h-3.5" />;
  if (text.includes("notion") || text.includes("doc")) return <FileText className="w-3.5 h-3.5" />;

  return <Activity className="w-3.5 h-3.5" />;
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
      {!isLast && (
        <div className="absolute left-[15px] top-7 bottom-0 w-[1px] bg-border-subtle/50" />
      )}

      <div
        className={`flex items-start gap-3 group rounded-md p-1.5 -ml-1.5 transition-colors ${
          hasImage ? "hover:bg-background-tertiary/30 cursor-pointer" : ""
        }`}
        onClick={() => hasImage && setIsExpanded(!isExpanded)}
      >
        {/* Timestamp Column */}
        <div className="w-16 flex-shrink-0 pt-0.5 text-right">
          <span className="text-text-tertiary text-xs font-mono">
            {formatTime(capture.capturedAt)}
          </span>
        </div>

        {/* Icon Marker */}
        <div className="relative flex-shrink-0 mt-1">
          <div
            className={`w-5 h-5 rounded-full border border-border-default bg-background-elevated flex items-center justify-center text-text-tertiary ${isPending ? "animate-pulse" : ""}`}
          >
            {getActivityIcon(capture.appName, activityText)}
          </div>
        </div>

        {/* Content Column */}
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm ${isPending ? "text-text-tertiary italic" : "text-text-secondary"}`}
            >
              {isPending ? "Analyzing..." : activityText}
            </span>

            {hasImage && (
              <ImageIcon className="w-3 h-3 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>

          {/* Debug/Metadata info (optional, can be hidden in prod) */}
          {capture.confidence !== null && capture.confidence < 0.8 && capture.confidence > 0 && (
            <span className="text-[10px] text-text-tertiary mt-0.5 block">
              Low confidence: {Math.round(capture.confidence * 100)}%
            </span>
          )}
        </div>

        {/* Expand/Collapse Indicator */}
        {hasImage && (
          <div className="pt-1 text-text-tertiary opacity-0 group-hover:opacity-50">
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
        <div className="ml-[5.5rem] mt-2 mb-3">
          <div className="relative rounded bg-background-black border border-border-subtle overflow-hidden max-w-lg shadow-lg">
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-background-tertiary h-32">
                <Loader2 className="w-4 h-4 text-text-tertiary animate-spin" />
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
