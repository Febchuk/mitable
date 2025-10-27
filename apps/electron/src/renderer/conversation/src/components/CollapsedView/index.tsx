import { useState, useEffect } from "react";
import SearchInput from "./SearchInput";
import NewChatOption from "./NewChatOption";
import ConversationList from "./ConversationList";

interface Conversation {
  id: string;
  title: string;
  timestamp: string; // Changed from lastMessageAt to match backend response
}

interface CollapsedViewProps {
  onSelectConversation: (conversationId: string) => void;
  onNewChat: () => void;
}

export default function CollapsedView({ onSelectConversation, onNewChat }: CollapsedViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Request conversation list from main process
    window.conversationAPI.requestConversationList();

    // Listen for response
    const cleanup = window.conversationAPI.onConversationList((data: Conversation[]) => {
      console.log("[CollapsedView] Received conversations:", data);
      setConversations(data);
      setLoading(false);
    });

    return cleanup;
  }, []);

  const filteredConversations = Array.isArray(conversations)
    ? conversations.filter((conv) =>
        conv.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="w-full h-[120px] bg-[#2a2a2a] rounded-2xl flex flex-col p-3 gap-2 app-drag">
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search conversations..."
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
        <NewChatOption onClick={onNewChat} />
        <ConversationList
          conversations={filteredConversations}
          onSelect={onSelectConversation}
          loading={loading}
        />
      </div>
    </div>
  );
}
