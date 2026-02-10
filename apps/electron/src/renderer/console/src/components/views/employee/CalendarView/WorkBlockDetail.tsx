/**
 * WorkBlockDetail
 *
 * Expandable work block card showing summary, app breakdown, and captures.
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Coffee,
  Activity,
  BarChart3,
} from "lucide-react";
import type { WorkBlock } from "./types";
import CaptureTimeline from "./CaptureTimeline";

interface WorkBlockDetailProps {
  block: WorkBlock;
  blockNumber: number;
  defaultExpanded?: boolean;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatIdleGap(minutes: number | null): string | null {
  if (!minutes || minutes < 30) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}min break`;
  if (mins === 0) return `${hours}hr break`;
  return `${hours}hr ${mins}min break`;
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

export default function WorkBlockDetail({
  block,
  blockNumber,
  defaultExpanded = false,
}: WorkBlockDetailProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showCaptures, setShowCaptures] = useState(false);

  const idleGapLabel = formatIdleGap(block.idleGapBefore);
  const timeRange = `${formatTime(block.startTime)} - ${block.endTime ? formatTime(block.endTime) : "now"}`;

  return (
    <div className="group">
      {/* Idle gap indicator */}
      {idleGapLabel && (
        <div className="flex items-center gap-2 py-2 ml-6">
          <div className="w-px h-4 bg-stroke-subtle" />
          <Coffee size={12} className="text-ink-tertiary" />
          <span className="text-xs text-ink-tertiary">{idleGapLabel}</span>
          <div className="flex-1 h-px bg-stroke-subtle/50" />
        </div>
      )}

      {/* Block card */}
      <div
        className={`
          rounded-xl border transition-all duration-200
          ${
            block.isActive
              ? "border-emerald/30 bg-gradient-to-br from-emerald/5 to-canvas-overlay"
              : "border-stroke-subtle bg-canvas-overlay/50 hover:bg-canvas-overlay hover:border-stroke"
          }
        `}
      >
        {/* Header - always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-4 p-4 text-left"
        >
          {/* Expand indicator */}
          <div className="flex-shrink-0 text-ink-tertiary">
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </div>

          {/* Block number and time */}
          <div className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                Block {blockNumber}
              </span>
              {block.isActive && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald/20 text-emerald text-[10px] font-semibold uppercase tracking-wider">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald"></span>
                  </span>
                  Active
                </span>
              )}
            </div>
            <div className="text-sm text-ink-secondary mt-0.5 tabular-nums">
              {timeRange}
            </div>
          </div>

          {/* Summary preview */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink-primary line-clamp-2">{block.summary}</p>
          </div>

          {/* Duration */}
          <div className="flex-shrink-0 flex items-center gap-1.5 text-ink-secondary">
            <Clock size={14} />
            <span className="text-sm font-medium tabular-nums">
              {formatDuration(block.duration)}
            </span>
          </div>

          {/* Capture count */}
          <div className="flex-shrink-0 flex items-center gap-1.5 text-ink-tertiary">
            <Activity size={14} />
            <span className="text-sm tabular-nums">{block.captures.length}</span>
          </div>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-stroke-subtle">
            {/* App breakdown */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={14} className="text-ink-tertiary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                  App Breakdown
                </span>
              </div>

              {/* App bars */}
              <div className="space-y-2">
                {block.appBreakdown.map((app) => (
                  <div key={app.app} className="flex items-center gap-3">
                    {/* App indicator */}
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${getAppColor(app.app)}`}
                    />
                    {/* App name */}
                    <span className="w-20 flex-shrink-0 text-sm text-ink-secondary truncate">
                      {app.app}
                    </span>
                    {/* Progress bar */}
                    <div className="flex-1 h-2 bg-canvas-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${getAppColor(app.app)}`}
                        style={{ width: `${app.percentage}%` }}
                      />
                    </div>
                    {/* Duration */}
                    <span className="w-14 flex-shrink-0 text-xs text-ink-tertiary text-right tabular-nums">
                      {formatDuration(app.minutes)}
                    </span>
                    {/* Percentage */}
                    <span className="w-10 flex-shrink-0 text-xs text-ink-tertiary text-right tabular-nums">
                      {app.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Captures toggle */}
            <div className="border-t border-stroke-subtle">
              <button
                onClick={() => setShowCaptures(!showCaptures)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-canvas-muted/30 transition-colors"
              >
                <span className="text-sm text-ink-secondary">
                  {showCaptures ? "Hide" : "View"} capture timeline
                </span>
                <ChevronDown
                  size={16}
                  className={`text-ink-tertiary transition-transform ${
                    showCaptures ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Capture timeline */}
              {showCaptures && (
                <div className="border-t border-stroke-subtle max-h-80 overflow-y-auto">
                  <CaptureTimeline captures={block.captures} maxVisible={30} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
