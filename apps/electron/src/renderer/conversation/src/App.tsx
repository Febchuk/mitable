import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import UserMessage from "../../components/domain/messages/UserMessage";
import AIMessage from "../../components/domain/messages/AIMessage";
import { ErrorBoundary } from "../../components/common/ErrorBoundary";
import { sendMessageStream, pauseWorkflow } from "../../lib/api/conversations";
import CollapsedView from "./components/CollapsedView";
import ExpertsCard from "./components/ExpertsCard";
import { WorkflowAccordion } from "./components/WorkflowAccordion";
import LoadingMessage from "./components/LoadingMessage";
import type { Message } from "./types";
import type { MultiWindowCaptureResult } from "@mitable/shared";

declare global {
  interface Window {
    conversationAPI: {
      hideWindow: () => void;
      onMessageReceived: (
        callback: (message: any, screenshot: string | null) => void
      ) => () => void;
      updateMessages: (messages: any[]) => void;
      onPositionUpdate: (callback: (x: number, y: number) => void) => () => void;
      showNudge: (data: unknown) => void;
      startGuide: (data: unknown) => void;
      showOverlay?: (data: unknown) => void;
      getAuthToken: () => Promise<string | null>;
      onAuthTokenUpdated: (callback: (token: string | null) => void) => () => void;
      // NEW: State management
      setViewState: (state: "hidden" | "collapsed" | "expanded") => void;
      onViewStateChange: (
        callback: (state: "hidden" | "collapsed" | "expanded") => void
      ) => () => void;
      onConversationLoad: (callback: (conversationId: string) => void) => () => void;
      switchConversation: (conversationId: string) => void;
      requestConversationList: () => void;
      onConversationList: (callback: (conversations: any[]) => void) => () => void;
      openConversationInConsole: (conversationId: string) => void;
      openNudgeForm: (data: {
        expert: {
          id: string;
          name: string;
          email: string;
          role: string;
          department: string;
          expertise: string[];
        };
        context: string;
        question: string;
        conversationId: string;
      }) => void;
      captureScreenshot: (payload?: {
        message?: string;
        context?: {
          hasActiveWorkflow: boolean;
          lastMessageType?: string;
          messageCount: number;
          lastMessageHadCardData?: boolean;
        };
      }) => Promise<MultiWindowCaptureResult>;
    };
  }
}

type ViewState = "hidden" | "collapsed" | "expanded";

