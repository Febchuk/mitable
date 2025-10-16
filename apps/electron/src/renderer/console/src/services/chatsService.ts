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

export interface ConversationsResponse {
  conversations: Chat[];
}

export interface MessagesResponse {
  messages: Message[];
}

/**
 * Fetch all conversations for the user
 */
export async function fetchConversations(): Promise<ConversationsResponse> {
  return apiRequest<ConversationsResponse>("/conversations");
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
