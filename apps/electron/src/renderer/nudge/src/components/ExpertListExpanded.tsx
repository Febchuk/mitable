import { ExpertProfile } from "@mitable/shared";
import { ChevronLeft } from "lucide-react";
import ExpertCard from "../../../components/expert/ExpertCard";

interface ExpertMatch {
  expert: ExpertProfile;
  matchScore: number;
}

interface ExpertListExpandedProps {
  experts: ExpertMatch[];
  onCollapse: () => void;
  onEscalate: (expertId: string) => void;
}

export default function ExpertListExpanded({ experts, onCollapse, onEscalate }: ExpertListExpandedProps) {
  // Sort by match score descending
  const sortedExperts = [...experts].sort((a, b) => b.matchScore - a.matchScore);
  const bestMatchId = sortedExperts[0]?.expert.id;

  return (
    <div className="relative w-full h-full flex items-center">
      {/* Main Card Container */}
      <div className="w-full h-full bg-[#1A1A1A] rounded-2xl p-4 flex flex-col">
        {/* Expert Cards */}
        <div className="flex-1 overflow-y-auto space-y-3">
          {sortedExperts.map((match) => (
            <ExpertCard
              key={match.expert.id}
              expert={match.expert}
              matchScore={match.matchScore}
              isBestMatch={match.expert.id === bestMatchId}
              onEscalate={onEscalate}
            />
          ))}
        </div>
      </div>

      {/* Collapse Button - Positioned on right edge */}
      <button
        onClick={onCollapse}
        className="absolute -right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-background-tertiary hover:bg-background-secondary rounded-full flex items-center justify-center transition-colors z-10"
        aria-label="Collapse expert list"
      >
        <ChevronLeft size={20} className="text-text-secondary" />
      </button>
    </div>
  );
}
