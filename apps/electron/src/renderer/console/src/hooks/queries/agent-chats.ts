import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAgentChats,
  createAgentChat,
  fetchAgentChat,
  renameAgentChat,
  deleteAgentChat,
  addAgentMessage,
  updateAgentChatSession,
} from "../../services/agentChatService";

export const agentChatKeys = {
  all: ["agent-chats"] as const,
  list: () => [...agentChatKeys.all, "list"] as const,
  detail: (id: string) => [...agentChatKeys.all, "detail", id] as const,
};

export function useAgentChats() {
  return useQuery({
    queryKey: agentChatKeys.list(),
    queryFn: async () => {
      const data = await fetchAgentChats();
      return data.conversations;
    },
  });
}

export function useAgentChat(id: string | undefined) {
  return useQuery({
    queryKey: agentChatKeys.detail(id!),
    queryFn: () => fetchAgentChat(id!),
    enabled: !!id,
  });
}

export function useCreateAgentChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id?: string; title?: string }) => createAgentChat(id, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentChatKeys.list() }),
  });
}

export function useRenameAgentChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameAgentChat(id, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentChatKeys.list() }),
  });
}

export function useDeleteAgentChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAgentChat(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: agentChatKeys.list() }),
  });
}

export function useUpdateAgentChatSession() {
  return useMutation({
    mutationFn: ({ id, sessionId }: { id: string; sessionId: string }) =>
      updateAgentChatSession(id, sessionId),
  });
}

export function useAddAgentMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      conversationId,
      role,
      content,
      toolCalls,
    }: {
      conversationId: string;
      role: string;
      content: string;
      toolCalls?: Array<{ name: string; input?: unknown; detail?: string }>;
    }) => addAgentMessage(conversationId, role, content, toolCalls),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: agentChatKeys.list() });
      qc.invalidateQueries({
        queryKey: agentChatKeys.detail(variables.conversationId),
      });
    },
  });
}
