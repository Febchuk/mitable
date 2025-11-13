import { Response } from "../../ui/ai-response";

interface AIMessageProps {
  content: string;
  isStreaming?: boolean;
}

export default function AIMessage({ content, isStreaming = false }: AIMessageProps) {
  return (
    <div className="mb-4 max-w-[700px]">
      {/* Message Content with Smart Markdown Parsing */}
      <div className="text-[16px] leading-[1.7] text-[#E5E5E5] font-normal">
        <Response parseIncompleteMarkdown={isStreaming}>{content}</Response>
      </div>
      {isStreaming && (
        <div className="flex gap-1 mt-3">
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
        </div>
      )}
    </div>
  );
}
