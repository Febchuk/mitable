/**
 * SessionRow
 *
 * Horizontal session item for the timeline list.
 * Minimal design with status stripe accent.
 */

import { CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import type { SessionListItem } from "@/console/src/services/monitoringService";

interface SessionRowProps {
  session: SessionListItem;
  onClick: () => void;
  style?: CSSProperties;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Get status config for visual treatment
function getStatusConfig(status: string, deliveryStatus: string | null) {
  if (deliveryStatus === "delivered") {
    return {
      bgClass: "bg-emerald",
      textClass: "text-emerald",
      label: "Delivered",
    };
  }

  switch (status) {
    case "active":
      return {
        bgClass: "bg-indigo",
        textClass: "text-indigo",
        label: "Active",
        pulse: true,
      };
    case "paused":
      return {
        bgClass: "bg-amber-500",
        textClass: "text-amber-500",
        label: "Paused",
      };
    case "summarizing":
      return {
        bgClass: "bg-indigo",
        textClass: "text-indigo",
        label: "Processing",
      };
    case "ended":
    case "ready":
      return {
        bgClass: "bg-ink-tertiary",
        textClass: "text-ink-secondary",
        label: "Ready",
      };
    default:
      return {
        bgClass: "bg-ink-tertiary",
        textClass: "text-ink-tertiary",
        label: status,
      };
  }
}

export default function SessionRow({ session, onClick, style }: SessionRowProps) {
  const statusConfig = getStatusConfig(session.status, session.deliveryStatus);

  return (
    <div
      onClick={onClick}
      style={style}
      className="group relative flex items-center gap-4 px-4 py-3.5 rounded-xl bg-canvas-overlay/50 border border-transparent cursor-pointer transition-all duration-200 hover:bg-canvas-overlay hover:border-stroke-subtle animate-reveal-up"
    >
      {/* Status Stripe */}
      <div
        className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${statusConfig.bgClass} ${
          statusConfig.pulse ? "animate-pulse" : ""
        }`}
      />

      {/* Time */}
      <span className="w-20 flex-shrink-0 pl-2 text-sm tabular-nums text-ink-secondary">
        {formatTime(session.startedAt)}
      </span>

      {/* Session Title */}
      <h4 className="flex-1 min-w-0 text-[15px] font-medium text-ink-primary truncate group-hover:text-white transition-colors">
        {session.name === "Work session" && session.status === "summarizing"
          ? "Generating title..."
          : session.name || "Untitled Session"}
      </h4>

      {/* Duration + Captures - Text only, no icons */}
      <span className="text-sm text-ink-tertiary tabular-nums">{session.duration.formatted}</span>
      <span className="text-sm text-ink-tertiary tabular-nums w-16">
        {session.captureCount} caps
      </span>

      {/* Status */}
      <span
        className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.textClass} bg-current/10`}
      >
        {statusConfig.label}
      </span>

      {/* Arrow */}
      <ChevronRight
        size={16}
        className="text-ink-tertiary opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
      />
    </div>
  );
}
