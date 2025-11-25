import { useState, useRef, useEffect, useCallback } from "react";
import { useConversationMessages, useSendMessage } from "@/console/src/hooks/queries/chats";
import UserMessage from "../../../../../../../components/domain/messages/UserMessage";
import AIMessage from "../../../../../../../components/domain/messages/AIMessage";
import ExpertsCard from "../../../../../../../conversation/src/components/ExpertsCard";
import WorkflowOptions, {
  type WorkflowPhase,
} from "../../../../../../../components/domain/workflow/WorkflowOptions";
import StepList from "../../../../../../../components/domain/workflow/StepList";
import RichTextInput from "./RichTextInput";

interface ChatMessagesProps {
  chatId: string;
  initialMessage?: string | null;
  onMessageSent?: () => void;
}

export default function ChatMessages({ chatId, initialMessage, onMessageSent }: ChatMessagesProps) {
  const { data: messages, isLoading: messagesLoading } = useConversationMessages(chatId);
  const [inputValue, setInputValue] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasAutoSent, setHasAutoSent] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const lastScrollTop = useRef<number>(0);

  // Ensure messages is always an array
  const messageList = Array.isArray(messages) ? messages : [];

  // Memoize callbacks to prevent infinite re-renders
  const onChunk = useCallback((chunk: string) => {
    setStreamingContent((prev) => prev + chunk);
  }, []);

  const onComplete = useCallback((_fullContent: string) => {
    setIsStreaming(false);
  }, []);

  const onError = useCallback((error: string) => {
    console.error("[ChatMessages] Streaming error:", error);
    setStreamingContent("");
    setIsStreaming(false);
  }, []);

  const onWindowTrigger = useCallback((windowType: string, data: any) => {
    console.log("[ChatMessages] Window trigger:", { windowType, data });
  }, []);

  const sendMessageMutation = useSendMessage({
    onChunk,
    onComplete,
    onError,
    onWindowTrigger,
    captureScreenshot: true,
  });

  // Clear streaming content once new messages load
  useEffect(() => {
    if (!isStreaming && streamingContent && messageList.length > 0) {
      const timer = setTimeout(() => {
        setStreamingContent("");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, streamingContent, messageList]);

  // Track user scrolling to avoid interrupting manual scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
      
      // User is scrolling if they're more than 100px from bottom
      const isNearBottom = distanceFromBottom < 100;
      
      // Detect upward scroll
      if (scrollTop < lastScrollTop.current && !isNearBottom) {
        setIsUserScrolling(true);
      } else if (isNearBottom) {
        setIsUserScrolling(false);
      }
      
      lastScrollTop.current = scrollTop;

      // Clear any existing timeout
      clearTimeout(scrollTimeout);
      
      // Reset user scrolling flag after 3 seconds of no scroll
      scrollTimeout = setTimeout(() => {
        if (isNearBottom) {
          setIsUserScrolling(false);
        }
      }, 3000);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  // Auto-scroll DISABLED - user can scroll manually
  // useEffect(() => {
  //   if (messagesEndRef.current && !isUserScrolling) {
  //     const behavior = isStreaming ? "auto" : "smooth";
  //     messagesEndRef.current.scrollIntoView({ behavior, block: "nearest" });
  //   }
  // }, [messageList, streamingContent, isStreaming, isUserScrolling]);

  // Initial load: scroll to bottom once
  useEffect(() => {
    if (messageList.length > 0 && messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      }, 100);
    }
  }, [chatId]); // Only on chat change

  // Auto-send initial message when component loads
  useEffect(() => {
    if (initialMessage && !hasAutoSent && chatId && !messagesLoading) {
      console.log("[ChatMessages] Auto-sending initial message:", initialMessage);
      setHasAutoSent(true);
      setIsStreaming(true);
      setStreamingContent("");
      sendMessageMutation.mutate({
        chatId,
        content: initialMessage,
      });
      if (onMessageSent) {
        onMessageSent();
      }
    }
  }, [initialMessage, hasAutoSent, chatId, messagesLoading, sendMessageMutation, onMessageSent]);

  const handleWorkflowOptionSelect = async (option: any) => {
    if (!chatId) return;

    const { action, label } = option;
    let metadata: any = {};
    let message = "";

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
          const screenshotResult = (await window.consoleAPI.captureScreenshot()) as any;
          if (screenshotResult) {
            screenshot = screenshotResult.dataUrl || screenshotResult;
            screenshotMetadata = screenshotResult.metadata;
          }
        } catch (error) {
          console.error("[ChatMessages] Screenshot capture failed:", error);
        }
      }
    }

    // Start streaming
    setIsStreaming(true);
    setStreamingContent("");

    // Send message with metadata and screenshot
    sendMessageMutation.mutate({
      chatId,
      content: message,
      metadata,
      screenshot,
      screenshotMetadata,
    });

    setInputValue("");
  };

  if (messagesLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0a0810]">
        <div className="w-8 h-8 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4"></div>
        <p className="text-white/70 text-sm">Loading messages...</p>
      </div>
    );
  }

  return (
    <div className="h-full relative bg-[#0a0810]">
      {/* Messages Area */}
      <div ref={scrollContainerRef} className="h-full overflow-y-auto app-no-drag custom-scrollbar bg-[#0a0810]">
        <div className="max-w-3xl mx-auto px-6 py-8 pb-40">
          {messageList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 flex items-center justify-center mb-4 border border-white/10">
                <span className="text-2xl">💬</span>
              </div>
              <p className="text-white/70 text-sm font-medium">No messages yet</p>
              <p className="text-white/40 text-xs mt-1">Start the conversation below</p>
            </div>
          ) : (
            messageList.map((message) => {
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
                  {message.content && (
                    <AIMessage content={message.content} timestamp={message.timestamp} />
                  )}

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
                  {message.content && (
                    <AIMessage content={message.content} timestamp={message.timestamp} />
                  )}

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
              <UserMessage 
                key={message.id} 
                content={message.content}
                timestamp={message.timestamp}
              />
            ) : (
              <AIMessage 
                key={message.id} 
                content={message.content}
                timestamp={message.timestamp}
              />
            );
          })
          )}

          {/* Streaming message */}
          {isStreaming && (
            <AIMessage content={streamingContent || "Thinking..."} isStreaming={true} />
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Form - Floating at Bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0a0810] via-[#0a0810] to-transparent pointer-events-none">
        <div className="max-w-3xl mx-auto app-no-drag pointer-events-auto">
          <RichTextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={() => {
              if (inputValue.trim() && chatId) {
                setIsStreaming(true);
                setStreamingContent("");
                sendMessageMutation.mutate({
                  chatId,
                  content: inputValue.trim(),
                });
                setInputValue("");
              }
            }}
            disabled={isStreaming}
            placeholder="Type your message..."
          />
        </div>
      </div>
    </div>
  );
}
