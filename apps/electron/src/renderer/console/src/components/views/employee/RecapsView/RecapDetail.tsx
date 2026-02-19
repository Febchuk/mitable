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

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  MessageSquare,
  Mail,
  Copy,
  ExternalLink,
  Target,
  Check,
  Loader2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  Edit2,
  X,
  Share2,
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
  type RecapDelivery,
} from "../../../../context/RecapsContext";
import {
  useGenerateRecap,
  useReviseRecap,
} from "../../../../hooks/queries/monitoring";
import AIEditPanel from "../../../shared/AIEditPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Types
type RecapTone = "professional" | "casual" | "concise" | "detailed";
type RecapLength = "brief" | "standard" | "comprehensive";


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
  { icon: typeof Send; label: string; subtitle: string; color: string; bgColor: string }
> = {
  slack: {
    icon: MessageSquare,
    label: "Slack",
    subtitle: "Post to channel",
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
  },
  gmail: {
    icon: Mail,
    label: "Gmail",
    subtitle: "Send as email",
    color: "text-rose-400",
    bgColor: "bg-rose-500/20",
  },
  linear: {
    icon: ExternalLink,
    label: "Linear",
    subtitle: "Create issue",
    color: "text-indigo",
    bgColor: "bg-indigo/20",
  },
  copy: {
    icon: Copy,
    label: "Copy",
    subtitle: "Copy to clipboard",
    color: "text-emerald",
    bgColor: "bg-emerald/20",
  },
};

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
  const { addRecap, addDelivery, updateRecap, getRecap } = useRecaps();

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
  const tone: RecapTone = "professional";
  const length: RecapLength = "standard";
  const [content, setContent] = useState(existingRecap?.content ?? "");
  const [isAIEditMode, setIsAIEditMode] = useState(false);
  const [savedRecapId, setSavedRecapId] = useState<string | null>(
    existingRecap?.id ?? null
  );
  const [sendingTo, setSendingTo] = useState<RecapDestination | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isBlockPickerOpen, setIsBlockPickerOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [showGateTooltip, setShowGateTooltip] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  // Derive deliveries from the saved recap in context
  const savedRecap = savedRecapId ? getRecap(savedRecapId) : undefined;
  const deliveries: RecapDelivery[] = savedRecap?.deliveries ?? [];

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

  const handlePublish = async () => {
    if (selectedBlocks.length === 0 || !content) return;

    setIsPublishing(true);
    await new Promise((resolve) => setTimeout(resolve, 400));

    if (savedRecapId) {
      // Editing an existing recap
      updateRecap(savedRecapId, {
        blocks: selectedBlocks.map(snapshotBlock),
        totalDuration,
        content,
      });
    } else {
      // New recap
      const recap = addRecap({
        blocks: selectedBlocks.map(snapshotBlock),
        totalDuration,
        content,
      });
      setSavedRecapId(recap.id);
    }

    setIsPublishing(false);
  };

  const handleSendTo = async (destination: RecapDestination) => {
    if (!savedRecapId) return;

    setSendingTo(destination);
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (destination === "copy") {
      await navigator.clipboard.writeText(content);
    }

    addDelivery(savedRecapId, destination);
    setSendingTo(null);
  };

  const isSentTo = (destination: RecapDestination) =>
    deliveries.some((d) => d.destination === destination);

  // Close share dropdown on click outside or Escape
  useEffect(() => {
    if (!isShareOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setIsShareOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsShareOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isShareOpen]);

  const handleShareClick = useCallback(() => {
    if (!savedRecapId) {
      setShowGateTooltip(true);
      setTimeout(() => setShowGateTooltip(false), 2000);
      return;
    }
    setIsShareOpen((prev) => !prev);
  }, [savedRecapId]);

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

            {/* Publish / Save button */}
            <button
              onClick={handlePublish}
              disabled={isPublishing || selectedBlocks.length === 0 || !content}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo text-white text-sm font-medium hover:bg-indigo/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isPublishing ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Check size={15} />
              )}
              {savedRecapId ? "Save Changes" : "Publish"}
            </button>

            {/* Share dropdown button */}
            <div className="relative" ref={shareRef}>
              <button
                onClick={handleShareClick}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                  savedRecapId
                    ? "bg-canvas-overlay border border-stroke hover:border-indigo/30 text-ink-primary shadow-sm"
                    : "bg-canvas-muted/50 text-ink-tertiary border border-stroke-subtle"
                }`}
              >
                <Share2 size={15} />
                <span>Share</span>
                {deliveries.length > 0 && (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo/15 text-indigo text-[10px] font-bold">
                    {deliveries.length}
                  </span>
                )}
              </button>

              {/* Gated tooltip */}
              {showGateTooltip && !savedRecapId && (
                <div className="absolute right-0 top-full mt-2 z-50 whitespace-nowrap bg-canvas-muted text-ink-secondary text-xs rounded-lg px-3 py-2 shadow-lg border border-stroke-subtle animate-fade-in">
                  Publish your recap first
                </div>
              )}

              {/* Share dropdown */}
              {isShareOpen && savedRecapId && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-stroke bg-canvas-overlay shadow-2xl backdrop-blur-sm z-50 overflow-hidden">
                  <div className="bg-gradient-to-br from-white/[0.03] to-transparent">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-stroke-subtle">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-tertiary">
                        Share Recap
                      </span>
                    </div>

                    {/* Destination rows */}
                    <div className="py-1">
                      {(["slack", "gmail", "linear"] as RecapDestination[]).map((dest) => {
                        const config = destinationConfig[dest];
                        const Icon = config.icon;
                        const sent = isSentTo(dest);
                        const sending = sendingTo === dest;
                        const delivery = deliveries.find((d) => d.destination === dest);

                        return (
                          <button
                            key={dest}
                            onClick={() => {
                              if (!sent && !sending) handleSendTo(dest);
                            }}
                            disabled={sent || sending}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                              sent
                                ? "bg-emerald/[0.04]"
                                : "hover:bg-canvas-muted/40"
                            } disabled:cursor-default`}
                          >
                            <div className={`w-8 h-8 rounded-lg ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                              <Icon size={16} className={config.color} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm font-medium ${sent ? "text-ink-secondary" : "text-ink-primary"}`}>
                                {config.label}
                              </span>
                              <p className="text-[11px] text-ink-tertiary">{config.subtitle}</p>
                            </div>
                            <div className="flex-shrink-0">
                              {sending ? (
                                <Loader2 size={14} className="animate-spin text-ink-tertiary" />
                              ) : sent && delivery ? (
                                <div className="flex items-center gap-1.5">
                                  <Check size={14} className="text-emerald" />
                                  <span className="text-[11px] text-ink-tertiary tabular-nums">
                                    {formatTime(delivery.sentAt)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-ink-tertiary group-hover:text-ink-secondary">
                                  Share &rarr;
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Delivery history footer */}
                    {deliveries.length > 0 && (
                      <div className="px-4 py-2.5 border-t border-stroke-subtle">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-tertiary">
                          Delivered
                        </span>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {deliveries.map((d, idx) => {
                            const cfg = destinationConfig[d.destination];
                            return (
                              <span
                                key={idx}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.bgColor} ${cfg.color}`}
                              >
                                <Check size={10} />
                                {cfg.label} · {formatTime(d.sentAt)}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="px-8 pb-8">
        <div className="stagger-2 space-y-6">
          {/* Block Picker Dialog */}
          <Dialog
            open={isBlockPickerOpen}
            onOpenChange={(open) => {
              setIsBlockPickerOpen(open);
              if (!open) setBrowsingDay(null);
            }}
          >
            <DialogContent className="sm:max-w-[520px] bg-canvas-raised border-stroke p-0 gap-0 flex flex-col h-[520px]">
              {/* Fixed header */}
              <div className="px-5 pt-5 pb-3 border-b border-stroke-subtle flex-shrink-0">
                <DialogHeader>
                  <DialogTitle className="text-ink-primary">Add Blocks</DialogTitle>
                  <DialogDescription className="text-ink-tertiary">
                    {selectedBlockIds.size} block{selectedBlockIds.size !== 1 ? "s" : ""} selected
                  </DialogDescription>
                </DialogHeader>
              </div>

              {browsingDay && (
                <>
                  {/* Fixed day carousel nav */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-stroke-subtle flex-shrink-0">
                    <button
                      onClick={() => {
                        if (browsingDayIndex < availableDays.length - 1) {
                          setBrowsingDay(availableDays[browsingDayIndex + 1]);
                        }
                      }}
                      disabled={browsingDayIndex >= availableDays.length - 1}
                      className="p-1.5 rounded-lg hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <div className="text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <Calendar size={13} className="text-ink-tertiary" />
                        <span className="text-sm font-medium text-ink-primary">
                          {formatShortDate(browsingDay)}
                        </span>
                        {isSameDay(browsingDay, new Date()) && (
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald/20 text-emerald text-[10px] font-semibold">
                            Today
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-tertiary mt-0.5">
                        {blocksForBrowsingDay.length} block{blocksForBrowsingDay.length !== 1 ? "s" : ""}
                        {(() => {
                          const sel = blocksForBrowsingDay.filter((b) => selectedBlockIds.has(b.id)).length;
                          return sel > 0 ? <span className="text-indigo"> · {sel} selected</span> : null;
                        })()}
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
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {/* Scrollable block list — fills remaining space */}
                  <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-2">
                    {blocksForBrowsingDay.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-ink-tertiary">No blocks on this day.</p>
                      </div>
                    ) : (
                      blocksForBrowsingDay.map((block) => {
                        const isSelected = selectedBlockIds.has(block.id);
                        return (
                          <button
                            key={block.id}
                            onClick={() => toggleBlock(block.id)}
                            className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all border ${
                              isSelected
                                ? "bg-indigo/10 border-indigo/30"
                                : "bg-canvas-overlay/50 border-stroke-subtle hover:border-stroke hover:bg-canvas-muted/40"
                            }`}
                          >
                            <div
                              className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
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
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-ink-secondary tabular-nums">
                                  {formatTime(block.startTime)} – {block.endTime ? formatTime(block.endTime) : "now"}
                                </span>
                                <span className="text-xs text-ink-tertiary">
                                  · {formatDuration(block.duration)}
                                </span>
                                {block.isFocusedSession && (
                                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-indigo/15 text-indigo text-[10px] font-semibold">
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
                      })
                    )}
                  </div>
                </>
              )}

              {!browsingDay && availableDays.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-ink-tertiary">No days with blocks available.</p>
                </div>
              )}

              {/* Fixed footer */}
              <div className="px-5 py-3 border-t border-stroke-subtle flex-shrink-0">
                <DialogFooter>
                  <Button
                    variant="outline"
                    className="border-stroke hover:bg-canvas-muted text-ink-secondary hover:text-ink-primary"
                    onClick={() => {
                      setIsBlockPickerOpen(false);
                      setBrowsingDay(null);
                    }}
                  >
                    Done
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>

          {/* Selected blocks */}
          <div className="rounded-xl border border-stroke-subtle bg-canvas-overlay/50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stroke-subtle">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                Selected Blocks
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-tertiary tabular-nums">
                  {selectedBlocks.length} block{selectedBlocks.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => {
                    if (availableDays.length > 0) setBrowsingDay(availableDays[0]);
                    setIsBlockPickerOpen(true);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo hover:bg-indigo/10 transition-colors"
                >
                  <Plus size={14} />
                  Add Blocks
                </button>
              </div>
            </div>
            <div className="p-4">
              {selectedBlocks.length === 0 ? (
                <p className="text-sm text-ink-tertiary text-center py-4">
                  No blocks selected. Click "Add Blocks" to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedBlocks.map((block, idx) => (
                    <div
                      key={block.id}
                      className="group flex items-start gap-3 p-3 rounded-lg bg-indigo/10 ring-1 ring-indigo/30"
                    >
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
                      <button
                        onClick={() => toggleBlock(block.id)}
                        className="mt-0.5 p-1 rounded-md text-ink-tertiary opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all flex-shrink-0"
                        title="Remove block"
                      >
                        <X size={14} />
                      </button>
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
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || selectedBlocks.length === 0}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-indigo hover:bg-indigo/10 transition-colors disabled:opacity-40"
                >
                  {isGenerating && <Loader2 size={14} className="animate-spin" />}
                  {content ? "Update" : "Generate"}
                </button>
                {content && (
                  <button
                    onClick={() => setIsAIEditMode(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-ink-secondary hover:bg-canvas-muted hover:text-ink-primary transition-colors"
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
                <div className="relative w-full min-h-[16rem] max-h-[32rem] overflow-y-auto p-4 rounded-lg bg-canvas-muted/30 border border-stroke-subtle">
                  {/* Copy button */}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(content);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-md text-ink-tertiary hover:text-ink-primary hover:bg-canvas-muted transition-colors z-10"
                    title="Copy to clipboard"
                  >
                    {copied ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
                  </button>
                  <div
                    className="prose prose-sm prose-invert max-w-none text-ink-primary [&_h1]:text-ink-primary [&_h2]:text-ink-primary [&_h3]:text-ink-primary [&_strong]:text-ink-primary [&_li]:text-ink-secondary [&_p]:text-ink-secondary [&_ul]:my-2 [&_ol]:my-2"
                    dangerouslySetInnerHTML={{ __html: contentHtml }}
                  />
                </div>
              ) : (
                <div className="w-full h-64 flex items-center justify-center rounded-lg bg-canvas-muted/30 border border-stroke-subtle">
                  <p className="text-sm text-ink-tertiary/50">
                    {selectedBlocks.length === 0
                      ? "Select blocks to get started..."
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


        </div>
      </div>
    </div>
  );
}
