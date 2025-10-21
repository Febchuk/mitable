import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp, ExternalLink, Workflow, Users } from "lucide-react";
import { useConversations, useSendMessage } from "@/console/src/hooks/queries/chats";
import UserMessage from "../../../../../../components/domain/messages/UserMessage";
import AIMessage from "../../../../../../components/domain/messages/AIMessage";
import WorkflowCard from "../../../../../../components/domain/messages/WorkflowCard";
import { Button } from "@/components/ui/button";

export default function ChatDetail() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const { data } = useConversations();
  const chats = data?.conversations || [];
  const [inputValue, setInputValue] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sendMessageMutation = useSendMessage({
    onChunk: (chunk: string) => {
      setStreamingContent((prev) => prev + chunk);
    },
    onComplete: (_fullContent: string) => {
      setStreamingContent("");
      setIsStreaming(false);
    },
    onError: (error: string) => {
      console.error("Streaming error:", error);
      setStreamingContent("");
      setIsStreaming(false);
      // TODO: Show error toast notification
    },
    // Enable screenshot capture for workflow mode
    captureScreenshot: true,
  });

  const chat = chats.find((c) => c.id === chatId);

  // Auto-scroll to bottom when messages change or streaming content updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages, streamingContent]);

  if (!chat) {
    return (
      <div className="p-8">
        <button
          onClick={() => navigate("/chats")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Chats</span>
        </button>
        <p className="text-text-primary">Chat not found</p>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !chatId) return;

    // Start streaming
    setIsStreaming(true);
    setStreamingContent("");

    // Send user message and stream AI response
    sendMessageMutation.mutate({
      chatId,
      content: inputValue.trim(),
    });

    setInputValue("");
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-8 pb-4 space-y-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/chats")}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={16} />
            <span className="text-sm">Back to Chats</span>
          </button>

          <Button
            variant="ghost"
            className="gap-2 text-text-secondary hover:text-white hover:bg-primary rounded-full px-4 py-2 h-auto"
            onClick={() => {
              // TODO: Implement agent pill integration
              console.log("Launch in Pill clicked");
            }}
          >
            <ExternalLink size={14} />
            <span className="text-xs">Launch in Pill</span>
          </Button>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-text-primary">{chat.title}</h1>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto app-no-drag custom-scrollbar">
        <div className="max-w-4xl mx-auto px-8 py-4">
          {chat.messages.map((message) => {
            // Render workflow or experts cards
            if (
              (message.messageType === "workflow" || message.messageType === "experts") &&
              message.cardData
            ) {
              const icon = message.cardData.iconType === "workflow" ? Workflow : Users;
              return (
                <WorkflowCard
                  key={message.id}
                  title={message.cardData.title}
                  subtitle={message.cardData.subtitle}
                  icon={icon}
                  onClick={() => {
                    // TODO: Handle card click - launch guide or show experts
                    console.log(`${message.messageType} card clicked:`, message.cardData);
                  }}
                />
              );
            }

            // Render regular text messages
            return message.role === "user" ? (
              <UserMessage key={message.id} content={message.content} />
            ) : (
              <AIMessage key={message.id} content={message.content} />
            );
          })}

          {/* Streaming message */}
          {isStreaming && (
            <AIMessage content={streamingContent || "Thinking..."} isStreaming={true} />
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Form */}
      <div className="p-8 pt-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="relative app-no-drag">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type your message..."
              className="w-full bg-[#1A1A1A] text-text-primary placeholder-text-tertiary px-lg py-md pr-16 rounded-full border-none outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-primary hover:bg-primary-hover disabled:bg-primary/50 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
              aria-label="Send message"
            >
              <ArrowUp size={20} className="text-white" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
