import { ExpertMatch, SuggestedNudge } from "../types";

interface ExpertsCardProps {
  experts: ExpertMatch[];
  suggestedNudge?: SuggestedNudge;
  conversationId: string;
}

export default function ExpertsCard({
  experts,
  suggestedNudge,
  conversationId,
}: ExpertsCardProps) {
  // Defensive: Filter out malformed experts and log warnings
  const validExperts = experts.filter((expert) => {
    if (!expert?.expert) {
      console.warn("[ExpertsCard] Malformed expert object (missing 'expert' property):", expert);
      return false;
    }
    if (!expert.expert.id || !expert.expert.name) {
      console.warn("[ExpertsCard] Malformed expert object (missing required fields):", expert);
      return false;
    }
    return true;
  });

  console.log(`[ExpertsCard] Rendering ${validExperts.length} of ${experts.length} experts`);

  const handleNudge = (expert: ExpertMatch) => {
    console.log("[ExpertsCard] Creating nudge for expert:", expert.expert.name);

    // Send IPC to open Console with pre-filled nudge form
    window.conversationAPI.openNudgeForm({
      expert: {
        id: expert.expert.id,
        name: expert.expert.name,
        email: expert.expert.email,
        role: expert.expert.role,
        department: expert.expert.department,
        expertise: expert.expertise.topics,
      },
      context: suggestedNudge?.context || "",
      question: suggestedNudge?.question || "",
      conversationId: conversationId,
    });
  };

  const getMatchScoreColor = (score: number) => {
    if (score > 0.8) return "bg-green-500/20 text-green-500";
    if (score > 0.6) return "bg-yellow-500/20 text-yellow-500";
    return "bg-gray-500/20 text-gray-500";
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="bg-background-secondary rounded-lg p-4 space-y-3">
      <h3 className="text-text-primary font-semibold text-sm">
        💬 Experts who can help:
      </h3>

      {validExperts.length === 0 ? (
        <div className="text-text-secondary text-sm p-4 text-center">
          No experts found. Please check the system logs for details.
        </div>
      ) : (
        <div className="space-y-2">
          {validExperts.map((expert) => (
          <div
            key={expert.expert.id}
            className="flex items-center gap-3 p-3 bg-background-elevated rounded-lg border border-border-subtle hover:border-border-primary transition-colors"
          >
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
              {expert.expert.avatarUrl ? (
                <img
                  src={expert.expert.avatarUrl}
                  alt={expert.expert.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                getInitials(expert.expert.name)
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-text-primary font-medium truncate text-sm">
                  {expert.expert.name}
                </p>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${getMatchScoreColor(
                    expert.matchScore
                  )}`}
                >
                  {(expert.matchScore * 100).toFixed(0)}% match
                </span>
              </div>
              <p className="text-text-secondary text-xs truncate">
                {expert.expert.role} • {expert.expert.department}
              </p>
              <p className="text-text-tertiary text-xs truncate">
                {expert.expertise.topics.slice(0, 2).join(", ")}
              </p>
            </div>

            {/* Nudge Button */}
            <button
              onClick={() => handleNudge(expert)}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors shrink-0 text-sm font-medium"
            >
              Nudge
            </button>
          </div>
        ))}
        </div>
      )}

      {/* Suggested nudge context preview (optional) */}
      {suggestedNudge && (
        <div className="text-xs text-text-tertiary pt-2 border-t border-border-subtle">
          <p className="italic">
            Pre-filled context available based on your conversation
          </p>
        </div>
      )}
    </div>
  );
}
