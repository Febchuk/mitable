import { apiRequest } from "./api";
import type { MultiWindowCaptureResult, WindowScreenshot } from "@mitable/shared";
import { createLogger } from "../../../lib/logger";
import { API_BASE_URL } from "../lib/config";

const logger = createLogger("ChatsService");

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  messageType?: "text" | "workflow" | "experts";
  cardData?: any;
  sources?: any[];
  // Workflow routing fields - links message to specific workflow session and step
  workflowSessionId?: string | null;
  relatedStepIndex?: number | null;
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
 * Stream chunk from SSE - includes workflow metadata for routing
 */
export interface StreamChunk {
  type: "chunk" | "complete" | "error" | "done" | "progress";
  content?: string;
  messageId?: string;
  error?: string;
  messageType?: "text" | "workflow" | "experts";
  cardData?: any;
  sources?: any[];
  // Workflow routing metadata (added by backend to every chunk)
  workflowSessionId?: string | null;
  relatedStepIndex?: number | null;
  // Progress updates for long-running operations
  progress?: {
    phase: string;
    message: string;
  };
}

/**
 * Stream callbacks - includes workflow metadata for proper message routing
 */
export interface StreamCallbacks {
  onChunk?: (
    content: string,
    workflowSessionId?: string | null,
    relatedStepIndex?: number | null
  ) => void;
  onComplete?: (
    fullContent: string,
    messageType?: string,
    cardData?: any,
    workflowSessionId?: string | null,
    relatedStepIndex?: number | null
  ) => void;
  onDone?: (
    messageId: string,
    workflowSessionId?: string | null,
    relatedStepIndex?: number | null
  ) => void;
  onError?: (error: string) => void;
  onProgress?: (phase: string, message: string) => void;
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

  try {
    // Forward all captured screenshots (if any) from multi-window capture
    let screenshotsPayload: WindowScreenshot[] | undefined;

    if (multiWindowCapture && multiWindowCapture.success) {
      if (multiWindowCapture.screenshots.length > 0) {
        screenshotsPayload = multiWindowCapture.screenshots;

        logger.info(" Sending multi-window capture payload:", {
          screenshotCount: screenshotsPayload.length,
          apps: screenshotsPayload.map((s) => s.appName).join(", "),
        });
      } else {
        logger.info(" Multi-window capture had no screenshots");
      }
    } else if (multiWindowCapture && !multiWindowCapture.success) {
      logger.info(" Screenshot capture blocked or failed:", multiWindowCapture.error);
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

    // Real-time SSE streaming - pass chunks directly to UI with workflow metadata
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let messageType: string | undefined;
    let cardData: any = undefined;
    let workflowSessionId: string | null | undefined;
    let relatedStepIndex: number | null | undefined;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        // Skip empty lines and ping messages
        if (!line.trim() || line.startsWith(":")) continue;

        if (line.startsWith("data: ")) {
          const data = line.slice(6);

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
                // Call onComplete with all metadata
                callbacks.onComplete?.(
                  fullContent,
                  messageType,
                  cardData,
                  workflowSessionId,
                  relatedStepIndex
                );
                break;
              }

              case "done": {
                if (chunk.workflowSessionId !== undefined) {
                  workflowSessionId = chunk.workflowSessionId;
                }
                if (chunk.relatedStepIndex !== undefined) {
                  relatedStepIndex = chunk.relatedStepIndex;
                }
                if (chunk.messageId) {
                  callbacks.onDone?.(chunk.messageId, workflowSessionId, relatedStepIndex);
                }
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
                throw new Error(chunk.error);
              }
            }
          } catch (e) {
            // Only log actual parse errors, not re-thrown errors
            if (e instanceof SyntaxError) {
              logger.warn(" Failed to parse SSE data:", data);
            } else {
              throw e;
            }
          }
        }
      }
    }

    if (!fullContent) {
      throw new Error("No content received from backend");
    }

    // Final completion signal (in case backend didn't send an explicit "complete")
    // Only call if onComplete wasn't already called
    if (!messageType && !cardData) {
      callbacks.onComplete?.(
        fullContent,
        messageType,
        cardData,
        workflowSessionId,
        relatedStepIndex
      );
    }
  } catch (error) {
    logger.error("Message send error:", error);
    callbacks.onError?.(error instanceof Error ? error.message : "Failed to send message");
    throw error;
  }
}
