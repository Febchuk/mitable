/**
 * TaskBreakdownSection
 *
 * Shared accordion UI for displaying structured task breakdowns
 * with progress bars. Used by both employee CalendarView and admin PersonDetail.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, ListChecks, Loader2 } from "lucide-react";

export interface TaskBreakdownItem {
  shortTitle: string;
  description: string;
  minutes: number;
}

const TASK_COLOR_PALETTE = [
  "bg-indigo-500",
  "bg-cyan-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-orange-500",
];

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface TaskBreakdownSectionProps {
  tasks: TaskBreakdownItem[];
  totalDuration: number;
  isLoading?: boolean;
  className?: string;
}

export default function TaskBreakdownSection({
  tasks,
  totalDuration,
  isLoading = false,
  className = "",
}: TaskBreakdownSectionProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

  return (
    <div className={`p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <ListChecks size={14} className="text-ink-tertiary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
          Tasks
        </span>
        {isLoading && <Loader2 size={12} className="text-ink-tertiary animate-spin" />}
      </div>

      <div className="space-y-1">
        {tasks.map((task, idx) => {
          const percentage =
            totalDuration > 0 ? Math.round((task.minutes / totalDuration) * 100) : 0;
          const isOpen = expandedTasks.has(idx);
          const color = TASK_COLOR_PALETTE[idx % TASK_COLOR_PALETTE.length];

          return (
            <div key={`${task.shortTitle}-${idx}`}>
              {/* Task row — clickable */}
              <button
                onClick={() => {
                  const next = new Set(expandedTasks);
                  if (isOpen) next.delete(idx);
                  else next.add(idx);
                  setExpandedTasks(next);
                }}
                className="w-full flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-canvas-muted/50 transition-colors text-left min-w-0"
              >
                <div className="flex-shrink-0 text-ink-tertiary">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {/* Short title */}
                <span className="min-w-0 flex-[0_1_200px] text-sm font-medium text-ink-primary truncate">
                  {task.shortTitle}
                </span>
                <div className="flex flex-1 min-w-0 items-center gap-3">
                  {/* Progress bar */}
                  <div className="flex-1 min-w-0 h-2 bg-canvas-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color} transition-all duration-300`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3 whitespace-nowrap text-xs text-ink-tertiary tabular-nums">
                    {/* Duration */}
                    <span>{formatDuration(task.minutes)}</span>
                    {/* Percentage */}
                    <span className="w-10 text-right">{percentage}%</span>
                  </div>
                </div>
              </button>

              {/* Expanded description */}
              {isOpen && (
                <div className="ml-8 mr-2 mb-2 pl-3 border-l-2 border-stroke-subtle">
                  <p className="text-sm text-ink-secondary leading-relaxed">{task.description}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
