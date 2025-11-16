import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useConversations, useCreateConversation } from "@/console/src/hooks/queries/chats";
import { Search, Plus, MessageSquare, Zap, BookOpen, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffYears = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365));

  if (diffMins < 1) {
    return "Last message just now";
  } else if (diffMins < 60) {
    return `Last message ${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  } else if (diffHours < 24) {
    return `Last message ${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  } else if (diffDays < 365) {
    return `Last message ${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  } else {
    return `Last message ${diffYears} year${diffYears > 1 ? "s" : ""} ago`;
  }
}

export default function ChatsView() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const createConversationMutation = useCreateConversation();

  const { data, isLoading, error } = useConversations(page, limit);
  const chats = data?.conversations || [];
  const pagination = data?.pagination;

  // Filter chats based on search query
  const filteredChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center text-text-secondary">Loading conversations...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-center text-status-error">Error loading conversations</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Your chat history</h1>
        <Button
          onClick={async () => {
            try {
              const result = await createConversationMutation.mutateAsync({
                title: "New Chat",
                contextType: "general",
              });
              navigate(`/chats/${result.conversation.id}`);
            } catch (e) {
              // no-op; optionally toast later
            }
          }}
          className="gap-2 bg-gradient-purple text-white hover:shadow-glow-purple transition-all duration-300"
        >
          <Plus size={20} />
          <span>New Chat</span>
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
          size={20}
        />
        <Input
          placeholder="Search your chats..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-12 bg-background-elevated border-transparent text-text-primary placeholder:text-text-secondary"
        />
      </div>

      {/* Chat List */}
      <div className="space-y-2">
        {filteredChats.map((chat) => {
          // Determine chat type based on title keywords
          const isWorkflow =
            chat.title.toLowerCase().includes("workflow") ||
            chat.title.toLowerCase().includes("how do");
          const isKnowledge =
            chat.title.toLowerCase().includes("what is") ||
            chat.title.toLowerCase().includes("explain");

          const icon = isWorkflow ? Zap : isKnowledge ? BookOpen : MessageSquare;
          const iconColor = isWorkflow
            ? "text-purple-400"
            : isKnowledge
              ? "text-blue-400"
              : "text-gray-400";
          const borderColor = isWorkflow
            ? "border-purple-500/20"
            : isKnowledge
              ? "border-blue-500/20"
              : "border-border-subtle";

          return (
            <div
              key={chat.id}
              onClick={() => navigate(`/chats/${chat.id}`)}
              className={`group bg-background-secondary border ${borderColor} rounded-lg p-4 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 cursor-pointer`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-8 h-8 bg-background-elevated rounded-lg flex items-center justify-center flex-shrink-0">
                    {(() => {
                      const Icon = icon;
                      return <Icon size={16} className={iconColor} />;
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-text-primary text-base font-medium group-hover:text-white transition-colors truncate">
                      {chat.title}
                    </h3>
                    <p className="text-text-tertiary text-xs">{formatTimestamp(chat.timestamp)}</p>
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className="text-text-tertiary group-hover:text-text-secondary group-hover:translate-x-1 transition-all flex-shrink-0"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredChats.length === 0 && (
        <div className="bg-background-secondary/50 backdrop-blur rounded-xl border border-border-subtle p-12 text-center shadow-card">
          <div className="w-16 h-16 bg-gradient-purple-blue rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageSquare size={32} className="text-white" />
          </div>
          <p className="text-text-secondary text-lg">
            {searchQuery ? `No chats found matching "${searchQuery}"` : "No conversations yet"}
          </p>
          <p className="text-text-tertiary text-sm mt-2">
            {searchQuery ? "Try a different search term" : "Start a new chat to get help"}
          </p>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="space-y-4 pt-4">
          {/* Pagination Info */}
          <p className="text-sm text-text-secondary text-center">
            Showing {(page - 1) * limit + 1}-{Math.min(page * limit, pagination.total)} of{" "}
            {pagination.total} conversations
          </p>

          {/* Pagination Controls */}
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => pagination.hasPrev && setPage(page - 1)}
                  className={
                    pagination.hasPrev
                      ? "cursor-pointer hover:bg-background-elevated"
                      : "opacity-50 cursor-not-allowed"
                  }
                />
              </PaginationItem>

              {/* Page Numbers */}
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pageNum) => {
                // Show first page, last page, current page, and pages around current
                const shouldShow =
                  pageNum === 1 ||
                  pageNum === pagination.totalPages ||
                  Math.abs(pageNum - page) <= 1;

                if (!shouldShow) {
                  // Show ellipsis for gaps
                  if (pageNum === 2 && page > 3) {
                    return (
                      <PaginationItem key={pageNum}>
                        <span className="px-4 py-2 text-text-secondary">...</span>
                      </PaginationItem>
                    );
                  }
                  if (pageNum === pagination.totalPages - 1 && page < pagination.totalPages - 2) {
                    return (
                      <PaginationItem key={pageNum}>
                        <span className="px-4 py-2 text-text-secondary">...</span>
                      </PaginationItem>
                    );
                  }
                  return null;
                }

                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => setPage(pageNum)}
                      isActive={pageNum === page}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}

              <PaginationItem>
                <PaginationNext
                  onClick={() => pagination.hasNext && setPage(page + 1)}
                  className={
                    pagination.hasNext
                      ? "cursor-pointer hover:bg-background-elevated"
                      : "opacity-50 cursor-not-allowed"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
