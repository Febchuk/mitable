/**
 * AIEditPanel
 *
 * Split-pane editor with AI assistance for editing text content.
 * Left side: Text editor (60%)
 * Right side: AI chat panel for revisions (40%)
 */

import { useState } from "react";
import { ArrowLeft, Save, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import TextEditor from "./TextEditor";
import AIChatPanel from "./AIChatPanel";

interface AIEditPanelProps {
  title: string;
  subtitle?: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onAutoSave?: (content: string) => Promise<void>; // Save without closing editor
  onCancel: () => void;
  onRevise: (instruction: string, currentContent: string) => Promise<{ suggestion: string }>;
  placeholder?: string;
  contextLabel?: string; // e.g., "session summary"
  sessionId?: string; // When provided, enables conversational refinement
}

export default function AIEditPanel({
  title,
  subtitle,
  initialContent,
  onSave,
  onAutoSave,
  onCancel,
  onRevise,
  placeholder = "Write your content here...",
  contextLabel = "content",
  sessionId,
}: AIEditPanelProps) {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(content);
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplySuggestion = (suggestion: string) => {
    setContent(suggestion);
    if (onAutoSave) {
      onAutoSave(suggestion).catch(() => {});
    }
  };

  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col bg-background-primary overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            className="text-text-secondary hover:text-text-primary hover:bg-background-elevated"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
            {subtitle && <p className="text-sm text-text-secondary">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isSaving}
            className="gap-2 text-text-secondary hover:text-text-primary hover:bg-background-elevated"
          >
            <X size={16} />
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !content.trim()}
            className="gap-2 bg-primary text-white hover:bg-primary/90"
          >
            {isSaving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Split Pane Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Text Editor (60%) */}
        <div className="w-3/5 border-r border-border-subtle overflow-hidden">
          <TextEditor
            content={content}
            onChange={setContent}
            placeholder={placeholder}
            disabled={isSaving}
          />
        </div>

        {/* Right: AI Chat Panel (40%) */}
        <div className="w-2/5 p-4 overflow-hidden">
          <AIChatPanel
            currentContent={content}
            onApplySuggestion={handleApplySuggestion}
            onRevise={onRevise}
            contextLabel={contextLabel}
            sessionId={sessionId}
          />
        </div>
      </div>
    </div>
  );
}

export { TextEditor, AIChatPanel };
export { default as RichTextEditor } from "./RichTextEditor";
