/**
 * Shared API Client for Conversations
 *
 * Handles communication with the backend streaming API
 * Works with both Agent and Conversation windows
 */

import type { Message as MessageType } from "../../conversation/src/types";
import type { MultiWindowCaptureResult, WindowScreenshot } from "@mitable/shared";

// Base URL for backend API (configurable via Vite env)
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Re-export Message type for convenience
export type Message = MessageType;

export interface Conversation {
  id: string;
  title: string;
  lastMessage?: string;
  timestamp: Date;
  messages: Message[];
}

export interface StreamChunk {
  type: "chunk" | "complete" | "error" | "window_trigger" | "done" | "progress";
  content?: string;
  messageId?: string;
  error?: string;
  messageType?: "text" | "workflow" | "experts";
  cardData?: any;
  sources?: any[];
  // Workflow routing metadata (added by backend)
  workflowSessionId?: string | null;
  relatedStepIndex?: number | null;
  // Window trigger for UI coordination (nudge/guide; overlay deprecated but kept for backward-compat)
  windowTrigger?: {
    window: "nudge" | "guide" | "overlay";
    data: any;
  };
  // Progress updates for long-running operations
  progress?: {
    phase: string;
    message: string;
  };
}

/**
 * Get auth token from main process
 * Works with both agentAPI and conversationAPI
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  let token: string | null = null;

  // Check which window API is available
  if ("agentAPI" in window && window.agentAPI?.getAuthToken) {
    token = await window.agentAPI.getAuthToken();
  } else if ("conversationAPI" in window && window.conversationAPI?.getAuthToken) {
    token = await window.conversationAPI.getAuthToken();
  }

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Create a new conversation
 */
export async function createConversation(
  title: string = "New Conversation",
  initialMessage?: string
): Promise<Conversation> {
  console.log("[API] Creating conversation:", { title, initialMessage });

  const headers = await getAuthHeaders();
  console.log("[API] Auth headers obtained");

  const response = await fetch(`${API_BASE_URL}/api/conversations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title,
      contextType: "general",
      initialMessage,
    }),
  });

  console.log("[API] Conversation creation response:", {
    status: response.status,
    ok: response.ok,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[API] ❌ Failed to create conversation:", {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });
    throw new Error(`Failed to create conversation: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  console.log("[API] ✅ Conversation created:", data.conversation);
  return data.conversation;
}

/**
 * Get conversation messages by ID
 */
export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}/messages`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to get conversation messages: ${response.statusText}`);
  }

  const data = await response.json();
  return data.messages;
}

/**
 * Pause an active workflow
 * Returns the updated workflow state with status: "paused"
 */
