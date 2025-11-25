import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNudges } from "@/console/src/hooks/queries/nudges";
import { Search, Plus, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface NudgeListProps {
  selectedNudgeId: string | null;
  onSelectNudge: (id: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
}

export default function NudgeList({ selectedNudgeId, onSelectNudge }: NudgeListProps) {
  const { data: nudges = [], isLoading } = useNudges();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter nudges based on search query
  const filteredNudges = nudges.filter(
    (nudge) =>
      nudge.expertName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      nudge.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Auto-select first nudge when it loads
  useEffect(() => {
    if (!selectedNudgeId && filteredNudges.length > 0) {
      onSelectNudge(filteredNudges[0].id);
    }
  }, [filteredNudges.length, selectedNudgeId, onSelectNudge]);

  return (
    <div className="w-96 border-r border-primary/20 bg-[#0f0d15] flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-primary/20 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-bold text-white">Nudges</h2>
          </div>
          <Button
            onClick={() => navigate("/nudges/new")}
            size="sm"
            className="h-9 w-9 p-0 bg-gradient-to-r from-purple-600 to-blue-600 hover:shadow-glow-purple shadow-lg hover:scale-105 transition-transform"
          >
            <Plus size={18} />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
            size={16}
          />
          <Input
            placeholder="Search nudges..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-black/20 border-white/10 text-sm focus:border-primary/50 focus:ring-primary/20 placeholder:text-white/30"
          />
        </div>
      </div>

      {/* Nudge List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="p-6 text-center">
            <div className="w-8 h-8 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-text-secondary text-sm">Loading nudges...</p>
          </div>
        ) : filteredNudges.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-text-secondary text-sm">
              {searchQuery ? "No nudges found" : "No nudges yet"}
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {filteredNudges.map((nudge) => {
              const isSelected = selectedNudgeId === nudge.id;

              return (
                <button
                  key={nudge.id}
                  onClick={() => onSelectNudge(nudge.id)}
                  className={`
                    w-full text-left p-4 rounded-xl transition-all duration-200
                    ${
                      isSelected
                        ? "bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-2 border-primary shadow-lg shadow-primary/20"
                        : "bg-[#1a1625] border border-primary/10 hover:border-primary/30 hover:bg-[#231d2e]"
                    }
                  `}
                >
                  {/* Expert Info */}
                  <div className="flex items-start gap-3 mb-3">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                        <span className="text-white font-semibold text-xs">
                          {getInitials(nudge.expertName)}
                        </span>
                      </div>
                      {/* Online indicator */}
                      <div
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 ${
                          isSelected ? "border-purple-600/20" : "border-[#1a1625]"
                        } ${nudge.online ? "bg-green-500" : "bg-gray-500"}`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold text-sm line-clamp-1">
                        {nudge.expertName}
                      </h3>
                      <p className="text-text-tertiary text-xs line-clamp-1">
                        {nudge.expertRole}
                      </p>
                    </div>

                    {/* Status Badge */}
                    <Badge
                      className={`text-xs px-2 py-0.5 ${
                        nudge.status === "resolved"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-yellow-500/20 text-yellow-400"
                      }`}
                    >
                      {nudge.status === "resolved" ? "✓" : "⏱"}
                    </Badge>
                  </div>

                  {/* Description */}
                  <p className="text-text-secondary text-xs line-clamp-2 mb-2">
                    {nudge.description}
                  </p>

                  {/* Timestamp */}
                  <div className="text-xs text-text-tertiary">
                    {formatTimestamp(nudge.timestamp)}
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
