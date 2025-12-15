/**
 * RecipientSelector
 *
 * Multi-select component for choosing Slack channels and users as delivery recipients.
 * Displays channels with # prefix and users with avatars.
 */

import { useState, useMemo } from "react";
import { Hash, Lock, User, X, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SlackChannel, SlackUser } from "@/console/src/services/monitoringService";

export interface Recipient {
  id: string;
  type: "channel" | "user";
  name: string;
  displayName?: string;
  isPrivate?: boolean;
  avatar?: string;
}

interface RecipientSelectorProps {
  channels: SlackChannel[];
  users: SlackUser[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export default function RecipientSelector({
  channels,
  users,
  selectedIds,
  onSelectionChange,
  isLoading = false,
  disabled = false,
}: RecipientSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter channels and users by search query
  const filteredChannels = useMemo(() => {
    if (!searchQuery) return channels;
    const query = searchQuery.toLowerCase();
    return channels.filter((ch) => ch.name.toLowerCase().includes(query));
  }, [channels, searchQuery]);

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(query) ||
        u.real_name.toLowerCase().includes(query) ||
        u.display_name.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  const handleToggle = (id: string) => {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const handleClearAll = () => {
    if (disabled) return;
    onSelectionChange([]);
  };

  const selectedCount = selectedIds.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-text-secondary">
        <div className="animate-pulse">Loading recipients...</div>
      </div>
    );
  }

  const hasNoRecipients = channels.length === 0 && users.length === 0;

  if (hasNoRecipients) {
    return (
      <div className="text-center py-6 text-text-secondary text-sm">
        <p>No Slack channels or users available.</p>
        <p className="mt-1">Please configure Slack integration first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with count and clear button */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">
          {selectedCount === 0
            ? "Select recipients"
            : `${selectedCount} recipient${selectedCount !== 1 ? "s" : ""} selected`}
        </span>
        {selectedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            disabled={disabled}
            className="h-6 px-2 text-xs text-text-secondary hover:text-text-primary"
          >
            <X size={12} className="mr-1" />
            Clear All
          </Button>
        )}
      </div>

      {/* Search input */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
        <Input
          type="text"
          placeholder="Search channels and people..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={disabled}
          className="pl-8 h-8 text-sm bg-background-elevated border-border-subtle"
        />
      </div>

      {/* Scrollable list */}
      <ScrollArea className="h-[240px] rounded-md border border-border-subtle">
        <div className="p-2 space-y-4">
          {/* Channels Section */}
          {filteredChannels.length > 0 && (
            <div>
              <div className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">
                Channels
              </div>
              <div className="space-y-0.5">
                {filteredChannels.map((channel) => (
                  <label
                    key={channel.id}
                    className={`flex items-center gap-3 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                      disabled
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-background-elevated"
                    }`}
                  >
                    <Checkbox
                      checked={selectedIds.includes(channel.id)}
                      onCheckedChange={() => handleToggle(channel.id)}
                      disabled={disabled}
                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <div className="flex items-center gap-1.5 text-sm text-text-primary">
                      {channel.is_private ? (
                        <Lock size={14} className="text-text-tertiary" />
                      ) : (
                        <Hash size={14} className="text-text-tertiary" />
                      )}
                      <span>{channel.name}</span>
                      {channel.is_private && (
                        <span className="text-xs text-text-tertiary">(private)</span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Users Section */}
          {filteredUsers.length > 0 && (
            <div>
              <div className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">
                People
              </div>
              <div className="space-y-0.5">
                {filteredUsers.map((user) => (
                  <label
                    key={user.id}
                    className={`flex items-center gap-3 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                      disabled
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-background-elevated"
                    }`}
                  >
                    <Checkbox
                      checked={selectedIds.includes(user.id)}
                      onCheckedChange={() => handleToggle(user.id)}
                      disabled={disabled}
                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <div className="flex items-center gap-2 text-sm text-text-primary">
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.display_name || user.real_name}
                          className="w-5 h-5 rounded-full"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                          <User size={12} className="text-primary" />
                        </div>
                      )}
                      <span>{user.display_name || user.real_name || user.name}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* No results message */}
          {filteredChannels.length === 0 && filteredUsers.length === 0 && searchQuery && (
            <div className="text-center py-4 text-text-tertiary text-sm">
              No results for "{searchQuery}"
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
