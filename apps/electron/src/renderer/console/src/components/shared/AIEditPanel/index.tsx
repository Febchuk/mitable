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
  onCancel: () => void;
  onRevise: (instruction: string, currentContent: string) => Promise<{ suggestion: string }>;
  placeholder?: string;
  contextLabel?: string; // e.g., "session summary"
}

export default function AIEditPanel({
  title,
  subtitle,
  initialContent,
  onSave,
  onCancel,
  onRevise,
  placeholder = "Write your content here...",
  contextLabel = "content",
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
  };

  return (
    <div className="h-full flex flex-col bg-background-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            className="text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
            {subtitle && (
              <p className="text-sm text-text-secondary">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isSaving}
            className="gap-2"
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
      <div className="flex-1 flex min-h-0">
        {/* Left: Text Editor (60%) */}
        <div className="w-3/5 border-r border-border-subtle">
          <TextEditor
            content={content}
            onChange={setContent}
            placeholder={placeholder}
            disabled={isSaving}
          />
        </div>

        {/* Right: AI Chat Panel (40%) */}
        <div className="w-2/5 p-4">
          <AIChatPanel
            currentContent={content}
            onApplySuggestion={handleApplySuggestion}
            onRevise={onRevise}
            contextLabel={contextLabel}
          />
        </div>
      </div>
    </div>
  );
}

export { TextEditor, AIChatPanel };
