import { motion } from "framer-motion";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { ExpertProfile } from "@mitable/shared";

interface ExpertMatch {
  expert: ExpertProfile;
  matchScore: number;
}

interface ExpertListProps {
  experts: ExpertMatch[];
  isExpanded: boolean;
  onToggle: () => void;
  onEscalate: (expertId: string) => void;
}

/**
 * Get status color based on availability
 */
const getStatusColor = (availability: string): string => {
  switch (availability) {
    case "available":
      return "bg-green-500";
    case "away":
      return "bg-yellow-500";
    case "busy":
      return "bg-red-500";
    case "offline":
    default:
      return "bg-gray-500";
  }
};

/**
 * Get initials from name
 */
const getInitials = (name: string): string => {
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

/**
 * ExpertList - Single animated component for collapsed and expanded states
 * Width-only animation with overflow-hidden to reveal/hide content
 */
export default function ExpertList({ experts, isExpanded, onToggle, onEscalate }: ExpertListProps) {
  return (
    <motion.div
      className="bg-[#2a2a2a] rounded-2xl flex flex-col app-drag overflow-hidden"
      style={{ transformOrigin: "left" }}
      initial={false}
      animate={{
        width: isExpanded ? 380 : "auto",
      }}
      transition={{
        duration: 0.3,
        ease: "easeInOut",
      }}
    >
      {/* Expert Rows */}
      <div className="flex flex-col p-2 gap-2 overflow-x-hidden">
        {experts.slice(0, 5).map((match, index) => {
          const { expert, matchScore } = match;
          const isBestMatch = index === 0;
          const initials = getInitials(expert.name);
          const statusColor = getStatusColor(expert.availability);

          return (
            <div
              key={expert.id}
              className={`flex items-center rounded-xl bg-[#1a1a1a] flex-shrink-0 h-[64px] ${
                isExpanded ? "gap-3 p-2" : "gap-0 p-1.5"
              } ${isBestMatch ? "border-2 border-[#F59E0B]" : ""}`}
            >
              {/* Avatar (always visible) */}
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-gray-400 flex items-center justify-center text-black font-semibold">
                  {initials}
                </div>
                <div
                  className={`absolute bottom-0 right-0 w-3 h-3 ${statusColor} rounded-full border-2 border-[#ffffff]`}
                />
              </div>

              {/* Content (visible when expanded) */}
              <div
                className={`flex items-center gap-3 transition-all duration-200 ${
                  isExpanded
                    ? "opacity-100 flex-1 min-w-0"
                    : "opacity-0 w-0 overflow-hidden pointer-events-none"
                }`}
              >
                {/* Name & Role */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white text-sm truncate">{expert.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">{expert.role}</p>
                </div>

                {/* Match Badge + Nudge Button Stacked */}
                <div className="flex-shrink-0 flex flex-col gap-1.5 items-end">
                  {/* Match Badge */}
                  <div
                    className={`border text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                      isBestMatch
                        ? "border-[#F59E0B] text-[#F59E0B]"
                        : "border-gray-600 text-gray-300"
                    }`}
                  >
                    {Math.round(matchScore * 100)}% Match
                  </div>

                  {/* Nudge Button */}
                  <button
                    onClick={() => onEscalate(expert.id)}
                    className="px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap app-no-drag"
                  >
                    Nudge
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toggle Button */}
      <div className="flex-shrink-0 flex items-center justify-center px-2 pb-2">
        <button
          onClick={onToggle}
          className="w-full h-6 flex items-center justify-center bg-[#3e3e3e] hover:bg-[#1a1a1a] rounded-lg transition-colors text-gray-400 app-no-drag"
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
    </motion.div>
  );
}
