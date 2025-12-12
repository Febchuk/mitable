import { useState, useRef, useEffect, useMemo } from "react";
import { Search, User, Hash, Lock, X } from "lucide-react";
import {
  DEMO_RECIPIENTS,
  getRecipientById,
  DEMO_CONFIG,
  type Recipient,
} from "@/console/src/data/demoRecipients";

interface RecipientSelectorProps {
  values: string[];
  onChange: (recipientIds: string[]) => void;
}

export default function RecipientSelector({
  values,
  onChange,
}: RecipientSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get selected recipients for chips
  const selectedRecipients = values
    .map((id) => getRecipientById(id))
    .filter(Boolean) as Recipient[];

  // Filter recipients based on search query, excluding already selected
  const filteredRecipients = useMemo(() => {
    const available = DEMO_RECIPIENTS.filter((r) => !values.includes(r.id));
    if (!searchQuery.trim()) return available;
    const lowerQuery = searchQuery.toLowerCase();
    return available.filter((r) => r.name.toLowerCase().includes(lowerQuery));
  }, [searchQuery, values]);

  // Group by type
  const users = filteredRecipients.filter((r) => r.type === "user");
  const channels = filteredRecipients.filter((r) => r.type === "channel");

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (recipient: Recipient) => {
    onChange([...values, recipient.id]);
    setSearchQuery("");
    // Keep dropdown open for adding more
  };

  const handleRemove = (id: string) => {
    onChange(values.filter((v) => v !== id));
  };

  const getRecipientIcon = (recipient: Recipient) => {
    if (recipient.type === "user") {
      return <User size={12} className="text-text-tertiary" />;
    }
    return recipient.isPrivate ? (
      <Lock size={12} className="text-text-tertiary" />
    ) : (
      <Hash size={12} className="text-text-tertiary" />
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Selected Recipients as Chips */}
      {selectedRecipients.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedRecipients.map((recipient) => (
            <div
              key={recipient.id}
              className="flex items-center gap-1.5 px-2 py-1 bg-primary/20 rounded-full text-xs text-text-primary"
            >
              {getRecipientIcon(recipient)}
              <span>{recipient.name}</span>
              <button
                onClick={() => handleRemove(recipient.id)}
                className="hover:bg-white/10 rounded-full p-0.5 transition-colors"
              >
                <X size={10} className="text-text-tertiary hover:text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search Input */}
      <div
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 bg-background-elevated border border-border-subtle rounded-lg text-sm cursor-text hover:border-primary/50 transition-colors"
      >
        <Search size={14} className="text-text-tertiary flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={
            values.length > 0
              ? DEMO_CONFIG.ui.recipientSelector.addMorePlaceholder
              : DEMO_CONFIG.ui.recipientSelector.searchPlaceholder
          }
          className="flex-1 bg-transparent text-text-primary placeholder-text-tertiary focus:outline-none text-sm"
        />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1A1A1A] border border-border-subtle rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Results */}
          <div className="max-h-48 overflow-y-auto">
            {filteredRecipients.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-text-tertiary">
                {values.length === DEMO_RECIPIENTS.length
                  ? DEMO_CONFIG.ui.recipientSelector.allSelectedMessage
                  : DEMO_CONFIG.ui.recipientSelector.noResultsMessage}
              </div>
            ) : (
              <>
                {/* Users Section */}
                {users.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wider">
                      {DEMO_CONFIG.ui.recipientSelector.usersHeader}
                    </div>
                    {users.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => handleSelect(user)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-white/5 transition-colors"
                      >
                        <User size={14} className="text-text-tertiary" />
                        <span>{user.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Channels Section */}
                {channels.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wider border-t border-border-subtle mt-1 pt-1.5">
                      {DEMO_CONFIG.ui.recipientSelector.channelsHeader}
                    </div>
                    {channels.map((channel) => (
                      <button
                        key={channel.id}
                        onClick={() => handleSelect(channel)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-white/5 transition-colors"
                      >
                        {channel.isPrivate ? (
                          <Lock size={14} className="text-text-tertiary" />
                        ) : (
                          <Hash size={14} className="text-text-tertiary" />
                        )}
                        <span>{channel.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
