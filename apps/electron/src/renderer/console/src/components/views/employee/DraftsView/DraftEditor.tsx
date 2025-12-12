import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEMO_CONFIG } from "@/console/src/data/demoConfig";

interface DraftEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSend: () => void;
  isSending?: boolean;
}

export default function DraftEditor({
  content,
  onChange,
  onSend,
  isSending = false,
}: DraftEditorProps) {
  return (
    <div className="h-full flex flex-col p-6">
      {/* Editor Area */}
      <div className="flex-1 overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-full bg-background-elevated border border-border-subtle rounded-lg resize-none text-text-primary text-sm leading-relaxed font-mono p-4 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
          placeholder={DEMO_CONFIG.ui.draftEditor.placeholder}
          disabled={isSending}
        />
      </div>

      {/* Footer with Send Button */}
      <div className="pt-4 flex items-center justify-between">
        <p className="text-xs text-text-tertiary">
          {DEMO_CONFIG.ui.draftEditor.tip}
        </p>
        <Button
          onClick={onSend}
          disabled={isSending || !content.trim()}
          className="gap-2 bg-primary hover:bg-primary/90 rounded-full px-6 disabled:opacity-50"
        >
          {isSending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              {DEMO_CONFIG.ui.draftEditor.sendingButton}
            </>
          ) : (
            <>
              <Send size={16} />
              {DEMO_CONFIG.ui.draftEditor.sendButton}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
