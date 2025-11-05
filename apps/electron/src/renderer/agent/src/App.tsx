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
   * Forwards "Next" message to conversation window
   * Screenshot capture will be handled by conversation window based on heuristics
   */
  async function handleSilentContinuation() {
    if (!conversationId) {
      console.error("[Agent] No conversation ID for continuation");
      return;
    }

    console.log("[Agent] Starting silent continuation...");

    // Forward "Next" message to conversation window
    // The conversation window will handle conditional screenshot capture
    try {
      window.agentAPI.sendMessageToConversation(
        {
          message: "Next",
          conversationId,
          userMessage: "Next",
          silent: true, // Flag to indicate silent continuation (no user message display)
        },
        null // No screenshot - let conversation window handle conditional capture
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
    console.log("========================================");
    console.log("[Agent] SUBMIT STARTED - Message:", message);
    console.log("========================================");

    // Ensure we have a conversation ID
    let convId: string;
    try {
      console.log("[Agent] Ensuring conversation exists...");
      convId = await ensureConversation();
      console.log("[Agent] ✅ Conversation ID:", convId);
    } catch (error) {
      console.error("[Agent] ❌ Failed to create conversation:", error);
      return;
    }

    // Show conversation window
    console.log("[Agent] Showing conversation window...");
    window.agentAPI.showConversation();

    // Forward message to conversation window
    // The conversation window will handle conditional screenshot capture based on heuristics
    // Forward message to conversation window with all necessary data
    console.log("[Agent] Forwarding message to conversation window:", {
      message,
      conversationId: convId,
      userMessage: message,
    });

    window.agentAPI.sendMessageToConversation(
      {
        message,
        conversationId: convId,
        userMessage: message, // For display in conversation window
      },
      null // No screenshot - let conversation window handle conditional capture
    );

    console.log("[Agent] ✅ Message forwarded successfully");
    console.log("========================================");
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <AgentPill onSubmit={handleSubmit} />
    </div>
  );
}

export default App;
