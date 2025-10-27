import { MessageSquare } from "lucide-react";

interface Conversation {
  id: string;
  title: string;
  lastMessageAt: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  onSelect: (conversationId: string) => void;
  loading?: boolean;
}

export default function ConversationList({
  conversations,
  onSelect,
  loading,
}: ConversationListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-20">
        <div className="text-gray-400 text-sm">Loading conversations...</div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-20">
        <div className="text-gray-400 text-sm">No conversations found</div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className="w-full h-10 flex items-center gap-2 px-3 bg-[#1a1a1a] hover:bg-[#2f2f2f] text-white rounded-lg transition-colors app-no-drag"
        >
          <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm truncate flex-1 text-left">{conv.title}</span>
        </button>
      ))}
    </div>
  );
}
