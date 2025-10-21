import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useConversations } from "@/console/src/hooks/queries/chats";
import { Search, Plus } from "lucide-react";
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
        <h1 className="text-4xl font-bold text-text-primary">Your chat history</h1>
        <Button
          onClick={() => navigate("/chats/new")}
          className="gap-2 bg-primary text-white hover:bg-primary/90"
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
      <div className="space-y-3">
        {filteredChats.map((chat) => (
          <div
            key={chat.id}
            onClick={() => navigate(`/chats/${chat.id}`)}
            className="bg-background-elevated rounded-lg border border-border-subtle p-6 hover:bg-background-elevated/80 transition-colors cursor-pointer"
          >
            <h3 className="text-text-primary text-lg mb-1">{chat.title}</h3>
            <p className="text-text-secondary text-sm">{formatTimestamp(chat.timestamp)}</p>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredChats.length === 0 && (
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-12">
          <p className="text-text-secondary text-center">
            {searchQuery ? `No chats found matching "${searchQuery}"` : "No conversations yet"}
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
