/**
 * Agent Chat Service (Local)
 *
 * All operations go through local IPC → SQLite + BYOK provider.
 * @deprecated Backend HTTP routes removed — everything is local now.
 */

export interface AgentConversationSummary {
  id: string;
  title: string | null;
  sessionId?: string | null;
  createdAt: string | number;
  updatedAt: string | number;
}

export interface AgentMessageRecord {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  toolCalls: Array<{ name: string; input?: unknown; detail?: string }> | string;
  createdAt: string | number;
}

export async function fetchAgentChats(): Promise<{ conversations: AgentConversationSummary[] }> {
  const result = await window.consoleAPI.localAgentListChats?.();
  return { conversations: result?.conversations ?? [] };
}

export async function createAgentChat(
  id?: string,
  title?: string
): Promise<{ conversation: AgentConversationSummary }> {
  const result = await window.consoleAPI.localAgentCreateChat?.({ id, title });
  if (result?.error) throw new Error(result.error);
  return { conversation: result!.conversation! };
}

export async function fetchAgentChat(id: string): Promise<{
  conversation: AgentConversationSummary;
  messages: AgentMessageRecord[];
}> {
  const result = await window.consoleAPI.localAgentGetChat?.(id);
  if (!result) throw new Error("Conversation not found");
  return result;
}

export async function renameAgentChat(
  id: string,
  title: string
): Promise<{ conversation: AgentConversationSummary }> {
  await window.consoleAPI.localAgentRenameChat?.(id, title);
  const data = await window.consoleAPI.localAgentGetChat?.(id);
  return { conversation: data?.conversation ?? { id, title, createdAt: 0, updatedAt: 0 } };
}

export async function updateAgentChatSession(
  _id: string,
  _sessionId: string
): Promise<{ conversation: AgentConversationSummary }> {
  return { conversation: { id: _id, title: "", createdAt: 0, updatedAt: 0 } };
}

export async function deleteAgentChat(id: string): Promise<{ success: boolean }> {
  const result = await window.consoleAPI.localAgentDeleteChat?.(id);
  return { success: result?.success ?? false };
}

export async function addAgentMessage(
  conversationId: string,
  role: string,
  content: string,
  toolCalls?: Array<{ name: string; input?: unknown; detail?: string }>
): Promise<{ message: AgentMessageRecord }> {
  const result = await window.consoleAPI.localAgentAddMessage?.({
    conversationId,
    role,
    content,
    toolCalls,
  });
  if (result?.error) throw new Error(result.error);
  return { message: result!.message as AgentMessageRecord };
}

// ── Agent Query Layer (Local RLM) ────────────────────────────────────

export interface AgentQueryResult {
  response?: string;
  error?: string;
}

export async function askAgentQuery(
  message: string,
  conversationId?: string,
  _signal?: AbortSignal
): Promise<AgentQueryResult> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const result = await window.consoleAPI.localAgentAsk?.({
    message,
    conversationId,
    timezone,
  });
  if (result?.error) throw new Error(result.error);
  return { response: result?.response };
}
