/**
 * Shared API Client for Conversations
 *
 * Handles communication with the backend streaming API
 * Works with both Agent and Conversation windows
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  messageType?: string;
  cardData?: any;
  sources?: any[];
  windowTrigger?: {
    window: "nudge" | "guide";
    data: any;
  };
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
  sources?: any[];
  windowTrigger?: {
    window: "nudge" | "guide";
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
  },
  metadata?: any
): Promise<void> {
  console.log("[API] 📨 Starting message stream:", {
    conversationId,
    contentLength: content.length,
    hasScreenshot: !!screenshot,
  });

  const headers = await getAuthHeaders();
  console.log("[API] Auth headers obtained for streaming");

  // Build request body with optional screenshot and metadata
  const requestBody: { content: string; screenshot?: string; metadata?: any } = { content };
  if (screenshot) {
    requestBody.screenshot = screenshot;
    console.log(`[API] Sending message with screenshot (${screenshot.length} bytes)`);
  } else {
    console.log("[API] Sending message without screenshot");
  }
  if (metadata) {
    requestBody.metadata = metadata;
    console.log(`[API] Sending message with metadata:`, metadata);
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

  // Read the entire SSE stream and collect the full content
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

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "" || data.startsWith(":")) continue;

          try {
            const chunk: StreamChunk = JSON.parse(data);

            // Stream chunks directly to UI as they arrive (real-time!)
            if (chunk.type === "chunk" && chunk.content) {
              fullContent += chunk.content;
              callbacks.onChunk?.(chunk.content);
            } else if (chunk.type === "complete") {
              if (chunk.content) fullContent = chunk.content;
              if (chunk.messageType) messageType = chunk.messageType;
              if (chunk.cardData) cardData = chunk.cardData;
            } else if (chunk.type === "window_trigger" && chunk.windowTrigger) {
              windowTriggerData = chunk.windowTrigger;
              callbacks.onWindowTrigger?.(chunk.windowTrigger.window, chunk.windowTrigger.data);
            } else if (chunk.type === "done" && chunk.messageId) {
              messageId = chunk.messageId;
            } else if (chunk.type === "error") {
              callbacks.onError?.(chunk.error || "Unknown error");
              return;
            }
          } catch (e) {
            // Skip parse errors
          }
        }
      }
    }

    if (!fullContent) {
      console.error("[API] ❌ No content received from backend");
      callbacks.onError?.("No content received from backend");
      return;
    }

    console.log("[API] ✅ Real-time streaming complete, calling onComplete");

    // Signal completion
    callbacks.onComplete?.(fullContent, messageId, messageType, cardData, windowTriggerData);
  } catch (error) {
    console.error("Stream reading error:", error);
    callbacks.onError?.(error instanceof Error ? error.message : "Stream reading error");
  }
}
