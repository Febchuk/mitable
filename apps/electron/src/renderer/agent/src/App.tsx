import { useState, useEffect } from "react";
import AgentPill from "./components/AgentPill";
import { createConversation } from "../../lib/api/conversations";
import type { ScreenshotResult } from "@mitable/shared";

declare global {
  interface Window {
    agentAPI: {
      toggle: () => void;
      showConsole: () => void;
      setIgnoreMouseEvents: (ignore: boolean) => void;
      resizeWindow: (
        options:
          | { width?: number; height?: number }
          | "pill"
          | "conversation"
          | "text-mode"
          | "audio-mode"
      ) => void;
      showConversation: () => void;
      hideConversation: () => void;
      toggleConversation: () => void; // NEW: Toggle collapsed combobox
      sendMessageToConversation: (messageData: any, screenshot: string | null) => void;
      showNudge: (data: unknown) => void;
      startGuide: (data: unknown) => void;
      captureScreenshot: () => Promise<ScreenshotResult | null>;
      getAuthToken: () => Promise<string | null>;
      onAuthTokenUpdated: (callback: (token: string | null) => void) => void;
      onGuideNextStep: (callback: () => void) => void;
    };
  }
}

function App() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lastMessageId, setLastMessageId] = useState<string | null>(null);

  // Poll for new workflow messages when conversation is active
  useEffect(() => {
    if (!conversationId) return;

    console.log("[Agent] Starting message polling for conversation:", conversationId);

    const pollInterval = setInterval(async () => {
      try {
        const token = await window.agentAPI.getAuthToken();
        if (!token) {
          console.error("[Agent] No auth token for polling");
          return;
        }

        const response = await fetch(
          `http://localhost:3000/api/conversations/${conversationId}/messages`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          console.error("[Agent] Failed to fetch messages:", response.status);
          return;
        }

        const data = await response.json();

        // Filter for workflow messages only
        const workflowMessages = data.messages.filter(
          (msg: any) => msg.messageType === "workflow"
        );

        if (workflowMessages.length === 0) return;

        // Find new messages since last poll
        const newMessages = lastMessageId
          ? workflowMessages.filter((msg: any) => msg.id > lastMessageId)
          : [workflowMessages[workflowMessages.length - 1]]; // If first poll, get latest

        if (newMessages.length > 0) {
          console.log("[Agent] Found new workflow messages:", newMessages.length);

          // Forward new messages to conversation window
          newMessages.forEach((msg: any) => {
            window.agentAPI.sendMessageToConversation(
              {
                message: msg.content,
                conversationId,
                polledMessage: true, // Flag to indicate this came from polling
                messageType: msg.messageType,
                cardData: msg.cardData,
              },
              null // No screenshot for polled messages
            );
          });

          // Update last seen message ID
          setLastMessageId(newMessages[newMessages.length - 1].id);
        }
      } catch (error) {
        console.error("[Agent] Failed to poll messages:", error);
      }
    }, 2000); // Poll every 2 seconds

    return () => {
      console.log("[Agent] Stopping message polling");
      clearInterval(pollInterval);
    };
  }, [conversationId, lastMessageId]);

  // Listen for Guide "Next" button clicks
  useEffect(() => {
    window.agentAPI.onGuideNextStep(() => {
      console.log("[Agent] Guide next step requested - capturing screenshot for continuation");
      // Handle silent continuation (don't show in chat)
      handleSilentContinuation();
    });
    // Note: Using conversationId in deps to ensure we have it when continuation happens
  }, [conversationId]);

  /**
   * Handle silent continuation for Guide "Next" button
   * Forwards "Next" message to conversation window with screenshot
   */
  async function handleSilentContinuation() {
    if (!conversationId) {
      console.error("[Agent] No conversation ID for continuation");
      return;
    }

    console.log("[Agent] Starting silent continuation...");

    // Capture screenshot
    let screenshot: string | null = null;
    try {
      const result = await window.agentAPI.captureScreenshot();
      console.log("[Agent] Screenshot captured for continuation:", {
        hasScreenshot: !!result,
        size: result?.dataUrl?.length || 0,
      });
      screenshot = result?.dataUrl || null;
    } catch (error) {
      console.error("[Agent] Screenshot capture failed:", error);
      return;
    }

    // Forward "Next" message to conversation window
    // The conversation window will handle the streaming and guide updates
    try {
      window.agentAPI.sendMessageToConversation(
        {
          message: "Next",
          conversationId,
          userMessage: "Next",
          silent: true, // Flag to indicate silent continuation (no user message display)
        },
        screenshot
      );

      console.log("[Agent] Silent continuation message forwarded to conversation window");
    } catch (error) {
      console.error("[Agent] Failed to forward continuation:", error);
    }
  }

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
    // Ensure we have a conversation ID
    let convId: string;
    try {
      convId = await ensureConversation();
    } catch (error) {
      console.error("Failed to create conversation:", error);
      return;
    }

    // Capture screenshot for visual guidance
    console.log("[Agent] Attempting to capture screenshot for workflow...");
    let screenshot: string | null = null;
    try {
      const result = await window.agentAPI.captureScreenshot();
      console.log("[Agent] Screenshot capture result:", {
        hasScreenshot: !!result,
        size: result?.dataUrl?.length || 0,
        metadata: result?.metadata,
      });
      screenshot = result?.dataUrl || null;
    } catch (error) {
      console.error("[Agent] Screenshot capture failed:", error);
      // Continue without screenshot - backend will handle gracefully
    }

    // Show conversation window
    window.agentAPI.showConversation();

    // Forward message to conversation window with all necessary data
    window.agentAPI.sendMessageToConversation(
      {
        message,
        conversationId: convId,
        userMessage: message, // For display in conversation window
      },
      screenshot
    );
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <AgentPill onSubmit={handleSubmit} />
    </div>
  );
}

export default App;
