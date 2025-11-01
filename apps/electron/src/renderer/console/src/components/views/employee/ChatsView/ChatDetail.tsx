import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp, ExternalLink, Camera } from "lucide-react";
import { useConversationMessages } from "../../../../hooks/queries/chats/useConversationMessages";
import { useSendMessage } from "../../../../hooks/queries/chats/useSendMessage";
import { useWorkflowPolling } from "../../../../../../hooks/useWorkflowPolling";
import UserMessage from "../../../../../../components/domain/messages/UserMessage";
import AIMessage from "../../../../../../components/domain/messages/AIMessage";
import ExpertsCard from "../../../../../../conversation/src/components/ExpertsCard";
import WorkflowAccordion from "../../../../../../conversation/src/components/WorkflowAccordion";
import { Button } from "@/components/ui/button";

export default function ChatDetail() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const { data: messages, isLoading: messagesLoading } = useConversationMessages(chatId);
  const [inputValue, setInputValue] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Allow empty conversations - user will type first message
  const displayMessages = messages || [];

  // Use shared workflow polling hook
  const workflowsData = useWorkflowPolling(displayMessages, chatId || null);

  // Check if there's an active workflow
  const hasActiveWorkflow = Array.from(workflowsData.values()).some(
    (data) => data.workflow.status === "active"
  );

  const sendMessageMutation = useSendMessage({
    onChunk: (chunk: string) => {
      setStreamingContent((prev) => prev + chunk);
    },
    onComplete: (_fullContent: string) => {
      // Don't clear streaming content immediately - let it stay visible
      // until the query refetches and the new message appears
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

  // Clear streaming content once new messages load (prevents flicker)
  useEffect(() => {
    if (!isStreaming && streamingContent && displayMessages && displayMessages.length > 0) {
      // Wait a tiny bit for the UI to render the new message
      const timer = setTimeout(() => {
        setStreamingContent("");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, streamingContent, displayMessages]);

  console.log("[ChatDetail] Component loaded", {
    hasSendMutation: !!sendMessageMutation,
    captureScreenshotEnabled: true,
    hasConsoleAPI: typeof window !== "undefined" && !!window.consoleAPI,
    hasCaptureMethod: typeof window !== "undefined" && !!window.consoleAPI?.captureScreenshot,
  });

  // Auto-scroll to bottom when messages change or streaming content updates
  useEffect(() => {
    if (messagesEndRef.current) {
      // Use smooth scroll for message changes, but instant for streaming to keep up
      const behavior = isStreaming ? "auto" : "smooth";
      messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
    }
  }, [displayMessages, streamingContent, isStreaming]);

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
        metadata = { workflowAction: "confirm_start", selectedOption: 1 };
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
          // Get active workflow to extract target app for context-aware capture
          const activeWorkflow = Array.from(workflowsData.values()).find(
            (data) => data.workflow.status === "active"
          );

          // Extract target app from workflow solution text
          let targetApp: string | undefined;
          if (activeWorkflow) {
            const solution = activeWorkflow.workflow.solution.toLowerCase();
            const searchQuery = activeWorkflow.workflow.searchQuery?.toLowerCase() || "";
            const combinedText = `${solution} ${searchQuery}`;

            // Detect common apps (order matters - most specific first)
            if (combinedText.includes("slack")) targetApp = "Slack";
            else if (combinedText.includes("notion")) targetApp = "Notion";
            else if (combinedText.includes("jira") || combinedText.includes("atlassian"))
              targetApp = "Jira";
            else if (combinedText.includes("figma")) targetApp = "Figma";
            else if (combinedText.includes("github")) targetApp = "GitHub";
            else if (combinedText.includes("vscode") || combinedText.includes("visual studio code"))
              targetApp = "Code";
            else if (combinedText.includes("chrome") || combinedText.includes("browser"))
              targetApp = "Chrome";
            else if (combinedText.includes("excel")) targetApp = "Excel";
            else if (combinedText.includes("word")) targetApp = "Word";
            else if (combinedText.includes("outlook")) targetApp = "Outlook";

            console.log("[ChatDetail] Context-aware capture - detected target app:", targetApp);
            console.log("[ChatDetail] From workflow:", { solution, searchQuery });
          }

          console.log("[ChatDetail] Capturing screenshot for workflow action...", { targetApp });
          // Pass targetApp to captureScreenshot for workflow-aware window capture
          screenshot = await window.consoleAPI.captureScreenshot(targetApp);
          console.log("[ChatDetail] Screenshot captured:", { success: !!screenshot, targetApp });
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
        <div className="max-w-4xl mx-auto px-8 py-4 pb-20">
          {/* Render messages in chronological order (workflows are now messages!) */}
          {displayMessages.map((message: any, index: number) => {
            // Skip workflow messages - they're just anchors, accordion renders after "Perfect!" message
            if (message.messageType === "workflow") {
              return null;
            }

            // Experts messages
            if (message.messageType === "experts" && message.cardData?.experts) {
              return (
                <div key={message.id} className="space-y-3">
                  {message.content && <AIMessage content={message.content} />}
                  <ExpertsCard
                    experts={message.cardData.experts}
                    suggestedNudge={message.cardData.suggestedNudge}
                    conversationId={chatId || ""}
                  />
                </div>
              );
            }

            // Regular text messages
            const messageElement =
              message.role === "user" ? (
                <UserMessage key={message.id} content={message.content} />
              ) : (
                <AIMessage key={message.id} content={message.content} />
              );

            // Check if we should render workflow accordion after this message
            // Look for workflow message BEFORE this one and "Perfect!" in this message
            const shouldRenderWorkflow =
              message.role === "assistant" &&
              (message.content?.includes("Perfect! Let's get started") ||
                message.content?.includes("Let's get started with step 1"));

            if (shouldRenderWorkflow) {
              // Find the workflow message that comes before this
              const workflowMessage = displayMessages
                .slice(0, index)
                .reverse()
                .find((m: any) => m.messageType === "workflow" && m.workflowId);

              if (workflowMessage) {
                const workflowId =
                  workflowMessage.workflowId || workflowMessage.cardData?.workflowId;
                const workflowData = workflowsData.get(workflowId);

                if (workflowData) {
                  return (
                    <div key={message.id}>
                      {messageElement}
                      <WorkflowAccordion
                        key={`workflow-${workflowId}`}
                        title={workflowData.workflow.solution}
                        workflow={workflowData.workflow}
                        interactions={workflowData.interactions}
                        onOptionSelect={handleWorkflowOptionSelect}
                        isLoading={workflowData.workflow.status === "active" && isStreaming}
                      />
                    </div>
                  );
                }
              }
            }

            return messageElement;
          })}

          {/* Streaming message (hide during ACTIVE workflow - shown in accordion instead) */}
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
              placeholder={
                hasActiveWorkflow
                  ? "Use the chat input in the workflow above..."
                  : "Type your message..."
              }
              disabled={hasActiveWorkflow}
              className="w-full bg-[#1A1A1A] text-text-primary placeholder-text-tertiary px-lg py-md pr-16 rounded-full border-none outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || hasActiveWorkflow}
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
