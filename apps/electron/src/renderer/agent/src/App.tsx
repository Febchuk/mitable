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
      hideTemporary: () => void; // Temporarily hide agent for screenshot
      restore: () => void; // Restore agent after screenshot
      showStatus: () => void; // Show "Looking at your screen" indicator
      hideStatus: () => void; // Hide status indicator
      getAuthToken: () => Promise<string | null>;
      onAuthTokenUpdated: (callback: (token: string | null) => void) => void;
      onGuideNextStep: (callback: () => void) => void;
    };
  }
}

type AnimationState = "visible" | "hiding" | "hidden" | "showing";
type EdgeDirection = "top" | "bottom" | "left" | "right";

function App() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [animationState, setAnimationState] = useState<AnimationState>("visible");
  const [edgeDirection, setEdgeDirection] = useState<EdgeDirection>("bottom");

  // Determine nearest screen edge for slide animation
  const determineNearestEdge = (): EdgeDirection => {
    const windowRect = document.body.getBoundingClientRect();
    const windowCenterX = window.screenX + windowRect.width / 2;
    const windowCenterY = window.screenY + windowRect.height / 2;

    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;

    const distanceToTop = windowCenterY;
    const distanceToBottom = screenHeight - windowCenterY;
    const distanceToLeft = windowCenterX;
    const distanceToRight = screenWidth - windowCenterX;

    const minDistance = Math.min(
      distanceToTop,
      distanceToBottom,
      distanceToLeft,
      distanceToRight
    );

    if (minDistance === distanceToTop) return "top";
    if (minDistance === distanceToBottom) return "bottom";
    if (minDistance === distanceToLeft) return "left";
    return "right";
  };

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

    console.log("[Agent] Starting animated screenshot capture flow...");

    // STEP 1: Determine nearest edge and start slide-out animation
    const edge = determineNearestEdge();
    setEdgeDirection(edge);
    setAnimationState("hiding");
    console.log(`[Agent] Sliding to ${edge} edge...`);

    // STEP 2: Wait for slide animation to complete (300ms)
    await new Promise((resolve) => setTimeout(resolve, 300));

    // STEP 3: Hide ALL Mitable windows via IPC (Agent, Conversation, Guide, Nudge, Overlay)
    window.agentAPI.hideTemporary();
    setAnimationState("hidden");

    // STEP 4: Show status window ("Looking at your screen...")
    window.agentAPI.showStatus();
    console.log("[Agent] Status window shown");

    // STEP 5: Wait for status window to appear and settle (300ms)
    await new Promise((resolve) => setTimeout(resolve, 300));

    // STEP 6: Capture screenshot (clean screen - NO Mitable UI visible at all)
    console.log("[Agent] Capturing clean screenshot...");
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

    // STEP 7: Hide status window (screenshot is done)
    window.agentAPI.hideStatus();
    console.log("[Agent] Status window hidden");

    // STEP 8: Show conversation window with the message
    window.agentAPI.showConversation();

    // STEP 9: Forward message to conversation window
    window.agentAPI.sendMessageToConversation(
      {
        message,
        conversationId: convId,
        userMessage: message,
      },
      screenshot
    );

    // STEP 10: Restore all previously visible windows (Agent + Guide/Nudge/Overlay if they were open)
    window.agentAPI.restore();
    setAnimationState("showing");
    console.log("[Agent] Windows restored, animating Agent back in...");

    // STEP 11: Wait for slide-in animation to complete (300ms)
    await new Promise((resolve) => setTimeout(resolve, 300));

    // STEP 12: Reset to visible state
    setAnimationState("visible");
    console.log("[Agent] Animation sequence complete - all windows restored");
  };

  // Determine CSS class based on animation state
  const getAnimationClass = (): string => {
    if (animationState === "visible" || animationState === "showing") {
      return "visible";
    }
    if (animationState === "hidden") {
      return "hidden";
    }
    if (animationState === "hiding") {
      return `hiding-${edgeDirection}`;
    }
    return "visible";
  };

  return (
    <div
      className={`agent-window-container w-full h-full flex items-center justify-center p-4 ${getAnimationClass()}`}
    >
      <AgentPill onSubmit={handleSubmit} />
    </div>
  );
}

export default App;
