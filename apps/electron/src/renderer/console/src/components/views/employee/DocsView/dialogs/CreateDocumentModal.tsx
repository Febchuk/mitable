/**
 * CreateDocumentModal
 *
 * Unified modal for creating documents - either with AI generation
 * from session data or starting with a blank document.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Sparkles, Loader2, FileText, Check, Search, Database, PenTool, Wand2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGenerateDocumentStream } from "@/console/src/hooks/queries/documents/useGenerateDocumentStream";

interface CreateDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SUGGESTIONS = [
  { label: "Weekly Report", prompt: "Write a weekly report summarizing my work from the past week" },
  { label: "How-To Guide", prompt: "Create a how-to guide for a process I worked on" },
  { label: "Meeting Notes", prompt: "Generate meeting notes from my sessions" },
  { label: "Project Summary", prompt: "Summarize the project I've been working on" },
];

const PHASE_ICONS: Record<string, React.ElementType> = {
  searching_sessions: Search,
  analyzing_data: Database,
  drafting: PenTool,
  polishing: Wand2,
  complete: Check,
};

const PHASE_LABELS: Record<string, string> = {
  searching_sessions: "Searching Sessions",
  analyzing_data: "Analyzing Data",
  drafting: "Drafting Document",
  polishing: "Polishing",
  complete: "Complete",
};

export default function CreateDocumentModal({ open, onOpenChange }: CreateDocumentModalProps) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const { generate, isGenerating, content, documentId, progress, error, reset } =
    useGenerateDocumentStream();

  const handleGenerate = async () => {
    if (!input.trim()) return;
    await generate(input, "knowledge-article");
  };

  const handleSkipToBlank = () => {
    onOpenChange(false);
    navigate("/docs/new");
  };

  const handleViewDocument = () => {
    if (documentId) {
      navigate(`/docs/${documentId}`);
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    reset?.();
    setInput("");
    onOpenChange(false);
  };

  const isComplete = progress?.phase === "complete" && documentId;

  // Auto-navigate to document when generation completes
  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => {
        handleViewDocument();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isComplete]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      reset?.();
      setInput("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] p-0 bg-canvas-base border-stroke-subtle overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-stroke-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo to-rose rounded-xl flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-ink-primary">Create Document</h2>
              <p className="text-xs text-ink-tertiary">AI will use your session data</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-ink-tertiary hover:text-ink-secondary hover:bg-canvas-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Initial State - Suggestions */}
          {!isGenerating && !content && !error && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold text-ink-primary">
                  What would you like to create?
                </h3>
                <p className="text-sm text-ink-tertiary">
                  AI will search your sessions and generate a document
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => setInput(s.prompt)}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      input === s.prompt
                        ? "border-indigo bg-indigo/10"
                        : "border-stroke-subtle bg-canvas-overlay hover:border-indigo/30 hover:bg-canvas-muted"
                    }`}
                  >
                    <span className={`text-sm font-medium ${
                      input === s.prompt ? "text-indigo" : "text-ink-primary"
                    }`}>
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder="Or describe what you want to create..."
                  className="min-h-[80px] w-full resize-none bg-canvas-overlay border-stroke-subtle focus:border-indigo/50 rounded-xl text-ink-primary placeholder:text-ink-tertiary"
                />

                <Button
                  onClick={handleGenerate}
                  disabled={!input.trim()}
                  className="w-full bg-indigo hover:bg-indigo/90 text-white"
                >
                  <Sparkles size={16} className="mr-2" />
                  Generate Document
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
                  onClick={handleSkipToBlank}
                  className="w-full text-ink-secondary hover:text-ink-primary hover:bg-canvas-muted"
                >
                  <FileText size={16} className="mr-2" />
                  Start with blank document
                </Button>
              </div>
            </div>
          )}

          {/* Generating State - Progress */}
          {isGenerating && (
            <div className="space-y-6">
              {/* Progress Indicator */}
              <div className="bg-canvas-overlay border border-stroke-subtle rounded-xl p-4">
                <div className="flex items-center gap-3 mb-4">
                  {progress && progress.phase !== "complete" && PHASE_ICONS[progress.phase] && (
                    <div className="w-10 h-10 bg-indigo/10 rounded-lg flex items-center justify-center">
                      {(() => {
                        const Icon = PHASE_ICONS[progress.phase];
                        return <Icon size={20} className="text-indigo" />;
                      })()}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink-primary">
                      {progress ? PHASE_LABELS[progress.phase] : "Starting..."}
                    </div>
                    <div className="text-xs text-ink-tertiary mt-1">
                      {progress?.message || "Initializing..."}
                    </div>
                  </div>
                  <Loader2 size={18} className="text-indigo animate-spin" />
                </div>
                <div className="h-1 bg-canvas-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo transition-all duration-500"
                    style={{ width: progress ? `${(Object.keys(PHASE_LABELS).indexOf(progress.phase) + 1) * 20}%` : "10%" }}
                  />
                </div>
              </div>

              {/* Streaming Content Preview */}
              {content && (
                <div className="bg-canvas-overlay border border-stroke-subtle rounded-xl p-4 max-h-[200px] overflow-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={16} className="text-ink-tertiary" />
                    <span className="text-sm font-medium text-ink-secondary">
                      Preview
                    </span>
                  </div>
                  <div className="text-ink-primary text-sm leading-relaxed whitespace-pre-wrap">
                    {content.slice(0, 500)}
                    {content.length > 500 && "..."}
                    <span className="inline-block w-2 h-4 bg-indigo animate-pulse ml-1" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Complete State */}
          {!isGenerating && content && isComplete && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald/10 border border-emerald/20 mb-4">
                <Check size={32} className="text-emerald" />
              </div>
              <h3 className="text-lg font-semibold text-ink-primary mb-1">
                Document created!
              </h3>
              <p className="text-sm text-ink-tertiary">Opening document...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-8">
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 space-y-4">
                <div className="text-red-400 text-sm font-medium">Generation Failed</div>
                <div className="text-ink-tertiary text-xs">{error}</div>
                <Button
                  onClick={() => {
                    reset?.();
                    setInput("");
                  }}
                  variant="outline"
                  className="border-stroke-subtle"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
