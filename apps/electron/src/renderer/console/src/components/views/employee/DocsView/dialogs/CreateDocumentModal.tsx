/**
 * CreateDocumentModal — Redesigned
 *
 * Simplified modal: textarea with inline Upload + Blocks controls.
 * No title, no blank doc option. Blocks dropdown shows recent sessions.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronDown, Loader2, Check, ArrowUp, Layers, Paperclip, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import type { DocType } from "@mitable/shared";

interface LocalSession {
  id: string;
  name: string | null;
  status: string;
  startedAt: number;
  endedAt: number | null;
  captureCount: number;
  duration: number;
}

interface CreateDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routeBase?: string;
  entityLabel?: string;
  promptPlaceholder?: string;
  defaultTags?: string[];
  docType?: DocType;
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatRelativeDate(timestamp: number | string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateDay.getTime() >= today.getTime()) return "Today";
  if (dateDay.getTime() >= yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PHASE_LABELS: Record<string, string> = {
  searching_sessions: "Searching sessions...",
  analyzing_data: "Analyzing data...",
  drafting: "Drafting document...",
  polishing: "Finalizing...",
  complete: "Complete!",
};

export default function CreateDocumentModal({
  open,
  onOpenChange,
  routeBase = "/docs",
  entityLabel = "document",
  promptPlaceholder,
  defaultTags: _defaultTags = [],
  docType: _docType = "knowledge-article",
}: CreateDocumentModalProps) {
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [input, setInput] = useState("");
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ phase: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showProviderModal, setShowProviderModal] = useState(false);

  const reset = useCallback(() => {
    setIsGenerating(false);
    setDocumentId(null);
    setProgress(null);
    setError(null);
  }, []);

  // Fetch local sessions via IPC instead of backend
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const result = await window.consoleAPI?.getRecentSessions?.();
        setSessions(result ?? []);
      } catch {
        setSessions([]);
      }
    })();
  }, [open]);

  const completedSessions = sessions.filter(
    (s) => ["ended", "ready", "delivered"].includes(s.status) && s.captureCount > 0
  );

  const entityLabelTitle = entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1);
  const phaseLabels: Record<string, string> = {
    ...PHASE_LABELS,
    drafting: `Drafting ${entityLabel}...`,
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  useEffect(() => {
    if (open) {
      reset?.();
      setInput("");
      setSelectedSessionIds(new Set());
      setBlocksOpen(false);
      setShowProviderModal(false);
    }
  }, [open]);

  const isComplete = progress?.phase === "complete" && documentId;
  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => {
        navigate(`${routeBase}/${documentId}`);
        onOpenChange(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [documentId, isComplete, navigate, onOpenChange, routeBase]);

  const handleGenerate = async () => {
    if (!input.trim()) return;

    // Check if AI provider is configured
    try {
      const config = await window.consoleAPI?.loadInferenceConfig?.();
      if (!config) {
        setShowProviderModal(true);
        return;
      }
    } catch {
      // Allow to proceed if check fails
    }

    setIsGenerating(true);
    setError(null);
    setProgress({ phase: "drafting", message: "Generating with AI..." });

    try {
      const sessionIds = selectedSessionIds.size > 0 ? Array.from(selectedSessionIds) : undefined;
      const result = await window.consoleAPI.localDocsGenerate?.(input.trim(), sessionIds);

      if (result?.error) {
        setError(result.error);
        setIsGenerating(false);
        return;
      }

      setDocumentId(result?.documentId ?? null);
      setProgress({ phase: "complete", message: "Document ready!" });
      setIsGenerating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    reset?.();
    setInput("");
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const toggleSession = (sessionId: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const showForm = !isGenerating && !isComplete && !error && !showProviderModal;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[520px] p-0 overflow-visible"
        style={{
          background: "var(--bg-base)",
          border: "var(--border-subtle)",
          borderRadius: 14,
        }}
        showCloseButton={false}
      >
        <VisuallyHidden>
          <DialogTitle>Create {entityLabel}</DialogTitle>
        </VisuallyHidden>

        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--text-tertiary)",
            zIndex: 10,
            transition: "color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-tertiary)";
          }}
        >
          <X size={15} />
        </button>

        {/* ── Form state ──────────────────────────────────────── */}
        {showForm && (
          <div style={{ padding: "20px 20px 16px" }}>
            {/* Selected blocks indicator */}
            {selectedSessionIds.size > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginBottom: 10,
                  fontSize: 11,
                  color: "var(--mi-accent)",
                }}
              >
                <Layers size={10} />
                {selectedSessionIds.size} block{selectedSessionIds.size !== 1 ? "s" : ""} selected
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={promptPlaceholder || `What will your ${entityLabel} be about?`}
              autoFocus
              style={{
                width: "100%",
                minHeight: 64,
                maxHeight: 160,
                resize: "none",
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-primary)",
                fontSize: 14,
                fontFamily: "var(--font-sans)",
                lineHeight: 1.6,
                padding: 0,
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 160) + "px";
              }}
            />

            {/* Toolbar row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginTop: 12,
                borderTop: "var(--border-hairline)",
                paddingTop: 12,
              }}
            >
              {/* Blocks dropdown */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setBlocksOpen(!blocksOpen)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 10px",
                    borderRadius: 6,
                    border: "none",
                    background: blocksOpen ? "rgba(var(--ui-rgb), 0.05)" : "transparent",
                    color:
                      selectedSessionIds.size > 0 ? "var(--mi-accent)" : "var(--text-tertiary)",
                    fontSize: 12,
                    fontFamily: "var(--font-sans)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedSessionIds.size === 0)
                      e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    if (selectedSessionIds.size === 0)
                      e.currentTarget.style.color = "var(--text-tertiary)";
                  }}
                >
                  <Layers size={13} />
                  Blocks
                  {selectedSessionIds.size > 0 && (
                    <span
                      style={{
                        background: "rgba(var(--mi-accent-rgb, 130,192,204), 0.15)",
                        color: "var(--mi-accent)",
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "1px 5px",
                        borderRadius: 4,
                      }}
                    >
                      {selectedSessionIds.size}
                    </span>
                  )}
                  <ChevronDown
                    size={12}
                    style={{
                      transform: blocksOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.15s ease",
                    }}
                  />
                </button>

                {/* Dropdown panel */}
                {blocksOpen && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 6px)",
                      left: 0,
                      width: 340,
                      maxHeight: 260,
                      overflowY: "auto",
                      background: "var(--bg-raised)",
                      border: "var(--border-subtle)",
                      borderRadius: 10,
                      padding: "6px 0",
                      zIndex: 50,
                      boxShadow: "0 8px 30px rgba(0, 0, 0, 0.4)",
                    }}
                  >
                    {completedSessions.length === 0 ? (
                      <div
                        style={{
                          padding: "20px 14px",
                          textAlign: "center",
                          fontSize: 12,
                          color: "var(--text-tertiary)",
                        }}
                      >
                        No completed blocks yet
                      </div>
                    ) : (
                      completedSessions.map((session: SessionListItem) => {
                        const isSelected = selectedSessionIds.has(session.id);
                        return (
                          <div
                            key={session.id}
                            onClick={() => toggleSession(session.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "8px 14px",
                              cursor: "pointer",
                              transition: "background 0.1s ease",
                              background: isSelected
                                ? "rgba(var(--mi-accent-rgb, 130,192,204), 0.06)"
                                : "transparent",
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected)
                                e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.03)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = isSelected
                                ? "rgba(var(--mi-accent-rgb, 130,192,204), 0.06)"
                                : "transparent";
                            }}
                          >
                            {/* Checkbox */}
                            <div
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: 4,
                                border: isSelected ? "none" : "1px solid rgba(var(--ui-rgb), 0.15)",
                                background: isSelected ? "var(--mi-accent)" : "transparent",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                transition: "all 0.1s ease",
                              }}
                            >
                              {isSelected && <Check size={10} color="#fff" strokeWidth={2.5} />}
                            </div>

                            {/* Session info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: isSelected
                                    ? "var(--text-primary)"
                                    : "var(--text-secondary)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {session.name || "Unnamed block"}
                              </div>
                            </div>

                            {/* Meta */}
                            <span
                              style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0 }}
                            >
                              {formatDuration(session.duration)}
                            </span>
                            <span
                              style={{ fontSize: 11, color: "var(--text-tertiary)", flexShrink: 0 }}
                            >
                              {formatRelativeDate(session.startedAt)}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Upload file */}
              <button
                onClick={async () => {
                  const result = await window.consoleAPI.localDocsPickFile?.();
                  if (result && !result.canceled && !result.error) {
                    handleClose();
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: "transparent",
                  color: "var(--text-tertiary)",
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-tertiary)";
                }}
              >
                <Paperclip size={13} />
                Upload
              </button>

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Generate */}
              <button
                onClick={handleGenerate}
                disabled={!input.trim()}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: "none",
                  background: input.trim() ? "var(--mi-accent)" : "rgba(var(--ui-rgb), 0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: input.trim() ? "pointer" : "default",
                  flexShrink: 0,
                  transition: "background 0.15s ease",
                  opacity: input.trim() ? 1 : 0.4,
                }}
              >
                <ArrowUp size={15} color="var(--bg-base)" />
              </button>
            </div>
          </div>
        )}

        {/* ── Generating state ────────────────────────────────── */}
        {isGenerating && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "48px 20px",
              gap: 16,
            }}
          >
            <Loader2
              size={24}
              style={{ color: "var(--mi-accent)", animation: "spin 1s linear infinite" }}
            />
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                {progress ? phaseLabels[progress.phase] || "Working..." : "Starting..."}
              </p>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
                {progress?.message || "Initializing..."}
              </p>
            </div>
          </div>
        )}

        {/* ── Complete state ───────────────────────────────────── */}
        {isComplete && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "48px 20px",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "rgba(var(--status-success-rgb), 0.1)",
                border: "0.5px solid rgba(var(--status-success-rgb), 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Check size={22} style={{ color: "var(--status-success)" }} />
            </div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
              {entityLabelTitle} created
            </p>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Opening...</p>
          </div>
        )}

        {/* ── Error state ──────────────────────────────────────── */}
        {error && (
          <div
            style={{
              padding: "32px 20px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                padding: "20px",
                borderRadius: 10,
                background: "rgba(var(--status-error-rgb), 0.06)",
                border: "0.5px solid rgba(var(--status-error-rgb), 0.15)",
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--status-error)" }}>
                Generation failed
              </p>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>{error}</p>
              <button
                onClick={() => {
                  reset?.();
                  setInput("");
                }}
                style={{
                  marginTop: 14,
                  padding: "6px 14px",
                  borderRadius: 7,
                  border: "var(--border-subtle)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* ── AI Provider Required Modal ────────────────────────── */}
        {showProviderModal && (
          <div
            style={{
              padding: "24px 20px",
            }}
          >
            <div
              style={{
                padding: "20px",
                borderRadius: 12,
                background: "var(--bg-raised)",
                border: "0.5px solid rgba(var(--ui-rgb), 0.1)",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(var(--mi-accent-rgb), 0.12)",
                  }}
                >
                  <Settings size={20} style={{ color: "var(--mi-accent)" }} />
                </div>
                <div>
                  <h3
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      margin: 0,
                    }}
                  >
                    AI Provider Required
                  </h3>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0" }}>
                    Add your API key to get started
                  </p>
                </div>
              </div>
              <p
                style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}
              >
                Document generation needs an AI provider to work. Go to{" "}
                <strong style={{ color: "var(--text-primary)" }}>Settings</strong> and add your API
                key for Google, OpenAI, or Anthropic.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => setShowProviderModal(false)}
                  style={{
                    flex: 1,
                    padding: "8px 16px",
                    fontSize: 13,
                    borderRadius: 8,
                    background: "var(--bg-overlay)",
                    color: "var(--text-secondary)",
                    border: "0.5px solid rgba(var(--ui-rgb), 0.10)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  Later
                </button>
                <button
                  onClick={() => {
                    setShowProviderModal(false);
                    handleClose();
                    navigate("/profile");
                  }}
                  style={{
                    flex: 1,
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 8,
                    background: "var(--mi-accent)",
                    color: "var(--bg-base)",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  Open Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
