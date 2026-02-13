/**
 * SessionCard
 *
 * Displays a summary card for a monitoring session.
 */

import { Clock, Camera, Send, CheckCircle, AlertCircle, Pause, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SessionListItem } from "@/console/src/services/monitoringService";
import { formatDateWithWeekday, formatTime } from "@/console/src/lib/date";

interface SessionCardProps {
  session: SessionListItem;
  onClick: () => void;
}

function formatDate(dateString: string): string {
  return formatDateWithWeekday(dateString);
}

function getStatusBadge(status: string, deliveryStatus: string | null) {
  if (deliveryStatus === "delivered") {
    return (
      <Badge className="bg-status-success/20 text-status-success border-transparent hover:bg-status-success/20">
        <Send size={12} className="mr-1" />
        Delivered
      </Badge>
    );
  }

  switch (status) {
    case "active":
      return (
        <Badge className="bg-primary/20 text-primary border-transparent hover:bg-primary/20">
          <Play size={12} className="mr-1" />
          Active
        </Badge>
      );
    case "paused":
      return (
        <Badge className="bg-status-warning/20 text-status-warning border-transparent hover:bg-status-warning/20">
          <Pause size={12} className="mr-1" />
          Paused
        </Badge>
      );
    case "ended":
    case "ready":
      return (
        <Badge className="bg-text-secondary/20 text-text-secondary border-transparent hover:bg-text-secondary/20">
          <CheckCircle size={12} className="mr-1" />
          Ready
        </Badge>
      );
    case "summarizing":
      return (
        <Badge className="bg-primary/20 text-primary border-transparent hover:bg-primary/20 animate-pulse">
          <AlertCircle size={12} className="mr-1" />
          Summarizing
        </Badge>
      );
    default:
      return (
        <Badge className="bg-text-secondary/20 text-text-secondary border-transparent hover:bg-text-secondary/20">
          {status}
        </Badge>
      );
  }
}

export default function SessionCard({ session, onClick }: SessionCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-background-elevated rounded-lg border border-border-subtle p-6 hover:bg-background-elevated/80 transition-colors cursor-pointer space-y-4"
    >
      {/* Top: Title + Status Badge */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-text-primary font-semibold text-lg truncate">
            {session.name === "Work session" && session.status === "summarizing"
              ? "Generating title..."
              : session.name || "Untitled Session"}
          </h3>
          <p className="text-text-secondary text-sm">
            {formatDate(session.startedAt)} at {formatTime(session.startedAt)}
          </p>
        </div>
        {getStatusBadge(session.status, session.deliveryStatus)}
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2 text-text-secondary">
          <Clock size={16} />
          <span>{session.duration.formatted}</span>
        </div>
        <div className="flex items-center gap-2 text-text-secondary">
          <Camera size={16} />
          <span>{session.captureCount} captures</span>
        </div>
      </div>

      {/* Action Hint */}
      {session.status === "ready" && !session.deliveryStatus && (
        <p className="text-text-tertiary text-sm italic">Click to review and share summary</p>
      )}
    </div>
  );
}
