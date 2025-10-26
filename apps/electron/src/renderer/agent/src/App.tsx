import { useState, useEffect } from "react";
import AgentPill from "./components/AgentPill";
import { createConversation } from "./api/conversations";
import type { ScreenshotResult } from "@mitable/shared";

declare global {
  interface Window {
    agentAPI: {
      toggle: () => void;
      showConsole: () => void;
      setIgnoreMouseEvents: (ignore: boolean) => void;
      resizeWindow: (mode: "pill" | "conversation") => void;
      showConversation: () => void;
      hideConversation: () => void;
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

  // Listen for Guide "Done" button clicks
  useEffect(() => {
    window.agentAPI.onGuideNextStep(() => {
      console.log("[Agent] Guide next step requested - sending 'Next' message");
      // Send "Next" message to continue workflow
      handleSubmit("Next");
    });
    // Note: Empty deps array is intentional - we only want to set up the listener once
  }, []);

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

  const handleMouseEnter = () => {
    window.agentAPI.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    window.agentAPI.setIgnoreMouseEvents(true);
  };

  return (
    <div
      className="w-full h-full flex items-center justify-center p-4"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <AgentPill onSubmit={handleSubmit} />
    </div>
  );
}

export default App;
