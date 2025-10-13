import { ExpertProfile } from "@mitable/shared";
import { ChevronRight } from "lucide-react";
import ExpertAvatar from "../../../components/expert/ExpertAvatar";

interface ExpertMatch {
  expert: ExpertProfile;
  matchScore: number;
}

interface ExpertListCollapsedProps {
  experts: ExpertMatch[];
  onExpand: () => void;
}

export default function ExpertListCollapsed({ experts, onExpand }: ExpertListCollapsedProps) {
  // Sort by match score descending
  const sortedExperts = [...experts].sort((a, b) => b.matchScore - a.matchScore);
  const bestMatch = sortedExperts[0];

  return (
    <div className="relative w-[120px] h-full flex items-center">
      {/* Main Card Container */}
      <div className="w-full h-full bg-[#1A1A1A] rounded-2xl p-4 flex flex-col items-center">
        {/* Expert Avatars */}
        <div className="flex flex-col gap-4 flex-1 justify-center">
          {sortedExperts.map((match, index) => (
            <div key={match.expert.id} className="relative">
              <ExpertAvatar
                expert={match.expert}
                isBestMatch={match.expert.id === bestMatch.expert.id}
                size="md"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Expand Button - Positioned on right edge */}
      <button
        onClick={onExpand}
        className="absolute -right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-background-tertiary hover:bg-background-secondary rounded-full flex items-center justify-center transition-colors z-10"
        aria-label="Expand expert list"
      >
        <ChevronRight size={20} className="text-text-secondary" />
      </button>
    </div>
  );
}
