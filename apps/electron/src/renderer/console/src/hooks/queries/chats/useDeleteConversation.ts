import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteConversation } from "@/console/src/services/chatsService";

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => deleteConversation(conversationId),
    onSuccess: () => {
      // Invalidate and refetch conversations list
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
