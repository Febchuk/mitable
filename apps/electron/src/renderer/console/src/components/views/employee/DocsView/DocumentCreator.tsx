/**
 * DocumentCreator - AI-powered document creation in a slide-over panel
 *
 * Streaming interface where users describe what they want and the AI
 * generates a document using session data via RAG + RLM pipeline.
 * Shows real-time progress updates during generation.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Sparkles,
  Loader2,
  FileText,
  Check,
  Search,
  Database,
  PenTool,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGenerateDocumentStream } from "@/console/src/hooks/queries/documents/useGenerateDocumentStream";

interface DocumentCreatorProps {
  onClose: () => void;
}

const SUGGESTIONS = [
  { label: "Weekly Report", prompt: "Write a weekly report summarizing my work" },
  { label: "How-To Guide", prompt: "Create a how-to guide for a process I worked on" },
  { label: "Meeting Notes", prompt: "Generate meeting notes from my sessions" },
  { label: "Project Summary", prompt: "Summarize the project I've been working on" },
];

const PHASE_ICONS: Record<string, any> = {
  indexing_sessions: Database,
  searching_sessions: Search,
  analyzing_data: Database,
  drafting: PenTool,
  polishing: Wand2,
  complete: Check,
};

const PHASE_LABELS: Record<string, string> = {
  indexing_sessions: "Indexing Sessions",
  searching_sessions: "Searching Sessions",
  analyzing_data: "Analyzing Data",
  drafting: "Drafting Document",
  polishing: "Polishing",
  complete: "Complete",
};

export default function DocumentCreator({ onClose }: DocumentCreatorProps) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const { generate, reset, isGenerating, content, documentId, progress, error } =
    useGenerateDocumentStream();

  const handleGenerate = async () => {
    if (!input.trim()) return;
    await generate(input, "knowledge-article");
  };

  const handleViewDocument = () => {
    if (documentId) {
      navigate(`/docs/${documentId}`);
      onClose();
    }
  };

  const isComplete = progress?.phase === "complete" && documentId;

  // Auto-navigate to document when generation completes
  useEffect(() => {
    if (isComplete) {
      // Small delay to show success message briefly
      const timer = setTimeout(() => {
        handleViewDocument();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isComplete, handleViewDocument]);

  return (
    <div className="flex flex-col h-full bg-background-primary">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-purple rounded-xl flex items-center justify-center">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-text-primary">Create Document</h2>
            <p className="text-xs text-text-tertiary">AI will use your session data</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-9 w-9 p-0">
          <X size={18} className="text-text-tertiary" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          {/* Initial State - Suggestions */}
          {!isGenerating && !content && (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="max-w-md w-full space-y-6">
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold text-text-primary">
                    What would you like to create?
                  </h3>
                  <p className="text-sm text-text-tertiary">
                    AI will search your sessions and generate a document
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => setInput(s.prompt)}
                      className="text-left p-4 rounded-xl bg-background-secondary border border-border-subtle hover:border-purple-500/30 hover:bg-background-elevated transition-all group"
                    >
                      <span className="text-sm font-medium text-text-primary group-hover:text-purple-400 transition-colors">
                        {s.label}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="space-y-3 pt-4">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                    placeholder="Or describe your own..."
                    className="min-h-[80px] w-full resize-none bg-background-elevated border-border-subtle focus:border-purple-500/50 rounded-xl"
                  />
                  <Button
                    onClick={handleGenerate}
                    disabled={!input.trim()}
                    className="w-full bg-gradient-purple text-white hover:shadow-glow-purple"
                  >
                    <Sparkles size={16} className="mr-2" />
                    Generate Document
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Generating State - Progress */}
          {isGenerating && (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 overflow-auto">
                <div className="p-6 space-y-6">
                  {/* Progress Indicator */}
                  <div className="bg-background-secondary border border-border-subtle rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-4">
                      {progress && progress.phase !== "complete" && PHASE_ICONS[progress.phase] && (
                        <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                          {(() => {
                            const Icon = PHASE_ICONS[progress.phase];
                            return <Icon size={20} className="text-purple-400" />;
                          })()}
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-medium text-text-primary">
                          {progress ? PHASE_LABELS[progress.phase] : "Starting..."}
                        </div>
                        <div className="text-xs text-text-tertiary mt-1">
                          {progress?.message || "Initializing..."}
                        </div>
                      </div>
                      <Loader2 size={18} className="text-purple-400 animate-spin" />
                    </div>
                    <div className="h-1 bg-background-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-purple animate-pulse"
                        style={{ width: "60%" }}
                      />
                    </div>
                  </div>

                  {/* Streaming Content */}
                  {content && (
                    <div className="bg-background-elevated border border-border-subtle rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <FileText size={16} className="text-text-tertiary" />
                        <span className="text-sm font-medium text-text-secondary">
                          Generated Content
                        </span>
                      </div>
                      <div className="prose prose-invert prose-sm max-w-none">
                        <div className="text-text-primary whitespace-pre-wrap text-sm leading-relaxed">
                          {content}
                          <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-1" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Complete State - Success message only (auto-navigates) */}
          {!isGenerating && content && isComplete && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="max-w-md w-full space-y-4 text-center">
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
                  <div className="flex flex-col items-center gap-3 text-green-400">
                    <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                      <Check size={24} />
                    </div>
                    <div>
                      <div className="text-base font-medium">Document created successfully!</div>
                      <div className="text-sm text-text-tertiary mt-1">Opening document...</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="max-w-md w-full bg-red-500/10 border border-red-500/30 rounded-xl p-6 space-y-4">
                <div className="text-center space-y-2">
                  <div className="text-red-400 text-sm font-medium">Generation Failed</div>
                  <div className="text-text-tertiary text-xs">{error}</div>
                </div>
                <Button
                  onClick={() => {
                    setInput("");
                    reset(); // Reset hook state instead of reloading entire page
                  }}
                  variant="outline"
                  className="w-full border-border-subtle"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
