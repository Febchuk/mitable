/**
 * Local persistence layer for agent chat conversations.
 * Uses localStorage as the backing store — will be migrated to
 * backend persistence in a future iteration.
 */

const STORAGE_KEY = "mitable:agent-chats";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "error";
  content: string;
  toolName?: string;
  isPlan?: boolean;
}

export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

function readAll(): ChatConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatConversation[];
  } catch {
    return [];
  }
}

function writeAll(conversations: ChatConversation[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

/** Get all conversations, newest first. */
export function getAllConversations(): ChatConversation[] {
  return readAll().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** Get a single conversation by ID. */
export function getConversation(id: string): ChatConversation | undefined {
  return readAll().find((c) => c.id === id);
}

/** Create a new conversation. */
export function createConversation(id: string, title?: string): ChatConversation {
  const convo: ChatConversation = {
    id,
    title: title || "New chat",
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const all = readAll();
  all.push(convo);
  writeAll(all);
  return convo;
}

/** Append a message to a conversation and update the timestamp. */
export function addMessage(conversationId: string, message: ChatMessage): void {
  const all = readAll();
  const convo = all.find((c) => c.id === conversationId);
  if (!convo) return;

  convo.messages.push(message);
  convo.updatedAt = new Date().toISOString();

  // Auto-title from first user message
  if (convo.title === "New chat" && message.role === "user") {
    convo.title = message.content.length > 60
      ? message.content.slice(0, 57) + "..."
      : message.content;
  }

  writeAll(all);
}

/** Replace all messages for a conversation (used after turn completion). */
export function setMessages(conversationId: string, messages: ChatMessage[]): void {
  const all = readAll();
  const convo = all.find((c) => c.id === conversationId);
  if (!convo) return;

  convo.messages = messages;
  convo.updatedAt = new Date().toISOString();

  // Auto-title from first user message if still default
  if (convo.title === "New chat") {
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser) {
      convo.title = firstUser.content.length > 60
        ? firstUser.content.slice(0, 57) + "..."
        : firstUser.content;
    }
  }

  writeAll(all);
}

/** Delete a conversation. */
export function deleteConversation(id: string): void {
  writeAll(readAll().filter((c) => c.id !== id));
}

/** Rename a conversation. */
export function renameConversation(id: string, title: string): void {
  const all = readAll();
  const convo = all.find((c) => c.id === id);
  if (!convo) return;
  convo.title = title;
  writeAll(all);
}
