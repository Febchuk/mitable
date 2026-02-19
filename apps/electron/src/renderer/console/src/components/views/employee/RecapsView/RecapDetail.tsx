/**
 * RecapDetail
 *
 * Recap editing and sending view.
 * Pulls work blocks from the same data source as CalendarView
 * (real sessions via useCalendarDays, mock fallback).
 * Saves created recaps to RecapsContext.
 *
 * - Generate: calls AI backend to compose recap from selected sessions
 * - Edit: opens AIEditPanel (split-pane editor + AI chat)
 * - Content area: read-only rendered markdown preview
 */

import { useState, useEffect, useMemo } from "react";
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
  Edit2,
} from "lucide-react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useCalendarDays } from "../../../../hooks/queries/calendar";
import { mockDays } from "../CalendarView/mockData";
import type { WorkBlock, ActivityDay } from "../CalendarView/types";
import {
  useRecaps,
  snapshotBlock,
  type RecapDestination,
} from "../../../../context/RecapsContext";
import {
  useGenerateRecap,
  useReviseRecap,
} from "../../../../hooks/queries/monitoring";
import AIEditPanel from "../../../shared/AIEditPanel";

// Types
type RecapTone = "professional" | "casual" | "concise" | "detailed";
type RecapLength = "brief" | "standard" | "comprehensive";

interface DeliveryEntry {
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

// Local deterministic content generation (mock data fallback)
function generateRecapContent(
  blocks: WorkBlock[],
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
  const { addRecap, getRecap } = useRecaps();

  const isNew = recapId === "new";
  const blockIdsParam = searchParams.get("blocks");
  const dateParam = searchParams.get("date");
  const initialBlockIds = blockIdsParam ? blockIdsParam.split(",") : [];
  const initialDate = dateParam ? new Date(dateParam + "T12:00:00") : null;

  // Pull blocks from the same source as CalendarView
  const { data: realDays } = useCalendarDays();
  const useMockData = !realDays || realDays.length === 0;
  const allDays: ActivityDay[] = useMockData ? mockDays : realDays;

  // Flatten all blocks from all days
  const allBlocks = useMemo(() => {
    const blocks: WorkBlock[] = [];
    for (const day of allDays) {
      blocks.push(...day.workBlocks);
    }
    return blocks;
  }, [allDays]);

  // If editing an existing recap, load its data
  const existingRecap = !isNew && recapId ? getRecap(recapId) : undefined;

  // Mutations
  const generateRecapMutation = useGenerateRecap();
  const reviseRecapMutation = useReviseRecap();

  // State
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => {
    if (existingRecap) {
      return new Set(existingRecap.blocks.map((b) => b.id));
    }
    return new Set(initialBlockIds.length > 0 ? initialBlockIds : []);
  });
  const [tone, setTone] = useState<RecapTone>("professional");
  const [length, setLength] = useState<RecapLength>("standard");
  const [content, setContent] = useState(existingRecap?.content ?? "");
  const [isAIEditMode, setIsAIEditMode] = useState(false);
  const [deliveries, setDeliveries] = useState<DeliveryEntry[]>([]);
  const [sendingTo, setSendingTo] = useState<RecapDestination | null>(null);
  const [showToneMenu, setShowToneMenu] = useState(false);
  const [showLengthMenu, setShowLengthMenu] = useState(false);

  // Day browsing helpers
  const getDaysWithBlocks = (blocks: WorkBlock[]): Date[] => {
    const dayMap = new Map<string, Date>();
    blocks.forEach((block) => {
      const key = getDateKey(block.startTime);
      if (!dayMap.has(key)) {
        dayMap.set(key, new Date(block.startTime));
      }
    });
    return Array.from(dayMap.values()).sort((a, b) => b.getTime() - a.getTime());
  };

  const getBlocksForDay = (blocks: WorkBlock[], day: Date): WorkBlock[] => {
    return blocks.filter((block) => isSameDay(block.startTime, day));
  };

  const availableDays = useMemo(() => getDaysWithBlocks(allBlocks), [allBlocks]);

