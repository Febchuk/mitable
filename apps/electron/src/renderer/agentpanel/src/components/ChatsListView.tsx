import { useState, useEffect, useCallback } from "react";
import { getConversations } from "../../../lib/api/conversations";
import type { Conversation } from "../../../lib/api/conversations";
import { MessageSquare, Loader2 } from "lucide-react";

interface ChatsListViewProps {
  onSelectConversation: (id: string) => void;
  currentConversationId: string | null;
}

const CONVERSATIONS_PER_PAGE = 20;

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function ChatsListView({ onSelectConversation, currentConversationId }: ChatsListViewProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Initial load
  useEffect(() => {
    async function loadConversations() {
      try {
        setIsLoading(true);
        setError(null);
        const result = await getConversations(1, CONVERSATIONS_PER_PAGE);
        setConversations(result.conversations);
        setHasMore(result.pagination.hasNext);
        setPage(1);
      } catch (err) {
        console.error("[ChatsListView] Failed to load conversations:", err);
        setError("Failed to load conversations");
      } finally {
        setIsLoading(false);
      }
    }

    loadConversations();
  }, []);

  // Load more conversations
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await getConversations(nextPage, CONVERSATIONS_PER_PAGE);
      setConversations((prev) => [...prev, ...result.conversations]);
      setPage(nextPage);
      setHasMore(result.pagination.hasNext);
    } catch (err) {
      console.error("[ChatsListView] Failed to load more conversations:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, page]);

  // Handle scroll for infinite loading
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      // Load more when within 100px of bottom
      if (scrollHeight - scrollTop - clientHeight < 100) {
        loadMore();
      }
    },
    [loadMore]
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-white/50" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-white/60 text-sm text-center">{error}</p>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-3">
        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
          <MessageSquare className="h-6 w-6 text-white/40" />
        </div>
        <p className="text-white/60 text-sm text-center">No conversations yet</p>
        <p className="text-white/40 text-xs text-center">Start a new chat to get help</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hidden" onScroll={handleScroll}>
        {conversations.map((conv) => {
          const isCurrent = conv.id === currentConversationId;
          return (
            <div
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={`
                px-4 py-3 cursor-pointer transition-colors border-b border-white/5
                ${isCurrent ? "bg-white/10" : "hover:bg-white/5"}
              `}
            >
              <div className="flex items-start gap-3">
                {/* Current indicator */}
                <div className="mt-1.5 flex-shrink-0">
                  {isCurrent ? (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  ) : (
                    <div className="w-2 h-2" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-white font-medium text-sm truncate">
                      {conv.title || "Untitled conversation"}
                    </h3>
                    <span className="text-white/40 text-xs flex-shrink-0">
                      {formatRelativeTime(conv.timestamp)}
                    </span>
                  </div>
                  {conv.lastMessage && (
                    <p className="text-white/50 text-xs mt-1 line-clamp-2">{conv.lastMessage}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading more indicator */}
        {isLoadingMore && (
          <div className="py-4 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-white/50" />
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatsListView;
