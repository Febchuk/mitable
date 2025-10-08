import { createContext, useContext, useState, ReactNode } from "react";
import { Chat } from "../types";

interface ChatsContextType {
  chats: Chat[];
  markAsRead: (chatId: string) => void;
}

const ChatsContext = createContext<ChatsContextType | undefined>(undefined);

export function ChatsProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<Chat[]>([
    {
      id: "1",
      title: "Help with React Router setup",
      lastMessage: "Thanks! That worked perfectly. I was able to...",
      timestamp: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
      unread: true,
    },
    {
      id: "2",
      title: "Onboarding checklist question",
      lastMessage: "I've completed the first week tasks. What's next?",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      unread: false,
    },
    {
      id: "3",
      title: "CI/CD pipeline walkthrough",
      lastMessage: "Marcus: Let me show you our deployment process...",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
      unread: true,
    },
    {
      id: "4",
      title: "Design system overview",
      lastMessage: "Emily: Here's the Figma link to our component library",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      unread: false,
    },
    {
      id: "5",
      title: "Backend architecture discussion",
      lastMessage: "David: Our services communicate via gRPC and...",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
      unread: false,
    },
  ]);

  const markAsRead = (chatId: string) => {
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, unread: false } : chat))
    );
  };

  return (
    <ChatsContext.Provider value={{ chats, markAsRead }}>
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
