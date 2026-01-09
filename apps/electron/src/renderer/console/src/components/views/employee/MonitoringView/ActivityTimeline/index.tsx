/**
 * ActivityTimeline
 *
 * Main container component for the session activity timeline.
 * Fetches captures, transforms them into groups, and renders the timeline.
 */

import { useState } from "react";
import { History, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useSessionCaptures } from "@/console/src/hooks/queries/monitoring";
import { useTimelineTransform } from "@/console/src/hooks/useTimelineTransform";
import TimelineGroup from "./TimelineGroup";

interface ActivityTimelineProps {
  sessionId: string;
  className?: string;
}

export default function ActivityTimeline({ sessionId, className = "" }: ActivityTimelineProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Fetch captures
  const { data: captures, isLoading, error } = useSessionCaptures(sessionId);

  // Transform into grouped timeline
  const timeline = useTimelineTransform(captures);

  // Don't render if no captures
  if (!isLoading && (!captures || captures.length === 0)) {
    return null;
  }

  return (
    <div className={`bg-background-elevated rounded-lg border border-border-subtle ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between p-4 hover:bg-background-tertiary/30 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-text-secondary" />
          <h3 className="text-lg font-semibold text-text-primary">Activity Timeline</h3>
          {timeline && (
            <span className="text-sm text-text-tertiary">
              ({timeline.totalCaptures} captures)
            </span>
          )}
        </div>
        <div className="text-text-tertiary">
          {isCollapsed ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <ChevronUp className="w-5 h-5" />
          )}
        </div>
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="px-4 pb-4">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-text-tertiary animate-spin" />
              <span className="ml-2 text-text-secondary">Loading timeline...</span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="text-center py-8">
              <p className="text-text-secondary">Failed to load timeline</p>
            </div>
          )}

          {/* Timeline groups */}
          {timeline && timeline.groups.length > 0 && (
            <div className="mt-2">
              {timeline.groups.map((group, index) => (
                <TimelineGroup
                  key={group.id}
                  group={group}
                  isLast={index === timeline.groups.length - 1}
                />
              ))}
            </div>
          )}

          {/* Empty state (has captures but no groups - shouldn't happen) */}
          {timeline && timeline.groups.length === 0 && captures && captures.length > 0 && (
            <div className="text-center py-8">
              <p className="text-text-secondary">No activity groups found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