function App() {
  // View state management
  const [viewState, setViewState] = useState<ViewState>("hidden");
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [draftMessages] = useState<Map<string, string>>(new Map());

  // Existing message state
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Loading state for progress messages
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);

  // Workflow-specific loading state (for inline loading in WorkflowAccordion)
  const [workflowLoadingMessage, setWorkflowLoadingMessage] = useState<string | null>(null);

  // Workflow custom question state (for "Type something" button)
  const [awaitingCustomQuestion, setAwaitingCustomQuestion] = useState<{
    conversationId: string;
    workflowSessionId: string | null;
    relatedStepIndex: number | null;
  } | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (viewState === "expanded") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, viewState]);

  // Listen for state changes from main process
  useEffect(() => {
    const cleanup = window.conversationAPI.onViewStateChange((state) => {
      console.log(
        "[Conversation] View state changed by main process:",
        state,
        "current:",
        viewState
      );
      setViewState(state);
    });

    return cleanup;
  }, [viewState]);

  // Handle conversation load from Console "send to agent"
  useEffect(() => {
    const cleanup = window.conversationAPI.onConversationLoad((conversationId) => {
      console.log("[Conversation] Loading conversation from Console:", conversationId);
      handleSelectConversation(conversationId);
    });

    return cleanup;
  }, []);

  // Listen for messages from Agent window
  useEffect(() => {
    const cleanup = window.conversationAPI.onMessageReceived(
      async (messageData: any, screenshot: string | null) => {
        console.log("[Conversation] Message received from Agent:", messageData);

        // If we're in collapsed state, expand to show the conversation
        if (viewState === "collapsed") {
          window.conversationAPI.setViewState("expanded");
        }

        // Destructure message data
        const { message, conversationId: convId, userMessage } = messageData;

        // Update conversation ID
        if (convId) {
          setConversationId(convId);
          setCurrentConversationId(convId);
        }

        // Add user message to UI (for new user messages only)
        if (userMessage) {
          const userMsg: Message = {
            id: Date.now().toString(),
            role: "user",
            content: userMessage,
            type: "text",
            // If awaiting custom question, attach workflow fields so message appears in accordion
            workflowSessionId: awaitingCustomQuestion?.workflowSessionId || undefined,
            relatedStepIndex: awaitingCustomQuestion?.relatedStepIndex ?? undefined,
          };
          setMessages((prev) => [...prev, userMsg]);
        }

        // Capture multi-window screenshots
        let multiWindowCapture: any = null;

        if (!screenshot) {
          // Build conversation context
          const lastMessage = messages[messages.length - 1];
          const hasActiveWorkflow =
            lastMessage?.messageType === "workflow" || !!lastMessage?.cardData?.workflowActive;

          const context = {
            hasActiveWorkflow,
            lastMessageType: lastMessage?.messageType,
            messageCount: messages.length,
            lastMessageHadCardData: !!lastMessage?.cardData,
          };

          console.log("[Conversation] Requesting multi-window capture:", {
            message,
            context,
          });

          // Capture multi-window screenshots using IPC API
          try {
            const result = await window.conversationAPI.captureScreenshot({
              message,
              context,
            });

            if (result && result.success) {
              // Multi-window capture successful
              console.log("[Conversation] Multi-window capture successful:", {
                screenshotCount: result.screenshots.length,
                blockedCount: result.blockedWindows.length,
                totalDetected: result.totalWindowsDetected,
              });
              multiWindowCapture = result;
            } else if (result && !result.success) {
              console.warn("[Conversation] Capture blocked or failed:", result.error);
            } else {
              console.log("[Conversation] No windows available to capture");
            }
          } catch (error) {
            console.error("[Conversation] Screenshot capture failed:", error);
            // Continue without screenshot - backend will handle gracefully
          }
        }

        // Create placeholder for streaming assistant message
        const streamingMessageId = `streaming-${Date.now()}`;
        streamingMessageIdRef.current = streamingMessageId;

        const assistantMessage: Message = {
          id: streamingMessageId,
          role: "assistant",
          content: "",
          type: "text",
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Prepare metadata if this is a custom question during workflow
        const metadata = awaitingCustomQuestion
          ? {
              workflowAction: "custom_question",
              selectedOption: 2,
              workflowSessionId: awaitingCustomQuestion.workflowSessionId,
              currentStepIndex: awaitingCustomQuestion.relatedStepIndex,
            }
          : undefined;

        console.log("[Conversation] Sending message with metadata:", metadata);

        // Set initial loading state
        setLoadingMessage("Thinking...");

        // Stream the response with multi-window captures
        try {
          await sendMessageStream(
            convId,
            message,
            multiWindowCapture, // Multi-window capture result
            {
              onChunk: (chunk, workflowSessionId, relatedStepIndex) => {
                // Clear loading message on first chunk
                setLoadingMessage(null);
                setMessages((prev) =>
                  prev.map(
                    (msg): Message =>
                      msg.id === streamingMessageId
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
              onComplete: (
                fullContent,
                messageId,
                messageType,
                cardData,
                windowTrigger,
                workflowSessionId,
                relatedStepIndex
              ) => {
                console.log("[Conversation] onComplete received:", {
                  messageId,
                  messageType,
                  hasCardData: !!cardData,
                  windowTrigger,
                  workflowSessionId,
                  relatedStepIndex,
                });

                // Clear loading message on complete (in case onChunk never fired)
                setLoadingMessage(null);

                setMessages((prev) =>
                  prev.map(
                    (msg): Message =>
                      msg.id === streamingMessageId
                        ? {
                            ...msg,
                            id: messageId,
                            content: fullContent,
                            type: cardData ? "card" : "text",
                            messageType: messageType as "workflow" | "experts" | "text",
                            cardData,
                            windowTrigger,
                            workflowSessionId,
                            relatedStepIndex,
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
              onError: (error) => {
                console.error("Streaming error:", error);

                // Clear loading message on error
                setLoadingMessage(null);

                setMessages((prev) =>
                  prev.map(
                    (msg): Message =>
                      msg.id === streamingMessageId
                        ? {
                            ...msg,
                            content: `Error: ${error}. Please try again.`,
                          }
                        : msg
                  )
                );
                streamingMessageIdRef.current = null;
              },
              onWindowTrigger: (windowType, data) => {
                console.log(`[Conversation] Window trigger received: ${windowType}`, {
                  hasData: !!data,
                  dataKeys: data ? Object.keys(data) : [],
                });
                if (windowType === "nudge") {
                  window.conversationAPI?.showNudge(data);
                } else if (windowType === "guide") {
                  window.conversationAPI?.startGuide(data);
                } else if (windowType === "overlay") {
                  console.log("[Conversation] Triggering overlay via conversationAPI.showOverlay");
                  window.conversationAPI?.showOverlay?.(data);
                } else {
                  console.warn("[Conversation] Unknown window trigger type:", windowType);
                }
              },
              onProgress: (phase, message) => {
                console.log(`[Conversation] Progress update: ${phase} - ${message}`);
                setLoadingMessage(message);
              },
            },
            metadata // Workflow metadata only
          );
        } catch (error) {
          console.error("Failed to send message:", error);
          setMessages((prev) =>
            prev.map(
              (msg): Message =>
                msg.id === streamingMessageId
                  ? {
                      ...msg,
                      content: "Failed to send message. Please try again.",
                    }
                  : msg
            )
          );
          streamingMessageIdRef.current = null;
        }
      }
    );

    // Cleanup listener on unmount or remount
    return cleanup;
  }, [viewState, awaitingCustomQuestion]);

  const handleNewChat = () => {
    console.log("[Conversation] Creating new chat");
    // Create temp conversation ID
    const tempId = `temp-${Date.now()}`;
    setCurrentConversationId(tempId);
    setConversationId(tempId);
    setMessages([]);
    window.conversationAPI.setViewState("expanded");
  };

  const handleSelectConversation = async (selectedConversationId: string) => {
    console.log("[Conversation] Selecting conversation:", selectedConversationId);

    // Save current draft if there is one
    if (currentConversationId && draftMessages.has(currentConversationId)) {
      console.log("[Conversation] Draft preserved for:", currentConversationId);
    }

    // Load the selected conversation
    setCurrentConversationId(selectedConversationId);
    setConversationId(selectedConversationId);

    // Fetch messages from backend for this conversation
    try {
      console.log("[Conversation] Fetching messages for conversation:", selectedConversationId);
      const { getConversationMessages } = await import("../../lib/api/conversations");
      const fetchedMessages = await getConversationMessages(selectedConversationId);

      console.log("[Conversation] Fetched", fetchedMessages.length, "messages");

      // Convert API messages to UI message format
      const uiMessages = fetchedMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        type: msg.cardData ? ("card" as const) : ("text" as const),
        messageType: msg.messageType,
        cardData: msg.cardData,
        sources: msg.sources,
        windowTrigger: msg.windowTrigger,
        workflowSessionId: msg.workflowSessionId,
        relatedStepIndex: msg.relatedStepIndex,
      }));

      setMessages(uiMessages);
    } catch (error) {
      console.error("[Conversation] Failed to fetch messages:", error);
      // Still expand but with empty messages
      setMessages([]);
    }

    // Expand to show the conversation
    window.conversationAPI.setViewState("expanded");
  };

  const handleClose = () => {
    console.log("[Conversation] Closing to collapsed state");
    // Don't clear messages or conversation - just collapse back to combobox
    window.conversationAPI.setViewState("collapsed");
  };

  const handleExitWorkflow = async () => {
    if (!conversationId) {
      console.error("[Conversation] No conversation ID for exit workflow");
      return;
    }

    try {
      console.log("[Conversation] Exiting workflow for conversation:", conversationId);

      // Call backend to pause workflow and get updated state
      const updatedWorkflow = await pauseWorkflow(conversationId);

      console.log("[Conversation] Workflow paused:", updatedWorkflow.workflowSessionId);

      // Update cardData status to "paused" for all messages in this workflow
      // Keep everything else (step indexes, content, etc.) unchanged
      setMessages((prev) =>
        prev.map((msg): Message => {
          if (msg.workflowSessionId === updatedWorkflow.workflowSessionId && msg.cardData) {
            return {
              ...msg,
              cardData: {
                ...msg.cardData,
                status: "paused", // Only change status
              },
            };
          }
          return msg;
        })
      );

      console.log("[Conversation] Workflow status updated to paused");
    } catch (error) {
      console.error("[Conversation] Error pausing workflow:", error);
    }
  };

  const handleWorkflowOptionSelect = async (option: any) => {
    if (!conversationId) {
      console.error("[Conversation] No conversation ID available for workflow action");
      return;
    }

    // Map option action to metadata and message
    const { action, label } = option;

    let metadata: any = {};
    let message = "";

    switch (action) {
      case "progress_step":
        metadata = {
          workflowAction: "progress_step",
          selectedOption: 1,
        };
        message = "Move on to next step";
        break;

      case "custom_question":
      case "ask_questions":
        metadata = {
          workflowAction: "custom_question",
          selectedOption: 2,
        };
        message = label; // The actual question text (will be "Type something" for now, fixed later)
        break;

      case "exit_workflow":
        // Handle exit workflow separately - pause workflow without sending message
        await handleExitWorkflow();
        return; // Don't continue with sending message

      case "confirm_start":
        metadata = {
          workflowAction: "progress_step",
          selectedOption: 1,
        };
        message = "Yes, let's get started!";
        break;

      default:
        message = label;
    }

    // Find the LATEST workflow message to get current workflowSessionId and currentStepIndex
    // Use reverse() to start from most recent messages
    const activeWorkflowMessage = [...messages]
      .reverse()
      .find((m) => m.messageType === "workflow" && m.cardData?.workflowSessionId);
    const workflowSessionId = activeWorkflowMessage?.cardData?.workflowSessionId || null;
    const currentStepIndex = activeWorkflowMessage?.cardData?.currentStepIndex ?? null;

    console.log("[Conversation] Workflow option selected:", {
      action,
      message,
      metadata,
      workflowSessionId,
      currentStepIndex,
    });

    // Handle "Type something" / "ask questions" actions - enable custom input mode
    if (action === "custom_question" || action === "ask_questions") {
      console.log("[Conversation] Enabling custom question mode");
      setAwaitingCustomQuestion({
        conversationId,
        workflowSessionId,
        relatedStepIndex: currentStepIndex,
      });
      // Don't send message yet - wait for user to type their actual question in agent pill
      return;
    }

    // Only create user message for actions where user intent should be visible
    // Control actions (progress_step, exit_workflow) should NOT create visible bubbles
    const shouldCreateUserMessage = action === "confirm_start";

    if (shouldCreateUserMessage) {
      // Add user message to UI with workflow fields so it appears inside WorkflowAccordion
      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: message,
        type: "text",
        workflowSessionId,
        relatedStepIndex: currentStepIndex,
      };
      setMessages((prev) => [...prev, userMsg]);
    }

    // Create placeholder for streaming assistant message
    const streamingMessageId = `streaming-${Date.now()}`;
    streamingMessageIdRef.current = streamingMessageId;

    const assistantMessage: Message = {
      id: streamingMessageId,
      role: "assistant",
      content: "",
      type: "text",
    };

    setMessages((prev) => [...prev, assistantMessage]);

    // Set workflow-specific loading state
    setWorkflowLoadingMessage("Thinking...");

    // Capture screenshot for workflow actions (progress_step and custom_question)
    let multiWindowCapture: any = null;
    if (
      option.action === "progress_step" ||
      option.action === "custom_question" ||
      option.action === "confirm_start"
    ) {
      console.log("[Conversation] Capturing screenshot for workflow action:", option.action);
      try {
        const result = await window.conversationAPI?.captureScreenshot?.();
        if (result && result.success) {
          console.log("[Conversation] Multi-window capture successful", {
            windowCount: result.screenshots.length,
            blockedCount: result.blockedWindows.length,
            totalDetected: result.totalWindowsDetected,
          });
          multiWindowCapture = result;
        } else if (result && !result.success) {
          console.warn("[Conversation] Capture blocked or failed:", result.error);
        } else {
          console.log("[Conversation] No windows available to capture");
        }
      } catch (error) {
        console.error("[Conversation] Screenshot capture failed:", error);
        // Continue without screenshot - backend will handle gracefully
      }
    }

    // Stream the response with metadata
    try {
      await sendMessageStream(
        conversationId,
        message,
        multiWindowCapture,
        {
          onChunk: (chunk) => {
            // Clear workflow loading state on first chunk
            setWorkflowLoadingMessage(null);

            setMessages((prev) =>
              prev.map(
                (msg): Message =>
                  msg.id === streamingMessageId ? { ...msg, content: msg.content + chunk } : msg
              )
            );
          },
          onComplete: (
            fullContent,
            messageId,
            messageType,
            cardData,
            windowTrigger,
            workflowSessionId,
            relatedStepIndex
          ) => {
            // Clear workflow loading state on complete (in case onChunk never fired)
            setWorkflowLoadingMessage(null);

            setMessages((prev) =>
              prev.map(
                (msg): Message =>
                  msg.id === streamingMessageId
                    ? {
                        ...msg,
                        id: messageId,
                        content: fullContent,
                        type: cardData ? "card" : "text",
                        messageType: messageType as "workflow" | "experts" | "text",
                        cardData,
                        windowTrigger,
                        workflowSessionId,
                        relatedStepIndex,
                      }
                    : msg
              )
            );
            streamingMessageIdRef.current = null;
          },
          onError: (error) => {
            console.error("Workflow streaming error:", error);

            // Clear workflow loading state on error
            setWorkflowLoadingMessage(null);

            setMessages((prev) =>
              prev.map(
                (msg): Message =>
                  msg.id === streamingMessageId ? { ...msg, content: `Error: ${error}` } : msg
              )
            );
            streamingMessageIdRef.current = null;
          },
          onWindowTrigger: (windowType, data) => {
            console.log(`[Conversation] Workflow window trigger received: ${windowType}`, {
              hasData: !!data,
              dataKeys: data ? Object.keys(data) : [],
            });
            if (windowType === "nudge") {
              window.conversationAPI?.showNudge(data);
            } else if (windowType === "guide") {
              window.conversationAPI?.startGuide(data);
            } else if (windowType === "overlay") {
              console.log("[Conversation] Triggering overlay via conversationAPI.showOverlay");
              window.conversationAPI?.showOverlay?.(data);
            } else {
              console.warn("[Conversation] Unknown workflow window trigger:", windowType);
            }
          },
          onProgress: (phase, message) => {
            console.log(`[Conversation] Workflow progress update: ${phase} - ${message}`);
            setWorkflowLoadingMessage(message);
          },
        },
        metadata // Pass workflow metadata to the API
      );
    } catch (error) {
      console.error("Failed to send workflow message:", error);
    }
  };

  // Render collapsed view (combobox)
  if (viewState === "collapsed") {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <CollapsedView onSelectConversation={handleSelectConversation} onNewChat={handleNewChat} />
      </div>
    );
  }

  // Render expanded view (full chat)
  if (viewState === "expanded") {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="w-full h-full flex items-center justify-center p-4"
        >
          <div className="relative w-full h-[600px] flex flex-col bg-background-secondary rounded-2xl overflow-hidden app-drag">
            {/* Open in Console Button */}
            <button
              onClick={() => {
                if (conversationId) {
                  console.log("[Conversation] Opening in console:", conversationId);
                  window.conversationAPI.openConversationInConsole(conversationId);
                }
              }}
              className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors app-no-drag"
              aria-label="Open in Console"
            >
              <ExternalLink size={16} className="text-white" />
            </button>

            {/* Close Button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors app-no-drag"
              aria-label="Close"
            >
              <X size={16} className="text-white" />
            </button>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 pt-16 app-no-drag">
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-gray-400">
                    <p className="text-lg font-medium mb-2">Start a conversation</p>
                    <p className="text-sm">Ask me anything by typing in the agent pill below</p>
                  </div>
                </div>
              )}

              {(() => {
                // Track which workflow sessions have been rendered to avoid duplicates
                const renderedWorkflowSessions = new Set<string>();

                return messages.map((message) => {
                  // Skip user messages that belong to a workflow (they'll be shown inside WorkflowAccordion)
                  if (message.role === "user") {
                    // Only render user message in main flow if it's NOT part of a workflow
                    if (!message.workflowSessionId) {
                      return <UserMessage key={message.id} content={message.content} />;
                    }
                    // User messages with workflowSessionId are rendered inside WorkflowAccordion
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
                    // Type assertion: backend guarantees workflow messages have complete SolutionObject in cardData
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

                  return (
                    <div key={message.id} className="space-y-3">
                      {/* Show AI message for non-workflow messages */}
                      {!isWorkflowMessage && message.content && (
                        <AIMessage content={message.content} />
                      )}

                      {/* Show inline ExpertsCard for experts messages */}
                      {message.messageType === "experts" && message.cardData?.experts && (
                        <ExpertsCard
                          experts={message.cardData.experts}
                          suggestedNudge={message.cardData.suggestedNudge}
                          conversationId={conversationId || ""}
                        />
                      )}
                    </div>
                  );
                });
              })()}

              {/* Loading message - show when backend is processing */}
              {loadingMessage && <LoadingMessage message={loadingMessage} />}

              <div ref={messagesEndRef} />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Hidden state - render nothing
  return null;
}

export default App;
