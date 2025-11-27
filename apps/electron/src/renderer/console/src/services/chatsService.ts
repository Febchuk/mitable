import { apiRequest } from "./api";
import type { MultiWindowCaptureResult, WindowScreenshot } from "@mitable/shared";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  messageType?: string;
  cardData?: any;
  sources?: any[];
}

export interface Chat {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  unread: boolean;
  messages: Message[];
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ConversationsResponse {
  conversations: Chat[];
  pagination: PaginationMetadata;
}

export interface MessagesResponse {
  messages: Message[];
}

/**
 * Fetch conversations for the user with pagination
 * @param page - Page number (default: 1)
 * @param limit - Number of conversations per page (default: 20)
 */
export async function fetchConversations(
  page: number = 1,
  limit: number = 20
): Promise<ConversationsResponse> {
  return apiRequest<ConversationsResponse>(`/conversations?page=${page}&limit=${limit}`);
}

/**
 * Fetch messages for a specific conversation
 */
export async function fetchMessages(conversationId: string): Promise<MessagesResponse> {
  return apiRequest<MessagesResponse>(`/conversations/${conversationId}/messages`);
}

/**
 * Create a new conversation
 */
export async function createConversation(data: {
  title?: string;
  contextType?: string;
  initialMessage?: string;
}): Promise<{
  success: boolean;
  conversation: { id: string; title: string; contextType: string; createdAt: Date };
}> {
  return apiRequest("/conversations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Send a message in a conversation
 */
export async function sendMessage(
  conversationId: string,
  data: {
    role: "user" | "assistant";
    content: string;
    messageType?: string;
    cardData?: any;
    sources?: any[];
  }
): Promise<{
  success: boolean;
  message: Message;
}> {
  return apiRequest(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Stream chunk from SSE (console client uses a minimal subset)
 */
export interface StreamChunk {
  type: "chunk" | "complete" | "error" | "done";
  content?: string;
  messageId?: string;
  error?: string;
}

/**
 * Stream callbacks
 */
export interface StreamCallbacks {
  onChunk?: (content: string) => void;
  onComplete?: (fullContent: string) => void;
  onDone?: (messageId: string) => void;
  onError?: (error: string) => void;
}

/**
 * Send a message and stream the AI response in real-time
 *
 * Uses Server-Sent Events (SSE) to receive real-time streaming responses.
 * Chunks are passed directly to the UI as they arrive from the backend.
 *
 * NOTE: Backend contract (main):
 * - Request body: { content: string; screenshot?: string; metadata?: any }
 * - SSE events: { type: "chunk" | "complete" | "error" | "done", ... }
 *
 * We keep the feature branch's multi-window capture input but map it down
 * to a single screenshot string before calling the backend.
 */
export async function sendStreamingMessage(
  conversationId: string,
  content: string,
  callbacks: StreamCallbacks,
  token: string,
  multiWindowCapture?: MultiWindowCaptureResult | null,
  metadata?: any
): Promise<void> {
  const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

  try {
    // Forward all captured screenshots (if any) from multi-window capture
    let screenshotsPayload: WindowScreenshot[] | undefined;

    if (multiWindowCapture && multiWindowCapture.success) {
      if (multiWindowCapture.screenshots.length > 0) {
        screenshotsPayload = multiWindowCapture.screenshots;

        console.log("[chatsService] Sending multi-window capture payload:", {
          screenshotCount: screenshotsPayload.length,
          apps: screenshotsPayload.map((s) => s.appName).join(", "),
        });
      } else {
        console.log("[chatsService] Multi-window capture had no screenshots");
      }
    } else if (multiWindowCapture && !multiWindowCapture.success) {
      console.log("[chatsService] Screenshot capture blocked or failed:", multiWindowCapture.error);
    }

    // Build request body aligned with backend (main) contract
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
    }

    // Fetch the SSE stream from backend
    const response = await fetch(
      `${API_BASE_URL}/api/conversations/${conversationId}/messages/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    // Real-time SSE streaming - pass chunks directly to UI
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";

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
            } else if (chunk.type === "complete" && chunk.content) {
              fullContent = chunk.content;
              callbacks.onComplete?.(fullContent);
            } else if (chunk.type === "done" && chunk.messageId) {
              callbacks.onDone?.(chunk.messageId);
            } else if (chunk.type === "error" && chunk.error) {
              callbacks.onError?.(chunk.error);
              throw new Error(chunk.error);
            }
          } catch (e) {
            // Skip parse errors
          }
        }
      }
    }

    if (!fullContent) {
      throw new Error("No content received from backend");
    }

    // Final completion signal (in case backend didn't send an explicit "complete")
    callbacks.onComplete?.(fullContent);
  } catch (error) {
    console.error("Message send error:", error);
    callbacks.onError?.(error instanceof Error ? error.message : "Failed to send message");
    throw error;
  }
}
