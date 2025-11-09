/**
 * Shared API Client for Conversations
 *
 * Handles communication with the backend streaming API
 * Works with both Agent and Conversation windows
 */

import type { Message as MessageType } from "../../conversation/src/types";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000") + "/api";

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
  type: "chunk" | "complete" | "error" | "window_trigger" | "done";
  content?: string;
  messageId?: string;
  error?: string;
  messageType?: "text" | "workflow" | "experts";
  cardData?: any;
  sources?: any[];
  workflowSessionId?: string | null;
  relatedStepIndex?: number | null;
  windowTrigger?: {
    window: "nudge" | "guide" | "overlay";
    data: any;
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
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/conversations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title,
      contextType: "general",
      initialMessage,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.statusText}`);
  }

  const data = await response.json();
  return data.conversation;
}

/**
 * Get conversation messages by ID
 */
export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
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

  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/workflow/pause`, {
    method: "POST",
    headers,
  });

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
 * @param screenshot - Optional base64-encoded screenshot for visual guidance
 * @param metadata - Optional metadata for workflow actions
 * @param onChunk - Callback for each streaming chunk
 * @param onComplete - Callback when streaming completes
 * @param onError - Callback for errors
 * @param onWindowTrigger - Callback for window triggers (Nudge/Guide)
 */
export async function sendMessageStream(
  conversationId: string,
  content: string,
  screenshot: string | null | undefined,
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
  },
  metadata?: any,
  screenshotMetadata?: {
    width: number;
    height: number;
    originalWidth: number;
    originalHeight: number;
    captureMode: string;
    timestamp: number;
    scaleFactor?: number;
  }
): Promise<void> {
  const headers = await getAuthHeaders();

  // Build request body with optional screenshot, metadata, and screenshotMetadata
  const requestBody: {
    content: string;
    screenshot?: string;
    metadata?: any;
    screenshotMetadata?: any;
  } = { content };

  if (screenshot) {
    requestBody.screenshot = screenshot;
    console.log(`[API] Sending message with screenshot (${screenshot.length} bytes)`);

    if (screenshotMetadata) {
      requestBody.screenshotMetadata = screenshotMetadata;
      console.log(`[API] Sending screenshot metadata:`, screenshotMetadata);
    }
  } else {
    console.log("[API] Sending message without screenshot");
  }

  if (metadata) {
    requestBody.metadata = metadata;
    console.log(`[API] Sending message with metadata:`, metadata);
  }

  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

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
          console.log("[API] SSE data received:", data.substring(0, 150));

          try {
            const chunk: StreamChunk = JSON.parse(data);
            console.log("[API] Parsed chunk:", { type: chunk.type, keys: Object.keys(chunk) });

            switch (chunk.type) {
              case "chunk":
                // Extract workflow metadata from first chunk
                // Backend enriches ALL chunks with these fields (either null or actual values)
                if (workflowSessionId === undefined) {
                  workflowSessionId = chunk.workflowSessionId;
                  relatedStepIndex = chunk.relatedStepIndex;
                }

                if (chunk.content) {
                  fullContent += chunk.content;
                  // Pass workflow metadata to onChunk so frontend can route chunks during streaming
                  callbacks.onChunk?.(chunk.content, workflowSessionId, relatedStepIndex);
                }
                break;

              case "complete":
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

              case "window_trigger":
                console.log("[API] Window trigger case MATCHED");
                console.log("[API] Received window_trigger event:", chunk.windowTrigger);
                if (chunk.windowTrigger) {
                  windowTriggerData = chunk.windowTrigger;
                  console.log("[API] Stored windowTriggerData:", windowTriggerData);
                  console.log("[API] Calling onWindowTrigger callback...");
                  callbacks.onWindowTrigger?.(chunk.windowTrigger.window, chunk.windowTrigger.data);
                  console.log("[API] onWindowTrigger callback called");
                }
                break;

              case "done":
                if (chunk.messageId) {
                  messageId = chunk.messageId;
                }
                if (chunk.workflowSessionId !== undefined) {
                  workflowSessionId = chunk.workflowSessionId;
                }
                if (chunk.relatedStepIndex !== undefined) {
                  relatedStepIndex = chunk.relatedStepIndex;
                }
                console.log("[API] Calling onComplete with workflow fields:", {
                  windowTriggerData,
                  workflowSessionId,
                  relatedStepIndex,
                });
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

              case "error":
                callbacks.onError?.(chunk.error || "Unknown error");
                break;

              default:
                console.warn("[API] Unknown chunk type received:", chunk.type, "Full chunk:", chunk);
                break;
            }
          } catch (parseError) {
            console.error("Failed to parse SSE data:", parseError, data);
          }
        }
      }
    }
  } catch (error) {
    console.error("Stream reading error:", error);
    callbacks.onError?.(error instanceof Error ? error.message : "Stream reading error");
  }
}
