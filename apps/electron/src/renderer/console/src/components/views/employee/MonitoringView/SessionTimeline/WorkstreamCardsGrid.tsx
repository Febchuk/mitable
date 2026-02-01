/**
 * WorkstreamCardsGrid
 *
 * Layer 3: Grid container for workstream cards.
 */

import type { Workstream } from "./utils/types";
import WorkstreamCard from "./WorkstreamCard";

interface WorkstreamCardsGridProps {
  workstreams: Workstream[];
  selectedWorkstreamId: string | null;
  onCardClick: (workstreamId: string) => void;
  className?: string;
}

export default function WorkstreamCardsGrid({
  workstreams,
  selectedWorkstreamId,
  onCardClick,
  className = "",
}: WorkstreamCardsGridProps) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
      {workstreams.map((workstream) => (
        <WorkstreamCard
          key={workstream.id}
          workstream={workstream}
          isSelected={selectedWorkstreamId === workstream.id}
          isDimmed={selectedWorkstreamId !== null && selectedWorkstreamId !== workstream.id}
          onClick={() => onCardClick(workstream.id)}
        />
      ))}
    </div>
  );
}
