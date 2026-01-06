/**
 * Shared API Client for Conversations
 *
 * Handles communication with the backend streaming API
 * Works with both Agent and Conversation windows
 */

import type { MultiWindowCaptureResult, WindowScreenshot } from "@mitable/shared";
import { createLogger } from "../logger";

const logger = createLogger("ConversationsAPI");

// Message type (formerly from conversation renderer)
interface MessageType {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: Date;
  messageType?: "text" | "workflow";
  cardData?: Record<string, unknown>;
  sources?: Array<{ title: string; url: string; snippet: string }>;
}

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
  messageType?: "text" | "workflow";
  cardData?: Record<string, unknown>;
  sources?: Array<{ title: string; url: string; snippet: string }>;
  // Workflow routing metadata (added by backend)
  workflowSessionId?: string | null;
  relatedStepIndex?: number | null;
  // Progress updates for long-running operations
  progress?: {
    phase: string;
    message: string;
  };
}

/**
 * Get auth headers for API requests
 * Returns headers with Content-Type, token not available in this context
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  // Token management is now handled at the component level via consoleAPI
  // This function just returns base headers
  return {
    "Content-Type": "application/json",
  };
}

/**
 * Create a new conversation
 */
export async function createConversation(
  title: string = "New Conversation",
  initialMessage?: string
): Promise<Conversation> {
  logger.info(" Creating conversation:", { title, initialMessage });

  const headers = await getAuthHeaders();
  logger.info(" Auth headers obtained");

  const response = await fetch(`${API_BASE_URL}/api/conversations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title,
      contextType: "general",
      initialMessage,
    }),
  });

  logger.info(" Conversation creation response:", {
    status: response.status,
    ok: response.ok,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(" ❌ Failed to create conversation:", {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });
    throw new Error(`Failed to create conversation: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  logger.info(" ✅ Conversation created:", data.conversation);
  return data.conversation;
}

/**
 * Get list of conversations (paginated)
 */
export async function getConversations(
  page: number = 1,
  limit: number = 20
): Promise<{
  conversations: Conversation[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE_URL}/api/conversations?page=${page}&limit=${limit}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to get conversations: ${response.statusText}`);
  }

  const data = await response.json();

  // Parse timestamps to Date objects
  const conversations = data.conversations.map((conv: any) => ({
    ...conv,
    timestamp: new Date(conv.timestamp),
  }));

  return {
    conversations,
    pagination: data.pagination,
  };
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
      workflowSessionId?: string | null,
      relatedStepIndex?: number | null
    ) => void;
    onError?: (error: string) => void;
    onProgress?: (phase: string, message: string) => void;
  },
  metadata?: any
): Promise<void> {
  // Forward all captured screenshots (if any) from multi-window capture
  let screenshotsPayload: WindowScreenshot[] | undefined;
  if (multiWindowCapture && multiWindowCapture.success && multiWindowCapture.screenshots.length) {
    screenshotsPayload = multiWindowCapture.screenshots;

    logger.info(" Sending multi-window capture payload:", {
      screenshotCount: screenshotsPayload.length,
      apps: screenshotsPayload.map((s) => s.appName).join(", "),
    });
  } else if (multiWindowCapture && !multiWindowCapture.success) {
    logger.info(" Screenshot capture blocked or failed:", multiWindowCapture.error);
  } else {
    logger.info(" Sending message without screenshots");
  }

  logger.info(" 📨 Starting message stream:", {
    conversationId,
    contentLength: content.length,
    screenshotCount: screenshotsPayload?.length || 0,
  });

  const headers = await getAuthHeaders();
  logger.info(" Auth headers obtained for streaming");

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
    logger.info(" Sending message with metadata:", metadata);
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
                logger.warn(" Unknown chunk type received:", chunk.type, chunk);
              }
            }
          } catch (parseError) {
            logger.error(" Failed to parse SSE data:", parseError, data);
          }
        }
      }
    }

    if (!fullContent) {
      logger.error(" ❌ No content received from backend");
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
        workflowSessionId,
        relatedStepIndex
      );
    }
  } catch (error) {
    logger.error("Stream reading error:", error);
    callbacks.onError?.(error instanceof Error ? error.message : "Stream reading error");
  }
}
