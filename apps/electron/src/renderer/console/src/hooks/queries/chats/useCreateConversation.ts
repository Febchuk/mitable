import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createConversation } from "../../../services/chatsService";
import { useUser } from "../../../context/UserContext";
import type { Chat, Message } from "../../../types";

export function useCreateConversation() {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: (payload: { title: string; contextType: string; initialMessage: string }) =>
      createConversation(payload),

    onSuccess: (result, variables) => {
      // Add new conversation to cache optimistically
      const firstUserMessage: Message = {
        id: `${result.conversation.id}-1`,
        role: "user",
        content: variables.initialMessage || "",
        timestamp: new Date(),
      };

      const newChat: Chat = {
        id: result.conversation.id,
        title: result.conversation.title,
        lastMessage: variables.initialMessage || "",
        timestamp: result.conversation.createdAt,
        unread: false,
        messages: [firstUserMessage],
      };

      queryClient.setQueryData(["conversations", user?.id], (old: any) =>
        old ? [newChat, ...old] : [newChat]
      );

      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
    },
  });
}
