import { apiRequest } from "./api";

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
 * Stream chunk from SSE
 */
export interface StreamChunk {
  type: "chunk" | "complete" | "error" | "done" | "window_trigger";
  content?: string;
  messageId?: string;
  error?: string;
  windowTrigger?: {
    window: string;
    data: any;
  };
}

/**
 * Stream callbacks
 */
export interface StreamCallbacks {
  onChunk?: (content: string) => void;
  onComplete?: (fullContent: string) => void;
  onDone?: (messageId: string) => void;
  onError?: (error: string) => void;
  onWindowTrigger?: (window: string, data: any) => void;
}

/**
 * Send a message and stream the AI response
 *
 * Uses Server-Sent Events (SSE) to receive real-time streaming responses.
 * The user message is saved immediately, and the assistant response is streamed
 * word-by-word as it's generated.
 *
 * @param conversationId - The conversation ID
 * @param content - The user message content
 * @param callbacks - Callbacks for handling stream events
 * @param token - Auth token
 * @param screenshot - Optional base64-encoded screenshot for workflow context
 * @param metadata - Optional metadata for workflow actions (workflowAction, selectedOption)
 * @param screenshotMetadata - Optional screenshot metadata (dimensions, scaleFactor, etc.)
 * @returns Promise that resolves when streaming completes
 */
export async function sendStreamingMessage(
  conversationId: string,
  content: string,
  callbacks: StreamCallbacks,
  token: string,
  screenshot?: string,
  metadata?: any,
  screenshotMetadata?: any
): Promise<void> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

  return new Promise((resolve, reject) => {
    // Build request body
    const requestBody: {
      content: string;
      screenshot?: string;
      metadata?: any;
      screenshotMetadata?: any;
    } = { content };
    if (screenshot) {
      requestBody.screenshot = screenshot;
    }
    if (metadata) {
      requestBody.metadata = metadata;
    }
    if (screenshotMetadata) {
      requestBody.screenshotMetadata = screenshotMetadata;
    }

    // Use fetch with streaming instead of EventSource for better control
    fetch(`${API_BASE_URL}/conversations/${conversationId}/messages/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Read stream
        const read = (): Promise<void> => {
          return reader.read().then(({ done, value }) => {
            if (done) {
              resolve();
              return;
            }

            // Decode chunk
            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE messages
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6); // Remove "data: " prefix

                if (data === "") continue; // Empty data line
                if (data.startsWith(":")) continue; // Comment (ping)

                try {
                  const chunk: StreamChunk = JSON.parse(data);

                  if (chunk.type === "chunk" && chunk.content) {
                    callbacks.onChunk?.(chunk.content);
                  } else if (chunk.type === "complete" && chunk.content) {
                    callbacks.onComplete?.(chunk.content);
                    // Also process embedded windowTrigger in complete chunks
                    if ((chunk as any).windowTrigger) {
                      callbacks.onWindowTrigger?.(
                        (chunk as any).windowTrigger.window,
                        (chunk as any).windowTrigger.data
                      );
                    }
                  } else if (chunk.type === "done" && chunk.messageId) {
                    callbacks.onDone?.(chunk.messageId);
                  } else if (chunk.type === "error" && chunk.error) {
                    callbacks.onError?.(chunk.error);
                    reject(new Error(chunk.error));
                  } else if (chunk.type === "window_trigger" && chunk.windowTrigger) {
                    callbacks.onWindowTrigger?.(
                      chunk.windowTrigger.window,
                      chunk.windowTrigger.data
                    );
                  }
                } catch (parseError) {
                  console.error("Error parsing SSE data:", parseError, data);
                }
              }
            }

            // Continue reading
            return read();
          });
        };

        return read();
      })
      .catch((error) => {
        console.error("Streaming error:", error);
        callbacks.onError?.(error instanceof Error ? error.message : "Streaming failed");
        reject(error);
      });
  });
}
