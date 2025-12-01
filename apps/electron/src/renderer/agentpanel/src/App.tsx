import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "./components/Header";
import EmptyState from "./components/EmptyState";
import ChatView from "./components/ChatView";
import ChatsListView from "./components/ChatsListView";
import InputBar from "./components/InputBar";
import {
  createConversation,
  sendMessageStream,
  getConversationMessages,
} from "../../lib/api/conversations";
import type { SelectedWindowInfo } from "./global";
import type { MultiWindowCaptureResult } from "@mitable/shared";

type PanelView = "chat" | "chats-list";

// ============================================================
// Animation Presets - Change ANIMATION_PRESET to try different animations
// ============================================================
type AnimationPreset = "scale-pop" | "fade-bounce" | "slide-right" | "fade-drift";
const ANIMATION_PRESET: AnimationPreset = "scale-pop"; // <-- Default to scale-pop with vibrancy coordination

// Animation duration in ms (used for vibrancy coordination timing)
const ANIMATION_DURATION_MS = 250;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const animationVariants: Record<AnimationPreset, any> = {
  "scale-pop": {
    // Scale animation now works because window is transparent during animation
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.02 },
    transition: { duration: ANIMATION_DURATION_MS / 1000, ease: [0.34, 1.56, 0.64, 1] },
  },
  "fade-bounce": {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: ANIMATION_DURATION_MS / 1000, ease: [0.34, 1.56, 0.64, 1] },
  },
  "slide-right": {
    initial: { opacity: 0, x: 50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 50 },
    transition: { duration: 0.2, ease: "easeOut" },
  },
  "fade-drift": {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: 0.2, ease: "easeOut" },
  },
};

const currentAnimation = animationVariants[ANIMATION_PRESET];

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  messageType?: "text" | "workflow" | "experts";
  isStreaming?: boolean;
  cardData?: unknown;
}

