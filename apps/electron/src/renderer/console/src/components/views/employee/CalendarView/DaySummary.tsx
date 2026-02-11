/**
 * DaySummary
 *
 * Day summary with toggle between prose and list views.
 * Prose shows a paragraph summary, List shows bullet points with details.
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
  AlignLeft,
  List,
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

// Analyze day's captures for list summary
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
  const projectTime: Record<string, number> = {};
  let contextSwitchCount = 0;

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

      // Count context switches
      if (capture.isContextSwitch) {
        contextSwitchCount++;
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
    .slice(0, 3)
    .map(([name, data]) => ({ name, app: data.app }));

  // Top projects
  const topProjects = Object.entries(projectTime)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name, time]) => ({ name, minutes: Math.round(time) }));

  return { sortedActivities, topDocuments, topProjects, contextSwitchCount };
}

// Generate list items from analysis
function generateListItems(day: ActivityDay, analysis: ReturnType<typeof analyzeDayActivity>) {
  const items: { icon: typeof Code; color: string; bgColor: string; text: string }[] = [];

  // Work blocks summary
  const focusedBlocks = day.workBlocks.filter((b) => b.isFocusedSession);
  if (day.workBlocks.length > 0) {
    items.push({
      icon: Code,
      color: "text-indigo",
      bgColor: "bg-indigo/10",
      text: `${day.workBlocks.length} work block${day.workBlocks.length !== 1 ? "s" : ""} totaling ${formatDuration(day.totalWorkTime)}${focusedBlocks.length > 0 ? ` (${focusedBlocks.length} focused)` : ""}`,
    });
  }

  // Top activity
  if (analysis.sortedActivities.length > 0) {
    const top = analysis.sortedActivities[0];
    const config = activityConfig[top.type];
    items.push({
      icon: config.icon,
      color: config.color,
      bgColor: config.bgColor,
      text: `Primary activity: ${config.label} (${top.percentage}% of time, ${formatDuration(top.minutes)})`,
    });
  }

  // Secondary activities
  if (analysis.sortedActivities.length > 1) {
    const secondary = analysis.sortedActivities.slice(1, 3);
    const secondaryText = secondary
      .map((a) => `${activityConfig[a.type].label} ${a.percentage}%`)
      .join(", ");
    items.push({
      icon: MoreHorizontal,
      color: "text-ink-tertiary",
      bgColor: "bg-canvas-muted",
      text: `Also: ${secondaryText}`,
    });
  }

  // Top documents
  if (analysis.topDocuments.length > 0) {
    const docList = analysis.topDocuments.map((d) => d.name).join(", ");
    items.push({
      icon: FileText,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      text: `Key files: ${docList}`,
    });
  }

  // Projects
  if (analysis.topProjects.length > 0) {
    const projectList = analysis.topProjects
      .map((p) => `${p.name} (${formatDuration(p.minutes)})`)
      .join(", ");
    items.push({
      icon: Code,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
      text: `Projects: ${projectList}`,
    });
  }

  // Context switches
  if (analysis.contextSwitchCount > 0) {
    items.push({
      icon: MessageSquare,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
      text: `${analysis.contextSwitchCount} context switches between apps`,
    });
  }

  // Goals from focused sessions
  const goals = day.workBlocks.filter((b) => b.goal).map((b) => b.goal);
  if (goals.length > 0) {
    items.push({
      icon: Code,
      color: "text-indigo",
      bgColor: "bg-indigo/10",
      text: `Goals: ${goals.join("; ")}`,
    });
  }

  return items;
}

export default function DaySummary({ day }: DaySummaryProps) {
  const [viewMode, setViewMode] = useState<"prose" | "list">("prose");

  const analysis = useMemo(() => analyzeDayActivity(day.workBlocks), [day.workBlocks]);
  const listItems = useMemo(() => generateListItems(day, analysis), [day, analysis]);

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
        <div className="flex items-center gap-1 rounded-lg bg-canvas-muted p-0.5">
          <button
            onClick={() => setViewMode("prose")}
            className={`p-1.5 rounded transition-colors ${
              viewMode === "prose"
                ? "bg-canvas-overlay text-ink-primary shadow-sm"
                : "text-ink-tertiary hover:text-ink-secondary"
            }`}
            title="Prose view"
          >
            <AlignLeft size={14} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded transition-colors ${
              viewMode === "list"
                ? "bg-canvas-overlay text-ink-primary shadow-sm"
                : "text-ink-tertiary hover:text-ink-secondary"
            }`}
            title="List view"
          >
            <List size={14} />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-stroke-subtle bg-canvas-overlay/50 p-4">
        {viewMode === "prose" ? (
          /* Prose view - paragraph summary */
          <p className="text-sm text-ink-secondary leading-relaxed">
            {day.summary || "No summary available for this day."}
          </p>
        ) : (
          /* List view - bullet points with icons */
          <ul className="space-y-2.5">
            {listItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <li key={idx} className="flex items-start gap-3">
                  <div
                    className={`flex-shrink-0 p-1 rounded ${item.bgColor} ${item.color} mt-0.5`}
                  >
                    <Icon size={12} />
                  </div>
                  <span className="text-sm text-ink-secondary leading-relaxed">
                    {item.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
