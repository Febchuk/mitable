import { useState, useEffect, useRef } from "react";
import { Workflow, LucideIcon } from "lucide-react";
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
      getAuthToken: () => Promise<string | null>;
      onAuthTokenUpdated: (callback: (token: string | null) => void) => void;
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

// Mock guide data for Ticket Billing Escalation workflow
const BILLING_ESCALATION_GUIDE = {
  id: "billing-escalation-guide",
  title: "Agent Interactive Workflow",
  description: "Step-by-step guide to escalate a billing ticket",
  steps: [
    {
      id: "step-1",
      stepNumber: 1,
      instruction: "Click the 'Priority' dropdown in the top toolbar.",
      targetElement: {
        label: "Priority Dropdown",
        boundingBox: { x: 100, y: 50, width: 120, height: 40 },
      },
      completed: false,
    },
    {
      id: "step-2",
      stepNumber: 2,
      instruction: "Click the 'Assign' button in the top toolbar.",
      targetElement: {
        label: "Assign Button",
        boundingBox: { x: 250, y: 50, width: 100, height: 40 },
      },
      completed: false,
    },
    {
      id: "step-3",
      stepNumber: 3,
      instruction: "Select 'Billing Team' from the assignment dropdown.",
      targetElement: {
        label: "Team Dropdown",
        boundingBox: { x: 250, y: 100, width: 200, height: 150 },
      },
      completed: false,
    },
    {
      id: "step-4",
      stepNumber: 4,
      instruction: "Add an escalation note in the comments section.",
      targetElement: {
        label: "Comments Field",
        boundingBox: { x: 50, y: 300, width: 400, height: 100 },
      },
      completed: false,
    },
    {
      id: "step-5",
      stepNumber: 5,
      instruction: "Click the 'Notify Team Lead' checkbox.",
      targetElement: {
        label: "Notify Checkbox",
        boundingBox: { x: 50, y: 420, width: 200, height: 30 },
      },
      completed: false,
    },
    {
      id: "step-6",
      stepNumber: 6,
      instruction: "Click 'Save' to complete the escalation.",
      targetElement: {
        label: "Save Button",
        boundingBox: { x: 300, y: 500, width: 100, height: 40 },
      },
      completed: false,
    },
  ],
  currentStep: 0,
  completed: false,
  createdAt: new Date().toISOString(),
};

function App() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingMessageIdRef = useRef<string | null>(null);

  const handleCardClick = (message: Message) => {
    if (!message.windowTrigger) {
      console.warn("Card clicked but no window trigger data");
      return;
    }

    const { window: windowType, data } = message.windowTrigger;
    console.log(`Card clicked - launching ${windowType} window`, data);

    if (windowType === "nudge") {
      window.agentAPI.showNudge(data);
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

    // Stream the response
    try {
      await sendMessageStream(convId, message, {
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingMessageId
                ? { ...msg, content: msg.content + chunk }
                : msg
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
        onWindowTrigger: (window, data) => {
          console.log(`Window trigger: ${window}`, data);

          if (window === "nudge") {
            // Auto-launch Nudge window with expert data
            window.agentAPI.showNudge(data);
          } else if (window === "guide") {
            // Auto-launch Guide + Overlay windows with guide data
            window.agentAPI.startGuide(data.guide);
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
