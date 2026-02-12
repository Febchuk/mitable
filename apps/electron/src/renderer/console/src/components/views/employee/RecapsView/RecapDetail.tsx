/**
 * RecapDetail
 *
 * Recap editing and sending view - consistent with app design language.
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  MessageSquare,
  Mail,
  Copy,
  ExternalLink,
  Target,
  Sparkles,
  Check,
  Loader2,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
} from "lucide-react";

// Types
type RecapDestination = "slack" | "gmail" | "linear" | "copy";
type RecapTone = "professional" | "casual" | "concise" | "detailed";
type RecapLength = "brief" | "standard" | "comprehensive";

interface RecapBlock {
  id: string;
  startTime: Date;
  endTime: Date | null;
  duration: number;
  summary: string;
  goal?: string;
  isFocusedSession?: boolean;
}

interface DeliveryStatus {
  destination: RecapDestination;
  sentAt: Date;
  status: "sent" | "failed";
}

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

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

function isSameDay(date1: Date, date2: Date): boolean {
  return getDateKey(date1) === getDateKey(date2);
}

function getDaysWithBlocks(blocks: RecapBlock[]): Date[] {
  const dayMap = new Map<string, Date>();
  blocks.forEach((block) => {
    const key = getDateKey(block.startTime);
    if (!dayMap.has(key)) {
      dayMap.set(key, new Date(block.startTime));
    }
  });
  return Array.from(dayMap.values()).sort((a, b) => b.getTime() - a.getTime());
}

function getBlocksForDay(blocks: RecapBlock[], day: Date): RecapBlock[] {
  return blocks.filter((block) => isSameDay(block.startTime, day));
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
    bgColor: "bg-purple-500/20",
  },
  gmail: {
    icon: Mail,
    label: "Gmail",
    color: "text-rose-400",
    bgColor: "bg-rose-500/20",
  },
  linear: {
    icon: ExternalLink,
    label: "Linear",
    color: "text-indigo",
    bgColor: "bg-indigo/20",
  },
  copy: {
    icon: Copy,
    label: "Copy",
    color: "text-emerald",
    bgColor: "bg-emerald/20",
  },
};

// Tone options
const toneOptions: { value: RecapTone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "concise", label: "Concise" },
  { value: "detailed", label: "Detailed" },
];

// Length options
const lengthOptions: { value: RecapLength; label: string }[] = [
  { value: "brief", label: "Brief" },
  { value: "standard", label: "Standard" },
  { value: "comprehensive", label: "Full" },
];

// Mock blocks data - organized by day for realistic browsing
const mockAllBlocks: RecapBlock[] = [
  // Today
  {
    id: "b1",
    startTime: new Date(Date.now() - 3 * 60 * 60 * 1000),
    endTime: new Date(Date.now() - 1 * 60 * 60 * 1000),
    duration: 120,
    summary:
      "Built the main CalendarView component with week navigation and day selection. Implemented work block cards with expandable details and capture timeline.",
    goal: "Complete Calendar UI prototype",
    isFocusedSession: true,
  },
  {
    id: "b2",
    startTime: new Date(Date.now() - 45 * 60 * 1000),
    endTime: null,
    duration: 45,
    summary:
      "Reviewed PR feedback and addressed comments. Updated component styling for better consistency with design system.",
    isFocusedSession: false,
  },
  // Yesterday
  {
    id: "b3",
    startTime: new Date(Date.now() - 24 * 60 * 60 * 1000 - 5 * 60 * 60 * 1000),
    endTime: new Date(Date.now() - 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000),
    duration: 120,
    summary:
      "Set up the RecapsView routing and created the initial component structure. Integrated with the navigation system.",
    goal: "Scaffold Recaps feature",
    isFocusedSession: true,
  },
  {
    id: "b4",
    startTime: new Date(Date.now() - 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000),
    endTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
    duration: 90,
    summary:
      "Added placeholder content and mock data for development. Connected to the sidebar navigation.",
    goal: "Recaps navigation setup",
    isFocusedSession: false,
  },
  // 2 days ago
  {
    id: "b5",
    startTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 6 * 60 * 60 * 1000),
    endTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000),
    duration: 180,
    summary:
      "Implemented the core monitoring service with screen capture integration. Added event listeners for application focus changes.",
    goal: "Build monitoring backend",
    isFocusedSession: true,
  },
  {
    id: "b6",
    startTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000),
    endTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 1 * 60 * 60 * 1000),
    duration: 60,
    summary:
      "Fixed idle detection bugs and improved event handling. Tested cross-platform behavior.",
    isFocusedSession: false,
  },
  // 3 days ago
  {
    id: "b7",
    startTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 - 4 * 60 * 60 * 1000),
    endTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000),
    duration: 120,
    summary:
      "Designed the database schema for work sessions and recaps. Created migration files and seed data.",
    goal: "Database design",
    isFocusedSession: true,
  },
];

// Generate recap content
function generateRecapContent(
  blocks: RecapBlock[],
  tone: RecapTone,
  length: RecapLength
): string {
  const totalMinutes = blocks.reduce((acc, b) => acc + b.duration, 0);

  let header = "";
  if (tone === "professional") {
    header = `Work Progress Update — ${formatDuration(totalMinutes)} tracked\n\n`;
  } else if (tone === "casual") {
    header = `Hey! Here's what I've been up to (${formatDuration(totalMinutes)} total):\n\n`;
  } else if (tone === "concise") {
    header = `Update · ${formatDuration(totalMinutes)}\n\n`;
  } else {
    header = `Detailed Work Summary\nTotal time: ${formatDuration(totalMinutes)}\n\n`;
  }

  let content = header;

  blocks.forEach((block, idx) => {
    const timeRange = `${formatTime(block.startTime)} – ${block.endTime ? formatTime(block.endTime) : "now"}`;

    if (length === "brief") {
      const firstSentence = block.summary.split(".")[0] + ".";
      content += `• ${firstSentence}\n`;
    } else if (length === "standard") {
      if (block.goal) {
        content += `${block.goal} (${formatDuration(block.duration)})\n`;
      } else {
        content += `Block ${idx + 1} (${formatDuration(block.duration)})\n`;
      }
      content += `${block.summary}\n\n`;
    } else {
      content += `${block.goal || `Work Block ${idx + 1}`}\n`;
      content += `${timeRange} · ${formatDuration(block.duration)}\n\n`;
      content += `${block.summary}\n`;
      if (block.isFocusedSession) {
        content += `\n✓ Focused session\n`;
      }
      content += "\n";
    }
  });

  return content.trim();
}

export default function RecapDetail() {
  const { recapId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isNew = recapId === "new";
  const blockIdsParam = searchParams.get("blocks");
  const dateParam = searchParams.get("date");
  const initialBlockIds = blockIdsParam ? blockIdsParam.split(",") : [];
  const initialDate = dateParam ? new Date(dateParam + "T12:00:00") : null;

  // State
  const [allBlocks] = useState<RecapBlock[]>(mockAllBlocks);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(
    new Set(initialBlockIds.length > 0 ? initialBlockIds : [])
  );
  const [tone, setTone] = useState<RecapTone>("professional");
  const [length, setLength] = useState<RecapLength>("standard");
  const [content, setContent] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [deliveries, setDeliveries] = useState<DeliveryStatus[]>([]);
  const [sendingTo, setSendingTo] = useState<RecapDestination | null>(null);
  const [showToneMenu, setShowToneMenu] = useState(false);
  const [showLengthMenu, setShowLengthMenu] = useState(false);

  // Day browsing state - auto-open to the date passed from calendar
  const availableDays = getDaysWithBlocks(allBlocks);
  const [browsingDay, setBrowsingDay] = useState<Date | null>(() => {
    // If coming from calendar with a date, auto-open that day
    if (initialDate && initialBlockIds.length > 0) {
      return initialDate;
    }
    return null;
  });
  const browsingDayIndex = browsingDay
    ? availableDays.findIndex((d) => isSameDay(d, browsingDay))
    : -1;
  const blocksForBrowsingDay = browsingDay
    ? getBlocksForDay(allBlocks, browsingDay)
    : [];

  const selectedBlocks = allBlocks.filter((b) => selectedBlockIds.has(b.id));
  const totalDuration = selectedBlocks.reduce((acc, b) => acc + b.duration, 0);

  // Generate content when settings change
  useEffect(() => {
    const newContent = generateRecapContent(selectedBlocks, tone, length);
    setContent(newContent);
  }, [selectedBlocks, tone, length]);

  const toggleBlock = (blockId: string) => {
    const next = new Set(selectedBlockIds);
    if (next.has(blockId)) {
      next.delete(blockId);
    } else {
      next.add(blockId);
    }
    setSelectedBlockIds(next);
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const newContent = generateRecapContent(selectedBlocks, tone, length);
    setContent(newContent);
    setIsRegenerating(false);
  };

  const handleSend = async (destination: RecapDestination) => {
    setSendingTo(destination);
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (destination === "copy") {
      await navigator.clipboard.writeText(content);
    }

    setDeliveries((prev) => [
      ...prev,
      { destination, sentAt: new Date(), status: "sent" },
    ]);
    setSendingTo(null);
  };

  const isSentTo = (destination: RecapDestination) =>
    deliveries.some((d) => d.destination === destination && d.status === "sent");

  return (
    <div className="h-full overflow-y-auto app-no-drag">
      {/* Header */}
      <div className="px-8 pt-8 pb-6">
        <div className="stagger-1">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => navigate("/recaps")}
              className="p-2 -ml-2 rounded-lg hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1">
              <h1 className="font-display text-2xl font-semibold text-ink-primary tracking-tight">
                {isNew ? "Create Recap" : "Edit Recap"}
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-ink-tertiary">
                  {selectedBlocks.length} block{selectedBlocks.length !== 1 ? "s" : ""} · {formatDuration(totalDuration)}
                </span>
                {/* Delivery chips */}
                {deliveries.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {deliveries.map((d, idx) => {
                      const config = destinationConfig[d.destination];
                      const Icon = config.icon;
                      return (
                        <span
                          key={idx}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${config.bgColor} ${config.color} text-[10px] font-semibold uppercase tracking-wider`}
                        >
                          <Icon size={10} />
                          <Check size={10} />
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="px-8 pb-8">
        <div className="stagger-2 space-y-6">
          {/* Browse blocks by day */}
          <div className="rounded-xl border border-stroke-subtle bg-canvas-overlay/50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stroke-subtle">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                Add Blocks from Day
              </span>
              {browsingDay && (
                <button
                  onClick={() => setBrowsingDay(null)}
                  className="text-xs text-ink-tertiary hover:text-ink-primary transition-colors"
                >
                  Close
                </button>
              )}
            </div>
            <div className="p-4">
              {/* Day selector */}
              {!browsingDay ? (
                <div className="grid grid-cols-2 gap-2">
                  {availableDays.map((day) => {
                    const dayBlocks = getBlocksForDay(allBlocks, day);
                    const selectedFromDay = dayBlocks.filter((b) =>
                      selectedBlockIds.has(b.id)
                    ).length;
                    const isToday = isSameDay(day, new Date());

                    return (
                      <button
                        key={getDateKey(day)}
                        onClick={() => setBrowsingDay(day)}
                        className="flex items-center gap-3 p-3 rounded-lg text-left hover:bg-canvas-muted/50 transition-colors border border-stroke-subtle"
                      >
                        <div className="w-10 h-10 rounded-lg bg-canvas-muted flex items-center justify-center flex-shrink-0">
                          <Calendar size={18} className="text-ink-tertiary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink-primary">
                              {formatShortDate(day)}
                            </span>
                            {isToday && (
                              <span className="px-1.5 py-0.5 rounded-full bg-emerald/20 text-emerald text-[10px] font-semibold">
                                Today
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-ink-tertiary mt-0.5">
                            {dayBlocks.length} block{dayBlocks.length !== 1 ? "s" : ""}
                            {selectedFromDay > 0 && (
                              <span className="text-indigo"> · {selectedFromDay} added</span>
                            )}
                          </p>
                        </div>
                        <ChevronRight size={16} className="text-ink-tertiary" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Day detail view */
                <div>
                  {/* Day navigation */}
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => {
                        if (browsingDayIndex < availableDays.length - 1) {
                          setBrowsingDay(availableDays[browsingDayIndex + 1]);
                        }
                      }}
                      disabled={browsingDayIndex >= availableDays.length - 1}
                      className="p-1.5 rounded-lg hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <div className="text-center">
                      <span className="text-sm font-medium text-ink-primary">
                        {formatShortDate(browsingDay)}
                      </span>
                      <p className="text-xs text-ink-tertiary">
                        {blocksForBrowsingDay.length} block{blocksForBrowsingDay.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (browsingDayIndex > 0) {
                          setBrowsingDay(availableDays[browsingDayIndex - 1]);
                        }
                      }}
                      disabled={browsingDayIndex <= 0}
                      className="p-1.5 rounded-lg hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>

                  {/* Blocks for this day */}
                  <div className="space-y-2">
                    {blocksForBrowsingDay.map((block) => {
                      const isSelected = selectedBlockIds.has(block.id);
                      return (
                        <button
                          key={block.id}
                          onClick={() => toggleBlock(block.id)}
                          className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all ${
                            isSelected
                              ? "bg-indigo/10 ring-1 ring-indigo/30"
                              : "hover:bg-canvas-muted/50 border border-stroke-subtle"
                          }`}
                        >
                          <div
                            className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                              isSelected ? "bg-indigo" : "border border-stroke"
                            }`}
                          >
                            {isSelected ? (
                              <Check size={10} className="text-white" />
                            ) : (
                              <Plus size={10} className="text-ink-tertiary" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-ink-tertiary tabular-nums">
                                {formatTime(block.startTime)} – {block.endTime ? formatTime(block.endTime) : "now"}
                              </span>
                              <span className="text-xs text-ink-tertiary">
                                · {formatDuration(block.duration)}
                              </span>
                              {block.isFocusedSession && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo/20 text-indigo text-[10px] font-semibold">
                                  <Target size={8} />
                                  Focused
                                </span>
                              )}
                            </div>
                            {block.goal && (
                              <p className="text-sm font-medium text-ink-primary mt-1">
                                {block.goal}
                              </p>
                            )}
                            <p className="text-xs text-ink-tertiary mt-1 line-clamp-2">
                              {block.summary}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Selected blocks */}
          <div className="rounded-xl border border-stroke-subtle bg-canvas-overlay/50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stroke-subtle">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                Selected Blocks
              </span>
              <span className="text-xs text-ink-tertiary tabular-nums">
                {selectedBlocks.length} block{selectedBlocks.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="p-4">
              {selectedBlocks.length === 0 ? (
                <p className="text-sm text-ink-tertiary text-center py-4">
                  No blocks selected. Browse days above to add blocks.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedBlocks.map((block, idx) => (
                    <div
                      key={block.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-indigo/10 ring-1 ring-indigo/30"
                    >
                      <button
                        onClick={() => toggleBlock(block.id)}
                        className="mt-0.5 w-4 h-4 rounded bg-indigo flex items-center justify-center flex-shrink-0 hover:bg-indigo/80 transition-colors"
                      >
                        <Check size={10} className="text-white" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-ink-primary">
                            Block {idx + 1}
                          </span>
                          <span className="text-xs text-ink-tertiary tabular-nums">
                            {formatDuration(block.duration)} · {formatDate(block.startTime)}
                          </span>
                          {block.isFocusedSession && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo/20 text-indigo text-[10px] font-semibold">
                              <Target size={8} />
                              Focused
                            </span>
                          )}
                        </div>
                        {block.goal && (
                          <p className="text-xs text-indigo mt-0.5">{block.goal}</p>
                        )}
                        <p className="text-xs text-ink-tertiary mt-1 line-clamp-2">
                          {block.summary}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recap content */}
          <div className="rounded-xl border border-stroke-subtle bg-canvas-overlay/50">
            {/* Controls */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-stroke-subtle">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                Recap Content
              </span>
              <div className="flex items-center gap-2">
                {/* Tone dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowToneMenu(!showToneMenu);
                      setShowLengthMenu(false);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-canvas-muted text-sm text-ink-secondary transition-colors"
                  >
                    {toneOptions.find((t) => t.value === tone)?.label}
                    <ChevronDown size={14} className="text-ink-tertiary" />
                  </button>
                  {showToneMenu && (
                    <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-stroke-subtle bg-canvas-overlay shadow-xl overflow-hidden z-10">
                      {toneOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setTone(option.value);
                            setShowToneMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-canvas-muted transition-colors ${
                            tone === option.value ? "text-ink-primary" : "text-ink-secondary"
                          }`}
                        >
                          {option.label}
                          {tone === option.value && <Check size={14} className="text-indigo" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Length dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowLengthMenu(!showLengthMenu);
                      setShowToneMenu(false);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-canvas-muted text-sm text-ink-secondary transition-colors"
                  >
                    {lengthOptions.find((l) => l.value === length)?.label}
                    <ChevronDown size={14} className="text-ink-tertiary" />
                  </button>
                  {showLengthMenu && (
                    <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-stroke-subtle bg-canvas-overlay shadow-xl overflow-hidden z-10">
                      {lengthOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setLength(option.value);
                            setShowLengthMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-canvas-muted transition-colors ${
                            length === option.value ? "text-ink-primary" : "text-ink-secondary"
                          }`}
                        >
                          {option.label}
                          {length === option.value && <Check size={14} className="text-indigo" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="w-px h-5 bg-stroke-subtle" />

                {/* Regenerate */}
                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating || selectedBlocks.length === 0}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo/10 text-indigo text-sm font-medium hover:bg-indigo/20 transition-colors disabled:opacity-50"
                >
                  {isRegenerating ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  Rewrite
                </button>
              </div>
            </div>

            {/* Textarea */}
            <div className="p-4">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Your recap content will appear here..."
                disabled={selectedBlocks.length === 0}
                className="w-full h-64 p-4 rounded-lg bg-canvas-muted/30 border border-stroke-subtle text-sm text-ink-primary leading-relaxed resize-none focus:outline-none focus:border-indigo/50 placeholder:text-ink-tertiary/50 disabled:opacity-50"
              />
              <div className="flex items-center justify-between mt-3 text-xs text-ink-tertiary">
                <span>{content.length} characters · {content.split(/\s+/).filter(Boolean).length} words</span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  ~{Math.max(1, Math.ceil(content.split(/\s+/).length / 200))} min read
                </span>
              </div>
            </div>
          </div>

          {/* Send to */}
          <div className="rounded-xl border border-stroke-subtle bg-canvas-overlay/50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stroke-subtle">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                Send To
              </span>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2">
                {(Object.keys(destinationConfig) as RecapDestination[]).map((dest) => {
                  const config = destinationConfig[dest];
                  const Icon = config.icon;
                  const sent = isSentTo(dest);
                  const sending = sendingTo === dest;

                  return (
                    <button
                      key={dest}
                      onClick={() => handleSend(dest)}
                      disabled={sending || selectedBlocks.length === 0 || sent}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                        sent
                          ? "bg-emerald/10 text-emerald ring-1 ring-emerald/30"
                          : "bg-canvas-muted hover:bg-canvas-muted/80 text-ink-secondary hover:text-ink-primary"
                      }`}
                    >
                      {sending ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : sent ? (
                        <Check size={16} />
                      ) : (
                        <Icon size={16} />
                      )}
                      {sent ? "Sent" : config.label}
                    </button>
                  );
                })}
              </div>

              {/* Delivery history */}
              {deliveries.length > 0 && (
                <div className="mt-4 pt-4 border-t border-stroke-subtle">
                  <div className="flex items-center gap-2 text-xs text-ink-tertiary">
                    <span>Delivered:</span>
                    {deliveries.map((d, idx) => (
                      <span key={idx} className="flex items-center gap-1">
                        {destinationConfig[d.destination].label} at {formatTime(d.sentAt)}
                        {idx < deliveries.length - 1 && <span>·</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
