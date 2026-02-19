/**
 * CaptureTimeline
 *
 * Rich activity timeline showing granular details of what was happening.
 * Displays context switches, activity descriptions, and document context.
 */

import { useState } from "react";
import {
  Monitor,
  Trash2,
  Eye,
  EyeOff,
  Clock,
  ArrowRight,
  Code,
  Globe,
  MessageSquare,
  Palette,
  FileText,
  Terminal,
  BookOpen,
  Video,
  MoreHorizontal,
  FolderOpen,
} from "lucide-react";
import type { Capture, ActivityType } from "./types";

interface CaptureTimelineProps {
  captures: Capture[];
  maxVisible?: number;
}

// Activity type icons and colors
const activityConfig: Record<
  ActivityType,
  { icon: typeof Code; color: string; bgColor: string; label: string }
> = {
  coding: {
    icon: Code,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    label: "Coding",
  },
  browsing: {
    icon: Globe,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    label: "Research",
  },
  communicating: {
    icon: MessageSquare,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    label: "Communication",
  },
  designing: {
    icon: Palette,
    color: "text-pink-400",
    bgColor: "bg-pink-500/10",
    label: "Design",
  },
  writing: {
    icon: FileText,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    label: "Writing",
  },
  reading: {
    icon: BookOpen,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    label: "Reading",
  },
  meeting: {
    icon: Video,
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    label: "Meeting",
  },
  terminal: {
    icon: Terminal,
    color: "text-gray-400",
    bgColor: "bg-gray-500/10",
    label: "Terminal",
  },
  other: {
    icon: MoreHorizontal,
    color: "text-gray-400",
    bgColor: "bg-gray-500/10",
    label: "Other",
  },
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatTimeShort(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

interface CaptureItemProps {
  capture: Capture;
  showContextSwitch?: boolean;
  onDelete?: () => void;
  onRestore?: () => void;
}

function CaptureItem({ capture, showContextSwitch, onDelete, onRestore }: CaptureItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const config = activityConfig[capture.activityType] || activityConfig.other;
  const Icon = config.icon;

  return (
    <div className="group">
      {/* Context switch indicator */}
      {showContextSwitch && capture.isContextSwitch && (
        <div className="flex items-center gap-2 py-2 px-4 ml-8">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-indigo/30 to-transparent" />
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo/10 border border-indigo/20">
            <ArrowRight size={10} className="text-indigo" />
            <span className="text-[10px] font-medium text-indigo uppercase tracking-wider">
              Switched from {capture.switchedFrom}
            </span>
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-indigo/30 to-transparent" />
        </div>
      )}

      {/* Main capture row */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          relative flex items-start gap-3 px-4 py-3 rounded-lg cursor-pointer
          transition-all duration-200
          ${capture.isDeleted ? "opacity-40" : "hover:bg-canvas-muted/50"}
        `}
      >
        {/* Time column */}
        <div className="w-20 flex-shrink-0 pt-0.5">
          <span className="text-xs text-ink-tertiary tabular-nums">
            {formatTime(capture.timestamp)}
          </span>
        </div>

        {/* Activity type icon */}
        <div className={`flex-shrink-0 p-1.5 rounded-lg ${config.bgColor} ${config.color}`}>
          <Icon size={14} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-1">
          {/* Activity description - primary info */}
          <p className="text-sm text-ink-primary leading-snug">{capture.activityDescription}</p>

          {/* Document and context - secondary info */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* App badge */}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-canvas-muted text-ink-secondary">
              {capture.appName}
            </span>

            {/* Document/file */}
            {capture.documentName && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-tertiary truncate max-w-[200px]">
                <FileText size={10} />
                {capture.documentName}
              </span>
            )}

            {/* Project context */}
            {capture.projectContext && (
              <span className="inline-flex items-center gap-1 text-xs text-ink-tertiary/70 truncate max-w-[150px]">
                <FolderOpen size={10} />
                {capture.projectContext}
              </span>
            )}
          </div>
        </div>

        {/* Thumbnail placeholder */}
        {capture.thumbnailUrl ? (
          <div className="w-20 h-12 rounded-lg bg-canvas-muted flex-shrink-0 overflow-hidden border border-stroke-subtle">
            <img src={capture.thumbnailUrl} alt="Capture" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-20 h-12 rounded-lg bg-canvas-muted/30 flex-shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border border-stroke-subtle/50">
            <Monitor size={16} className="text-ink-tertiary/30" />
          </div>
        )}

        {/* Actions */}
        {isHovered && (
          <div className="flex items-center gap-1 absolute right-2 top-2">
            {capture.isDeleted ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore?.();
                }}
                className="p-1.5 rounded hover:bg-emerald/20 text-ink-tertiary hover:text-emerald transition-colors"
                title="Restore capture"
              >
                <Eye size={14} />
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.();
                }}
                className="p-1.5 rounded hover:bg-red-500/20 text-ink-tertiary hover:text-red-400 transition-colors"
                title="Remove from summary"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Group captures by time segments (every 5 minutes)
interface CaptureGroup {
  startTime: Date;
  endTime: Date;
  captures: Capture[];
  primaryActivity: ActivityType;
  summary: string;
}

function groupCapturesByTime(captures: Capture[]): CaptureGroup[] {
  if (captures.length === 0) return [];

  const groups: CaptureGroup[] = [];
  let currentGroup: Capture[] = [];
  let groupStartTime = captures[0].timestamp;

  captures.forEach((capture) => {
    const timeSinceGroupStart = (capture.timestamp.getTime() - groupStartTime.getTime()) / 60000;

    // Start new group every 5 minutes or on context switch
    if (timeSinceGroupStart >= 5 || (capture.isContextSwitch && currentGroup.length > 0)) {
      if (currentGroup.length > 0) {
        const primaryActivity = getMostFrequentActivity(currentGroup);
        groups.push({
          startTime: groupStartTime,
          endTime: currentGroup[currentGroup.length - 1].timestamp,
          captures: currentGroup,
          primaryActivity,
          summary: currentGroup[0].activityDescription,
        });
      }
      currentGroup = [capture];
      groupStartTime = capture.timestamp;
    } else {
      currentGroup.push(capture);
    }
  });

  // Don't forget the last group
  if (currentGroup.length > 0) {
    const primaryActivity = getMostFrequentActivity(currentGroup);
    groups.push({
      startTime: groupStartTime,
      endTime: currentGroup[currentGroup.length - 1].timestamp,
      captures: currentGroup,
      primaryActivity,
      summary: currentGroup[0].activityDescription,
    });
  }

  return groups;
}

function getMostFrequentActivity(captures: Capture[]): ActivityType {
  const counts: Record<string, number> = {};
  captures.forEach((c) => {
    counts[c.activityType] = (counts[c.activityType] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as ActivityType;
}

// Grouped view component
interface CaptureGroupCardProps {
  group: CaptureGroup;
  isExpanded: boolean;
  onToggle: () => void;
}

function CaptureGroupCard({ group, isExpanded, onToggle }: CaptureGroupCardProps) {
  const config = activityConfig[group.primaryActivity] || activityConfig.other;
  const Icon = config.icon;
  const durationMinutes = Math.round((group.endTime.getTime() - group.startTime.getTime()) / 60000);

  return (
    <div className="border border-stroke-subtle rounded-lg overflow-hidden">
      {/* Group header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-canvas-muted/30 transition-colors"
      >
        {/* Time range */}
        <div className="w-32 flex-shrink-0 text-left">
          <span className="text-xs text-ink-tertiary tabular-nums">
            {formatTimeShort(group.startTime)} - {formatTimeShort(group.endTime)}
          </span>
        </div>

        {/* Activity icon */}
        <div className={`flex-shrink-0 p-1.5 rounded-lg ${config.bgColor} ${config.color}`}>
          <Icon size={14} />
        </div>

        {/* Summary */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm text-ink-primary truncate">{group.summary}</p>
          <p className="text-xs text-ink-tertiary mt-0.5">
            {group.captures.length} captures · {durationMinutes} min
          </p>
        </div>

        {/* Expand indicator */}
        <div className={`text-ink-tertiary transition-transform ${isExpanded ? "rotate-180" : ""}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {/* Expanded captures */}
      {isExpanded && (
        <div className="border-t border-stroke-subtle bg-canvas-muted/20">
          {group.captures.map((capture, idx) => (
            <CaptureItem
              key={capture.id}
              capture={capture}
              showContextSwitch={idx > 0}
              onDelete={() => console.log("Delete:", capture.id)}
              onRestore={() => console.log("Restore:", capture.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CaptureTimeline({ captures, maxVisible = 100 }: CaptureTimelineProps) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [viewMode, setViewMode] = useState<"grouped" | "detailed">("grouped");
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  // Filter out deleted unless showing them
  const visibleCaptures = showDeleted ? captures : captures.filter((c) => !c.isDeleted);

  const deletedCount = captures.filter((c) => c.isDeleted).length;

  // Group captures for grouped view
  const captureGroups = groupCapturesByTime(visibleCaptures);

  const toggleGroup = (index: number) => {
    const next = new Set(expandedGroups);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setExpandedGroups(next);
  };

  if (captures.length === 0) {
    return (
      <div className="py-8 text-center">
        <Clock size={24} className="mx-auto text-ink-tertiary/40 mb-2" />
        <p className="text-sm text-ink-tertiary">No captures in this block</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with view toggle and filters */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-tertiary">
            {visibleCaptures.length} capture{visibleCaptures.length !== 1 ? "s" : ""}
            {deletedCount > 0 && !showDeleted && (
              <span className="ml-1 text-ink-tertiary/50">({deletedCount} hidden)</span>
            )}
          </span>

          {/* View mode toggle */}
          <div className="flex items-center rounded-lg bg-canvas-muted p-0.5">
            <button
              onClick={() => setViewMode("grouped")}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                viewMode === "grouped"
                  ? "bg-canvas-overlay text-ink-primary shadow-sm"
                  : "text-ink-tertiary hover:text-ink-secondary"
              }`}
            >
              Grouped
            </button>
            <button
              onClick={() => setViewMode("detailed")}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                viewMode === "detailed"
                  ? "bg-canvas-overlay text-ink-primary shadow-sm"
                  : "text-ink-tertiary hover:text-ink-secondary"
              }`}
            >
              Detailed
            </button>
          </div>
        </div>

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

      {/* Content based on view mode */}
      {viewMode === "grouped" ? (
        <div className="space-y-2">
          {captureGroups.map((group, idx) => (
            <CaptureGroupCard
              key={idx}
              group={group}
              isExpanded={expandedGroups.has(idx)}
              onToggle={() => toggleGroup(idx)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-0.5">
          {visibleCaptures.slice(0, maxVisible).map((capture, idx) => (
            <CaptureItem
              key={capture.id}
              capture={capture}
              showContextSwitch={idx > 0}
              onDelete={() => console.log("Delete:", capture.id)}
              onRestore={() => console.log("Restore:", capture.id)}
            />
          ))}
          {visibleCaptures.length > maxVisible && (
            <div className="py-2 text-center">
              <span className="text-xs text-ink-tertiary">
                Showing {maxVisible} of {visibleCaptures.length} captures
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
