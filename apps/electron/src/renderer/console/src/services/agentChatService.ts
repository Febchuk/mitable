import { apiRequest } from "./api";

export interface AgentConversationSummary {
  id: string;
  title: string | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMessageRecord {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  toolCalls: Array<{ name: string; input?: unknown; detail?: string }>;
  createdAt: string;
}

export async function fetchAgentChats(): Promise<{ conversations: AgentConversationSummary[] }> {
  return apiRequest("/agent/chats");
}

export async function createAgentChat(
  id?: string,
  title?: string
): Promise<{ conversation: AgentConversationSummary }> {
  return apiRequest("/agent/chats", {
    method: "POST",
    body: JSON.stringify({ id, title }),
  });
}

export async function fetchAgentChat(id: string): Promise<{
  conversation: AgentConversationSummary;
  messages: AgentMessageRecord[];
}> {
  return apiRequest(`/agent/chats/${id}`);
}

export async function renameAgentChat(
  id: string,
  title: string
): Promise<{ conversation: AgentConversationSummary }> {
  return apiRequest(`/agent/chats/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function updateAgentChatSession(
  id: string,
  sessionId: string
): Promise<{ conversation: AgentConversationSummary }> {
  return apiRequest(`/agent/chats/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ sessionId }),
  });
}

export async function deleteAgentChat(id: string): Promise<{ success: boolean }> {
  return apiRequest(`/agent/chats/${id}`, { method: "DELETE" });
}

export async function addAgentMessage(
  conversationId: string,
  role: string,
  content: string,
  toolCalls?: Array<{ name: string; input?: unknown; detail?: string }>
): Promise<{ message: AgentMessageRecord }> {
  return apiRequest(`/agent/chats/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ role, content, toolCalls }),
  });
}

// ── Agent Query Layer (Layer 1) ─────────────────────────────────────
// Lightweight RLM for conversational queries — no SDK subprocess needed.

export interface AgentQueryResult {
  response?: string;
  escalate?: boolean;
}

export async function askAgentQuery(
  message: string,
  conversationId?: string,
  signal?: AbortSignal
): Promise<AgentQueryResult> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return apiRequest("/agent/ask", {
    method: "POST",
    body: JSON.stringify({ message, conversationId, timezone }),
    signal,
  });
}
