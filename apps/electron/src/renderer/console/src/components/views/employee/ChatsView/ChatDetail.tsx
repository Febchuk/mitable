import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp, Camera } from "lucide-react";
import { useConversationMessages, useSendMessage } from "@/console/src/hooks/queries/chats";
import UserMessage from "../../../../../../components/domain/messages/UserMessage";
import AIMessage from "../../../../../../components/domain/messages/AIMessage";
import { Button } from "@/components/ui/button";
import type { Message } from "@/console/src/types";

// Simplified loading component
function LoadingMessage() {
  return (
    <div className="flex items-center gap-2 p-4 text-text-secondary">
      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span>Thinking...</span>
    </div>
  );
}

export default function ChatDetail() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const { data: messages, isLoading: messagesLoading } = useConversationMessages(chatId);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Local state for streaming content
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [screenshotData, setScreenshotData] = useState<string | null>(null);

  // Send message mutation with streaming callbacks
  const sendMessageMutation = useSendMessage({
    onChunk: (chunk: string) => {
      setStreamingContent((prev) => prev + chunk);
    },
    onComplete: () => {
      setIsStreaming(false);
      setStreamingContent("");
    },
    onError: (error: string) => {
      console.error("[ChatDetail] Stream error:", error);
      setIsStreaming(false);
      setStreamingContent("");
    },
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, isStreaming]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !chatId) return;

    const messageContent = inputValue;
    setInputValue("");
    setIsStreaming(true);
    setStreamingContent("");

    // Send message using mutation
    sendMessageMutation.mutate({
      chatId,
      content: messageContent,
      multiWindowCapture: screenshotData
        ? {
            success: true as const,
            screenshots: [
              {
                dataUrl: screenshotData,
                metadata: {
                  width: 0,
                  height: 0,
                  bounds: { x: 0, y: 0, width: 0, height: 0 },
                  scaleFactor: 1,
                },
                windowId: "manual",
                windowTitle: "Screenshot",
                appName: "Manual",
              },
            ],
            blockedWindows: [],
            totalWindowsDetected: 1,
            captureTimestamp: Date.now(),
          }
        : null,
    });

    // Clear screenshot after sending
    setScreenshotData(null);
  };

  // Screenshot capture for testing
  const handleTestScreenshot = async () => {
    try {
      console.log("[ChatDetail] Capturing screenshot...");
      const result = await window.consoleAPI.captureScreenshot();
      if (result?.success && result.screenshots.length > 0) {
        console.log("[ChatDetail] Screenshot captured:", {
          count: result.screenshots.length,
          firstSize: result.screenshots[0].dataUrl?.substring(0, 50) + "...",
        });
        setScreenshotData(result.screenshots[0].dataUrl);
      }
    } catch (error) {
      console.error("[ChatDetail] Screenshot error:", error);
    }
  };

  if (messagesLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-8 pb-4 flex-shrink-0 app-drag">
        <div className="flex items-center gap-4 mb-4 app-no-drag">
          <Button
            variant="ghost"
            className="gap-2 text-text-secondary hover:text-white hover:bg-primary rounded-full px-4 py-2 h-auto"
            onClick={() => navigate("/chats")}
          >
            <ArrowLeft size={14} />
            <span className="text-xs">Back</span>
          </Button>

          <Button
            variant="ghost"
            className="gap-2 text-text-secondary hover:text-white hover:bg-primary rounded-full px-4 py-2 h-auto"
            onClick={handleTestScreenshot}
          >
            <Camera size={14} />
            <span className="text-xs">Test Screenshot</span>
          </Button>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-text-primary">Conversation</h1>
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto app-no-drag custom-scrollbar"
      >
        <div className="max-w-4xl mx-auto px-8 py-4">
          {messages?.map((message: Message) => {
            if (message.role === "user") {
              return <UserMessage key={message.id} content={message.content} />;
            }

            // Regular assistant messages
            if (message.content) {
              return <AIMessage key={message.id} content={message.content} />;
            }

            return null;
          })}

          {/* Streaming message */}
          {isStreaming && streamingContent && (
            <AIMessage key="streaming" content={streamingContent} />
          )}

          {/* Loading indicator when waiting for response */}
          {isStreaming && !streamingContent && <LoadingMessage />}

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
              disabled={!inputValue.trim() || isStreaming}
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
