/**
 * WorkBlockList
 *
 * List of work blocks for a day, displayed as a timeline.
 */

import { Clock, Zap, Coffee } from "lucide-react";
import type { WorkBlock } from "./types";
import WorkBlockDetail from "./WorkBlockDetail";

interface WorkBlockListProps {
  blocks: WorkBlock[];
  totalWorkTime: number;
  onBlockDelete?: (blockId: string) => void;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} minutes`;
  if (mins === 0) return `${hours} hour${hours !== 1 ? "s" : ""}`;
  return `${hours}h ${mins}m`;
}

export default function WorkBlockList({
  blocks,
  totalWorkTime,
  onBlockDelete,
}: WorkBlockListProps) {
  if (blocks.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-canvas-overlay border border-stroke-subtle mb-4">
          <Coffee size={28} className="text-ink-tertiary" />
        </div>
        <h3 className="font-display text-lg font-medium text-ink-primary mb-1">
          No activity recorded
        </h3>
        <p className="text-ink-tertiary text-sm max-w-xs mx-auto">
          Work blocks will appear here as you use your computer. Activity is automatically detected.
        </p>
      </div>
    );
  }

  // Calculate total break time
  const totalBreakTime = blocks.reduce((acc, block) => {
    return acc + (block.idleGapBefore || 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Day stats summary */}
      <div className="flex items-center gap-6 px-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo/10">
            <Zap size={16} className="text-indigo" />
          </div>
          <div>
            <div className="text-lg font-semibold text-ink-primary tabular-nums">
              {formatDuration(totalWorkTime)}
            </div>
            <div className="text-xs text-ink-tertiary">Total work time</div>
          </div>
        </div>

        <div className="w-px h-10 bg-stroke-subtle" />

        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-canvas-muted">
            <Clock size={16} className="text-ink-tertiary" />
          </div>
          <div>
            <div className="text-lg font-semibold text-ink-primary tabular-nums">
              {blocks.length}
            </div>
            <div className="text-xs text-ink-tertiary">Work blocks</div>
          </div>
        </div>

        {totalBreakTime > 0 && (
          <>
            <div className="w-px h-10 bg-stroke-subtle" />
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Coffee size={16} className="text-amber-500" />
              </div>
              <div>
                <div className="text-lg font-semibold text-ink-primary tabular-nums">
                  {formatDuration(totalBreakTime)}
                </div>
                <div className="text-xs text-ink-tertiary">Break time</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Work blocks timeline */}
      <div className="space-y-2">
        {blocks.map((block, index) => (
          <WorkBlockDetail
            key={block.id}
            block={block}
            blockNumber={index + 1}
            defaultExpanded={block.isActive || (index === blocks.length - 1 && blocks.length <= 3)}
            onDelete={onBlockDelete}
          />
        ))}
      </div>
    </div>
  );
}
