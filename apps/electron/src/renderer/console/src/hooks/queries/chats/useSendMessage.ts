import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendMessage as sendMessageAPI } from '../../../services/chatsService';
import { useUser } from '../../../context/UserContext';
import type { Message } from '../../../types';

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: ({ chatId, message }: { chatId: string; message: Omit<Message, 'id' | 'timestamp'> }) =>
      sendMessageAPI(chatId, {
        role: message.role,
        content: message.content,
        messageType: message.type,
        cardData: message.cardData,
      }),

    // Optimistic update
    onMutate: async ({ chatId, message }) => {
      await queryClient.cancelQueries({ queryKey: ['conversations', user?.id] });
      const previousConversations = queryClient.getQueryData(['conversations', user?.id]);

      const fullMessage: Message = {
        ...message,
        id: `temp-${Date.now()}`,
        timestamp: new Date(),
      };

      queryClient.setQueryData(['conversations', user?.id], (old: any) =>
        old?.map((chat: any) => {
          if (chat.id === chatId) {
            return {
              ...chat,
              messages: [...chat.messages, fullMessage],
              lastMessage: fullMessage.content,
              timestamp: fullMessage.timestamp,
            };
          }
          return chat;
        })
      );

      return { previousConversations, tempMessage: fullMessage };
    },

    onError: (err, variables, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(['conversations', user?.id], context.previousConversations);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', user?.id] });
    },
  });
}
