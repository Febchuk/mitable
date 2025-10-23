import { useState, useRef, useEffect } from "react";
import AgentPill from "./components/AgentPill";
import ConversationDialog from "./components/ConversationDialog";
import { createConversation, sendMessageStream } from "./api/conversations";

declare global {
  interface Window {
    agentAPI: {
      toggle: () => void;
      showConsole: () => void;
      setIgnoreMouseEvents: (ignore: boolean) => void;
      resizeWindow: (mode: "pill" | "conversation") => void;
      showNudge: (data: unknown) => void;
      startGuide: (data: unknown) => void;
      captureScreenshot: () => Promise<string | null>;
      getAuthToken: () => Promise<string | null>;
      onAuthTokenUpdated: (callback: (token: string | null) => void) => void;
      onGuideNextStep: (callback: () => void) => void;
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

function App() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingMessageIdRef = useRef<string | null>(null);

  // Listen for Guide "Done" button clicks
  useEffect(() => {
    window.agentAPI.onGuideNextStep(() => {
      console.log("[Agent] Guide next step requested - sending 'Next' message");
      // Send "Next" message to continue workflow
      handleSubmit("Next");
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCardClick = (message: Message) => {
    if (!message.windowTrigger) {
      console.warn("Card clicked but no window trigger data");
      return;
    }

    const { window: windowType, data } = message.windowTrigger;
    console.log(`Card clicked - launching ${windowType} window`, data);

    if (windowType === "nudge") {
      // Pass expert data + conversationId for context generation
      window.agentAPI.showNudge({
        ...data,
        conversationId, // Add conversationId for Generate buttons
      });
    } else if (windowType === "guide") {
      window.agentAPI.startGuide(data.guide);
    }
  };

  // Create conversation on first message if needed
  const ensureConversation = async (): Promise<string> => {
    if (conversationId) {
      return conversationId;
    }

    try {
      const conversation = await createConversation("Agent Conversation");
      setConversationId(conversation.id);
      return conversation.id;
    } catch (error) {
      console.error("Failed to create conversation:", error);
      throw error;
    }
  };

  const handleSubmit = async (message: string) => {
    if (isStreaming) {
      console.log("Already streaming, ignoring new message");
      return;
    }

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: message,
      type: "text",
    };

    setMessages((prev) => [...prev, userMessage]);

    // Expand to conversation mode
    if (!isExpanded) {
      setIsExpanded(true);
      window.agentAPI.resizeWindow("conversation");
    }

    // Ensure we have a conversation ID
    let convId: string;
    try {
      convId = await ensureConversation();
    } catch (error) {
      // Show error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Failed to start conversation. Please try again.",
        type: "text",
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    // Capture screenshot for visual guidance
    console.log("[Agent] Attempting to capture screenshot for workflow...");
    let screenshot: string | null = null;
    try {
      screenshot = await window.agentAPI.captureScreenshot();
      console.log("[Agent] Screenshot capture result:", {
        hasScreenshot: !!screenshot,
        size: screenshot?.length || 0,
      });
    } catch (error) {
      console.error("[Agent] Screenshot capture failed:", error);
      // Continue without screenshot - backend will handle gracefully
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
    setIsStreaming(true);

    // Stream the response with optional screenshot
    try {
      await sendMessageStream(convId, message, screenshot, {
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
          setIsStreaming(false);
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
          setIsStreaming(false);
          streamingMessageIdRef.current = null;
        },
        onWindowTrigger: (windowType, data) => {
          console.log(`Window trigger: ${windowType}`, data);

          if (windowType === "nudge") {
            // Don't auto-open nudge window - let user click "View Experts" card
            console.log(
              "Expert data ready. User can click 'View Experts' card to open nudge window."
            );
            // The windowTrigger data (including experts) is already stored in the message
            // and will be accessible when user clicks the card via handleCardClick
          } else if (windowType === "guide") {
            // Don't auto-launch guide window - let user click "Start Guide" card
            console.log(
              "Guide data ready. User can click 'Start Guide' card to launch guide."
            );
            // The windowTrigger data (including guide) is already stored in the message
            // and will be accessible when user clicks the card via handleCardClick
          }
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
      setIsStreaming(false);
      streamingMessageIdRef.current = null;
    }
  };

  const handleClose = () => {
    setIsExpanded(false);
    setMessages([]);
    window.agentAPI.resizeWindow("pill");
  };

  const handleMouseEnter = () => {
    window.agentAPI.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    window.agentAPI.setIgnoreMouseEvents(true);
  };

  return (
    <div
      className="w-full h-full flex flex-col-reverse items-center gap-4 p-4"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-center justify-center">
        <AgentPill onSubmit={handleSubmit} />
      </div>
      {isExpanded && (
        <ConversationDialog
          messages={messages}
          onSubmit={handleSubmit}
          onClose={handleClose}
          onCardClick={handleCardClick}
        />
      )}
    </div>
  );
}

export default App;
