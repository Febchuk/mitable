import { useQuery } from "@tanstack/react-query";
import { fetchConversations } from "../../../services/chatsService";
import { useUser } from "../../../context/UserContext";

export function useConversations(page: number = 1, limit: number = 20) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["conversations", user?.id, page, limit],
    queryFn: async () => {
      const data = await fetchConversations(page, limit);

      // Parse date strings to Date objects
      const conversations = data.conversations.map((chat) => ({
        ...chat,
        timestamp: new Date(chat.timestamp),
        messages: chat.messages
          ? chat.messages.map((msg) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }))
          : [],
      }));

      return {
        conversations,
        pagination: data.pagination,
      };
    },
    enabled: !!user,
  });
}
