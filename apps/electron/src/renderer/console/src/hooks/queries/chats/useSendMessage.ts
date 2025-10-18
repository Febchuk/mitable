import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendStreamingMessage, type StreamCallbacks } from "../../../services/chatsService";
import { useUser } from "../../../context/UserContext";
import { authService } from "../../../services/authService";
import type { Message } from "../../../types";

export interface SendMessageOptions {
  onChunk?: (content: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: string) => void;
}

export function useSendMessage(options?: SendMessageOptions) {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async ({
      chatId,
      content,
    }: {
      chatId: string;
      content: string;
    }) => {
      const token = authService.getAccessToken();

      if (!token) {
        throw new Error("No authentication token");
      }

      // Define streaming callbacks
      const callbacks: StreamCallbacks = {
        onChunk: (chunk: string) => {
          options?.onChunk?.(chunk);
        },
        onComplete: (fullContent: string) => {
          options?.onComplete?.(fullContent);
        },
        onError: (error: string) => {
          options?.onError?.(error);
        },
      };

      // Start streaming
      await sendStreamingMessage(chatId, content, callbacks, token);
    },

    // Optimistic update for user message
    onMutate: async ({ chatId, content }) => {
      await queryClient.cancelQueries({ queryKey: ["conversations", user?.id] });
      const previousConversations = queryClient.getQueryData(["conversations", user?.id]);

      const userMessage: Message = {
        id: `temp-user-${Date.now()}`,
        role: "user",
        content,
        type: "text",
        timestamp: new Date(),
      };

      queryClient.setQueryData(["conversations", user?.id], (old: any) =>
        old?.map((chat: any) => {
          if (chat.id === chatId) {
            return {
              ...chat,
              messages: [...chat.messages, userMessage],
              lastMessage: userMessage.content,
              timestamp: userMessage.timestamp,
            };
          }
          return chat;
        })
      );

      return { previousConversations, tempUserMessage: userMessage };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(["conversations", user?.id], context.previousConversations);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
    },
  });
}
