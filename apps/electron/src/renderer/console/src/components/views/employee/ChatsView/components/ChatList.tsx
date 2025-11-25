import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Plus } from "lucide-react";
import { useConversations, useCreateConversation } from "@/console/src/hooks/queries/chats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchMessages } from "@/console/src/services/chatsService";
import logoIconSvg from "../../../../../../../assets/logo-icon.svg";

interface ChatListProps {
  selectedChatId: string | null;
  onSelectChat: (chatId: string) => void;
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ChatList({ selectedChatId, onSelectChat }: ChatListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();
  const { data, isLoading } = useConversations(1, 50);
  const createConversationMutation = useCreateConversation();
  
  const chats = data?.conversations || [];

  // Prefetch messages on hover (debounced to avoid spam)
  const [prefetchTimeout, setPrefetchTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const prefetchChat = (chatId: string) => {
    // Clear previous timeout
    if (prefetchTimeout) {
      clearTimeout(prefetchTimeout);
    }
    
    // Debounce prefetch by 300ms
    const timeout = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ['conversation-messages', chatId],
        queryFn: () => fetchMessages(chatId),
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
    }, 300);
    
    setPrefetchTimeout(timeout);
  };

  // Filter chats based on search
  const filteredChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateChat = () => {
    console.log("[ChatList] + button clicked!");
    console.log("[ChatList] isPending:", createConversationMutation.isPending);
    
    if (createConversationMutation.isPending) {
      console.log("[ChatList] Already creating, skipping...");
      return;
    }
    
    console.log("[ChatList] Starting mutation...");
    createConversationMutation.mutate(
      {
        title: "New Chat",
        contextType: "general",
      },
      {
        onSuccess: (result) => {
          console.log("[ChatList] Chat created successfully:", result);
          if (result?.conversation?.id) {
            console.log("[ChatList] Selecting chat:", result.conversation.id);
            onSelectChat(result.conversation.id);
          } else {
            console.error("[ChatList] No conversation ID in result:", result);
          }
        },
        onError: (error) => {
          console.error("[ChatList] Failed to create chat:", error);
        },
      }
    );
  };

  return (
    <div className="w-80 border-r border-white/5 flex flex-col bg-gradient-to-b from-[#1e1b2e] to-[#161420] flex-shrink-0 h-full">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex-shrink-0 bg-gradient-to-b from-purple-500/5 to-transparent">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <img src={logoIconSvg} alt="Mitable" className="w-6 h-6" />
            <h2 className="text-xl font-bold text-white">Chats</h2>
          </div>
          <Button
            onClick={handleCreateChat}
            disabled={createConversationMutation.isPending}
            size="sm"
            className="h-9 w-9 p-0 bg-gradient-to-r from-purple-600 to-blue-600 hover:shadow-glow-purple shadow-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {createConversationMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Plus size={18} />
            )}
          </Button>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
            size={16}
          />
          <Input
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-black/20 border-white/10 text-sm focus:border-primary/50 focus:ring-primary/20 placeholder:text-white/30"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="p-4 text-center text-text-secondary text-sm">
            Loading chats...
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="p-4 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600/20 to-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-white/10">
              <img src={logoIconSvg} alt="Mitable" className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-white/70 text-sm font-medium">
              {searchQuery ? `No chats found` : "No conversations yet"}
            </p>
            <p className="text-white/40 text-xs mt-1">
              {searchQuery ? "Try a different search" : "Start a new chat"}
            </p>
          </div>
        ) : (
          <div className="p-2">
            {filteredChats.map((chat) => {
              const isSelected = selectedChatId === chat.id;

              return (
                <button
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  onMouseEnter={() => prefetchChat(chat.id)}
                  className={`
                    w-full text-left p-3 rounded-xl transition-all duration-200
                    ${isSelected 
                      ? 'bg-gradient-to-r from-purple-600/30 to-blue-600/30 shadow-xl shadow-purple-500/20 border border-purple-500/40 backdrop-blur-sm' 
                      : 'hover:bg-white/5 hover:border-white/10 border border-transparent'
                    }
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className={`
                          text-sm font-semibold truncate transition-colors
                          ${isSelected ? 'text-white' : 'text-white/90'}
                        `}>
                          {chat.title}
                        </h3>
                        <span className={`text-xs flex-shrink-0 transition-colors ${isSelected ? 'text-purple-200' : 'text-white/40'}`}>
                          {formatTimestamp(chat.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
