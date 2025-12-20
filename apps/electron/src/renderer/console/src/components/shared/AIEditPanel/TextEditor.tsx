/**
 * TextEditor
 *
 * Full-height text editor for the left side of the AI edit panel.
 * Supports markdown editing with monospace font.
 */

interface TextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function TextEditor({
  content,
  onChange,
  placeholder = "Write your content here...",
  disabled = false,
}: TextEditorProps) {
  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex-1 overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-full bg-background-elevated border border-border-subtle rounded-lg resize-none text-text-primary text-sm leading-relaxed font-mono p-4 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all disabled:opacity-50"
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
      <p className="text-xs text-text-tertiary pt-4">
        Supports markdown formatting
      </p>
    </div>
  );
}
