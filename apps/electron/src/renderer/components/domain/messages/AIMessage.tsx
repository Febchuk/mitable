import { Response } from "../../ui/ai-response";

interface AIMessageProps {
  content: string;
  isStreaming?: boolean;
  timestamp?: Date;
}

function formatMessageTime(date?: Date): string {
  if (!date) return "";
  const now = new Date();
  const msgDate = new Date(date);
  const diffMs = now.getTime() - msgDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  // Show time for today, date for older
  if (msgDate.toDateString() === now.toDateString()) {
    return msgDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return msgDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AIMessage({
  content,
  isStreaming = false,
  timestamp,
}: AIMessageProps) {
  return (
    <div className="mb-6 group">
      {timestamp && !isStreaming && (
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-xs text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity">
            {formatMessageTime(timestamp)}
          </span>
        </div>
      )}

      {/* Message Content with Smart Markdown Parsing */}
      <div className="text-[15px] leading-[1.6] text-text-primary">
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
