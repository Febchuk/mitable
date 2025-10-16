import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Chat, Message } from "../types";
import {
  fetchConversations,
  createConversation,
  sendMessage as sendMessageAPI,
} from "../services/chatsService";
import { supabase } from "../lib/supabase";

interface ChatsContextType {
  chats: Chat[];
  markAsRead: (chatId: string) => void;
  addMessage: (chatId: string, message: Message) => void;
  createNewChat: (firstMessage: string) => Promise<string>;
  loading: boolean;
  error: string | null;
}

const ChatsContext = createContext<ChatsContextType | undefined>(undefined);

export function ChatsProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch conversations when user is authenticated
  useEffect(() => {
    async function loadConversations() {
      try {
        // Check if user is authenticated
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          // User not authenticated, skip fetching
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);
        const data = await fetchConversations();
        setChats(data.conversations);
      } catch (err) {
        console.error("Failed to fetch conversations:", err);
        setError(err instanceof Error ? err.message : "Failed to load conversations");
      } finally {
        setLoading(false);
      }
    }

    loadConversations();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadConversations();
      } else {
        setChats([]);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const markAsRead = (chatId: string) => {
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, unread: false } : chat))
    );
    // TODO: Add API call to mark as read on the backend if needed
  };

  const addMessage = async (chatId: string, message: Message) => {
    // Optimistically update UI
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id === chatId) {
          const updatedMessages = [...chat.messages, message];
          return {
            ...chat,
            messages: updatedMessages,
            lastMessage: message.content,
            timestamp: message.timestamp,
          };
        }
        return chat;
      })
    );

    // Send message to API
    try {
      await sendMessageAPI(chatId, {
        role: message.role,
        content: message.content,
        messageType: message.type,
        cardData: message.cardData,
      });
    } catch (err) {
      console.error("Failed to send message:", err);
      // Revert optimistic update on error
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id === chatId) {
            const revertedMessages = chat.messages.filter((msg) => msg.id !== message.id);
            const lastMsg = revertedMessages[revertedMessages.length - 1];
            return {
              ...chat,
              messages: revertedMessages,
              lastMessage: lastMsg?.content || "",
              timestamp: lastMsg?.timestamp || chat.timestamp,
            };
          }
          return chat;
        })
      );
      setError(err instanceof Error ? err.message : "Failed to send message");
    }
  };

  const createNewChat = async (firstMessage: string): Promise<string> => {
    try {
      // Create conversation on backend
      const result = await createConversation({
        title: firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : ""),
        contextType: "general",
        initialMessage: firstMessage,
      });

      // Create local chat object
      const firstUserMessage: Message = {
        id: `${result.conversation.id}-1`,
        role: "user",
        content: firstMessage,
        timestamp: new Date(),
      };

      const newChat: Chat = {
        id: result.conversation.id,
        title: result.conversation.title,
        lastMessage: firstMessage,
        timestamp: result.conversation.createdAt,
        unread: false,
        messages: [firstUserMessage],
      };

      // Add to local state
      setChats((prev) => [newChat, ...prev]);
      return result.conversation.id;
    } catch (err) {
      console.error("Failed to create conversation:", err);
      setError(err instanceof Error ? err.message : "Failed to create conversation");
      throw err;
    }
  };

  return (
    <ChatsContext.Provider value={{ chats, markAsRead, addMessage, createNewChat, loading, error }}>
      {children}
    </ChatsContext.Provider>
  );
}

export function useChats() {
  const context = useContext(ChatsContext);
  if (!context) {
    throw new Error("useChats must be used within ChatsProvider");
  }
  return context;
}