function App() {
  // Conversation state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  // User state
  const [userName] = useState("there");

  // Input mode state
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [isRecording, setIsRecording] = useState(false);

  // Watch mode state
  const [watchingScreen, setWatchingScreen] = useState(false);
  const [selectedWindows, setSelectedWindows] = useState<SelectedWindowInfo[]>([]);

  // View state (chat view or chats list)
  const [currentView, setCurrentView] = useState<PanelView>("chat");

  // Animation visibility state
  const [isVisible, setIsVisible] = useState(true);

  // Initialize auth token listener
  useEffect(() => {
    // Listen for auth token updates (tokens are managed by main process)
    window.agentPanelAPI?.onAuthTokenUpdated(() => {
      // Token updates are handled automatically by the API library
      console.log("[AgentPanel] Auth token updated");
    });

    return () => {
      // Cleanup if needed
    };
  }, []);

  // Listen for panel show events to trigger entrance animation with vibrancy coordination
  useEffect(() => {
    window.agentPanelAPI?.onPanelShow(() => {
      // Turn on vibrancy first (frosted glass appears)
      window.agentPanelAPI?.vibrancyOn();
      // Then animate content in
      setIsVisible(true);
    });
  }, []);

  // Listen for conversation load requests from Console
  useEffect(() => {
    const handleLoadConversation = async (convId: string) => {
      console.log("[AgentPanel] Loading conversation:", convId);
      setConversationId(convId);

      // Fetch existing messages
      try {
        const existingMessages = await getConversationMessages(convId);
        setMessages(
          existingMessages.map((msg) => ({
            id: msg.id,
            role: msg.role as "user" | "assistant",
            content: msg.content,
            timestamp: new Date(),
            messageType: msg.messageType as "text" | "workflow" | "experts",
            cardData: msg.cardData,
          }))
        );
      } catch (error) {
        console.error("[AgentPanel] Failed to load conversation:", error);
      }
    };
    window.agentPanelAPI?.onLoadConversation(handleLoadConversation);

    return () => {
      window.agentPanelAPI?.offLoadConversation(handleLoadConversation);
    };
  }, []);

  // Listen for watch mode window updates
  useEffect(() => {
    const handleWatchWindowsUpdated = (windows: SelectedWindowInfo[]) => {
      setSelectedWindows(windows);
    };
    window.agentPanelAPI?.onWatchWindowsUpdated(handleWatchWindowsUpdated);

    return () => {
      window.agentPanelAPI?.offWatchWindowsUpdated(handleWatchWindowsUpdated);
    };
  }, []);

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      // Create user message
      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setStreamingContent("");

      try {
        // Capture screenshot if in watch mode
        let captureResult: MultiWindowCaptureResult | null = null;
        if (selectedWindows.length > 0) {
          console.log("[AgentPanel] Capturing screenshots...");
          captureResult = await window.agentPanelAPI?.captureScreenshot();
          console.log("[AgentPanel] Screenshot capture result:", {
            success: captureResult?.success,
            count: captureResult?.success ? captureResult.screenshots.length : 0,
          });
        }

        // Create conversation if not exists
        let activeConversationId = conversationId;
        if (!activeConversationId) {
          console.log("[AgentPanel] Creating new conversation...");
          const conversation = await createConversation("Agent Panel Conversation");
          activeConversationId = conversation.id;
          setConversationId(activeConversationId);
          console.log("[AgentPanel] Conversation created:", activeConversationId);
        }

        // Send message with streaming
        await sendMessageStream(activeConversationId, content.trim(), captureResult, {
          onChunk: (chunk) => {
            setStreamingContent((prev) => prev + chunk);
          },
          onComplete: (fullContent, messageId, messageType, cardData) => {
            console.log("[AgentPanel] Stream complete:", {
              messageId,
              messageType,
              hasCardData: !!cardData,
            });

            // Add assistant message
            const assistantMessage: Message = {
              id: messageId || `msg-${Date.now()}`,
              role: "assistant",
              content: fullContent,
              timestamp: new Date(),
              messageType: messageType as "text" | "workflow" | "experts",
              cardData,
            };

            setMessages((prev) => [...prev, assistantMessage]);
            setStreamingContent("");
            setIsStreaming(false);
          },
          onError: (error) => {
            console.error("[AgentPanel] Stream error:", error);
            setStreamingContent("");
            setIsStreaming(false);

            // Add error message
            const errorMessage: Message = {
              id: `msg-error-${Date.now()}`,
              role: "assistant",
              content: `Sorry, I encountered an error: ${error}`,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, errorMessage]);
          },
          onProgress: (phase, message) => {
            console.log("[AgentPanel] Progress:", phase, message);
          },
        });
      } catch (error) {
        console.error("[AgentPanel] Error sending message:", error);
        setIsStreaming(false);
        setStreamingContent("");

        // Add error message
        const errorMessage: Message = {
          id: `msg-error-${Date.now()}`,
          role: "assistant",
          content: `Sorry, I couldn't process your request. Please try again.`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    },
    [conversationId, isStreaming, selectedWindows.length]
  );

  const handleToggleWatchMode = async () => {
    try {
      const newState = !watchingScreen;
      await window.agentPanelAPI?.toggleWatchMode(newState);
      setWatchingScreen(newState);
    } catch (error) {
      console.error("Failed to toggle watch mode:", error);
    }
  };

  const handleNewChat = () => {
    setConversationId(null);
    setMessages([]);
    setStreamingContent("");
    setIsStreaming(false);
    setCurrentView("chat"); // Return to chat view
  };

  const handleOpenChats = () => {
    setCurrentView("chats-list");
  };

  const handleSelectConversation = async (id: string) => {
    console.log("[AgentPanel] Selecting conversation:", id);
    setConversationId(id);
    setCurrentView("chat");

    // Fetch messages for selected conversation
    try {
      const existingMessages = await getConversationMessages(id);
      setMessages(
        existingMessages.map((msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          content: msg.content,
          timestamp: new Date(),
          messageType: msg.messageType as "text" | "workflow" | "experts",
          cardData: msg.cardData,
        }))
      );
    } catch (error) {
      console.error("[AgentPanel] Failed to load conversation:", error);
    }
  };

  const handleOpenInConsole = () => {
    if (conversationId) {
      window.agentPanelAPI?.openInConsole(conversationId);
    }
  };

  const handleClose = () => {
    // Start exit animation and fade out vibrancy simultaneously
    setIsVisible(false);
    window.agentPanelAPI?.vibrancyOff();
    // Wait for animation to complete before hiding window
    setTimeout(() => {
      window.agentPanelAPI?.hide();
    }, ANIMATION_DURATION_MS);
  };

  // Workflow option handler
  const handleWorkflowOptionSelect = useCallback(
    async (option: { id: number; label: string; action: string }) => {
      if (!conversationId || isStreaming) return;

      const { action, label } = option;
      let metadata: Record<string, unknown> = {};
      let message = "";

      // Map workflow actions
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

      // Capture screenshot if in watch mode
      let captureResult: MultiWindowCaptureResult | null = null;
      if (
        selectedWindows.length > 0 &&
        ["progress_step", "custom_question", "confirm_start"].includes(action)
      ) {
        console.log("[AgentPanel] Capturing screenshot for workflow action...");
        captureResult = (await window.agentPanelAPI?.captureScreenshot()) || null;
      }

      // Add user message
      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content: message,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setStreamingContent("");

      try {
        // Send with metadata as 5th argument
        await sendMessageStream(
          conversationId,
          message,
          captureResult,
          {
            onChunk: (chunk) => {
              setStreamingContent((prev) => prev + chunk);
            },
            onComplete: (fullContent, messageId, messageType, cardData) => {
              console.log("[AgentPanel] Workflow stream complete:", {
                messageId,
                messageType,
                hasCardData: !!cardData,
              });

              const assistantMessage: Message = {
                id: messageId || `msg-${Date.now()}`,
                role: "assistant",
                content: fullContent,
                timestamp: new Date(),
                messageType: messageType as "text" | "workflow" | "experts",
                cardData,
              };

              setMessages((prev) => [...prev, assistantMessage]);
              setStreamingContent("");
              setIsStreaming(false);
            },
            onError: (error) => {
              console.error("[AgentPanel] Workflow stream error:", error);
              setStreamingContent("");
              setIsStreaming(false);

              const errorMessage: Message = {
                id: `msg-error-${Date.now()}`,
                role: "assistant",
                content: `Sorry, I encountered an error: ${error}`,
                timestamp: new Date(),
              };
              setMessages((prev) => [...prev, errorMessage]);
            },
            onProgress: (phase, progressMessage) => {
              console.log("[AgentPanel] Workflow progress:", phase, progressMessage);
            },
          },
          metadata
        );
      } catch (error) {
        console.error("[AgentPanel] Error in workflow action:", error);
        setIsStreaming(false);
        setStreamingContent("");

        const errorMessage: Message = {
          id: `msg-error-${Date.now()}`,
          role: "assistant",
          content: `Sorry, I couldn't process that action. Please try again.`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    },
    [conversationId, isStreaming, selectedWindows.length]
  );

  const hasConversation = messages.length > 0;

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.div
          key="agent-panel"
          initial={currentAnimation.initial}
          animate={currentAnimation.animate}
          exit={currentAnimation.exit}
          transition={currentAnimation.transition}
          className="flex flex-col h-screen bg-black/20 text-white border-l border-white/10"
        >
          {/* Header */}
          <Header
            onNewChat={handleNewChat}
            onOpenChats={handleOpenChats}
            onOpenInConsole={handleOpenInConsole}
            onClose={handleClose}
            hasConversation={hasConversation}
            showChatsTitle={currentView === "chats-list"}
          />

          {/* Main content area */}
          <div className="flex-1 overflow-hidden">
            {currentView === "chats-list" ? (
              <ChatsListView
                onSelectConversation={handleSelectConversation}
                currentConversationId={conversationId}
              />
            ) : hasConversation ? (
              <ChatView
                messages={messages}
                isStreaming={isStreaming}
                streamingContent={streamingContent}
                onWorkflowOptionSelect={handleWorkflowOptionSelect}
              />
            ) : (
              <EmptyState userName={userName} />
            )}
          </div>

          {/* Input bar - hidden when viewing chats list */}
          {currentView !== "chats-list" && (
            <InputBar
              inputMode={inputMode}
              onInputModeChange={setInputMode}
              isRecording={isRecording}
              onRecordingChange={setIsRecording}
              watchingScreen={watchingScreen}
              onToggleWatch={handleToggleWatchMode}
              selectedWindowCount={selectedWindows.length}
              onSendMessage={handleSendMessage}
              disabled={isStreaming}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default App;
