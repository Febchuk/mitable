import { useRef, KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";

interface RichTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function RichTextInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Type your message...",
  disabled = false,
}: RichTextInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative">
      {/* Input Area - ChatGPT Style */}
      <div className="relative bg-[#2f2f2f] border-2 border-transparent hover:border-primary/30 focus-within:border-primary/50 rounded-full overflow-hidden transition-all shadow-lg">
        <div className="flex items-center px-5 py-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 bg-transparent text-white placeholder-text-tertiary outline-none resize-none min-h-[24px] max-h-[120px]"
            rows={1}
            style={{
              height: 'auto',
              minHeight: '24px',
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
            }}
          />
          
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim() || disabled}
            className="ml-3 w-8 h-8 bg-white hover:bg-gray-200 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-all flex-shrink-0"
            aria-label="Send message"
          >
            <ArrowUp size={18} className={!value.trim() || disabled ? "text-gray-400" : "text-black"} />
          </button>
        </div>
      </div>
    </div>
  );
}
