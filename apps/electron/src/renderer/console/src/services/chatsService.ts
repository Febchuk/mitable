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
 * Send a message and get the full AI response, then simulate streaming on frontend
 *
 * Simplified approach: Backend returns complete response, frontend streams it word-by-word.
 * This is more reliable and gives us full control over the streaming UX.
 *
 * @param conversationId - The conversation ID
 * @param content - The user message content
 * @param callbacks - Callbacks for handling stream events
 * @param token - Auth token
 * @param screenshot - Optional base64-encoded screenshot for workflow context
 * @param metadata - Optional metadata for workflow actions (workflowAction, selectedOption)
 * @returns Promise that resolves when streaming completes
 */
export async function sendStreamingMessage(
  conversationId: string,
  content: string,
  callbacks: StreamCallbacks,
  token: string,
  screenshot?: string,
  metadata?: any
): Promise<void> {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

  try {
    // Build request body
    const requestBody: { content: string; screenshot?: string; metadata?: any } = { content };
    if (screenshot) {
      requestBody.screenshot = screenshot;
    }
    if (metadata) {
      requestBody.metadata = metadata;
    }

    // Fetch the SSE stream from backend
    const response = await fetch(
      `${API_BASE_URL}/conversations/${conversationId}/messages/stream`,
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

    // Read the entire SSE stream and collect the full content
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

            // Accumulate content from backend
            if (chunk.type === "chunk" && chunk.content) {
              fullContent += chunk.content;
            } else if (chunk.type === "complete" && chunk.content) {
              fullContent = chunk.content;
            } else if (chunk.type === "done") {
              // Stream completed
              break;
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

    // Now simulate frontend streaming word-by-word
    const words = fullContent.split(" ");

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const isLast = i === words.length - 1;

      // Add word with space (except for last word)
      callbacks.onChunk?.(isLast ? word : word + " ");

      // Delay between words for typing effect - slowed down for Groq's speed 😎
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    // Signal completion
    callbacks.onComplete?.(fullContent);
  } catch (error) {
    console.error("Message send error:", error);
    callbacks.onError?.(error instanceof Error ? error.message : "Failed to send message");
    throw error;
  }
}
