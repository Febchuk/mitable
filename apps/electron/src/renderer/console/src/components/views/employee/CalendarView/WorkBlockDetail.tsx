/**
 * WorkBlockDetail
 *
 * Expandable work block card showing summary, app breakdown, and captures.
 * Supports block status display and recap actions.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { marked } from "marked";
import DOMPurify from "dompurify";

/** Metadata-like patterns to skip when building a preview */
const METADATA_RE =
  /^(session metadata|date:|start time:|end time:|duration:|total activities recorded:|context &|---)/i;

/** Extract a clean 1-2 sentence preview, skipping metadata preambles */
function extractPreview(text: string): string {
  // Strip markdown formatting first
  const plain = text
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .trim();

  // Split into segments (paragraphs, dash-separated, or bullet items)
  const segments = plain
    .split(/\n{2,}|\n|(?:\s—\s)/)
    .map((s) => s.replace(/^[•·]\s*/, "").trim())
    .filter((s) => s.length > 20 && !METADATA_RE.test(s));

  if (segments.length === 0) {
    // Fallback: just clean up and truncate the whole thing
    const fallback = plain.replace(/\n/g, " ").replace(/\s{2,}/g, " ");
    return fallback.length > 160 ? fallback.slice(0, 157) + "..." : fallback;
  }

  // Take the first meaningful segment, truncate if needed
  const preview = segments[0];
  return preview.length > 160 ? preview.slice(0, 157) + "..." : preview;
}
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Coffee,
  BarChart3,
  Target,
  MoreVertical,
  FileText,
  Trash2,
  Loader2,
  Send,
  Pause,
} from "lucide-react";
import type { WorkBlock } from "./types";
import TaskBreakdownSection from "../../../shared/TaskBreakdownSection";
import { useBlockDetail } from "../../../../hooks/queries/calendar";
import { useDeleteSession } from "../../../../hooks/queries/monitoring";

