/**
 * ActivityLogList
 *
 * Activity list with timestamps and app names for the detail panel.
 */

import {
  Code2,
  Terminal,
  Globe,
  MessageSquare,
  Video,
  Palette,
  FolderOpen,
  Circle,
} from "lucide-react";
import type { SessionCapture } from "@/console/src/services/monitoringService";
import { getActivityType, type ActivityType } from "./utils/types";
import { formatTimeShort, getDurationMinutes } from "./utils/formatDuration";

interface ActivityLogListProps {
  captures: SessionCapture[];
  className?: string;
}

const ACTIVITY_ICONS: Record<ActivityType, React.ReactNode> = {
  code: <Code2 className="w-4 h-4" />,
  terminal: <Terminal className="w-4 h-4" />,
  browser: <Globe className="w-4 h-4" />,
  communication: <MessageSquare className="w-4 h-4" />,
  meeting: <Video className="w-4 h-4" />,
  design: <Palette className="w-4 h-4" />,
  file: <FolderOpen className="w-4 h-4" />,
  unknown: <Circle className="w-4 h-4" />,
};

export default function ActivityLogList({
  captures,
  className = "",
}: ActivityLogListProps) {
  // Sort captures by time
  const sortedCaptures = [...captures].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
  );

  // Deduplicate consecutive similar activities
  const activities = deduplicateActivities(sortedCaptures);

  if (activities.length === 0) {
    return (
      <div className={`text-center py-4 text-text-secondary text-sm ${className}`}>
        No activity recorded
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="text-sm font-medium text-text-secondary mb-3">Activity Log</div>
      <div className="space-y-0 border-l-2 border-border-subtle ml-2 pl-4">
        {activities.map((activity, index) => (
          <ActivityLogEntry key={index} activity={activity} />
        ))}
      </div>
    </div>
  );
}

interface ActivityEntry {
  timestamp: string;
  description: string;
  appName: string | null;
  activityType: ActivityType;
  durationMinutes?: number;
}

function deduplicateActivities(captures: SessionCapture[]): ActivityEntry[] {
  const activities: ActivityEntry[] = [];
  let lastActivity: string | null = null;
  let lastEntry: ActivityEntry | null = null;

  for (let i = 0; i < captures.length; i++) {
    const capture = captures[i];
    const description =
      capture.activityDescription || capture.deltaChangeDescription || `Working in ${capture.appName || "app"}`;

    // Skip if same as last activity
    if (description === lastActivity && lastEntry) {
      // Update duration if we have a next capture
      if (i + 1 < captures.length) {
        const duration = getDurationMinutes(lastEntry.timestamp, captures[i + 1].capturedAt);
        lastEntry.durationMinutes = Math.round(duration);
      }
      continue;
    }

    const entry: ActivityEntry = {
      timestamp: capture.capturedAt,
      description,
      appName: capture.appName,
      activityType: getActivityType(capture.appName, capture.windowTitle),
    };

    // Calculate duration to next activity
    if (i + 1 < captures.length) {
      const duration = getDurationMinutes(capture.capturedAt, captures[i + 1].capturedAt);
      if (duration >= 1) {
        entry.durationMinutes = Math.round(duration);
      }
    }

    activities.push(entry);
    lastActivity = description;
    lastEntry = entry;
  }

  return activities;
}

interface ActivityLogEntryProps {
  activity: ActivityEntry;
}

function ActivityLogEntry({ activity }: ActivityLogEntryProps) {
  const icon = ACTIVITY_ICONS[activity.activityType];

  return (
    <div className="flex items-start gap-3 py-2 group">
      {/* Timeline dot */}
      <div className="relative -ml-[1.125rem] mt-1">
        <div className="w-2 h-2 rounded-full bg-text-tertiary group-hover:bg-primary transition-colors" />
      </div>

      {/* Timestamp */}
      <span className="text-xs font-mono text-text-tertiary w-12 flex-shrink-0 mt-0.5">
        {formatTimeShort(activity.timestamp)}
      </span>

      {/* Icon */}
      <span className="text-text-tertiary mt-0.5">{icon}</span>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <span className="text-sm text-text-primary">
          {activity.description}
        </span>
        {activity.durationMinutes && activity.durationMinutes >= 1 && (
          <span className="text-xs text-text-tertiary ml-2">
            ({activity.durationMinutes}m)
          </span>
        )}
        {activity.appName && (
          <span className="block text-xs text-text-tertiary mt-0.5">
            {activity.appName}
          </span>
        )}
      </div>
    </div>
  );
}
