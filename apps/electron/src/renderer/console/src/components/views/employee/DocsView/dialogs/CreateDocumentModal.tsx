/**
 * CreateDocumentModal
 *
 * Redesigned modal for creating documents with clean, functional design.
 * Features:
 * - Clean header (no sparkle icons)
 * - Multi-line textarea with Enter/Shift+Enter support
 * - Collapsible advanced options
 * - Optional session selection (hints, not required)
 * - Placeholder for artifacts (coming soon)
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronRight, ChevronDown, Loader2, Check, FileText, Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGenerateDocumentStream } from "@/console/src/hooks/queries/documents/useGenerateDocumentStream";
import { useSessions } from "@/console/src/hooks/queries/monitoring";
import type { SessionListItem } from "@/console/src/services/monitoringService";

interface CreateDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Helper to format duration
function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Helper to format relative date
function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateDay.getTime() >= today.getTime()) {
    return "Today";
  } else if (dateDay.getTime() >= yesterday.getTime()) {
    return "Yesterday";
  } else if (dateDay.getTime() >= weekAgo.getTime()) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
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

  // Form state
  const [input, setInput] = useState("");
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [sessionSearch, setSessionSearch] = useState("");

  // Generation state
  const { generate, isGenerating, content, documentId, progress, error, reset } =
    useGenerateDocumentStream();

  // Fetch sessions for selection
  const { data: sessions, isLoading: isLoadingSessions } = useSessions();

  // Filter to completed sessions (ended, ready, delivered) with captures
  const completedSessions = (sessions || []).filter(
    (s: SessionListItem) =>
      ["ended", "ready", "delivered"].includes(s.status) && s.captureCount > 0
  );

  // Filter by search query
  const filteredSessions = sessionSearch.trim()
    ? completedSessions.filter((s: SessionListItem) =>
        (s.name || "Unnamed session").toLowerCase().includes(sessionSearch.toLowerCase())
      )
    : completedSessions;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      reset?.();
      setInput("");
      setSelectedSessionIds(new Set());
      setIsAdvancedOpen(false);
      setSessionSearch("");
    }
  }, [open]);

  // Auto-navigate when generation completes
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
    await generate(input, "knowledge-article", { sessionIds });
  };

  const handleStartBlank = () => {
    onOpenChange(false);
    navigate("/docs/new");
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
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const targetSessions = filteredSessions;
    const allFilteredSelected = targetSessions.every((s: SessionListItem) => selectedSessionIds.has(s.id));

    if (allFilteredSelected) {
      // Deselect all filtered sessions
      setSelectedSessionIds((prev) => {
        const next = new Set(prev);
        targetSessions.forEach((s: SessionListItem) => next.delete(s.id));
        return next;
      });
    } else {
      // Select all filtered sessions
      setSelectedSessionIds((prev) => {
        const next = new Set(prev);
        targetSessions.forEach((s: SessionListItem) => next.add(s.id));
        return next;
      });
    }
  };

  const allFilteredSelected = filteredSessions.length > 0 &&
    filteredSessions.every((s: SessionListItem) => selectedSessionIds.has(s.id));

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[560px] p-0 bg-canvas-base border-stroke-subtle overflow-hidden"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="font-display font-semibold text-ink-primary text-lg">
            Create Document
          </h2>
          <button
            onClick={handleClose}
            className="p-2 -mr-2 rounded-lg text-ink-tertiary hover:text-ink-secondary hover:bg-canvas-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-2">
          {/* Initial State */}
          {!isGenerating && !isComplete && !error && (
            <div className="space-y-4">
              {/* Main Input */}
              <div>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe what you want to create, e.g. 'weekly report' or 'how-to guide for setting up CI'..."
                  className="w-full min-h-[80px] max-h-[200px] resize-none px-4 py-3 bg-canvas-overlay border border-stroke-subtle rounded-xl text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-indigo/50 focus:ring-2 focus:ring-indigo/20 transition-all"
                  autoFocus
                />
              </div>

              {/* Advanced Options Toggle */}
              <button
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                className="flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary transition-colors"
              >
                {isAdvancedOpen ? (
                  <ChevronDown size={16} className="text-ink-tertiary" />
                ) : (
                  <ChevronRight size={16} className="text-ink-tertiary" />
                )}
                Advanced options
              </button>

              {/* Advanced Options Content */}
              {isAdvancedOpen && (
                <div className="space-y-4 animate-reveal-up">
                  {/* Sessions Section */}
                  <div className="bg-canvas-overlay border border-stroke-subtle rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-stroke-subtle">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-primary">
                          Include specific sessions
                        </span>
                        {selectedSessionIds.size > 0 && (
                          <span className="px-1.5 py-0.5 text-xs font-medium bg-indigo/10 text-indigo rounded">
                            {selectedSessionIds.size}
                          </span>
                        )}
                      </div>
                      {filteredSessions.length > 0 && (
                        <button
                          onClick={handleSelectAll}
                          className="text-xs text-ink-tertiary hover:text-indigo transition-colors"
                        >
                          {allFilteredSelected ? "Clear" : "Select all"}
                        </button>
                      )}
                    </div>

                    {/* Search input */}
                    {completedSessions.length > 3 && (
                      <div className="px-3 py-2 border-b border-stroke-subtle">
                        <div className="relative">
                          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary" />
                          <input
                            type="text"
                            value={sessionSearch}
                            onChange={(e) => setSessionSearch(e.target.value)}
                            placeholder="Search sessions..."
                            className="w-full pl-8 pr-3 py-1.5 text-sm bg-canvas-base border border-stroke-subtle rounded-lg text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-indigo/50"
                          />
                        </div>
                      </div>
                    )}

                    <div className="max-h-[200px] overflow-y-auto">
                      {isLoadingSessions ? (
                        <div className="px-4 py-6 text-center">
                          <Loader2 size={16} className="animate-spin text-ink-tertiary mx-auto" />
                        </div>
                      ) : completedSessions.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-ink-tertiary">
                          No completed sessions available
                        </div>
                      ) : filteredSessions.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-ink-tertiary">
                          No sessions match "{sessionSearch}"
                        </div>
                      ) : (
                        filteredSessions.map((session: SessionListItem) => (
                          <label
                            key={session.id}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas-muted cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedSessionIds.has(session.id)}
                              onChange={() => toggleSession(session.id)}
                              className="w-4 h-4 rounded border-stroke-subtle text-indigo focus:ring-indigo/20 focus:ring-offset-0 bg-canvas-overlay"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-ink-primary truncate block">
                                {session.name || "Unnamed session"}
                              </span>
                            </div>
                            <span className="text-xs text-ink-tertiary tabular-nums">
                              {formatDuration(session.duration.totalMs)}
                            </span>
                            <span className="text-xs text-ink-tertiary">
                              {formatRelativeDate(session.startedAt)}
                            </span>
                          </label>
                        ))
                      )}
                    </div>

                    <div className="px-4 py-2 border-t border-stroke-subtle">
                      <p className="text-xs text-ink-tertiary">
                        Leave empty to search all sessions automatically
                      </p>
                    </div>
                  </div>

                  {/* Artifacts Section (Placeholder) */}
                  <div className="bg-canvas-overlay border border-stroke-subtle rounded-xl opacity-60">
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-primary">
                          Artifacts to include
                        </span>
                        <span className="px-1.5 py-0.5 text-xs font-medium bg-canvas-muted text-ink-tertiary rounded">
                          coming soon
                        </span>
                      </div>
                    </div>
                    <div className="px-4 py-6 text-center text-sm text-ink-tertiary border-t border-stroke-subtle">
                      No artifacts uploaded yet
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Generating State */}
          {isGenerating && (
            <div className="py-8">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-2 border-indigo/20 border-t-indigo animate-spin" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-ink-primary">
                    {progress ? PHASE_LABELS[progress.phase] : "Starting..."}
                  </p>
                  <p className="text-xs text-ink-tertiary mt-1">
                    {progress?.message || "Initializing..."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Complete State */}
          {isComplete && (
            <div className="py-8 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald/10 border border-emerald/20 mb-4">
                <Check size={28} className="text-emerald" />
              </div>
              <p className="text-sm font-medium text-ink-primary">Document created</p>
              <p className="text-xs text-ink-tertiary mt-1">Opening document...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="py-8">
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                <p className="text-sm font-medium text-red-400">Generation failed</p>
                <p className="text-xs text-ink-tertiary mt-2">{error}</p>
                <Button
                  onClick={() => {
                    reset?.();
                    setInput("");
                  }}
                  variant="outline"
                  size="sm"
                  className="mt-4 border-stroke-subtle"
                >
                  Try again
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isGenerating && !isComplete && !error && (
          <div className="px-6 pb-6 space-y-3">
            <Button
              onClick={handleGenerate}
              disabled={!input.trim()}
              className="w-full bg-indigo hover:bg-indigo/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stroke-subtle" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-canvas-base px-3 text-ink-tertiary">or</span>
              </div>
            </div>

            <Button
              variant="ghost"
              onClick={handleStartBlank}
              className="w-full text-ink-secondary hover:text-ink-primary hover:bg-canvas-muted"
            >
              <FileText size={16} className="mr-2" />
              Start with blank document
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
