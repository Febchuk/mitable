import { useQuery } from "@tanstack/react-query";
import { fetchMessages } from "../../../services/chatsService";

export function useConversationMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["conversation-messages", conversationId],
    queryFn: async () => {
      if (!conversationId) throw new Error("No conversation ID");
      const data = await fetchMessages(conversationId);

      // Parse date strings to Date objects
      const messages = data.messages.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));

      return messages;
    },
    enabled: !!conversationId,
  });
}
