/**
 * RecapsView
 *
 * Shows history of sent work updates/recaps.
 * Each recap shows the blocks included and where it was sent.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  History,
  Send,
  MessageSquare,
  Mail,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Clock,
  Target,
  Calendar,
  Check,
  MoreHorizontal,
  Trash2,
  Plus,
  Pencil,
} from "lucide-react";

// Recap destination types
type RecapDestination = "slack" | "gmail" | "linear" | "copy";

// Recap data structure
interface RecapBlock {
  id: string;
  startTime: Date;
  endTime: Date | null;
  duration: number;
  summary: string;
  goal?: string;
  isFocusedSession?: boolean;
}

interface Recap {
  id: string;
  sentAt: Date;
  destination: RecapDestination;
  blocks: RecapBlock[];
  totalDuration: number;
  content: string;
}

// Mock recaps data
const mockRecaps: Recap[] = [
  {
    id: "recap-1",
    sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    destination: "slack",
    totalDuration: 180,
    content:
      "**Work Update** (3h total)\n\n**Block 1** (9:00 AM - 11:30 AM, 2h 30m)\nGoal: Complete Calendar UI prototype\nBuilt the main CalendarView component with week navigation and day selection. Implemented work block cards with expandable details and capture timeline.\n\n**Block 2** (12:00 PM - 12:30 PM, 30m)\nReviewed PR feedback and addressed comments on the DaySummary component.",
    blocks: [
      {
        id: "b1",
        startTime: new Date(Date.now() - 5 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 2.5 * 60 * 60 * 1000),
        duration: 150,
        summary:
          "Built the main CalendarView component with week navigation and day selection. Implemented work block cards with expandable details and capture timeline.",
        goal: "Complete Calendar UI prototype",
        isFocusedSession: true,
      },
      {
        id: "b2",
        startTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 1.5 * 60 * 60 * 1000),
        duration: 30,
        summary: "Reviewed PR feedback and addressed comments on the DaySummary component.",
      },
    ],
  },
  {
    id: "recap-2",
    sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
    destination: "linear",
    totalDuration: 240,
    content:
      "**Work Update** (4h total)\n\n**Block 1** (10:00 AM - 12:00 PM, 2h)\nGoal: Fix authentication flow\nInvestigated and fixed the OAuth token refresh bug. Updated error handling in the auth service.\n\n**Block 2** (2:00 PM - 4:00 PM, 2h)\nGoal: Write tests\nAdded unit tests for the authentication service and integration tests for the login flow.",
    blocks: [
      {
        id: "b3",
        startTime: new Date(Date.now() - 26 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
        duration: 120,
        summary:
          "Investigated and fixed the OAuth token refresh bug. Updated error handling in the auth service.",
        goal: "Fix authentication flow",
        isFocusedSession: true,
      },
      {
        id: "b4",
        startTime: new Date(Date.now() - 22 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 20 * 60 * 60 * 1000),
        duration: 120,
        summary:
          "Added unit tests for the authentication service and integration tests for the login flow.",
        goal: "Write tests",
        isFocusedSession: true,
      },
    ],
  },
  {
    id: "recap-3",
    sentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    destination: "gmail",
    totalDuration: 90,
    content:
      "**Work Update** (1h 30m total)\n\n**Block 1** (3:00 PM - 4:30 PM, 1h 30m)\nResearched competitor products and documented findings in Notion. Created comparison matrix for feature prioritization.",
    blocks: [
      {
        id: "b5",
        startTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 - 1.5 * 60 * 60 * 1000),
        endTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        duration: 90,
        summary:
          "Researched competitor products and documented findings in Notion. Created comparison matrix for feature prioritization.",
      },
    ],
  },
];

// Helper functions
function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

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

function formatFullDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Destination config
const destinationConfig: Record<
  RecapDestination,
  { icon: typeof Send; label: string; color: string; bgColor: string }
> = {
  slack: {
    icon: MessageSquare,
    label: "Slack",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  gmail: {
    icon: Mail,
    label: "Gmail",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
  },
  linear: {
    icon: ExternalLink,
    label: "Linear",
    color: "text-indigo",
    bgColor: "bg-indigo/10",
  },
  copy: {
    icon: Copy,
    label: "Copied",
    color: "text-ink-tertiary",
    bgColor: "bg-canvas-muted",
  },
};

// Recap card component
interface RecapCardProps {
  recap: Recap;
  onEdit: () => void;
}

function RecapCard({ recap, onEdit }: RecapCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const destConfig = destinationConfig[recap.destination];
  const DestIcon = destConfig.icon;

  return (
    <div className="rounded-xl border border-stroke-subtle bg-canvas-overlay/50 overflow-hidden transition-all hover:border-stroke">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left"
      >
        {/* Expand indicator */}
        <div className="flex-shrink-0 text-ink-tertiary">
          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>

        {/* Destination badge */}
        <div className={`flex-shrink-0 p-2 rounded-lg ${destConfig.bgColor}`}>
          <DestIcon size={16} className={destConfig.color} />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink-primary">
              Sent to {destConfig.label}
            </span>
            <span className="text-xs text-ink-tertiary">
              · {formatRelativeTime(recap.sentAt)}
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

        {/* Actions */}
        <div
          className="relative flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-lg hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary transition-colors"
          >
            <MoreHorizontal size={16} />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-stroke-subtle bg-canvas-overlay shadow-xl overflow-hidden z-10">
              <button
                onClick={() => {
                  onEdit();
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-canvas-muted transition-colors"
              >
                <Pencil size={14} className="text-ink-tertiary" />
                <span className="text-sm text-ink-primary">Edit recap</span>
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(recap.content);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-canvas-muted transition-colors border-t border-stroke-subtle"
              >
                <Copy size={14} className="text-ink-tertiary" />
                <span className="text-sm text-ink-primary">Copy content</span>
              </button>
              <button
                onClick={() => {
                  console.log("Delete recap:", recap.id);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-canvas-muted transition-colors border-t border-stroke-subtle"
              >
                <Trash2 size={14} className="text-red-400" />
                <span className="text-sm text-red-400">Delete</span>
              </button>
            </div>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-stroke-subtle">
          {/* Blocks included */}
          <div className="px-5 py-4 border-b border-stroke-subtle">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
              Blocks included
            </h4>
            <div className="space-y-2">
              {recap.blocks.map((block, idx) => (
                <div
                  key={block.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-canvas-muted/30"
                >
                  <div className="flex-shrink-0 w-5 h-5 rounded bg-indigo/10 text-indigo flex items-center justify-center text-xs font-medium">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-ink-tertiary tabular-nums">
                        {formatTime(block.startTime)} -{" "}
                        {block.endTime ? formatTime(block.endTime) : "ongoing"}
                      </span>
                      <span className="text-xs text-ink-tertiary">
                        ({formatDuration(block.duration)})
                      </span>
                      {block.isFocusedSession && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo/10 text-indigo">
                          Focused
                        </span>
                      )}
                    </div>
                    {block.goal && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Target size={10} className="text-indigo" />
                        <span className="text-xs font-medium text-indigo">
                          {block.goal}
                        </span>
                      </div>
                    )}
                    <p className="text-sm text-ink-secondary mt-1 line-clamp-2">
                      {block.summary}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Content preview */}
          <div className="px-5 py-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
              Content sent
            </h4>
            <div className="rounded-lg border border-stroke-subtle bg-canvas-muted/30 p-4">
              <pre className="whitespace-pre-wrap text-sm text-ink-secondary font-sans">
                {recap.content}
              </pre>
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-ink-tertiary">
                {formatFullDate(recap.sentAt)} at {formatTime(recap.sentAt)}
              </span>
              <div className="flex items-center gap-1 text-xs text-emerald">
                <Check size={12} />
                <span>Delivered</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecapsView() {
  const navigate = useNavigate();
  const [recaps] = useState<Recap[]>(mockRecaps);

  // Group recaps by date
  const groupedRecaps = recaps.reduce(
    (acc, recap) => {
      const dateKey = recap.sentAt.toDateString();
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
              <p className="text-sm text-ink-tertiary max-w-sm mx-auto">
                When you send work updates from the Calendar view, they'll appear
                here for easy reference.
              </p>
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
