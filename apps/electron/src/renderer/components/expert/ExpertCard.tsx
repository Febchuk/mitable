import { ExpertProfile } from "@mitable/shared";
import { Users } from "lucide-react";
import ExpertAvatar from "./ExpertAvatar";

interface ExpertCardProps {
  expert: ExpertProfile;
  matchScore: number; // 0-1
  isBestMatch?: boolean;
  onEscalate: (expertId: string) => void;
}

export default function ExpertCard({ expert, matchScore, isBestMatch = false, onEscalate }: ExpertCardProps) {
  const matchPercentage = Math.round(matchScore * 100);

  return (
    <div
      className={`relative flex flex-col gap-3 p-4 bg-[#2A2A2A] rounded-xl ${
        isBestMatch ? "ring-2 ring-yellow-500" : ""
      }`}
    >
      {/* Gold Ribbon for Best Match */}
      {isBestMatch && (
        <div className="absolute top-0 left-4">
          <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 0H24V32L12 26L0 32V0Z" fill="#F59E0B"/>
          </svg>
        </div>
      )}

      {/* Header: Avatar + Name + Match Score */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <ExpertAvatar expert={expert} isBestMatch={false} size="lg" />

        {/* Name and Role */}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-lg leading-tight">{expert.name}</h3>
          <p className="text-text-secondary text-sm mt-0.5">
            {expert.role || "Expert"} - {expert.department}
          </p>
        </div>

        {/* Match Score Badge */}
        <div className="flex-shrink-0">
          <span className="inline-block px-3 py-1 border border-text-tertiary text-text-secondary text-xs rounded-full">
            {matchPercentage}% Match
          </span>
        </div>
      </div>

      {/* Nudge Button */}
      <div className="flex justify-end">
        <button
          onClick={() => onEscalate(expert.id)}
          className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <Users size={16} />
          Nudge
        </button>
      </div>
    </div>
  );
}
