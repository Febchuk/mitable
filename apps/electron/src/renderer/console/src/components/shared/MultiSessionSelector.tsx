/**
 * MultiSessionSelector
 *
 * A multi-select component for choosing monitoring sessions.
 * Used in GenerateDocDialog for multi-session document generation.
 */

import { useState, useMemo } from "react";
import { useSessions } from "@/console/src/hooks/queries/monitoring";
import { Search, Activity, CheckCircle, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MultiSessionSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  maxHeight?: string;
}

// Format relative date
function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MultiSessionSelector({
  selectedIds,
  onChange,
  maxHeight = "300px",
}: MultiSessionSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: sessions = [], isLoading } = useSessions();

  // Filter sessions that are completed (ready or delivered) and match search
  const filteredSessions = useMemo(() => {
    const completedSessions = sessions.filter(
      (s) => s.status === "ready" || s.status === "delivered"
    );

    if (!searchQuery) return completedSessions;

    const query = searchQuery.toLowerCase();
    return completedSessions.filter((s) => {
      const name = (s.name || "Work Session").toLowerCase();
      return name.includes(query);
    });
  }, [sessions, searchQuery]);

  // Toggle session selection
  const toggleSession = (sessionId: string) => {
    if (selectedIds.includes(sessionId)) {
      onChange(selectedIds.filter((id) => id !== sessionId));
    } else {
      onChange([...selectedIds, sessionId]);
    }
  };

  // Select/deselect all visible sessions
  const toggleAll = () => {
    const allVisibleIds = filteredSessions.map((s) => s.id);
    const allSelected = allVisibleIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      // Deselect all visible
      onChange(selectedIds.filter((id) => !allVisibleIds.includes(id)));
    } else {
      // Select all visible
      const newIds = new Set([...selectedIds, ...allVisibleIds]);
      onChange(Array.from(newIds));
    }
  };

  if (isLoading) {
    return (
      <div className="h-32 flex items-center justify-center text-text-secondary">
        Loading sessions...
      </div>
    );
  }

  const allVisibleSelected =
    filteredSessions.length > 0 &&
    filteredSessions.every((s) => selectedIds.includes(s.id));

  return (
    <div className="space-y-3">
      {/* Search and Select All */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            size={16}
          />
          <Input
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-background-elevated border-border-subtle text-sm"
          />
        </div>
        {filteredSessions.length > 0 && (
          <button
            onClick={toggleAll}
            className="text-xs text-primary hover:text-primary/80"
          >
            {allVisibleSelected ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      {/* Selection Count */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {selectedIds.length} session{selectedIds.length !== 1 ? "s" : ""} selected
          </Badge>
        </div>
      )}

      {/* Sessions List */}
      <ScrollArea style={{ maxHeight }} className="border border-border-subtle rounded-lg">
        {filteredSessions.length === 0 ? (
          <div className="p-8 text-center text-text-secondary text-sm">
            {sessions.length === 0
              ? "No completed sessions available"
              : "No sessions match your search"}
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {filteredSessions.map((session) => {
              const isSelected = selectedIds.includes(session.id);
              return (
                <label
                  key={session.id}
                  className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-background-secondary/50 transition-colors ${
                    isSelected ? "bg-primary/5" : ""
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSession(session.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Activity size={14} className="text-primary flex-shrink-0" />
                      <span className="text-sm font-medium text-text-primary truncate">
                        {session.name || "Work Session"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-text-secondary">
                      <span>{formatRelativeDate(session.startedAt)}</span>
                      {session.duration?.formatted && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {session.duration.formatted}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {isSelected && (
                    <CheckCircle size={16} className="text-primary flex-shrink-0" />
                  )}
                </label>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
