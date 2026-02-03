/**
 * ActivityLogList
 *
 * Activity list with timestamps for the detail panel.
 * Clean design with minimal visual noise.
 */

import type { SessionCapture } from "@/console/src/services/monitoringService";
import { getActivityType, type ActivityType } from "./utils/types";
import { formatTimeShort, getDurationMinutes } from "./utils/formatDuration";

interface ActivityLogListProps {
  captures: SessionCapture[];
  className?: string;
}

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
      <div className={`text-center py-4 text-ink-tertiary text-sm ${className}`}>
        No activity recorded
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="text-xs font-medium text-ink-tertiary uppercase tracking-wider mb-3">
        Activity
      </div>
      <div className="space-y-0 border-l border-stroke-subtle ml-1 pl-4">
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
  return (
    <div className="flex items-start gap-3 py-2 group">
      {/* Timeline dot */}
      <div className="relative -ml-[1.0625rem] mt-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-stroke group-hover:bg-indigo transition-colors" />
      </div>

      {/* Timestamp */}
      <span className="text-xs text-ink-tertiary w-10 flex-shrink-0 tabular-nums mt-0.5">
        {formatTimeShort(activity.timestamp)}
      </span>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <span className="text-sm text-ink-primary">
          {activity.description}
        </span>
        {activity.durationMinutes && activity.durationMinutes >= 1 && (
          <span className="text-xs text-ink-tertiary ml-2 tabular-nums">
            {activity.durationMinutes}m
          </span>
        )}
        {activity.appName && (
          <span className="block text-xs text-ink-tertiary mt-0.5">
            {activity.appName}
          </span>
        )}
      </div>
    </div>
  );
}
