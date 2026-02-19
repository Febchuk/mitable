/**
 * RecapsView
 *
 * Shows history of sent work updates/recaps.
 * Reads from RecapsContext (populated when user sends from RecapDetail).
 */

import { useNavigate } from "react-router-dom";
import {
  History,
  Send,
  ChevronRight,
  Clock,
  Target,
  Calendar,
  Plus,
} from "lucide-react";
import { useRecaps, type Recap } from "../../../../context/RecapsContext";

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

// Recap card component
interface RecapCardProps {
  recap: Recap;
  onEdit: () => void;
}

function RecapCard({ recap, onEdit }: RecapCardProps) {
  return (
    <button
      onClick={onEdit}
      className="w-full rounded-xl border border-stroke-subtle bg-canvas-overlay/50 transition-all hover:border-stroke flex items-center gap-4 px-5 py-4 text-left"
    >
      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink-primary">
            {recap.title || "Work Update"}
          </span>
          <span className="text-xs text-ink-tertiary">
            · {formatRelativeTime(recap.createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="inline-flex items-center gap-1 text-xs text-ink-tertiary">
            <Clock size={12} />
            {formatDuration(recap.totalDuration)}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-ink-tertiary">
            <Calendar size={12} />
            {recap.blocks.length} block{recap.blocks.length !== 1 ? "s" : ""}
          </span>
          {recap.blocks.some((b) => b.isFocusedSession) && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo/10 text-indigo">
              <Target size={10} />
              Focused
            </span>
          )}
        </div>
      </div>

      {/* Trailing chevron */}
      <ChevronRight size={16} className="flex-shrink-0 text-ink-tertiary" />
    </button>
  );
}

export default function RecapsView() {
  const navigate = useNavigate();
  const { recaps } = useRecaps();

  // Group recaps by date
  const groupedRecaps = recaps.reduce(
    (acc, recap) => {
      const dateKey = recap.createdAt.toDateString();
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(recap);
      return acc;
    },
    {} as Record<string, Recap[]>
  );

  const dateGroups = Object.entries(groupedRecaps).sort(
    (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()
  );

  return (
    <div className="h-full overflow-y-auto app-no-drag">
      {/* Header */}
      <div className="px-8 pt-8 pb-6">
        <div className="stagger-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo/10">
                <History size={20} className="text-indigo" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold text-ink-primary tracking-tight">
                  Recaps
                </h1>
                <p className="text-ink-tertiary text-sm">
                  History of shared work updates
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate("/recaps/new")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo text-white font-medium text-sm hover:bg-indigo/90 transition-colors"
            >
              <Plus size={16} />
              <span>Create Recap</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recaps list */}
      <div className="px-8 pb-8">
        <div className="stagger-2">
          {recaps.length === 0 ? (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-canvas-muted mb-4">
                <Send size={24} className="text-ink-tertiary" />
              </div>
              <h3 className="text-lg font-medium text-ink-primary mb-2">
                No recaps yet
              </h3>
              <p className="text-sm text-ink-tertiary max-w-sm mx-auto mb-6">
                Create a recap from your work blocks to share progress with your team.
              </p>
              <button
                onClick={() => navigate("/recaps/new")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo text-white font-medium text-sm hover:bg-indigo/90 transition-colors"
              >
                <Plus size={16} />
                <span>Create your first recap</span>
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {dateGroups.map(([dateKey, dayRecaps]) => (
                <div key={dateKey}>
                  {/* Date header */}
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm font-medium text-ink-secondary">
                      {formatRelativeTime(new Date(dateKey)) === "Yesterday"
                        ? "Yesterday"
                        : new Date(dateKey).toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}
                    </span>
                    <div className="flex-1 h-px bg-stroke-subtle" />
                    <span className="text-xs text-ink-tertiary">
                      {dayRecaps.length} update{dayRecaps.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Recaps for this date */}
                  <div className="space-y-3">
                    {dayRecaps.map((recap) => (
                      <RecapCard
                        key={recap.id}
                        recap={recap}
                        onEdit={() => navigate(`/recaps/${recap.id}`)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
