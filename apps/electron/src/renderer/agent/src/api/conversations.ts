/**
 * API Client for Conversations
 *
 * Handles communication with the backend streaming API
 */

const API_BASE_URL = "http://localhost:3000/api";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  messageType?: string;
  cardData?: any;
  sources?: any[];
}

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
  messageType?: string;
  cardData?: any;
  windowTrigger?: {
    window: "nudge" | "guide";
    data: any;
  };
}

/**
 * Get auth token from main process
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await window.agentAPI.getAuthToken();

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
 * Get conversation by ID
 */
export async function getConversation(conversationId: string): Promise<Conversation> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to get conversation: ${response.statusText}`);
  }

  const data = await response.json();
  return data.conversation;
}

/**
 * Send a message and stream the response
 *
 * @param conversationId - Conversation ID
 * @param content - Message content
 * @param screenshot - Optional base64-encoded screenshot for visual guidance
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
    onChunk?: (chunk: string) => void;
    onComplete?: (
      fullContent: string,
      messageId: string,
      messageType?: string,
      cardData?: any,
      windowTrigger?: { window: "nudge" | "guide"; data: any }
    ) => void;
    onError?: (error: string) => void;
    onWindowTrigger?: (window: "nudge" | "guide", data: any) => void;
  }
): Promise<void> {
  const headers = await getAuthHeaders();

  // Build request body with optional screenshot
  const requestBody: { content: string; screenshot?: string } = { content };
  if (screenshot) {
    requestBody.screenshot = screenshot;
    console.log(`[Agent API] Sending message with screenshot (${screenshot.length} bytes)`);
  } else {
    console.log("[Agent API] Sending message without screenshot");
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
  let windowTriggerData: { window: "nudge" | "guide"; data: any } | undefined;

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
              case "chunk":
                if (chunk.content) {
                  fullContent += chunk.content;
                  callbacks.onChunk?.(chunk.content);
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
                if (chunk.windowTrigger) {
                  windowTriggerData = chunk.windowTrigger;
                  callbacks.onWindowTrigger?.(chunk.windowTrigger.window, chunk.windowTrigger.data);
                }
                break;

              case "done":
                if (chunk.messageId) {
                  messageId = chunk.messageId;
                }
                callbacks.onComplete?.(
                  fullContent,
                  messageId,
                  messageType,
                  cardData,
                  windowTriggerData
                );
                break;

              case "error":
                callbacks.onError?.(chunk.error || "Unknown error");
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
