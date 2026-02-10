/**
 * CaptureTimeline
 *
 * Timeline of captures within a work block.
 * Shows app activity over time with thumbnails when available.
 */

import { useState } from "react";
import { Monitor, Trash2, Eye, EyeOff, Clock } from "lucide-react";
import type { Capture } from "./types";

interface CaptureTimelineProps {
  captures: Capture[];
  maxVisible?: number;
}

// App icon colors
const appColors: Record<string, string> = {
  "VS Code": "bg-blue-500",
  Chrome: "bg-amber-500",
  Slack: "bg-purple-500",
  Figma: "bg-pink-500",
  Terminal: "bg-gray-600",
  Notion: "bg-gray-800",
  Safari: "bg-blue-400",
  Discord: "bg-indigo-500",
};

function getAppColor(appName: string): string {
  return appColors[appName] || "bg-gray-500";
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface CaptureItemProps {
  capture: Capture;
  onDelete?: () => void;
  onRestore?: () => void;
}

function CaptureItem({ capture, onDelete, onRestore }: CaptureItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        group relative flex items-center gap-3 px-3 py-2 rounded-lg
        transition-all duration-200
        ${capture.isDeleted ? "opacity-40" : "hover:bg-canvas-muted/50"}
      `}
    >
      {/* Time */}
      <span className="w-16 flex-shrink-0 text-xs text-ink-tertiary tabular-nums">
        {formatTime(capture.timestamp)}
      </span>

      {/* App indicator */}
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 ${getAppColor(capture.appName)}`}
      />

      {/* App name */}
      <span className="w-20 flex-shrink-0 text-sm font-medium text-ink-secondary truncate">
        {capture.appName}
      </span>

      {/* Window title */}
      <span className="flex-1 min-w-0 text-sm text-ink-tertiary truncate">
        {capture.windowTitle}
      </span>

      {/* Thumbnail placeholder */}
      {capture.thumbnailUrl ? (
        <div className="w-16 h-10 rounded bg-canvas-muted flex-shrink-0 overflow-hidden">
          <img
            src={capture.thumbnailUrl}
            alt="Capture"
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-16 h-10 rounded bg-canvas-muted/30 flex-shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Monitor size={14} className="text-ink-tertiary/50" />
        </div>
      )}

      {/* Actions */}
      {isHovered && (
        <div className="flex items-center gap-1">
          {capture.isDeleted ? (
            <button
              onClick={onRestore}
              className="p-1.5 rounded hover:bg-emerald/20 text-ink-tertiary hover:text-emerald transition-colors"
              title="Restore capture"
            >
              <EyeOff size={14} />
            </button>
          ) : (
            <button
              onClick={onDelete}
              className="p-1.5 rounded hover:bg-red-500/20 text-ink-tertiary hover:text-red-400 transition-colors"
              title="Remove from summary"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function CaptureTimeline({
  captures,
  maxVisible = 50,
}: CaptureTimelineProps) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Filter out deleted unless showing them
  const visibleCaptures = showDeleted
    ? captures
    : captures.filter((c) => !c.isDeleted);

  // Limit to maxVisible unless expanded
  const displayedCaptures = expanded
    ? visibleCaptures
    : visibleCaptures.slice(0, maxVisible);

  const hasMore = visibleCaptures.length > maxVisible && !expanded;
  const deletedCount = captures.filter((c) => c.isDeleted).length;

  if (captures.length === 0) {
    return (
      <div className="py-8 text-center">
        <Clock size={24} className="mx-auto text-ink-tertiary/40 mb-2" />
        <p className="text-sm text-ink-tertiary">No captures in this block</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header with filters */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-ink-tertiary">
          {visibleCaptures.length} capture{visibleCaptures.length !== 1 ? "s" : ""}
          {deletedCount > 0 && !showDeleted && (
            <span className="ml-1 text-ink-tertiary/50">
              ({deletedCount} hidden)
            </span>
          )}
        </span>
        {deletedCount > 0 && (
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            className="flex items-center gap-1 text-xs text-ink-tertiary hover:text-ink-secondary transition-colors"
          >
            {showDeleted ? <EyeOff size={12} /> : <Eye size={12} />}
            {showDeleted ? "Hide removed" : "Show removed"}
          </button>
        )}
      </div>

      {/* Capture list */}
      <div className="space-y-0.5">
        {displayedCaptures.map((capture) => (
          <CaptureItem
            key={capture.id}
            capture={capture}
            onDelete={() => {
              // In real app, would call API to soft delete
              console.log("Delete capture:", capture.id);
            }}
            onRestore={() => {
              // In real app, would call API to restore
              console.log("Restore capture:", capture.id);
            }}
          />
        ))}
      </div>

      {/* Show more */}
      {hasMore && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full py-2 text-center text-xs text-indigo hover:text-indigo/80 transition-colors"
        >
          Show {visibleCaptures.length - maxVisible} more captures
        </button>
      )}
    </div>
  );
}
