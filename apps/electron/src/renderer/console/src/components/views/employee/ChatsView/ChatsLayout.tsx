import { useState } from "react";
import { useCreateConversation } from "@/console/src/hooks/queries/chats";
import ChatList from "./components/ChatList";
import ChatMessages from "./components/ChatMessages";
import EmptyState from "./components/EmptyState";

export default function ChatsLayout() {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const createConversationMutation = useCreateConversation();

  const handleNewChat = async (initialMessage?: string) => {
    try {
      const result = await createConversationMutation.mutateAsync({
        title: initialMessage || "New Chat",
        contextType: "general",
        initialMessage: initialMessage,
      });
      setSelectedChatId(result.conversation.id);
      
      // If there's an initial message, store it to be sent when the chat loads
      if (initialMessage) {
        setPendingMessage(initialMessage);
      }
    } catch (error) {
      console.error("Failed to create chat:", error);
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Panel: Chat List - Always Visible */}
      <ChatList 
        selectedChatId={selectedChatId}
        onSelectChat={setSelectedChatId}
      />
      
      {/* Right Panel: Active Chat Messages */}
      <div className="flex-1 flex flex-col">
        {selectedChatId ? (
          <ChatMessages 
            chatId={selectedChatId} 
            initialMessage={pendingMessage}
            onMessageSent={() => setPendingMessage(null)}
          />
        ) : (
          <EmptyState onNewChat={handleNewChat} />
        )}
      </div>
    </div>
  );
}
