import { useNudges } from "@/console/src/hooks/queries/nudges";
import { Badge } from "@/components/ui/badge";

interface NudgeDetailProps {
  nudgeId: string;
}

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

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
}

export default function NudgeDetail({ nudgeId }: NudgeDetailProps) {
  const { data: nudges = [] } = useNudges();

  const nudge = nudges.find((n) => n.id === nudgeId);

  if (!nudge) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0810]">
        <p className="text-text-secondary">Nudge not found</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0810] custom-scrollbar">
      <div className="max-w-4xl mx-auto p-8 space-y-6 app-no-drag">
        {/* Header */}
        <div className="space-y-4">

          <div className="flex items-start gap-4">
            {/* Avatar with initials and online indicator */}
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
                <span className="text-white font-semibold text-lg">
                  {getInitials(nudge.expertName)}
                </span>
              </div>
              {/* Online indicator dot */}
              <div
                className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[#0a0810] ${
                  nudge.online ? "bg-green-500" : "bg-gray-500"
                }`}
              />
            </div>

            {/* Expert info and status */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white mb-2">{nudge.expertName}</h1>
              <p className="text-text-secondary text-base mb-3">{nudge.expertRole}</p>
              <div className="flex items-center gap-3">
                <Badge
                  className={`text-sm ${
                    nudge.status === "resolved"
                      ? "bg-green-500/20 text-green-400"
                      : "bg-yellow-500/20 text-yellow-400"
                  }`}
                >
                  {nudge.status === "resolved" ? "✓ Resolved" : "⏱ Waiting"}
                </Badge>
                <span className="text-text-tertiary text-sm">
                  {formatTimestamp(nudge.timestamp)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="bg-[#1a1625] rounded-xl border border-primary/20 p-6 space-y-3 shadow-xl">
          <h2 className="text-lg font-semibold text-white">Escalation</h2>
          <p className="text-text-secondary leading-relaxed">{nudge.description}</p>
        </div>

        {/* Context (if provided) */}
        {nudge.context && (
          <div className="bg-[#1a1625] rounded-xl border border-primary/20 p-6 space-y-3 shadow-xl">
            <h2 className="text-lg font-semibold text-white">Context Provided to Expert</h2>
            <p className="text-text-secondary leading-relaxed">{nudge.context}</p>
          </div>
        )}

        {/* No context message */}
        {!nudge.context && (
          <div className="bg-[#1a1625] rounded-xl border border-primary/20 p-6">
            <p className="text-text-tertiary text-center py-8">
              No additional context was provided with this escalation
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
