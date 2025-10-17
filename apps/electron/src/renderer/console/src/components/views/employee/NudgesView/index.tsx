import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNudges } from "@/console/src/hooks/queries/nudges";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks}w ago`;
  }
}

export default function NudgesView() {
  const { data: nudges = [], isLoading, error } = useNudges();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter nudges based on search query
  const filteredNudges = nudges.filter(
    (nudge) =>
      nudge.expertName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      nudge.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-center text-text-secondary">Loading nudges...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-center text-status-error">Error loading nudges</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <h1 className="text-4xl font-bold text-text-primary">Your nudge history</h1>

      {/* Search Bar */}
      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
          size={20}
        />
        <Input
          placeholder="Search your escalations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-12 bg-background-elevated border-transparent text-text-primary placeholder:text-text-secondary"
        />
      </div>

      {/* Nudges Grid */}
      <div className="grid grid-cols-2 gap-6">
        {filteredNudges.map((nudge) => (
          <div
            key={nudge.id}
            onClick={() => navigate(`/nudges/${nudge.id}`)}
            className="bg-background-elevated rounded-lg border border-border-subtle p-6 hover:bg-background-elevated/80 transition-colors cursor-pointer space-y-4"
          >
            {/* Top: Avatar + Name + Role */}
            <div className="flex items-start gap-3">
              {/* Avatar with initials and online indicator */}
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-text-tertiary/20 flex items-center justify-center">
                  <span className="text-white font-semibold text-sm">
                    {getInitials(nudge.expertName)}
                  </span>
                </div>
                {/* Online indicator dot */}
                <div
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background-elevated ${
                    nudge.online ? "bg-status-success" : "bg-status-error"
                  }`}
                />
              </div>

              {/* Expert info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-text-primary font-semibold text-base">{nudge.expertName}</h3>
                <p className="text-text-secondary text-sm">{nudge.expertRole}</p>
              </div>
            </div>

            {/* Description */}
            <p className="text-text-primary text-sm leading-relaxed">{nudge.description}</p>

            {/* Bottom: Timestamp + Status Badge */}
            <div className="flex items-center justify-between">
              <span className="text-text-secondary text-sm">
                {formatTimestamp(nudge.timestamp)}
              </span>
              <Badge
                className={
                  nudge.status === "resolved"
                    ? "bg-status-success/20 text-status-success border-transparent hover:bg-status-success/20"
                    : "bg-status-warning/20 text-status-warning border-transparent hover:bg-status-warning/20"
                }
              >
                {nudge.status === "resolved" ? "Resolved" : "Waiting"}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredNudges.length === 0 && (
        <div className="bg-background-elevated rounded-lg border border-border-subtle p-12">
          <p className="text-text-secondary text-center">
            {searchQuery ? `No nudges found matching "${searchQuery}"` : "No nudges yet"}
          </p>
        </div>
      )}
    </div>
  );
}