  const [browsingDay, setBrowsingDay] = useState<Date | null>(() => {
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

  // Can we use AI generation? Only with real data and blocks selected
  const canGenerate = !useMockData && selectedBlocks.length > 0;
  const isGenerating = generateRecapMutation.isPending;

  // Convert content to sanitized HTML for markdown preview
  const contentHtml = useMemo(() => {
    if (!content) return "";
    const result = marked.parse(content);
    return typeof result === "string" ? DOMPurify.sanitize(result) : "";
  }, [content]);

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  // Auto-generate content for mock data when selection/settings change
  useEffect(() => {
    if (!useMockData) return; // Real data: user clicks Generate explicitly
    if (existingRecap && content === existingRecap.content) return;
    if (selectedBlocks.length === 0) {
      setContent("");
      return;
    }
    const newContent = generateRecapContent(selectedBlocks, tone, length);
    setContent(newContent);
  }, [selectedBlockIds, tone, length, allBlocks, useMockData]);

  const toggleBlock = (blockId: string) => {
    const next = new Set(selectedBlockIds);
    if (next.has(blockId)) {
      next.delete(blockId);
    } else {
      next.add(blockId);
    }
    setSelectedBlockIds(next);
  };

  const handleGenerate = async () => {
    if (selectedBlocks.length === 0) return;

    // Mock data: use local generation
    if (useMockData) {
      const newContent = generateRecapContent(selectedBlocks, tone, length);
      setContent(newContent);
      return;
    }

    // Real data: call AI backend
    try {
      const sessionIds = selectedBlocks.map((b) => b.id);
      const result = await generateRecapMutation.mutateAsync({
        sessionIds,
        tone,
        length,
      });
      setContent(result.recap);
    } catch {
      // Fallback to local generation on error
      const newContent = generateRecapContent(selectedBlocks, tone, length);
      setContent(newContent);
    }
  };

  const handleRevise = async (instruction: string, currentContent: string) => {
    const result = await reviseRecapMutation.mutateAsync({
      instruction,
      currentContent,
    });
    return result;
  };

  const handleSaveFromEditor = async (editedContent: string) => {
    setContent(editedContent);
    setIsAIEditMode(false);
  };

  const handleSend = async (destination: RecapDestination) => {
    if (selectedBlocks.length === 0) return;

    setSendingTo(destination);
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (destination === "copy") {
      await navigator.clipboard.writeText(content);
    }

    // Save to RecapsContext
    addRecap({
      sentAt: new Date(),
      destination,
      blocks: selectedBlocks.map(snapshotBlock),
      totalDuration,
      content,
    });

    setDeliveries((prev) => [
      ...prev,
      { destination, sentAt: new Date(), status: "sent" },
    ]);
    setSendingTo(null);
  };

  const isSentTo = (destination: RecapDestination) =>
    deliveries.some((d) => d.destination === destination && d.status === "sent");

  // AI Edit Mode - full page takeover (same pattern as SessionDetail)
  if (isAIEditMode && content) {
    return (
      <AIEditPanel
        title="Edit Recap"
        subtitle={`${selectedBlocks.length} block${selectedBlocks.length !== 1 ? "s" : ""} · ${formatDuration(totalDuration)}`}
        initialContent={content}
        onSave={handleSaveFromEditor}
        onCancel={() => setIsAIEditMode(false)}
        onRevise={handleRevise}
        placeholder="Edit your recap content..."
        contextLabel="recap"
      />
    );
  }

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

                {/* Generate */}
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || selectedBlocks.length === 0}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo/10 text-indigo text-sm font-medium hover:bg-indigo/20 transition-colors disabled:opacity-50"
                >
                  {isGenerating ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {canGenerate ? "Generate" : "Rewrite"}
                </button>

                {/* Edit */}
                {content && (
                  <button
                    onClick={() => setIsAIEditMode(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-canvas-muted text-sm text-ink-secondary font-medium transition-colors"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Markdown preview */}
            <div className="p-4">
              {content ? (
                <div className="w-full min-h-[16rem] max-h-[32rem] overflow-y-auto p-4 rounded-lg bg-canvas-muted/30 border border-stroke-subtle">
                  <div
                    className="prose prose-sm prose-invert max-w-none text-ink-primary [&_h1]:text-ink-primary [&_h2]:text-ink-primary [&_h3]:text-ink-primary [&_strong]:text-ink-primary [&_li]:text-ink-secondary [&_p]:text-ink-secondary [&_ul]:my-2 [&_ol]:my-2"
                    dangerouslySetInnerHTML={{ __html: contentHtml }}
                  />
                </div>
              ) : (
                <div className="w-full h-64 flex items-center justify-center rounded-lg bg-canvas-muted/30 border border-stroke-subtle">
                  <p className="text-sm text-ink-tertiary/50">
                    {selectedBlocks.length === 0
                      ? "Select blocks above to get started..."
                      : canGenerate
                        ? "Click Generate to create your recap with AI..."
                        : "Click Rewrite to generate recap content..."}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between mt-3 text-xs text-ink-tertiary">
                <span>{content.length} characters · {wordCount} words</span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  ~{Math.max(1, Math.ceil(wordCount / 200))} min read
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
