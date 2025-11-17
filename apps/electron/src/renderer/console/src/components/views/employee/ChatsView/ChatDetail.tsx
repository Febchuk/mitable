import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp, Minimize2 } from "lucide-react";
import { useConversationMessages, useSendMessage } from "@/console/src/hooks/queries/chats";
import UserMessage from "../../../../../../components/domain/messages/UserMessage";
import AIMessage from "../../../../../../components/domain/messages/AIMessage";
import ExpertsCard from "../../../../../../conversation/src/components/ExpertsCard";
import WorkflowOptions, {
  type WorkflowPhase,
} from "../../../../../../components/domain/workflow/WorkflowOptions";
import StepList from "../../../../../../components/domain/workflow/StepList";

export default function ChatDetail() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const { data: messages, isLoading: messagesLoading } = useConversationMessages(chatId);
  const [inputValue, setInputValue] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Memoize callbacks to prevent infinite re-renders
  const onChunk = useCallback((chunk: string) => {
    setStreamingContent((prev) => prev + chunk);
  }, []);

  const onComplete = useCallback((_fullContent: string) => {
    setIsStreaming(false);
  }, []);

  const onError = useCallback((error: string) => {
    console.error("[ChatDetail] Streaming error:", error);
    setStreamingContent("");
    setIsStreaming(false);
  }, []);

  const onWindowTrigger = useCallback((windowType: string, data: any) => {
    console.log("[ChatDetail] Window trigger:", { windowType, data });
  }, []);

  const sendMessageMutation = useSendMessage({
    onChunk,
    onComplete,
    onError,
    onWindowTrigger,
    captureScreenshot: true,
  });

  // Clear streaming content once new messages load (prevents flicker)
  useEffect(() => {
    if (!isStreaming && streamingContent && messages && messages.length > 0) {
      // Wait a tiny bit for the UI to render the new message
      const timer = setTimeout(() => {
        setStreamingContent("");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, streamingContent, messages]);

  // Auto-scroll to bottom when messages change or streaming content updates
  useEffect(() => {
    if (messagesEndRef.current) {
      // Use smooth scroll for message changes, but instant for streaming to keep up
      const behavior = isStreaming ? "auto" : "smooth";
      messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
    }
  }, [messages, streamingContent, isStreaming]);

  // Additional scroll trigger specifically for streaming chunks
  useEffect(() => {
    if (isStreaming && streamingContent) {
      // Scroll to bottom as content streams in
      messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [streamingContent, isStreaming]);

  if (messagesLoading) {
    return (
      <div className="p-8">
        <button
          onClick={() => navigate("/chats")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Chats</span>
        </button>
        <p className="text-text-primary">Loading messages...</p>
      </div>
    );
  }

  // Don't show error for empty conversations - just render empty chat
  // if (!messages || messages.length === 0) {
  //   return empty state - removed to allow empty chats
  // }

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

  const handleWorkflowOptionSelect = async (option: any) => {
    if (!chatId) return;

    const { action, label } = option;
    let metadata: any = {};
    let message = "";

    console.log("[ChatDetail] Workflow option selected:", { action, label });

    // Map workflow actions to metadata and message content
    switch (action) {
      case "progress_step":
        metadata = { workflowAction: "progress_step", selectedOption: 1 };
        message = "Move on to next step";
        break;
      case "custom_question":
      case "ask_questions":
        metadata = { workflowAction: "custom_question", selectedOption: 2 };
        message = label || "I have a question";
        break;
      case "exit_workflow":
        metadata = { workflowAction: "exit_workflow", selectedOption: 3 };
        message = "Exit workflow";
        break;
      case "confirm_start":
        metadata = { workflowAction: "progress_step", selectedOption: 1 };
        message = "Yes, let's get started!";
        break;
      default:
        message = label || action;
    }

    // Capture screenshot for workflow actions if available
    let screenshot: string | null = null;
    let screenshotMetadata: any = null;
    if (["progress_step", "custom_question", "confirm_start"].includes(action)) {
      if (window.consoleAPI?.captureScreenshot) {
        try {
          console.log("[ChatDetail] Capturing screenshot for workflow action...");
          const screenshotResult = (await window.consoleAPI.captureScreenshot()) as any;
          if (screenshotResult) {
            screenshot = screenshotResult.dataUrl || screenshotResult;
            screenshotMetadata = screenshotResult.metadata;
            console.log("[ChatDetail] Screenshot captured successfully:", {
              hasScreenshot: !!screenshot,
              hasMetadata: !!screenshotMetadata,
              dimensions: screenshotMetadata
                ? `${screenshotMetadata.width}x${screenshotMetadata.height}`
                : "N/A",
            });
          }
        } catch (error) {
          console.error("[ChatDetail] Screenshot capture failed:", error);
        }
      } else {
        console.warn("[ChatDetail] captureScreenshot not available in consoleAPI");
      }
    }

    // Start streaming
    setIsStreaming(true);
    setStreamingContent("");

    // Send message with metadata and screenshot
    sendMessageMutation.mutate({
      chatId,
      content: message,
      metadata, // Pass workflow metadata
      screenshot, // Pass screenshot if captured
      screenshotMetadata, // Pass screenshot metadata for debug and coordinate conversion
    });

    setInputValue("");
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="p-8 pb-4 flex-shrink-0">
        <button
          onClick={() => navigate("/chats")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Chats</span>
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto app-no-drag custom-scrollbar">
        <div className="max-w-4xl mx-auto px-8 py-4 pb-20">
          {(messages || []).map((message) => {
            // Render workflow messages with rich details
            if (message.messageType === "workflow" && message.cardData) {
              const isWorkflowActive = message.cardData.workflowActive;
              const workflowPhase = message.cardData.workflowPhase as WorkflowPhase | undefined;
              const shouldShowStepList =
                isWorkflowActive && workflowPhase && workflowPhase !== "custom_question";
              const shouldShowCheckboxes = workflowPhase === "step_progression";

              return (
                <div key={message.id} className="space-y-3">
                  {/* 1. Show step list for initial_proposal and step_progression */}
                  {shouldShowStepList && message.cardData.stepList && (
                    <StepList
                      steps={message.cardData.stepList}
                      currentStepIndex={message.cardData.currentStepIndex || 0}
                      showCheckboxes={shouldShowCheckboxes}
                    />
                  )}

                  {/* 2. Show AI text response */}
                  {message.content && <AIMessage content={message.content} />}

                  {/* 3. Show workflow options for interaction */}
                  {isWorkflowActive && workflowPhase && (
                    <WorkflowOptions
                      phase={workflowPhase}
                      onOptionSelect={handleWorkflowOptionSelect}
                    />
                  )}
                </div>
              );
            }

            // Render experts messages with rich details
            if (message.messageType === "experts" && message.cardData?.experts) {
              return (
                <div key={message.id} className="space-y-3">
                  {/* Show AI text response first */}
                  {message.content && <AIMessage content={message.content} />}

                  {/* Show full experts card with profiles */}
                  <ExpertsCard
                    experts={message.cardData.experts}
                    suggestedNudge={message.cardData.suggestedNudge}
                    conversationId={chatId || ""}
                  />
                </div>
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
              className="w-full bg-[#1A1A1A] text-text-primary placeholder-text-tertiary px-lg py-md pr-28 rounded-full border-none outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                type="submit"
                disabled={!inputValue.trim()}
                className="w-10 h-10 bg-primary hover:bg-primary-hover disabled:bg-primary/50 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors"
                aria-label="Send message"
              >
                <ArrowUp size={20} className="text-white" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (chatId) {
                    console.log("Minimize to reduced view clicked, sending conversation:", chatId);
                    window.consoleAPI.sendToAgent(chatId);
                    window.consoleAPI.minimizeWindow();
                  }
                }}
                className="w-10 h-10 bg-white/10 hover:bg-primary hover:shadow-glow-purple rounded-full flex items-center justify-center transition-all duration-200 group"
                aria-label="Minimize to reduced view"
                title="Minimize to reduced view"
              >
                <Minimize2
                  size={18}
                  className="text-white/60 group-hover:text-white group-hover:scale-110 transition-all"
                />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
