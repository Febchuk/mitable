import { createContext, useContext, useState, ReactNode } from "react";
import { Chat, Message } from "../types";

interface ChatsContextType {
  chats: Chat[];
  markAsRead: (chatId: string) => void;
  addMessage: (chatId: string, message: Message) => void;
  createNewChat: (firstMessage: string) => string;
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
      messages: [
        {
          id: "1-1",
          role: "user",
          content:
            "I'm trying to set up React Router in my project but I'm getting a blank page. Can you help?",
          timestamp: new Date(Date.now() - 1000 * 60 * 60),
        },
        {
          id: "1-2",
          role: "assistant",
          content:
            "I can help with that! The blank page usually means the routes aren't configured correctly. Can you share your router setup?",
          timestamp: new Date(Date.now() - 1000 * 60 * 50),
        },
        {
          id: "1-3",
          role: "user",
          content:
            "Here's my App.tsx - I have BrowserRouter wrapping everything but none of my routes are showing up.",
          timestamp: new Date(Date.now() - 1000 * 60 * 40),
        },
        {
          id: "1-4",
          role: "assistant",
          content:
            "I see the issue! You need to use HashRouter instead of BrowserRouter for Electron apps. BrowserRouter uses the HTML5 history API which doesn't work well with the file:// protocol that Electron uses.",
          timestamp: new Date(Date.now() - 1000 * 60 * 30),
        },
        {
          id: "1-5",
          role: "user",
          content: "Thanks! That worked perfectly. I was able to navigate between routes now.",
          timestamp: new Date(Date.now() - 1000 * 60 * 15),
        },
        {
          id: "1-6",
          role: "user",
          content:
            "Actually, I have another question - how do I handle ticket escalation in our system?",
          timestamp: new Date(Date.now() - 1000 * 60 * 10),
        },
        {
          id: "1-7",
          role: "assistant",
          content:
            "I can show you how to escalate a ticket. Would you like an interactive walkthrough?",
          timestamp: new Date(Date.now() - 1000 * 60 * 9),
        },
        {
          id: "1-8",
          role: "user",
          content: "Yes, show me!",
          timestamp: new Date(Date.now() - 1000 * 60 * 8),
        },
        {
          id: "1-9",
          role: "assistant",
          content: "",
          timestamp: new Date(Date.now() - 1000 * 60 * 7),
          type: "workflow",
          cardData: {
            title: "Ticket Billing Escalation",
            subtitle: "Interactive Workflow",
            iconType: "workflow",
          },
        },
        {
          id: "1-10",
          role: "user",
          content: "I'm still a little confused, who can I reach out to for help?",
          timestamp: new Date(Date.now() - 1000 * 60 * 5),
        },
        {
          id: "1-11",
          role: "assistant",
          content: "Of course! Here are a few options.",
          timestamp: new Date(Date.now() - 1000 * 60 * 4),
        },
        {
          id: "1-12",
          role: "assistant",
          content: "",
          timestamp: new Date(Date.now() - 1000 * 60 * 3),
          type: "experts",
          cardData: {
            title: "Billing Escalation Experts",
            subtitle: "View Experts",
            iconType: "experts",
          },
        },
      ],
    },
    {
      id: "2",
      title: "Onboarding checklist question",
      lastMessage: "I've completed the first week tasks. What's next?",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      unread: false,
      messages: [
        {
          id: "2-1",
          role: "user",
          content: "I've completed the first week tasks. What's next?",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
        },
        {
          id: "2-2",
          role: "assistant",
          content:
            "Great progress! Week 2 focuses on learning our internal tools. You should have access to the 'Internal Tools Overview' task in your roadmap. Would you like me to walk you through it?",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2 + 1000 * 60 * 5),
        },
      ],
    },
    {
      id: "3",
      title: "CI/CD pipeline walkthrough",
      lastMessage: "Marcus: Let me show you our deployment process...",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
      unread: true,
      messages: [
        {
          id: "3-1",
          role: "user",
          content: "Can someone explain how our CI/CD pipeline works? I need to deploy a fix.",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6),
        },
        {
          id: "3-2",
          role: "assistant",
          content:
            "Let me show you our deployment process. We use GitHub Actions for CI/CD. When you push to main, it automatically runs tests and deploys to staging.",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
        },
      ],
    },
    {
      id: "4",
      title: "Design system overview",
      lastMessage: "Emily: Here's the Figma link to our component library",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      unread: false,
      messages: [
        {
          id: "4-1",
          role: "user",
          content:
            "Where can I find documentation for our design system? I'm building a new feature.",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 - 1000 * 60 * 30),
        },
        {
          id: "4-2",
          role: "assistant",
          content:
            "Here's the Figma link to our component library: [link]. You'll find all our design tokens, components, and usage guidelines there.",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
        },
      ],
    },
    {
      id: "5",
      title: "Backend architecture discussion",
      lastMessage: "David: Our services communicate via gRPC and...",
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
      unread: false,
      messages: [
        {
          id: "5-1",
          role: "user",
          content: "Can you explain how our microservices communicate with each other?",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2 - 1000 * 60 * 45),
        },
        {
          id: "5-2",
          role: "assistant",
          content:
            "Our services communicate via gRPC and use Protocol Buffers for serialization. Each service has its own database and they share data through well-defined APIs.",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
        },
      ],
    },
  ]);

  const markAsRead = (chatId: string) => {
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, unread: false } : chat))
    );
  };

  const addMessage = (chatId: string, message: Message) => {
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
  };

  const createNewChat = (firstMessage: string): string => {
    const newChatId = Date.now().toString();
    const firstUserMessage: Message = {
      id: `${newChatId}-1`,
      role: "user",
      content: firstMessage,
      timestamp: new Date(),
    };

    const newChat: Chat = {
      id: newChatId,
      title: firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : ""),
      lastMessage: firstMessage,
      timestamp: new Date(),
      unread: false,
      messages: [firstUserMessage],
    };

    setChats((prev) => [newChat, ...prev]);
    return newChatId;
  };

  return (
    <ChatsContext.Provider value={{ chats, markAsRead, addMessage, createNewChat }}>
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
