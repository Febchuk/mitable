import { useQuery } from "@tanstack/react-query";
import { fetchConversations } from "../../../services/chatsService";
import { useUser } from "../../../context/UserContext";

export function useConversations() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: async () => {
      const data = await fetchConversations();

      // Parse date strings to Date objects
      return data.conversations.map((chat) => ({
        ...chat,
        timestamp: new Date(chat.timestamp),
        messages: chat.messages.map((msg) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })),
      }));
    },
    enabled: !!user,
  });
}
