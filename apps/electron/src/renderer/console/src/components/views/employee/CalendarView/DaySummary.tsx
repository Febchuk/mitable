/**
 * DaySummary
 *
 * Day summary with toggle between brief and detailed views.
 * Shows activity breakdown, key documents, and timeline in detailed mode.
 */

import { useState, useMemo } from "react";
import {
  Code,
  Globe,
  MessageSquare,
  Palette,
  FileText,
  Terminal,
  BookOpen,
  Video,
  MoreHorizontal,
  ArrowRight,
  FolderOpen,
  TrendingUp,
} from "lucide-react";
import type { ActivityDay, ActivityType, WorkBlock } from "./types";

interface DaySummaryProps {
  day: ActivityDay;
}

// Activity type config
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

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Analyze day's captures for detailed summary
function analyzeDayActivity(blocks: WorkBlock[]) {
  const activityTime: Record<ActivityType, number> = {
    coding: 0,
    browsing: 0,
    communicating: 0,
    designing: 0,
    writing: 0,
    reading: 0,
    meeting: 0,
    terminal: 0,
    other: 0,
  };

  const documentFrequency: Record<string, { count: number; app: string }> = {};
  const contextSwitches: { time: Date; from: string; to: string }[] = [];
  const projectTime: Record<string, number> = {};

  blocks.forEach((block) => {
    block.captures.forEach((capture) => {
      // Count activity time (each capture represents ~30 seconds)
      activityTime[capture.activityType] = (activityTime[capture.activityType] || 0) + 0.5;

      // Track document frequency
      if (capture.documentName) {
        if (!documentFrequency[capture.documentName]) {
          documentFrequency[capture.documentName] = { count: 0, app: capture.appName };
        }
        documentFrequency[capture.documentName].count++;
      }

      // Track project time
      if (capture.projectContext) {
        projectTime[capture.projectContext] = (projectTime[capture.projectContext] || 0) + 0.5;
      }

      // Track context switches
      if (capture.isContextSwitch && capture.switchedFrom) {
        contextSwitches.push({
          time: capture.timestamp,
          from: capture.switchedFrom,
          to: capture.appName,
        });
      }
    });
  });

  // Sort activities by time
  const sortedActivities = Object.entries(activityTime)
    .filter(([, time]) => time > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, time]) => ({
      type: type as ActivityType,
      minutes: Math.round(time),
      percentage: Math.round((time / Object.values(activityTime).reduce((a, b) => a + b, 0)) * 100),
    }));

  // Top documents
  const topDocuments = Object.entries(documentFrequency)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([name, data]) => ({ name, app: data.app, count: data.count }));

  // Top projects
  const topProjects = Object.entries(projectTime)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, time]) => ({ name, minutes: Math.round(time) }));

  // Sample context switches (first 5)
  const sampleSwitches = contextSwitches.slice(0, 8);

  return { sortedActivities, topDocuments, topProjects, sampleSwitches, totalSwitches: contextSwitches.length };
}

export default function DaySummary({ day }: DaySummaryProps) {
  const [viewMode, setViewMode] = useState<"brief" | "detailed">("brief");

  const analysis = useMemo(() => analyzeDayActivity(day.workBlocks), [day.workBlocks]);

  if (day.workBlocks.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
          Day Summary
        </h3>
        <div className="flex items-center rounded-lg bg-canvas-muted p-0.5">
          <button
            onClick={() => setViewMode("brief")}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === "brief"
                ? "bg-canvas-overlay text-ink-primary shadow-sm"
                : "text-ink-tertiary hover:text-ink-secondary"
            }`}
          >
            Brief
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

      {viewMode === "brief" ? (
        /* Brief view - just the summary text */
        <div className="rounded-xl border border-stroke-subtle bg-canvas-overlay/50 p-4">
          <p className="text-sm text-ink-secondary leading-relaxed">
            {day.summary || "No summary available for this day."}
          </p>
        </div>
      ) : (
        /* Detailed view - full breakdown */
        <div className="rounded-xl border border-stroke-subtle bg-canvas-overlay/50 overflow-hidden">
          {/* Summary text */}
          <div className="p-4 border-b border-stroke-subtle">
            <p className="text-sm text-ink-secondary leading-relaxed">
              {day.summary || "No summary available for this day."}
            </p>
          </div>

          {/* Activity breakdown */}
          <div className="p-4 border-b border-stroke-subtle">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-ink-tertiary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                Activity Breakdown
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {analysis.sortedActivities.slice(0, 6).map((activity) => {
                const config = activityConfig[activity.type];
                const Icon = config.icon;
                return (
                  <div
                    key={activity.type}
                    className="flex items-center gap-3 p-2 rounded-lg bg-canvas-muted/50"
                  >
                    <div className={`p-1.5 rounded-lg ${config.bgColor} ${config.color}`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-ink-primary">
                          {config.label}
                        </span>
                        <span className="text-xs text-ink-tertiary tabular-nums">
                          {activity.percentage}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-canvas-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${config.bgColor.replace("/10", "")}`}
                            style={{ width: `${activity.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-ink-tertiary tabular-nums w-10 text-right">
                          {formatDuration(activity.minutes)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Key documents */}
          {analysis.topDocuments.length > 0 && (
            <div className="p-4 border-b border-stroke-subtle">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={14} className="text-ink-tertiary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                  Key Documents
                </span>
              </div>
              <div className="space-y-2">
                {analysis.topDocuments.map((doc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-canvas-muted text-ink-secondary">
                      {doc.app}
                    </span>
                    <span className="flex-1 text-ink-primary truncate">{doc.name}</span>
                    <span className="text-xs text-ink-tertiary tabular-nums">
                      {doc.count} times
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {analysis.topProjects.length > 0 && (
            <div className="p-4 border-b border-stroke-subtle">
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen size={14} className="text-ink-tertiary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                  Projects
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.topProjects.map((project, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-canvas-muted/50 border border-stroke-subtle/50"
                  >
                    <span className="text-sm text-ink-primary">{project.name}</span>
                    <span className="text-xs text-ink-tertiary tabular-nums">
                      {formatDuration(project.minutes)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Context switches timeline */}
          {analysis.sampleSwitches.length > 0 && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ArrowRight size={14} className="text-ink-tertiary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                    Context Switches
                  </span>
                </div>
                <span className="text-xs text-ink-tertiary">
                  {analysis.totalSwitches} total
                </span>
              </div>
              <div className="space-y-2">
                {analysis.sampleSwitches.map((sw, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="w-16 text-ink-tertiary tabular-nums flex-shrink-0">
                      {formatTime(sw.time)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-canvas-muted text-ink-secondary font-medium">
                      {sw.from}
                    </span>
                    <ArrowRight size={10} className="text-ink-tertiary" />
                    <span className="px-1.5 py-0.5 rounded bg-canvas-muted text-ink-secondary font-medium">
                      {sw.to}
                    </span>
                  </div>
                ))}
                {analysis.totalSwitches > analysis.sampleSwitches.length && (
                  <p className="text-xs text-ink-tertiary/70 mt-2">
                    + {analysis.totalSwitches - analysis.sampleSwitches.length} more switches
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