interface WorkBlockDetailProps {
  block: WorkBlock;
  blockNumber: number;
  defaultExpanded?: boolean;
  onDelete?: (blockId: string) => void;
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

// Dynamic app color palette — assigns a consistent color per app name
const APP_COLOR_PALETTE = [
  "bg-blue-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-emerald-500",
  "bg-indigo-500",
  "bg-cyan-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-violet-500",
  "bg-lime-500",
];

function getAppColor(appName: string): string {
  let hash = 0;
  for (let i = 0; i < appName.length; i++) {
    hash = appName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return APP_COLOR_PALETTE[Math.abs(hash) % APP_COLOR_PALETTE.length];
}

// Status badge colors
function getStatusColor(status: WorkBlock["status"]): { bg: string; text: string } {
  const colors: Record<WorkBlock["status"], { bg: string; text: string }> = {
    active: { bg: "bg-emerald/20", text: "text-emerald" },
    paused: { bg: "bg-amber/20", text: "text-amber" },
    ended: { bg: "bg-gray-500/20", text: "text-ink-tertiary" },
    summarizing: { bg: "bg-indigo/20", text: "text-indigo" },
    ready: { bg: "bg-cyan/20", text: "text-cyan" },
    delivered: { bg: "bg-violet/20", text: "text-violet" },
  };
  return colors[status] || colors.ended;
}

export default function WorkBlockDetail({
  block,
  blockNumber,
  defaultExpanded = false,
  onDelete,
}: WorkBlockDetailProps) {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch full block details (includes summary) on demand
  const { data: blockDetail, isLoading: isLoadingDetail } = useBlockDetail(block.id, {
    enabled: isExpanded,
  });

  // Delete mutation
  const deleteSession = useDeleteSession();

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const idleGapLabel = formatIdleGap(block.idleGapBefore);
  const timeRange = `${formatTime(block.startTime)} - ${block.endTime ? formatTime(block.endTime) : "now"}`;

  // Get summary from block detail if available
  const displaySummary =
    blockDetail?.finalSummary || blockDetail?.rawActivitySummary || block.summary;

  // Render markdown summary to sanitized HTML
  const renderedSummaryHtml = useMemo(() => {
    if (!displaySummary) return "";
    const result = marked.parse(displaySummary);
    return typeof result === "string" ? DOMPurify.sanitize(result) : "";
  }, [displaySummary]);

  // Handle creating a recap from this block
  const handleCreateRecap = () => {
    const dateStr = block.startTime.toISOString().split("T")[0];
    navigate(`/recaps/new?blocks=${block.id}&date=${dateStr}`);
    setShowMenu(false);
  };

  // Handle deleting this block
  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this block?")) return;
    try {
      await deleteSession.mutateAsync(block.id);
      onDelete?.(block.id);
    } catch (error) {
      console.error("Failed to delete block:", error);
    }
    setShowMenu(false);
  };

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
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsExpanded(!isExpanded)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsExpanded(!isExpanded);
            }
          }}
          className="w-full flex items-center gap-4 p-4 text-left cursor-pointer"
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
            <div className="text-sm text-ink-secondary mt-0.5 tabular-nums">{timeRange}</div>
          </div>

          {/* Summary preview */}
          <div className="flex-1 min-w-0">
            {block.goal && (
              <div className="flex items-center gap-1.5 mb-1">
                <Target size={12} className="text-indigo" />
                <span className="text-xs font-medium text-indigo">{block.goal}</span>
              </div>
            )}
            <p className="text-sm text-ink-primary line-clamp-2">
              {displaySummary ? extractPreview(displaySummary) : "No summary yet"}
            </p>
          </div>

          {/* Duration */}
          <div className="flex-shrink-0 flex items-center gap-1.5 text-ink-secondary">
            <Clock size={14} />
            <span className="text-sm font-medium tabular-nums">
              {formatDuration(block.duration)}
            </span>
          </div>

          {/* Status badge */}
          {block.status && block.status !== "ended" && (
            <div
              className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${getStatusColor(block.status).bg} ${getStatusColor(block.status).text}`}
            >
              {block.status === "active" && (
                <span className="flex items-center gap-1">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald"></span>
                  </span>
                  Active
                </span>
              )}
              {block.status === "paused" && (
                <span className="flex items-center gap-1">
                  <Pause size={10} />
                  Paused
                </span>
              )}
              {block.status === "summarizing" && (
                <span className="flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" />
                  Summarizing
                </span>
              )}
              {block.status === "ready" && "Ready"}
              {block.status === "delivered" && (
                <span className="flex items-center gap-1">
                  <Send size={10} />
                  Delivered
                </span>
              )}
            </div>
          )}

          {/* Block menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1.5 rounded-lg hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary transition-colors opacity-0 group-hover:opacity-100"
            >
              <MoreVertical size={16} />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-xl border border-stroke-subtle bg-canvas-overlay shadow-xl overflow-hidden z-50">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCreateRecap();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-canvas-muted transition-colors"
                >
                  <FileText size={14} className="text-indigo" />
                  <span className="text-sm text-ink-primary">Create Recap</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete();
                  }}
                  disabled={deleteSession.isPending}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-canvas-muted transition-colors border-t border-stroke-subtle text-rose disabled:opacity-50"
                >
                  {deleteSession.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  <span className="text-sm">Delete Block</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-stroke-subtle">
            {/* Task Breakdown (structured) or fallback to markdown summary */}
            {block.taskBreakdown && block.taskBreakdown.length > 0 ? (
              <TaskBreakdownSection
                tasks={block.taskBreakdown}
                totalDuration={block.duration}
                isLoading={isLoadingDetail}
                className="border-b border-stroke-subtle"
              />
            ) : displaySummary || isLoadingDetail ? (
              <div className="p-4 border-b border-stroke-subtle">
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={14} className="text-ink-tertiary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                    Summary
                  </span>
                  {isLoadingDetail && (
                    <Loader2 size={12} className="text-ink-tertiary animate-spin" />
                  )}
                </div>
                <div
                  className="text-sm text-ink-secondary leading-relaxed prose prose-sm prose-invert max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: displaySummary ? renderedSummaryHtml : "<p>Loading...</p>",
                  }}
                />
              </div>
            ) : null}

            {/* Create Recap action */}
            {block.status !== "active" && block.status !== "paused" && (
              <div className="px-4 py-3 border-b border-stroke-subtle">
                <button
                  onClick={handleCreateRecap}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-indigo/30 bg-indigo/5 text-indigo text-sm font-medium hover:bg-indigo/10 transition-colors"
                >
                  <FileText size={14} />
                  Create Recap from this block
                </button>
              </div>
            )}

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
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getAppColor(app.app)}`} />
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
          </div>
        )}
      </div>
    </div>
  );
}
