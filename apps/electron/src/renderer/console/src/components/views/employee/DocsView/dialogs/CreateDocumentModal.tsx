/**
 * CreateDocumentModal — Redesigned
 *
 * Simplified modal: textarea with inline Upload + Blocks controls.
 * No title, no blank doc option. Blocks dropdown shows recent sessions.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronDown, Loader2, Check, ArrowUp, Paperclip, Layers } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useGenerateDocumentStream } from "@/console/src/hooks/queries/documents/useGenerateDocumentStream";
import { useSessions } from "@/console/src/hooks/queries/monitoring";
import { useUploadArtifact } from "@/console/src/hooks/queries/artifacts";
import type { SessionListItem } from "@/console/src/services/monitoringService";

interface CreateDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
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

export default function CreateDocumentModal({ open, onOpenChange }: CreateDocumentModalProps) {
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [input, setInput] = useState("");
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; id: string }[]>([]);

  const { generate, isGenerating, documentId, progress, error, reset } =
    useGenerateDocumentStream();

  const { data: sessionsData } = useSessions();
  const sessions = sessionsData?.sessions ?? [];
  const completedSessions = sessions.filter(
    (s: SessionListItem) => ["ended", "ready", "delivered"].includes(s.status) && s.captureCount > 0
  );

  const uploadMutation = useUploadArtifact();

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
      setUploadedFiles([]);
    }
  }, [open]);

  const isComplete = progress?.phase === "complete" && documentId;
  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => {
        navigate(`/docs/${documentId}`);
        onOpenChange(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isComplete, documentId, navigate, onOpenChange]);

  const handleGenerate = async () => {
    if (!input.trim()) return;
    const sessionIds = selectedSessionIds.size > 0 ? Array.from(selectedSessionIds) : undefined;
    const artifactIds = uploadedFiles.length > 0 ? uploadedFiles.map((f) => f.id) : undefined;
    await generate(input, "knowledge-article", { sessionIds, artifactIds });
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await uploadMutation.mutateAsync(file);
      if (result?.artifact?.id) {
        setUploadedFiles((prev) => [...prev, { name: file.name, id: result.artifact.id }]);
      }
    } catch {
      console.error("[CreateDocModal] Upload failed");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeUploadedFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const showForm = !isGenerating && !isComplete && !error;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[520px] p-0 overflow-visible"
        style={{
          background: "#1A1916",
          border: "0.5px solid rgba(236, 232, 224, 0.1)",
          borderRadius: 14,
        }}
        showCloseButton={false}
      >
        <VisuallyHidden>
          <DialogTitle>Create document</DialogTitle>
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
            color: "#6B665C",
            zIndex: 10,
            transition: "color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#ECE8E0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#6B665C";
          }}
        >
          <X size={15} />
        </button>

        {/* ── Form state ──────────────────────────────────────── */}
        {showForm && (
          <div style={{ padding: "20px 20px 16px" }}>
            {/* Attached files */}
            {uploadedFiles.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 10,
                }}
              >
                {uploadedFiles.map((file) => (
                  <span
                    key={file.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "rgba(155, 132, 232, 0.08)",
                      border: "0.5px solid rgba(155, 132, 232, 0.2)",
                      fontSize: 11,
                      color: "#9B84E8",
                    }}
                  >
                    <Paperclip size={10} />
                    {file.name}
                    <button
                      onClick={() => removeUploadedFile(file.id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#9B84E8",
                        padding: 0,
                        display: "flex",
                        marginLeft: 2,
                      }}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Selected blocks indicator */}
            {selectedSessionIds.size > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginBottom: 10,
                  fontSize: 11,
                  color: "#9B84E8",
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
              placeholder="What will your doc be about?"
              autoFocus
              style={{
                width: "100%",
                minHeight: 64,
                maxHeight: 160,
                resize: "none",
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#ECE8E0",
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
                borderTop: "0.5px solid rgba(236, 232, 224, 0.06)",
                paddingTop: 12,
              }}
            >
              {/* Upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: "transparent",
                  color: "#6B665C",
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                  cursor: uploadMutation.isPending ? "default" : "pointer",
                  transition: "color 0.15s ease",
                  opacity: uploadMutation.isPending ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!uploadMutation.isPending) e.currentTarget.style.color = "#ECE8E0";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#6B665C";
                }}
              >
                {uploadMutation.isPending ? (
                  <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Paperclip size={13} />
                )}
                Upload
              </button>

              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                style={{ display: "none" }}
                accept=".pdf,.doc,.docx,.txt,.md,.csv,.json"
              />

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
                    background: blocksOpen ? "rgba(236, 232, 224, 0.05)" : "transparent",
                    color: selectedSessionIds.size > 0 ? "#9B84E8" : "#6B665C",
                    fontSize: 12,
                    fontFamily: "var(--font-sans)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedSessionIds.size === 0) e.currentTarget.style.color = "#ECE8E0";
                  }}
                  onMouseLeave={(e) => {
                    if (selectedSessionIds.size === 0) e.currentTarget.style.color = "#6B665C";
                  }}
                >
                  <Layers size={13} />
                  Blocks
                  {selectedSessionIds.size > 0 && (
                    <span
                      style={{
                        background: "rgba(155, 132, 232, 0.15)",
                        color: "#9B84E8",
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
                      background: "#211F1B",
                      border: "0.5px solid rgba(236, 232, 224, 0.1)",
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
                          color: "#6B665C",
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
                              background: isSelected ? "rgba(155, 132, 232, 0.06)" : "transparent",
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected)
                                e.currentTarget.style.background = "rgba(236, 232, 224, 0.03)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = isSelected
                                ? "rgba(155, 132, 232, 0.06)"
                                : "transparent";
                            }}
                          >
                            {/* Checkbox */}
                            <div
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: 4,
                                border: isSelected ? "none" : "1px solid rgba(236, 232, 224, 0.15)",
                                background: isSelected ? "#9B84E8" : "transparent",
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
                                  color: isSelected ? "#ECE8E0" : "#9B9689",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {session.name || "Unnamed block"}
                              </div>
                            </div>

                            {/* Meta */}
                            <span style={{ fontSize: 11, color: "#6B665C", flexShrink: 0 }}>
                              {formatDuration(session.duration.totalMs)}
                            </span>
                            <span style={{ fontSize: 11, color: "#6B665C", flexShrink: 0 }}>
                              {formatRelativeDate(session.startedAt)}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

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
                  background: input.trim() ? "#9B84E8" : "rgba(236, 232, 224, 0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: input.trim() ? "pointer" : "default",
                  flexShrink: 0,
                  transition: "background 0.15s ease",
                  opacity: input.trim() ? 1 : 0.4,
                }}
              >
                <ArrowUp size={15} color="#fff" />
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
            <Loader2 size={24} style={{ color: "#9B84E8", animation: "spin 1s linear infinite" }} />
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "#ECE8E0" }}>
                {progress ? PHASE_LABELS[progress.phase] || "Working..." : "Starting..."}
              </p>
              <p style={{ fontSize: 12, color: "#6B665C", marginTop: 4 }}>
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
                background: "rgba(58, 155, 107, 0.1)",
                border: "0.5px solid rgba(58, 155, 107, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Check size={22} style={{ color: "#3A9B6B" }} />
            </div>
            <p style={{ fontSize: 13, fontWeight: 500, color: "#ECE8E0" }}>Document created</p>
            <p style={{ fontSize: 12, color: "#6B665C" }}>Opening...</p>
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
                background: "rgba(232, 116, 116, 0.06)",
                border: "0.5px solid rgba(232, 116, 116, 0.15)",
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 500, color: "#E87474" }}>Generation failed</p>
              <p style={{ fontSize: 12, color: "#6B665C", marginTop: 6 }}>{error}</p>
              <button
                onClick={() => {
                  reset?.();
                  setInput("");
                }}
                style={{
                  marginTop: 14,
                  padding: "6px 14px",
                  borderRadius: 7,
                  border: "0.5px solid rgba(236, 232, 224, 0.12)",
                  background: "transparent",
                  color: "#ECE8E0",
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
      </DialogContent>
    </Dialog>
  );
}
