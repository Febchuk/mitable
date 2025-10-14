import { useState } from "react";
import { useChats } from "../../context/ChatsContext";
import Card from "../ui/Card";
import Button from "../ui/Button";
import { MessageSquare, Clock, Plus, Send, ArrowLeft } from "lucide-react";

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function ChatsView() {
  const { chats, markAsRead } = useChats();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const unreadCount = chats.filter((c) => c.unread).length;

  const handleNewChat = () => {
    setActiveChatId("new");
    setMessages([]);
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    markAsRead(chatId);
    // TODO: Load messages for this chat
    setMessages([]);
  };

  const handleBackToList = () => {
    setActiveChatId(null);
    setMessages([]);
    setInputValue("");
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      // Call backend API to get response from Pinecone + LLM
      const response = await fetch("http://localhost:3000/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error. Please make sure the backend is running and try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Show chat interface if a chat is active
  if (activeChatId) {
    return (
      <div className="flex flex-col h-full app-no-drag">
        {/* Chat Header */}
        <div className="p-md border-b border-background-elevated flex items-center gap-md">
          <button
            onClick={handleBackToList}
            className="p-xs hover:bg-background-elevated rounded transition-colors"
          >
            <ArrowLeft size={20} className="text-text-secondary" />
          </button>
          <h2 className="text-lg font-semibold text-text-primary">
            {activeChatId === "new"
              ? "New Conversation"
              : chats.find((c) => c.id === activeChatId)?.title || "Chat"}
          </h2>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-md space-y-md">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <MessageSquare size={48} className="text-text-tertiary mx-auto mb-md" />
                <p className="text-text-secondary">
                  Start a conversation by typing a message below
                </p>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-2xl rounded-lg p-md ${
                  message.role === "user"
                    ? "bg-primary text-white"
                    : "bg-background-elevated text-text-primary"
                }`}
              >
                <p className="text-sm">{message.content}</p>
                <p
                  className={`text-xs mt-xs ${
                    message.role === "user" ? "text-white/70" : "text-text-tertiary"
                  }`}
                >
                  {formatTimestamp(message.timestamp)}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-background-elevated text-text-primary rounded-lg p-md">
                <p className="text-sm">Thinking...</p>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-md border-t border-background-elevated">
          <div className="flex gap-sm">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Type your message..."
              className="flex-1 bg-background-elevated text-text-primary px-md py-sm rounded-lg border border-background-elevated focus:border-primary focus:outline-none"
              disabled={isLoading}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
            >
              <Send size={16} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show chat list view
  return (
    <div className="p-2xl space-y-xl max-w-4xl app-no-drag">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary mb-sm">
            Conversations
          </h1>
          <p className="text-text-secondary">
            Your ongoing help requests and expert connections
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleNewChat}>
          <Plus size={16} />
          <span className="ml-xs">New Chat</span>
        </Button>
      </div>

      {/* Chat List */}
      <div className="space-y-md">
        {chats.map((chat) => (
          <Card
            key={chat.id}
            hover
            onClick={() => handleSelectChat(chat.id)}
            className={`cursor-pointer ${chat.unread ? "border-primary" : ""}`}
          >
            <div className="flex items-start gap-md">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  chat.unread ? "bg-primary" : "bg-background-elevated"
                }`}
              >
                <MessageSquare
                  size={20}
                  className={chat.unread ? "text-white" : "text-text-tertiary"}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-md mb-xs">
                  <h3
                    className={`text-base font-semibold ${
                      chat.unread ? "text-text-primary" : "text-text-secondary"
                    }`}
                  >
                    {chat.title}
                  </h3>
                  <div className="flex items-center gap-xs text-text-tertiary flex-shrink-0">
                    <Clock size={14} />
                    <span className="text-xs">{formatTimestamp(chat.timestamp)}</span>
                  </div>
                </div>

                <p
                  className={`text-sm truncate ${
                    chat.unread ? "text-text-primary" : "text-text-tertiary"
                  }`}
                >
                  {chat.lastMessage}
                </p>
              </div>

              {chat.unread && (
                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {chats.length === 0 && (
        <Card padding="lg">
          <div className="text-center py-2xl">
            <div className="w-16 h-16 bg-background-elevated rounded-full flex items-center justify-center mx-auto mb-md">
              <MessageSquare size={32} className="text-text-tertiary" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-sm">
              No conversations yet
            </h3>
            <p className="text-sm text-text-secondary">
              Start a conversation by clicking "New Chat" above.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
