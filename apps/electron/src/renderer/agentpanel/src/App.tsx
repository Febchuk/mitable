import { useState, useEffect, useCallback } from "react";
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
    window.agentPanelAPI?.hide();
  };

  const hasConversation = messages.length > 0;

  return (
    <div className="flex flex-col h-screen bg-black/20 text-white  border-l border-white/10">
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
    </div>
  );
}

export default App;
