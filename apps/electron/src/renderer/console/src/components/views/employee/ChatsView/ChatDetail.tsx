import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp, ExternalLink, Camera } from "lucide-react";
import { useConversationMessages, useSendMessage } from "@/console/src/hooks/queries/chats";
import UserMessage from "../../../../../../components/domain/messages/UserMessage";
import AIMessage from "../../../../../../components/domain/messages/AIMessage";
import ExpertsCard from "../../../../../../conversation/src/components/ExpertsCard";
import { WorkflowAccordion } from "../../../../../../conversation/src/components/WorkflowAccordion";
import LoadingMessage from "../../../../../../conversation/src/components/LoadingMessage";
import { ErrorBoundary } from "../../../../../../components/common/ErrorBoundary";
import { pauseWorkflow } from "../../../../../../lib/api/conversations";
import { Button } from "@/components/ui/button";
import type { Message } from "../../../../../../conversation/src/types";

export default function ChatDetail() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const { data: messagesData, isLoading: messagesLoading } = useConversationMessages(chatId);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Ref to track which message is currently streaming (for WorkflowAccordion)
  const streamingMessageIdRef = useRef<string | null>(null);

  // Local messages state for optimistic updates and streaming
  const [localMessages, setLocalMessages] = useState<Message[]>([]);

  // Workflow-specific loading state (for inline loading in WorkflowAccordion)
  const [workflowLoadingMessage, setWorkflowLoadingMessage] = useState<string | null>(null);

  // General loading state for non-workflow operations
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);

  // Workflow custom question state (for "Type something" button)
  const [awaitingCustomQuestion, setAwaitingCustomQuestion] = useState<{
    workflowSessionId: string | null;
    relatedStepIndex: number | null;
  } | null>(null);

  // Sync local messages with fetched data
  // Only sync when not actively streaming to avoid overwriting optimistic updates
  useEffect(() => {
    if (messagesData && !streamingMessageIdRef.current) {
      // Convert API messages to UI message format (matching Conversation's Message type)
      const uiMessages: Message[] = messagesData.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        type: msg.cardData ? "card" : "text",
        messageType: msg.messageType,
        cardData: msg.cardData,
        sources: msg.sources,
        workflowSessionId: msg.workflowSessionId,
        relatedStepIndex: msg.relatedStepIndex,
      }));
      setLocalMessages(uiMessages);
    }
  }, [messagesData]);

  // Use localMessages for rendering (includes optimistic updates)
  const messages = localMessages;

  // Check if we're currently waiting for a custom question response
  const isCustomWorkflowQuestion = !!awaitingCustomQuestion;

  const sendMessageMutation = useSendMessage({
    onChunk: (chunk, workflowSessionId, relatedStepIndex) => {
      // Clear loading message on first chunk
      if (isCustomWorkflowQuestion) {
        setWorkflowLoadingMessage(null);
      } else {
        setLoadingMessage(null);
      }

      // Update the streaming message with new content and workflow routing
      setLocalMessages((prev) =>
        prev.map(
          (msg): Message =>
            msg.id === streamingMessageIdRef.current
              ? {
                  ...msg,
                  content: msg.content + chunk,
                  // Add workflow routing metadata from first chunk
                  workflowSessionId: msg.workflowSessionId ?? workflowSessionId,
                  relatedStepIndex: msg.relatedStepIndex ?? relatedStepIndex,
                }
              : msg
        )
      );
    },
    onComplete: (fullContent, messageType, cardData, workflowSessionId, relatedStepIndex) => {
      console.log("[ChatDetail] onComplete received:", {
        messageType,
        hasCardData: !!cardData,
        workflowSessionId,
        relatedStepIndex,
      });

      // Clear loading messages
      if (isCustomWorkflowQuestion) {
        setWorkflowLoadingMessage(null);
      } else {
        setLoadingMessage(null);
      }

      setLocalMessages((prev) =>
        prev.map(
          (msg): Message =>
            msg.id === streamingMessageIdRef.current
              ? {
                  ...msg,
                  content: fullContent && fullContent.trim().length > 0 ? fullContent : msg.content,
                  type: cardData ? "card" : "text",
                  messageType: messageType as "workflow" | "experts" | "text",
                  cardData,
                  workflowSessionId: workflowSessionId ?? msg.workflowSessionId,
                  relatedStepIndex: relatedStepIndex ?? msg.relatedStepIndex,
                }
              : msg
        )
      );
    },
    onDone: (messageId, workflowSessionId, relatedStepIndex) => {
      // Update the streaming message with final ID
      setLocalMessages((prev) =>
        prev.map(
          (msg): Message =>
            msg.id === streamingMessageIdRef.current
              ? {
                  ...msg,
                  id: messageId,
                  workflowSessionId: workflowSessionId ?? msg.workflowSessionId,
                  relatedStepIndex: relatedStepIndex ?? msg.relatedStepIndex,
                }
              : msg
        )
      );

      streamingMessageIdRef.current = null;

      // Clear awaiting custom question state after successful completion
      if (awaitingCustomQuestion) {
        setAwaitingCustomQuestion(null);
      }
    },
    onError: (error: string) => {
      console.error("[ChatDetail] Streaming error:", error);

      // Clear loading messages
      setWorkflowLoadingMessage(null);
      setLoadingMessage(null);

      // Update the streaming message with error
      setLocalMessages((prev) =>
        prev.map(
          (msg): Message =>
            msg.id === streamingMessageIdRef.current
              ? { ...msg, content: `Error: ${error}. Please try again.` }
              : msg
        )
      );

      streamingMessageIdRef.current = null;
    },
    onProgress: (phase, message) => {
      console.log(`[ChatDetail] Progress update: ${phase} - ${message}`);
      if (isCustomWorkflowQuestion) {
        setWorkflowLoadingMessage(message);
      } else {
        setLoadingMessage(message);
      }
    },
    // Screenshot capture is disabled in Console - use Agent Panel for watch mode
    captureScreenshot: false,
  });

  console.log("[ChatDetail] Component loaded", {
    hasSendMutation: !!sendMessageMutation,
    captureScreenshotEnabled: false,
    hasConsoleAPI: typeof window !== "undefined" && !!window.consoleAPI,
    hasCaptureMethod: typeof window !== "undefined" && !!window.consoleAPI?.captureScreenshot,
  });

  // Auto-scroll to bottom when messages change (only if user is near bottom)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // Check if user is already near the bottom (within 100px)
    const isNearBottom = 
      container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    // Only auto-scroll if user hasn't scrolled up
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

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

    const content = inputValue.trim();

    // Add user message to local state with workflow routing if in custom question mode
    const userMsg: Message = {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content,
      type: "text",
      workflowSessionId: awaitingCustomQuestion?.workflowSessionId ?? undefined,
      relatedStepIndex: awaitingCustomQuestion?.relatedStepIndex ?? undefined,
    };
    setLocalMessages((prev) => [...prev, userMsg]);

    // Create placeholder for streaming assistant message
    const streamingMessageId = `streaming-${Date.now()}`;
    streamingMessageIdRef.current = streamingMessageId;

    const assistantMessage: Message = {
      id: streamingMessageId,
      role: "assistant",
      content: "",
      type: "text",
      // Route into the correct workflow accordion/step immediately for custom questions
      workflowSessionId: awaitingCustomQuestion?.workflowSessionId ?? undefined,
      relatedStepIndex: awaitingCustomQuestion?.relatedStepIndex ?? undefined,
    };
    setLocalMessages((prev) => [...prev, assistantMessage]);

    // Set initial loading state
    if (awaitingCustomQuestion) {
      setWorkflowLoadingMessage("Thinking...");
    } else {
      setLoadingMessage("Thinking...");
    }

    // Prepare metadata if this is a custom question during workflow
    const metadata = awaitingCustomQuestion
      ? {
          workflowAction: "custom_question",
          selectedOption: 2,
          workflowSessionId: awaitingCustomQuestion.workflowSessionId,
          currentStepIndex: awaitingCustomQuestion.relatedStepIndex,
        }
      : undefined;

    // Send user message and stream AI response
    sendMessageMutation.mutate({
      chatId,
      content,
      metadata,
      // Pass workflow routing for optimistic update
      workflowSessionId: awaitingCustomQuestion?.workflowSessionId,
      relatedStepIndex: awaitingCustomQuestion?.relatedStepIndex,
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
      const result = await window.consoleAPI.captureScreenshot();
      console.log("[ChatDetail] Multi-window screenshot result:", result);

      if (result && result.success) {
        alert(
          `SUCCESS! Captured ${result.screenshots.length} windows\nBlocked: ${result.blockedWindows.length}\nTotal detected: ${result.totalWindowsDetected}`
        );
      } else if (result && !result.success) {
        alert(`Capture blocked or failed: ${result.error}`);
      } else {
        alert("Screenshot returned unexpected result. Check console logs.");
      }
    } catch (error) {
      console.error("[ChatDetail] Screenshot capture error:", error);
      alert(`ERROR: ${error}. Check console logs.`);
    }
  };

  // Handle exit workflow - pauses workflow without sending message
  const handleExitWorkflow = async () => {
    if (!chatId) {
      console.error("[ChatDetail] No chat ID for exit workflow");
      return;
    }

    try {
      setWorkflowLoadingMessage("cancelling workflow");
      console.log("[ChatDetail] Exiting workflow for conversation:", chatId);

      // Call backend to pause workflow and get updated state
      const updatedWorkflow = await pauseWorkflow(chatId);
      console.log("[ChatDetail] Workflow paused:", updatedWorkflow.workflowSessionId);

      // Update cardData status to "paused" for all messages in this workflow
      setLocalMessages((prev) =>
        prev.map((msg): Message => {
          if (msg.workflowSessionId === updatedWorkflow.workflowSessionId && msg.cardData) {
            return {
              ...msg,
              cardData: {
                ...msg.cardData,
                status: "paused",
              },
            };
          }
          return msg;
        })
      );

      console.log("[ChatDetail] Workflow status updated to paused");
    } catch (error) {
      console.error("[ChatDetail] Error pausing workflow:", error);
    } finally {
      setWorkflowLoadingMessage(null);
    }
  };

  const handleWorkflowOptionSelect = async (option: any) => {
    if (!chatId) return;

    const { action, label } = option;

    // Find the LATEST workflow message to get current workflowSessionId and currentStepIndex
    const activeWorkflowMessage = [...messages]
      .reverse()
      .find((m) => m.messageType === "workflow" && m.cardData?.workflowSessionId);
    const workflowSessionId = activeWorkflowMessage?.cardData?.workflowSessionId || null;
    const currentStepIndex = activeWorkflowMessage?.cardData?.currentStepIndex ?? null;

    console.log("[ChatDetail] Workflow option selected:", {
      action,
      label,
      workflowSessionId,
      currentStepIndex,
    });

    // Handle "Type something" / "ask questions" actions - enable custom input mode
    if (action === "custom_question" || action === "ask_questions") {
      setAwaitingCustomQuestion({
        workflowSessionId,
        relatedStepIndex: currentStepIndex,
      });
      // Don't send message yet - wait for user to type their actual question
      return;
    }

    // Handle exit workflow separately - pause workflow without sending message
    if (action === "exit_workflow") {
      await handleExitWorkflow();
      return;
    }

    // Map option action to metadata and message
    let metadata: any = {};
    let message = "";

    switch (action) {
      case "progress_step":
        metadata = { workflowAction: "progress_step", selectedOption: 1 };
        message = "Move on to next step";
        break;
      case "resume_workflow":
        metadata = { workflowAction: "resume_workflow", selectedOption: 1 };
        message = "Resume workflow";
        break;
      case "confirm_start":
        metadata = { workflowAction: "progress_step", selectedOption: 1 };
        message = "Yes, let's get started!";
        break;
      default:
        message = label || action;
    }

    // Create placeholder for streaming assistant message (no user message for workflow actions)
    const streamingMessageId = `streaming-${Date.now()}`;
    streamingMessageIdRef.current = streamingMessageId;

    const assistantMessage: Message = {
      id: streamingMessageId,
      role: "assistant",
      content: "",
      type: "text",
    };
    setLocalMessages((prev) => [...prev, assistantMessage]);

    // Set workflow-specific loading state
    if (action === "confirm_start") {
      setWorkflowLoadingMessage("starting workflow");
    } else if (action === "progress_step") {
      setWorkflowLoadingMessage("progressing to next step");
    } else if (action === "resume_workflow") {
      setWorkflowLoadingMessage("resuming workflow");
    } else {
      setWorkflowLoadingMessage("Thinking...");
    }

    // Capture screenshot for workflow actions
    let multiWindowCapture: any = null;
    if (["progress_step", "confirm_start"].includes(action)) {
      if (window.consoleAPI?.captureScreenshot) {
        try {
          console.log("[ChatDetail] Capturing multi-window screenshots for workflow action...");
          const result = await window.consoleAPI.captureScreenshot();
          if (result && result.success) {
            console.log("[ChatDetail] Multi-window capture successful:", {
              windowCount: result.screenshots.length,
              blockedCount: result.blockedWindows.length,
              totalDetected: result.totalWindowsDetected,
            });
            multiWindowCapture = result;
          } else if (result && !result.success) {
            console.warn("[ChatDetail] Capture blocked or failed:", result.error);
          } else {
            console.log("[ChatDetail] No windows available to capture");
          }
        } catch (error) {
          console.error("[ChatDetail] Screenshot capture failed:", error);
        }
      } else {
        console.warn("[ChatDetail] captureScreenshot not available in consoleAPI");
      }
    }

    // Send message with metadata and multi-window capture
    sendMessageMutation.mutate({
      chatId,
      content: message,
      metadata,
      multiWindowCapture,
    });
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
                  console.log("Send to Agent Panel clicked, sending conversation:", chatId);
                  window.consoleAPI.sendToAgentPanel(chatId);
                  window.consoleAPI.minimizeWindow();
                }
              }}
            >
              <ExternalLink size={14} />
              <span className="text-xs">Send to Agent Panel</span>
            </Button>
          </div>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-text-primary">Conversation</h1>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto app-no-drag custom-scrollbar">
        <div className="max-w-4xl mx-auto px-8 py-4">
          {(() => {
            // Track which workflow sessions have been rendered to avoid duplicates
            const renderedWorkflowSessions = new Set<string>();

            return messages.map((message) => {
              // User messages: decide whether to show in main flow vs inside WorkflowAccordion
              if (message.role === "user") {
                const isInWorkflow = !!message.workflowSessionId;
                const hasValidStepIndex =
                  message.relatedStepIndex !== undefined &&
                  message.relatedStepIndex !== null &&
                  message.relatedStepIndex >= 0;

                // Show in main flow if not part of a workflow OR if it's a pre-flight message
                // (relatedStepIndex < 0) that doesn't belong to any concrete step
                if (!isInWorkflow || !hasValidStepIndex) {
                  return <UserMessage key={message.id} content={message.content} />;
                }

                // True step-level workflow user messages (relatedStepIndex >= 0)
                // are rendered inside WorkflowAccordion only
                return null;
              }

              // Render AI messages (assistant)
              const isWorkflowMessage =
                message.messageType === "workflow" && message.cardData?.workflowSessionId;

              // Check if this is a workflow with an accordion
              if (isWorkflowMessage && message.cardData) {
                const workflowSessionId = message.cardData.workflowSessionId!;

                // Skip if we've already rendered this workflow session
                if (renderedWorkflowSessions.has(workflowSessionId)) {
                  return null;
                }

                // Mark this workflow session as rendered
                renderedWorkflowSessions.add(workflowSessionId);

                // Filter all messages for this workflow
                const workflowMessages = messages.filter(
                  (m) => m.workflowSessionId === workflowSessionId
                );

                // Get the LATEST workflow state from the most recent workflow message with cardData
                // This ensures we show the current step index, status, etc.
                const latestWorkflowMessage = [...workflowMessages]
                  .reverse()
                  .find((m) => m.messageType === "workflow" && m.cardData);
                const currentWorkflowState = (latestWorkflowMessage?.cardData ||
                  message.cardData) as any;

                // Check if ANY message in this workflow is currently streaming
                const isCurrentlyStreaming = workflowMessages.some(
                  (m) => streamingMessageIdRef.current === m.id
                );

                // Check if we're awaiting a custom question for this workflow
                const isAwaitingCustomQuestion =
                  awaitingCustomQuestion?.workflowSessionId === workflowSessionId;

                // Render WorkflowAccordion ONCE per workflow session
                return (
                  <div key={workflowSessionId}>
                    <ErrorBoundary
                      fallback={
                        <div className="workflow-error bg-status-error/10 border border-status-error/30 rounded-lg p-4 mb-4">
                          <p className="text-sm text-text-secondary text-center">
                            Unable to load workflow. Please try refreshing the conversation.
                          </p>
                        </div>
                      }
                    >
                      <WorkflowAccordion
                        workflow={currentWorkflowState}
                        messages={workflowMessages}
                        onOptionSelect={handleWorkflowOptionSelect}
                        isStreaming={isCurrentlyStreaming}
                        awaitingCustomQuestion={isAwaitingCustomQuestion}
                        workflowLoadingMessage={workflowLoadingMessage}
                      />
                    </ErrorBoundary>
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

              // Regular assistant messages
              // Do NOT render here if this assistant message belongs to a workflow;
              // it will be shown inside the corresponding WorkflowAccordion step
              if (!isWorkflowMessage && message.content && !message.workflowSessionId) {
                return <AIMessage key={message.id} content={message.content} />;
              }

              return null;
            });
          })()}

          {/* Loading message - show when backend is processing (non-workflow) */}
          {loadingMessage && <LoadingMessage message={loadingMessage} />}

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
