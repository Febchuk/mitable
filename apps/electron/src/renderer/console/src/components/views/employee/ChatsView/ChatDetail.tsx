import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp, ExternalLink, Camera } from "lucide-react";
import { useConversationMessages, useSendMessage } from "@/console/src/hooks/queries/chats";
import UserMessage from "../../../../../../components/domain/messages/UserMessage";
import AIMessage from "../../../../../../components/domain/messages/AIMessage";
import ExpertsCard from "../../../../../../conversation/src/components/ExpertsCard";
import WorkflowOptions, { type WorkflowPhase } from "../../../../../../components/domain/workflow/WorkflowOptions";
import StepList from "../../../../../../components/domain/workflow/StepList";
import { Button } from "@/components/ui/button";

export default function ChatDetail() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const { data: messages, isLoading: messagesLoading } = useConversationMessages(chatId);
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
      console.error("[ChatDetail] Streaming error:", error);
      setStreamingContent("");
      setIsStreaming(false);
      // TODO: Show error toast notification
    },
    // Enable screenshot capture for workflow mode
    captureScreenshot: true,
  });

  console.log("[ChatDetail] Component loaded", {
    hasSendMutation: !!sendMessageMutation,
    captureScreenshotEnabled: true,
    hasConsoleAPI: typeof window !== "undefined" && !!window.consoleAPI,
    hasCaptureMethod: typeof window !== "undefined" && !!window.consoleAPI?.captureScreenshot,
  });

  // Auto-scroll to bottom when messages change or streaming content updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

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

  if (!messages || messages.length === 0) {
    return (
      <div className="p-8">
        <button
          onClick={() => navigate("/chats")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to Chats</span>
        </button>
        <p className="text-text-primary">No messages found</p>
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

  const handleTestScreenshot = async () => {
    console.log("[ChatDetail] Test Screenshot button clicked");
    console.log("[ChatDetail] Checking window.consoleAPI...", {
      hasConsoleAPI: !!window.consoleAPI,
      hasCaptureMethod: !!window.consoleAPI?.captureScreenshot,
    });

    if (!window.consoleAPI) {
      console.error("[ChatDetail] window.consoleAPI is NOT available!");
      alert("ERROR: window.consoleAPI is not available. Check console logs.");
      return;
    }

    if (!window.consoleAPI.captureScreenshot) {
      console.error("[ChatDetail] window.consoleAPI.captureScreenshot is NOT available!");
      alert("ERROR: captureScreenshot method is not available. Check console logs.");
      return;
    }

    try {
      console.log("[ChatDetail] Calling captureScreenshot()...");
      const screenshot = await window.consoleAPI.captureScreenshot();
      console.log("[ChatDetail] Screenshot result:", {
        hasScreenshot: !!screenshot,
        size: screenshot?.length || 0,
        preview: screenshot?.substring(0, 100),
      });

      if (screenshot) {
        alert(`SUCCESS! Screenshot captured: ${screenshot.length} bytes`);
      } else {
        alert("Screenshot returned null. Check console and Electron main process logs.");
      }
    } catch (error) {
      console.error("[ChatDetail] Screenshot capture error:", error);
      alert(`ERROR: ${error}. Check console logs.`);
    }
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
    if (["progress_step", "custom_question", "confirm_start"].includes(action)) {
      if (window.consoleAPI?.captureScreenshot) {
        try {
          console.log("[ChatDetail] Capturing screenshot for workflow action...");
          screenshot = await window.consoleAPI.captureScreenshot();
          console.log("[ChatDetail] Screenshot captured:", !!screenshot);
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

          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="gap-2 text-text-secondary hover:text-white hover:bg-primary rounded-full px-4 py-2 h-auto"
              onClick={handleTestScreenshot}
            >
              <Camera size={14} />
              <span className="text-xs">Test Screenshot</span>
            </Button>

            <Button
              variant="ghost"
              className="gap-2 text-text-secondary hover:text-white hover:bg-primary rounded-full px-4 py-2 h-auto"
              onClick={() => {
                if (chatId) {
                  console.log("Launch in Pill clicked, sending conversation:", chatId);
                  window.consoleAPI.sendToAgent(chatId);
                  window.consoleAPI.minimizeWindow();
                }
              }}
            >
              <ExternalLink size={14} />
              <span className="text-xs">Launch in Pill</span>
            </Button>
          </div>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-text-primary">Conversation</h1>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto app-no-drag custom-scrollbar">
        <div className="max-w-4xl mx-auto px-8 py-4">
          {messages.map((message) => {
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
