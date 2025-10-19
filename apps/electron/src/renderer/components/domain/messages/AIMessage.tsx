import { Response } from "../../ui/ai-response";

interface AIMessageProps {
  content: string;
  isStreaming?: boolean;
}

export default function AIMessage({ content, isStreaming = false }: AIMessageProps) {
  return (
    <div className="flex items-start gap-3 mb-6">
      {/* AI Avatar */}
      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      </div>

      {/* Message Content with Smart Markdown Parsing */}
      <div className="flex-1 max-w-[700px]">
        <Response parseIncompleteMarkdown={isStreaming}>{content}</Response>
        {isStreaming && <span className="inline-block w-1 h-4 ml-1 bg-primary animate-pulse" />}
      </div>
    </div>
  );
}