export async function pauseWorkflow(conversationId: string): Promise<{
  success: boolean;
  workflowSessionId: string;
  status: string;
  workflowData: any;
  currentStepIndex: number;
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}/workflow/pause`,
    {
      method: "POST",
      headers,
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to pause workflow: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Send a message and stream the response
 *
 * @param conversationId - Conversation ID
 * @param content - Message content
 * @param multiWindowCapture - Optional multi-window capture result with screenshots
 * @param callbacks - Streaming callbacks
 * @param callbacks.onChunk - Callback for each streaming chunk (with workflow metadata)
 * @param callbacks.onComplete - Callback when streaming completes (with workflow metadata)
 * @param callbacks.onError - Callback for errors
 * @param callbacks.onWindowTrigger - Callback for window triggers (Nudge/Guide)
 * @param callbacks.onProgress - Callback for progress updates
 * @param metadata - Optional metadata for workflow actions
 */
export async function sendMessageStream(
  conversationId: string,
  content: string,
  multiWindowCapture: MultiWindowCaptureResult | null | undefined,
  callbacks: {
    onChunk?: (
      chunk: string,
      workflowSessionId?: string | null,
      relatedStepIndex?: number | null
    ) => void;
    onComplete?: (
      fullContent: string,
      messageId: string,
      messageType?: string,
      cardData?: any,
      windowTrigger?: { window: "nudge" | "guide" | "overlay"; data: any },
      workflowSessionId?: string | null,
      relatedStepIndex?: number | null
    ) => void;
    onError?: (error: string) => void;
    onWindowTrigger?: (window: "nudge" | "guide" | "overlay", data: any) => void;
    onProgress?: (phase: string, message: string) => void;
  },
  metadata?: any
): Promise<void> {
  // Forward all captured screenshots (if any) from multi-window capture
  let screenshotsPayload: WindowScreenshot[] | undefined;
  if (multiWindowCapture && multiWindowCapture.success && multiWindowCapture.screenshots.length) {
    screenshotsPayload = multiWindowCapture.screenshots;

    console.log("[API] Sending multi-window capture payload:", {
      screenshotCount: screenshotsPayload.length,
      apps: screenshotsPayload.map((s) => s.appName).join(", "),
    });
  } else if (multiWindowCapture && !multiWindowCapture.success) {
    console.log("[API] Screenshot capture blocked or failed:", multiWindowCapture.error);
  } else {
    console.log("[API] Sending message without screenshots");
  }

  console.log("[API] 📨 Starting message stream:", {
    conversationId,
    contentLength: content.length,
    screenshotCount: screenshotsPayload?.length || 0,
  });

  const headers = await getAuthHeaders();
  console.log("[API] Auth headers obtained for streaming");

  // Build request body with optional screenshots and metadata
  const requestBody: {
    content: string;
    screenshots?: WindowScreenshot[];
    metadata?: any;
  } = { content };

  if (screenshotsPayload) {
    requestBody.screenshots = screenshotsPayload;
  }

  if (metadata) {
    requestBody.metadata = metadata;
    console.log("[API] Sending message with metadata:", metadata);
  }

  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}/messages/stream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    callbacks.onError?.(`Failed to send message: ${response.statusText} - ${errorText}`);
    return;
  }

  if (!response.body) {
    callbacks.onError?.("No response body");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let messageId = "";
  let messageType: string | undefined;
  let cardData: any = undefined;
  let windowTriggerData: { window: "nudge" | "guide" | "overlay"; data: any } | undefined;
  let workflowSessionId: string | null | undefined;
  let relatedStepIndex: number | null | undefined;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode the chunk
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        // Skip empty lines and ping messages
        if (!line.trim() || line.startsWith(":")) {
          continue;
        }

        // Parse SSE data
        if (line.startsWith("data: ")) {
          const data = line.slice(6); // Remove "data: " prefix
          try {
            const chunk: StreamChunk = JSON.parse(data);

            switch (chunk.type) {
              case "chunk": {
                // Extract workflow metadata from first chunk
                if (workflowSessionId === undefined) {
                  workflowSessionId = chunk.workflowSessionId ?? null;
                  relatedStepIndex = chunk.relatedStepIndex ?? null;
                }

                if (chunk.content) {
                  fullContent += chunk.content;
                  callbacks.onChunk?.(chunk.content, workflowSessionId, relatedStepIndex);
                }
                break;
              }

              case "complete": {
                if (chunk.content) {
                  fullContent = chunk.content;
                }
                if (chunk.messageType) {
                  messageType = chunk.messageType;
                }
                if (chunk.cardData) {
                  cardData = chunk.cardData;
                }
                break;
              }

              case "window_trigger": {
                if (chunk.windowTrigger) {
                  windowTriggerData = chunk.windowTrigger;
                  callbacks.onWindowTrigger?.(
                    chunk.windowTrigger.window,
                    chunk.windowTrigger.data
                  );
                }
                break;
              }

              case "done": {
                if (chunk.messageId) {
                  messageId = chunk.messageId;
                }
                if (chunk.workflowSessionId !== undefined) {
                  workflowSessionId = chunk.workflowSessionId;
                }
                if (chunk.relatedStepIndex !== undefined) {
                  relatedStepIndex = chunk.relatedStepIndex;
                }

                callbacks.onComplete?.(
                  fullContent,
                  messageId,
                  messageType,
                  cardData,
                  windowTriggerData,
                  workflowSessionId,
                  relatedStepIndex
                );
                break;
              }

              case "progress": {
                if (chunk.progress) {
                  callbacks.onProgress?.(chunk.progress.phase, chunk.progress.message);
                }
                break;
              }

              case "error": {
                callbacks.onError?.(chunk.error || "Unknown error");
                break;
              }

              default: {
                console.warn("[API] Unknown chunk type received:", chunk.type, chunk);
              }
            }
          } catch (parseError) {
            console.error("[API] Failed to parse SSE data:", parseError, data);
          }
        }
      }
    }

    if (!fullContent) {
      console.error("[API] ❌ No content received from backend");
      callbacks.onError?.("No content received from backend");
      return;
    }

    // If we somehow exit the loop without a "done" event, still call onComplete once
    if (!messageId) {
      callbacks.onComplete?.(
        fullContent,
        messageId,
        messageType,
        cardData,
        windowTriggerData,
        workflowSessionId,
        relatedStepIndex
      );
    }
  } catch (error) {
    console.error("Stream reading error:", error);
    callbacks.onError?.(error instanceof Error ? error.message : "Stream reading error");
  }
}
