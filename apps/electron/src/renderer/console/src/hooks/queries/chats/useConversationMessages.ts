import { useQuery } from "@tanstack/react-query";
import { fetchMessages } from "../../../services/chatsService";

export function useConversationMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["conversation-messages", conversationId],
    queryFn: async () => {
      if (!conversationId) throw new Error("No conversation ID");
      
      console.log("[useConversationMessages] Fetching messages for:", conversationId);
      const data = await fetchMessages(conversationId);
      console.log("[useConversationMessages] Received:", data.messages.length, "messages");

      // Parse date strings to Date objects
      const messages = data.messages.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));

      return messages;
    },
    enabled: !!conversationId,
    retry: 2, // Retry up to 2 times for message fetching
    staleTime: 30000, // Keep data fresh for 30 seconds
    refetchOnWindowFocus: false, // Don't refetch when switching between chats
    refetchOnMount: false, // Don't refetch on every component mount
    refetchInterval: (query) => {
      // Poll every 10 seconds (reduced from 5 to avoid spam), but only if:
      // 1. The query has data (initial fetch succeeded)
      // 2. There are active observers (user is viewing this chat)
      const hasActiveObservers = query.getObserversCount() > 0;
      return query.state.data && hasActiveObservers ? 10000 : false;
    },
  });
}
