import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useNudges } from "../../../../context/NudgesContext";
import { Badge } from "@/components/ui/badge";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks}w ago`;
  }
}

export default function NudgeDetail() {
  const { nudgeId } = useParams<{ nudgeId: string }>();
  const navigate = useNavigate();
  const { nudges } = useNudges();

  const nudge = nudges.find((n) => n.id === nudgeId);

  if (!nudge) {
    return (
      <div className="p-8">
        <button
          onClick={() => navigate("/nudges")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Nudges</span>
        </button>
        <p className="text-text-primary">Nudge not found</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={() => navigate("/nudges")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Nudges</span>
        </button>

        <div className="flex items-start gap-4">
          {/* Avatar with initials and online indicator */}
          <div className="relative flex-shrink-0">
            <div className="w-16 h-16 rounded-full bg-text-tertiary/20 flex items-center justify-center">
              <span className="text-white font-semibold text-lg">
                {getInitials(nudge.expertName)}
              </span>
            </div>
            {/* Online indicator dot */}
            <div
              className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-background-primary ${
                nudge.online ? "bg-status-success" : "bg-status-error"
              }`}
            />
          </div>

          {/* Expert info and status */}
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-text-primary mb-2">{nudge.expertName}</h1>
            <p className="text-text-secondary text-lg mb-2">{nudge.expertRole}</p>
            <div className="flex items-center gap-3">
              <Badge
                className={
                  nudge.status === "resolved"
                    ? "bg-status-success/20 text-status-success border-transparent hover:bg-status-success/20"
                    : "bg-status-warning/20 text-status-warning border-transparent hover:bg-status-warning/20"
                }
              >
                {nudge.status === "resolved" ? "Resolved" : "Waiting"}
              </Badge>
              <span className="text-text-secondary text-sm">
                {formatTimestamp(nudge.timestamp)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
        <h2 className="text-xl font-semibold text-text-primary">Escalation</h2>
        <p className="text-text-primary leading-relaxed">{nudge.description}</p>
      </div>

      {/* Context (if provided) */}
      {nudge.context && (
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6 space-y-4">
          <h2 className="text-xl font-semibold text-text-primary">Context Provided to Expert</h2>
          <p className="text-text-primary leading-relaxed">{nudge.context}</p>
        </div>
      )}

      {/* No context message */}
      {!nudge.context && (
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-6">
          <p className="text-text-secondary text-center py-8">
            No additional context was provided with this escalation
          </p>
        </div>
      )}
    </div>
  );
}
