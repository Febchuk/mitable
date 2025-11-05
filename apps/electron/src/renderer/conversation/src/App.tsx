import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Code, ExternalLink, LucideIcon, Users, Workflow, X } from "lucide-react";
import UserMessage from "../../components/domain/messages/UserMessage";
import AIMessage from "../../components/domain/messages/AIMessage";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { sendMessageStream } from "../../lib/api/conversations";
import CollapsedView from "./components/CollapsedView";
import WorkflowOptions, { WorkflowPhase } from "../../components/domain/workflow/WorkflowOptions";
import StepList from "../../components/domain/workflow/StepList";
import ExpertsCard from "./components/ExpertsCard";

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
  windowTrigger?: {
    window: "nudge" | "guide";
    data: any;
  };
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
        console.log("[Conversation] Placeholder AI message created, starting stream...");

        // Stream the response with conditionally captured screenshot
        try {
          await sendMessageStream(convId, message, capturedScreenshot, {
            onChunk: (chunk) => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === streamingMessageId ? { ...msg, content: msg.content + chunk } : msg
                )
              );
            },
            onComplete: (fullContent, messageId, messageType, cardData, windowTrigger) => {
              console.log("[Conversation] onComplete received:", {
                messageId,
                messageType,
                hasCardData: !!cardData,
                windowTrigger,
              });
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === streamingMessageId
                    ? {
                        ...msg,
                        id: messageId,
                        content: fullContent,
                        type: cardData ? "card" : "text",
                        messageType,
                        cardData,
                        windowTrigger,
                      }
                    : msg
                )
              );
              streamingMessageIdRef.current = null;
            },
            onError: (error) => {
              console.error("Streaming error:", error);
              setMessages((prev) =>
                prev.map((msg) =>
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
              console.log(`Window trigger: ${windowType}`, data);
              // Window trigger data is stored in message for user to click card
            },
          });
        } catch (error) {
          console.error("Failed to send message:", error);
          setMessages((prev) =>
            prev.map((msg) =>
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
        windowTrigger: msg.windowTrigger,
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

  const handleCardClick = (message: Message) => {
    console.log("[Conversation] Card clicked - message object:", {
      id: message.id,
      messageType: message.messageType,
      hasCardData: !!message.cardData,
      windowTrigger: message.windowTrigger,
      fullMessage: message,
    });

    if (!message.windowTrigger) {
      console.warn("Card clicked but no window trigger data");
      return;
    }

    const { window: windowType, data } = message.windowTrigger;
    console.log(`Card clicked - launching ${windowType} window`, data);

    if (windowType === "nudge") {
      // Pass expert data + conversationId for context generation
      window.conversationAPI.showNudge({
        ...data,
        conversationId,
      });
    } else if (windowType === "guide") {
      // Pass guide data + conversationId for step progression
      window.conversationAPI.startGuide({
        ...data,
        conversationId,
      });
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
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === streamingMessageId ? { ...msg, content: msg.content + chunk } : msg
              )
            );
          },
          onComplete: (fullContent, messageId, messageType, cardData, windowTrigger) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === streamingMessageId
                  ? {
                      ...msg,
                      id: messageId,
                      content: fullContent,
                      type: cardData ? "card" : "text",
                      messageType,
                      cardData,
                      windowTrigger,
                    }
                  : msg
              )
            );
            streamingMessageIdRef.current = null;
          },
          onError: (error) => {
            console.error("Workflow streaming error:", error);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === streamingMessageId ? { ...msg, content: `Error: ${error}` } : msg
              )
            );
            streamingMessageIdRef.current = null;
          },
          onWindowTrigger: (windowType, data) => {
            if (windowType === "nudge") {
              window.conversationAPI?.showNudge(data);
            } else if (windowType === "guide") {
              window.conversationAPI?.startGuide(data);
            }
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
            <div className="flex-1 overflow-y-auto px-6 py-4 pt-16 pb-8 app-no-drag">
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-gray-400">
                    <p className="text-lg font-medium mb-2">Start a conversation</p>
                    <p className="text-sm">Ask me anything by typing in the agent pill below</p>
                  </div>
                </div>
              )}

              {messages.map((message) => {
                // Render user messages
                if (message.role === "user") {
                  return <UserMessage key={message.id} content={message.content} />;
                }

                // Render AI messages (assistant)
                const isWorkflowMessage =
                  message.messageType === "workflow" && message.cardData?.workflowActive;
                const workflowPhase = message.cardData?.workflowPhase as WorkflowPhase | undefined;

                // Determine if we should show step list based on phase
                const shouldShowStepList =
                  isWorkflowMessage && workflowPhase && workflowPhase !== "custom_question";
                const shouldShowCheckboxes = workflowPhase === "step_progression";

                // Determine card title/subtitle/icon for non-workflow cards
                let title = "";
                let subtitle = "";
                let Icon: LucideIcon = Code;

                if (message.messageType === "experts" && message.cardData) {
                  const expertCount = message.cardData.experts?.length || 0;
                  title = `${expertCount} Expert${expertCount > 1 ? "s" : ""} Available`;
                  subtitle = "View Experts";
                  Icon = Users;
                } else if (
                  message.messageType === "workflow" &&
                  message.cardData &&
                  !isWorkflowMessage
                ) {
                  // Old workflow card format (before our changes)
                  title = message.cardData.guide?.title || "Interactive Workflow";
                  subtitle = "Start Guide";
                  Icon = Workflow;
                } else if (message.cardData && !isWorkflowMessage) {
                  // Fallback for unknown card types
                  title = message.cardData.title || "Card";
                  subtitle = message.cardData.subtitle || "Click to view";
                }

                return (
                  <div key={message.id} className="space-y-3">
                    {/* Show workflow components for active workflows */}
                    {isWorkflowMessage && (
                      <>
                        {/* 1. FIRST: Show step list for initial_proposal and step_progression phases */}
                        {shouldShowStepList && message.cardData.stepList && (
                          <StepList
                            steps={message.cardData.stepList}
                            currentStepIndex={message.cardData.currentStepIndex || 0}
                            showCheckboxes={shouldShowCheckboxes}
                          />
                        )}

                        {/* 2. SECOND: Show AI text response (conversational message) */}
                        {message.content && <AIMessage content={message.content} />}

                        {/* Always show WorkflowOptions for workflow messages */}
                        {workflowPhase && (
                          <WorkflowOptions
                            phase={workflowPhase}
                            onOptionSelect={handleWorkflowOptionSelect}
                          />
                        )}
                      </>
                    )}

                    {/* Show AI message for non-workflow messages */}
                    {!isWorkflowMessage &&
                      (() => {
                        const isCurrentStreaming =
                          message.id === streamingMessageIdRef.current && !message.content;
                        const content = isCurrentStreaming ? "Thinking..." : message.content || "";
                        return <AIMessage content={content} isStreaming={isCurrentStreaming} />;
                      })()}

                    {/* Show inline ExpertsCard for experts messages */}
                    {message.messageType === "experts" && message.cardData?.experts && (
                      <ExpertsCard
                        experts={message.cardData.experts}
                        suggestedNudge={message.cardData.suggestedNudge}
                        conversationId={conversationId || ""}
                      />
                    )}

                    {/* Show card below the text if cardData exists (non-workflow, non-experts cards) */}
                    {message.type === "card" &&
                      message.cardData &&
                      !isWorkflowMessage &&
                      message.messageType !== "experts" && (
                        <Card
                          className="w-full p-4 flex items-center justify-between cursor-pointer hover:bg-accent transition-colors"
                          onClick={() => handleCardClick(message)}
                        >
                          <div className="text-left">
                            <CardTitle className="text-base mb-1">{title}</CardTitle>
                            <CardDescription>{subtitle}</CardDescription>
                          </div>
                          <div className="w-12 h-12 bg-[#30303e] rounded-lg flex items-center justify-center flex-shrink-0 ml-4">
                            <Icon size={24} className="text-primary-foreground" />
                          </div>
                        </Card>
                      )}
                  </div>
                );
              })}
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
