/**
 * RecapDetail
 *
 * Full recap editing and sending view.
 * - Edit recap content with AI assistance (tone, length, format)
 * - Send to multiple destinations
 * - Track where recap was sent
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
  ChevronDown,
  Wand2,
  FileText,
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

// Destination config
const destinationConfig: Record<
  RecapDestination,
  { icon: typeof Send; label: string; color: string; bgColor: string; description: string }
> = {
  slack: {
    icon: MessageSquare,
    label: "Slack",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    description: "Post to a Slack channel or DM",
  },
  gmail: {
    icon: Mail,
    label: "Gmail",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    description: "Send as an email",
  },
  linear: {
    icon: ExternalLink,
    label: "Linear",
    color: "text-indigo",
    bgColor: "bg-indigo/10",
    description: "Add as a comment on an issue",
  },
  copy: {
    icon: Copy,
    label: "Clipboard",
    color: "text-ink-secondary",
    bgColor: "bg-canvas-muted",
    description: "Copy to paste anywhere",
  },
};

// Tone options
const toneOptions: { value: RecapTone; label: string; description: string }[] = [
  { value: "professional", label: "Professional", description: "Formal and structured" },
  { value: "casual", label: "Casual", description: "Friendly and conversational" },
  { value: "concise", label: "Concise", description: "Brief and to the point" },
  { value: "detailed", label: "Detailed", description: "Thorough with context" },
];

// Length options
const lengthOptions: { value: RecapLength; label: string; description: string }[] = [
  { value: "brief", label: "Brief", description: "1-2 sentences per block" },
  { value: "standard", label: "Standard", description: "Key points and context" },
  { value: "comprehensive", label: "Comprehensive", description: "Full details and outcomes" },
];

// Mock blocks data (would come from route state or API)
const mockBlocks: RecapBlock[] = [
  {
    id: "b1",
    startTime: new Date(Date.now() - 3 * 60 * 60 * 1000),
    endTime: new Date(Date.now() - 1 * 60 * 60 * 1000),
    duration: 120,
    summary:
      "Built the main CalendarView component with week navigation and day selection. Implemented work block cards with expandable details and capture timeline. Added prose/list toggle for day summary.",
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
];

// Generate recap content based on settings
function generateRecapContent(
  blocks: RecapBlock[],
  tone: RecapTone,
  length: RecapLength
): string {
  const totalMinutes = blocks.reduce((acc, b) => acc + b.duration, 0);

  // Adjust content based on tone and length
  let header = "";

  if (tone === "professional") {
    header = `**Work Progress Update** — ${formatDuration(totalMinutes)} tracked\n\n`;
  } else if (tone === "casual") {
    header = `Hey! Here's what I've been working on (${formatDuration(totalMinutes)} total):\n\n`;
  } else if (tone === "concise") {
    header = `Update (${formatDuration(totalMinutes)}):\n\n`;
  } else {
    header = `**Detailed Work Summary**\nTotal time: ${formatDuration(totalMinutes)}\n\n`;
  }

  let content = header;

  blocks.forEach((block, idx) => {
    const timeRange = `${formatTime(block.startTime)} - ${block.endTime ? formatTime(block.endTime) : "ongoing"}`;

    if (length === "brief") {
      // Just the key point
      const firstSentence = block.summary.split(".")[0] + ".";
      if (tone === "casual") {
        content += `• ${firstSentence}\n`;
      } else {
        content += `- ${firstSentence}\n`;
      }
    } else if (length === "standard") {
      // Block header + summary
      if (block.goal) {
        content += `**${block.goal}** (${formatDuration(block.duration)})\n`;
      } else {
        content += `**Block ${idx + 1}** (${formatDuration(block.duration)})\n`;
      }
      content += `${block.summary}\n\n`;
    } else {
      // Full details
      content += `### ${block.goal || `Work Block ${idx + 1}`}\n`;
      content += `*${timeRange} (${formatDuration(block.duration)})*\n\n`;
      content += `${block.summary}\n\n`;
      if (block.isFocusedSession) {
        content += `✓ Focused session\n\n`;
      }
    }
  });

  return content.trim();
}

export default function RecapDetail() {
  const { recapId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Check if this is a new recap being created
  const isNew = recapId === "new";
  const blockIdsParam = searchParams.get("blocks");
  const initialBlockIds = blockIdsParam ? blockIdsParam.split(",") : [];

  // State
  const [blocks] = useState<RecapBlock[]>(mockBlocks);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(
    new Set(initialBlockIds.length > 0 ? initialBlockIds : mockBlocks.map((b) => b.id))
  );
  const [tone, setTone] = useState<RecapTone>("professional");
  const [length, setLength] = useState<RecapLength>("standard");
  const [content, setContent] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [deliveries, setDeliveries] = useState<DeliveryStatus[]>([]);
  const [showToneMenu, setShowToneMenu] = useState(false);
  const [showLengthMenu, setShowLengthMenu] = useState(false);
  const [sendingTo, setSendingTo] = useState<RecapDestination | null>(null);

  // Selected blocks
  const selectedBlocks = blocks.filter((b) => selectedBlockIds.has(b.id));
  const totalDuration = selectedBlocks.reduce((acc, b) => acc + b.duration, 0);

  // Generate content when settings change
  useEffect(() => {
    const newContent = generateRecapContent(selectedBlocks, tone, length);
    setContent(newContent);
  }, [selectedBlocks, tone, length]);

  // Toggle block selection
  const toggleBlock = (blockId: string) => {
    const next = new Set(selectedBlockIds);
    if (next.has(blockId)) {
      next.delete(blockId);
    } else {
      next.add(blockId);
    }
    setSelectedBlockIds(next);
  };

  // Regenerate with AI
  const handleRegenerate = async () => {
    setIsRegenerating(true);
    // Simulate AI regeneration
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const newContent = generateRecapContent(selectedBlocks, tone, length);
    setContent(newContent + "\n\n_Regenerated with AI enhancements._");
    setIsRegenerating(false);
  };

  // Send to destination
  const handleSend = async (destination: RecapDestination) => {
    setSendingTo(destination);

    // Simulate sending
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (destination === "copy") {
      await navigator.clipboard.writeText(content);
    }

    // Add to deliveries
    setDeliveries((prev) => [
      ...prev,
      { destination, sentAt: new Date(), status: "sent" },
    ]);

    setSendingTo(null);
  };

  // Check if already sent to destination
  const isSentTo = (destination: RecapDestination) =>
    deliveries.some((d) => d.destination === destination && d.status === "sent");

  return (
    <div className="min-h-full app-no-drag">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-canvas-base/95 backdrop-blur-sm border-b border-stroke-subtle">
        <div className="px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/recaps")}
                className="p-2 rounded-lg hover:bg-canvas-muted text-ink-tertiary hover:text-ink-primary transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="font-display text-xl font-semibold text-ink-primary">
                  {isNew ? "Create Recap" : "Edit Recap"}
                </h1>
                <p className="text-sm text-ink-tertiary">
                  {selectedBlocks.length} block{selectedBlocks.length !== 1 ? "s" : ""} ·{" "}
                  {formatDuration(totalDuration)}
                </p>
              </div>
            </div>

            {/* Delivery status */}
            {deliveries.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-tertiary">Sent to:</span>
                {deliveries.map((d, idx) => {
                  const config = destinationConfig[d.destination];
                  const Icon = config.icon;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full ${config.bgColor}`}
                    >
                      <Icon size={12} className={config.color} />
                      <Check size={12} className="text-emerald" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        <div className="grid grid-cols-3 gap-6">
          {/* Left column - Blocks selection */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
              Include Blocks
            </h3>
            <div className="space-y-2">
              {blocks.map((block, idx) => (
                <button
                  key={block.id}
                  onClick={() => toggleBlock(block.id)}
                  className={`w-full p-3 rounded-lg border text-left transition-all ${
                    selectedBlockIds.has(block.id)
                      ? "border-indigo bg-indigo/5"
                      : "border-stroke-subtle hover:border-stroke"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        selectedBlockIds.has(block.id)
                          ? "bg-indigo text-white"
                          : "border border-stroke-subtle"
                      }`}
                    >
                      {selectedBlockIds.has(block.id) && <Check size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-primary">
                          Block {idx + 1}
                        </span>
                        <span className="text-xs text-ink-tertiary">
                          {formatDuration(block.duration)}
                        </span>
                        {block.isFocusedSession && (
                          <Target size={12} className="text-indigo" />
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
                </button>
              ))}
            </div>
          </div>

          {/* Middle column - Content editor */}
          <div className="space-y-4">
            {/* AI controls */}
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                Recap Content
              </h3>
              <div className="flex items-center gap-2">
                {/* Tone dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowToneMenu(!showToneMenu);
                      setShowLengthMenu(false);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-stroke-subtle hover:border-stroke text-sm transition-colors"
                  >
                    <Wand2 size={14} className="text-ink-tertiary" />
                    <span className="text-ink-secondary">
                      {toneOptions.find((t) => t.value === tone)?.label}
                    </span>
                    <ChevronDown size={14} className="text-ink-tertiary" />
                  </button>
                  {showToneMenu && (
                    <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-stroke-subtle bg-canvas-overlay shadow-xl overflow-hidden z-10">
                      {toneOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setTone(option.value);
                            setShowToneMenu(false);
                          }}
                          className={`w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-canvas-muted transition-colors ${
                            tone === option.value ? "bg-canvas-muted" : ""
                          }`}
                        >
                          <div className="flex-1">
                            <p className="text-sm text-ink-primary">{option.label}</p>
                            <p className="text-xs text-ink-tertiary">{option.description}</p>
                          </div>
                          {tone === option.value && (
                            <Check size={14} className="text-indigo mt-0.5" />
                          )}
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
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-stroke-subtle hover:border-stroke text-sm transition-colors"
                  >
                    <FileText size={14} className="text-ink-tertiary" />
                    <span className="text-ink-secondary">
                      {lengthOptions.find((l) => l.value === length)?.label}
                    </span>
                    <ChevronDown size={14} className="text-ink-tertiary" />
                  </button>
                  {showLengthMenu && (
                    <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-stroke-subtle bg-canvas-overlay shadow-xl overflow-hidden z-10">
                      {lengthOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => {
                            setLength(option.value);
                            setShowLengthMenu(false);
                          }}
                          className={`w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-canvas-muted transition-colors ${
                            length === option.value ? "bg-canvas-muted" : ""
                          }`}
                        >
                          <div className="flex-1">
                            <p className="text-sm text-ink-primary">{option.label}</p>
                            <p className="text-xs text-ink-tertiary">{option.description}</p>
                          </div>
                          {length === option.value && (
                            <Check size={14} className="text-indigo mt-0.5" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Regenerate button */}
                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating || selectedBlocks.length === 0}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo/10 text-indigo hover:bg-indigo/20 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isRegenerating ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  <span>Regenerate</span>
                </button>
              </div>
            </div>

            {/* Content textarea */}
            <div className="rounded-lg border border-stroke-subtle bg-canvas-muted/30 overflow-hidden">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Your recap content will appear here..."
                className="w-full h-80 p-4 text-sm text-ink-primary bg-transparent resize-none focus:outline-none"
                disabled={selectedBlocks.length === 0}
              />
            </div>

            {/* Character count */}
            <div className="flex items-center justify-between text-xs text-ink-tertiary">
              <span>{content.length} characters</span>
              <span>~{Math.ceil(content.split(/\s+/).length / 200)} min read</span>
            </div>
          </div>

          {/* Right column - Send destinations */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
              Send To
            </h3>
            <div className="space-y-2">
              {(Object.keys(destinationConfig) as RecapDestination[]).map((dest) => {
                const config = destinationConfig[dest];
                const Icon = config.icon;
                const sent = isSentTo(dest);
                const sending = sendingTo === dest;

                return (
                  <button
                    key={dest}
                    onClick={() => handleSend(dest)}
                    disabled={sending || selectedBlocks.length === 0}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all ${
                      sent
                        ? "border-emerald/30 bg-emerald/5"
                        : "border-stroke-subtle hover:border-stroke hover:bg-canvas-muted/30"
                    } disabled:opacity-50`}
                  >
                    <div className={`p-2 rounded-lg ${config.bgColor}`}>
                      <Icon size={18} className={config.color} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-ink-primary">
                        {config.label}
                      </p>
                      <p className="text-xs text-ink-tertiary">{config.description}</p>
                    </div>
                    {sending ? (
                      <Loader2 size={18} className="text-ink-tertiary animate-spin" />
                    ) : sent ? (
                      <div className="flex items-center gap-1 text-emerald">
                        <Check size={16} />
                        <span className="text-xs font-medium">Sent</span>
                      </div>
                    ) : (
                      <Send size={16} className="text-ink-tertiary" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Delivery history */}
            {deliveries.length > 0 && (
              <div className="mt-6 pt-4 border-t border-stroke-subtle">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
                  Delivery History
                </h4>
                <div className="space-y-2">
                  {deliveries.map((delivery, idx) => {
                    const config = destinationConfig[delivery.destination];
                    const Icon = config.icon;
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-2 rounded-lg bg-canvas-muted/30"
                      >
                        <Icon size={14} className={config.color} />
                        <span className="text-sm text-ink-secondary flex-1">
                          {config.label}
                        </span>
                        <span className="text-xs text-ink-tertiary">
                          {formatTime(delivery.sentAt)}
                        </span>
                        <Check size={14} className="text-emerald" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
