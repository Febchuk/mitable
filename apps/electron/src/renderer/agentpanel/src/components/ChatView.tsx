import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Response } from "@/components/ui/ai-response";
import MessageBubble from "./MessageBubble";
import type { Message } from "../App";

interface ChatViewProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
}

function ChatView({ messages, isStreaming, streamingContent }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  return (
    <ScrollArea className="h-full" ref={scrollRef}>
      <div className="flex flex-col gap-4 p-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Streaming indicator - matches AI message style (no bubble) */}
        {isStreaming && (
          <div className="mb-4 max-w-[85%]">
            <div className="text-[15px] leading-[1.6] text-white">
              {streamingContent ? (
                <Response parseIncompleteMarkdown={true}>
                  {streamingContent}
                </Response>
              ) : (
                <span className="flex gap-1">
                  <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" />
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

export default ChatView;
