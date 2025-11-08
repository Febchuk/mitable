import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import UserMessage from "../../components/domain/messages/UserMessage";
import AIMessage from "../../components/domain/messages/AIMessage";
import { sendMessageStream } from "../../lib/api/conversations";
import CollapsedView from "./components/CollapsedView";
import WorkflowOptions, { WorkflowPhase } from "../../components/domain/workflow/WorkflowOptions";
import ExpertsCard from "./components/ExpertsCard";
import { WorkflowAccordion } from "./components/WorkflowAccordion";
import LoadingMessage from "./components/LoadingMessage";
import type { Message } from "./types";

declare global {
  interface Window {
    conversationAPI: {
      hideWindow: () => void;
      onMessageReceived: (
        callback: (message: any, screenshot: string | null) => void
      ) => () => void;
      updateMessages: (messages: any[]) => void;
      onPositionUpdate: (callback: (x: number, y: number) => void) => () => void;
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
      }) => Promise<{
        dataUrl: string;
        metadata: {
          width: number;
          height: number;
          originalWidth: number;
          originalHeight: number;
          captureMode: string;
          timestamp: number;
        };
      } | null>;
    };
  }
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "card";
  messageType?: string;
  cardData?: any;
  sources?: any[];
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

        // If we're not already expanded, expand to show the conversation
        if (viewState !== "expanded") {
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
          };
          setMessages((prev) => [...prev, userMsg]);
          console.log("[Conversation] User message added to UI:", userMsg);
        }

        // Conditionally capture screenshot based on message content and conversation context
        let capturedScreenshot: string | null = screenshot; // Use provided screenshot if available

        if (!capturedScreenshot) {
          // Build conversation context for heuristics
          const lastMessage = messages[messages.length - 1];
          const hasActiveWorkflow =
            lastMessage?.messageType === "workflow" || !!lastMessage?.cardData?.workflowActive;

          const context = {
            hasActiveWorkflow,
            lastMessageType: lastMessage?.messageType,
            messageCount: messages.length,
            lastMessageHadCardData: !!lastMessage?.cardData,
          };

          console.log("[Conversation] Evaluating screenshot capture need:", {
            message,
            context,
          });

          // Capture screenshot conditionally using IPC API with heuristics
          // The main process will use CaptureService.conditionalCapture() to decide
          try {
            const result = await window.conversationAPI.captureScreenshot({
              message,
              context,
            });

            if (result) {
              capturedScreenshot = result.dataUrl;
              console.log("[Conversation] Screenshot captured via heuristics:", {
                size: capturedScreenshot.length,
                metadata: result.metadata,
              });
            } else {
              console.log(
                "[Conversation] No screenshot captured (heuristics determined not needed)"
              );
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

        // Stream the response with conditionally captured screenshot
        try {
          await sendMessageStream(
            convId,
            message,
            capturedScreenshot,
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
                _windowTrigger, // Ignored - no longer triggering windows
                workflowSessionId,
                relatedStepIndex
              ) => {
                console.log("[Conversation] onComplete received:", {
                  messageId,
                  messageType,
                  hasCardData: !!cardData,
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
              onProgress: (phase, message) => {
                console.log(`[Conversation] Progress update: ${phase} - ${message}`);
                setLoadingMessage(message);
              },
            }
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
  }, [viewState]);

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
        message = label; // The actual question text
        break;

      case "exit_workflow":
        metadata = {
          workflowAction: "exit_workflow",
          selectedOption: 3,
        };
        message = "Exit workflow";
        break;

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

    console.log("[Conversation] Workflow option selected:", { action, message, metadata });

    // Add user message to UI
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: message,
      type: "text",
    };
    setMessages((prev) => [...prev, userMsg]);

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
    let screenshot: string | null = null;
    if (
      option.action === "progress_step" ||
      option.action === "custom_question" ||
      option.action === "confirm_start"
    ) {
      console.log("[Conversation] Capturing screenshot for workflow action:", option.action);
      const screenshotResult = await window.conversationAPI?.captureScreenshot?.();
      if (screenshotResult) {
        screenshot = screenshotResult.dataUrl;
        console.log("[Conversation] Screenshot captured successfully");
      } else {
        console.warn("[Conversation] Screenshot capture failed");
      }
    }

    // Stream the response with metadata
    try {
      await sendMessageStream(
        conversationId,
        message,
        screenshot,
        {
          onChunk: (chunk) => {
            // Clear workflow loading state on first chunk
            setWorkflowLoadingMessage(null);

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === streamingMessageId ? { ...msg, content: msg.content + chunk } : msg
              )
            );
          },
          onComplete: (
            fullContent,
            messageId,
            messageType,
            cardData,
            _windowTrigger, // Ignored - no longer triggering windows
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
              prev.map((msg) =>
                msg.id === streamingMessageId ? { ...msg, content: `Error: ${error}` } : msg
              )
            );
            streamingMessageIdRef.current = null;
          },
          onProgress: (phase, message) => {
            console.log(`[Conversation] Workflow progress update: ${phase} - ${message}`);
            setWorkflowLoadingMessage(message);
          },
        },
        metadata // Pass metadata to the API
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
            {/* Close Button - Subtle gray background with hover effect */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors app-no-drag shadow-lg"
              aria-label="Close"
            >
              <X size={18} className="text-white" />
            </button>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 pt-16 pb-8 app-no-drag scrollbar-hide">
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-gray-400">
                    <p className="text-lg font-medium mb-2">Start a conversation</p>
                    <p className="text-sm">Ask me anything by typing in the agent pill below</p>
                  </div>
                </div>
              )}

              {(() => {
                // Track rendered workflow sessions to deduplicate
                const renderedWorkflowSessions = new Set<string>();

                return messages.map((message) => {
                  // Render user messages
                  if (message.role === "user") {
                    return <UserMessage key={message.id} content={message.content} />;
                  }

                  // Render AI messages (assistant)
                  const isWorkflowMessage =
                    message.messageType === "workflow" && message.cardData?.workflowActive;

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
                        <WorkflowAccordion
                          workflow={currentWorkflowState}
                          messages={workflowMessages}
                          onOptionSelect={handleWorkflowOptionSelect}
                          isStreaming={isCurrentlyStreaming}
                          awaitingCustomQuestion={isAwaitingCustomQuestion}
                          workflowLoadingMessage={workflowLoadingMessage}
                        />

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
                  }

                  // Render non-workflow assistant messages
                  return (
                    <div key={message.id} className="space-y-3">
                      {/* Show AI message for non-workflow messages */}
                      {message.content && <AIMessage content={message.content} />}

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
