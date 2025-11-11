import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createConversation } from "../../../services/chatsService";
import { useUser } from "../../../context/UserContext";

export function useCreateConversation() {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: (payload: { title?: string; contextType?: string; initialMessage?: string }) =>
      createConversation(payload),

    onSuccess: (_result) => {
      // Simply invalidate conversations list; ChatDetail will fetch messages normally
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
    },
  });
}
