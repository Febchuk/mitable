import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, Plus, ChevronRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUsers } from "@/console/src/hooks/queries/admin";
import type { User } from "@/console/src/services/adminService";

// Mock activity metadata per user (keyed by index for demo)
interface UserActivityMeta {
  lastActive: string;
  topTopic: string;
  recentHighlight: string;
  dayBreakdown: { color: string; pct: number }[];
  mood: "focused" | "collaborative" | "meeting-heavy" | "ramping-up";
  docsThisWeek: number;
  questionsAsked: number;
}

const moodConfig: Record<UserActivityMeta["mood"], { label: string; color: string }> = {
  focused: { label: "Focused", color: "bg-emerald/15 text-emerald" },
  collaborative: { label: "Collaborative", color: "bg-indigo/15 text-indigo-light" },
  "meeting-heavy": { label: "Meeting-heavy", color: "bg-yellow-500/15 text-yellow-400" },
  "ramping-up": { label: "Ramping up", color: "bg-rose/15 text-rose" },
};

const mockActivities: UserActivityMeta[] = [
  {
    lastActive: "2 min ago",
    topTopic: "Technical Writing",
    recentHighlight: "Completed API docs v2",
    dayBreakdown: [
      { color: "#6366F1", pct: 45 },
      { color: "#F59E0B", pct: 20 },
      { color: "#34D399", pct: 35 },
    ],
    mood: "focused",
    docsThisWeek: 4,
    questionsAsked: 2,
  },
  {
    lastActive: "15 min ago",
    topTopic: "Customer Support",
    recentHighlight: "Resolved 8 tickets today",
    dayBreakdown: [
      { color: "#F472B6", pct: 50 },
      { color: "#F59E0B", pct: 25 },
      { color: "#6366F1", pct: 25 },
    ],
    mood: "collaborative",
    docsThisWeek: 1,
    questionsAsked: 5,
  },
  {
    lastActive: "1h ago",
    topTopic: "Sprint Planning",
    recentHighlight: "Led backlog grooming session",
    dayBreakdown: [
      { color: "#F59E0B", pct: 55 },
      { color: "#6366F1", pct: 30 },
      { color: "#818CF8", pct: 15 },
    ],
    mood: "meeting-heavy",
    docsThisWeek: 2,
    questionsAsked: 1,
  },
  {
    lastActive: "3h ago",
    topTopic: "Lead Follow-ups",
    recentHighlight: "Booked 3 demo calls",
    dayBreakdown: [
      { color: "#818CF8", pct: 40 },
      { color: "#F472B6", pct: 35 },
      { color: "#F59E0B", pct: 25 },
    ],
    mood: "collaborative",
    docsThisWeek: 0,
    questionsAsked: 3,
  },
  {
    lastActive: "Just now",
    topTopic: "Bug Triage",
    recentHighlight: "Triaged 5 P1 issues",
    dayBreakdown: [
      { color: "#34D399", pct: 50 },
      { color: "#6366F1", pct: 30 },
      { color: "#F59E0B", pct: 20 },
    ],
    mood: "focused",
    docsThisWeek: 1,
    questionsAsked: 0,
  },
  {
    lastActive: "30 min ago",
    topTopic: "Report Writing",
    recentHighlight: "Submitted Q4 analysis",
    dayBreakdown: [
      { color: "#60A5FA", pct: 45 },
      { color: "#6366F1", pct: 35 },
      { color: "#F59E0B", pct: 20 },
    ],
    mood: "focused",
    docsThisWeek: 3,
    questionsAsked: 1,
  },
  {
    lastActive: "Yesterday",
    topTopic: "Onboarding",
    recentHighlight: "Completed setup checklist",
    dayBreakdown: [
      { color: "#F472B6", pct: 30 },
      { color: "#34D399", pct: 40 },
      { color: "#F59E0B", pct: 30 },
    ],
    mood: "ramping-up",
    docsThisWeek: 0,
    questionsAsked: 8,
  },
  {
    lastActive: "5 min ago",
    topTopic: "Customer Support",
    recentHighlight: "Updated knowledge base",
    dayBreakdown: [
      { color: "#F472B6", pct: 40 },
      { color: "#6366F1", pct: 30 },
      { color: "#34D399", pct: 30 },
    ],
    mood: "collaborative",
    docsThisWeek: 2,
    questionsAsked: 4,
  },
];

function getActivityForUser(index: number): UserActivityMeta {
  return mockActivities[index % mockActivities.length];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function MiniActivityBar({ breakdown }: { breakdown: UserActivityMeta["dayBreakdown"] }) {
  return (
    <div className="flex h-1.5 w-20 rounded-full overflow-hidden">
      {breakdown.map((seg, i) => (
        <div key={i} style={{ width: `${seg.pct}%`, backgroundColor: seg.color }} />
      ))}
    </div>
  );
}

function PersonRow({ user, index, onClick }: { user: User; index: number; onClick: () => void }) {
  const activity = getActivityForUser(index);
  const moodStyle = moodConfig[activity.mood];

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-5 py-4 border-b border-stroke-subtle hover:bg-canvas-overlay cursor-pointer transition-colors duration-normal group"
    >
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-indigo/20 flex items-center justify-center text-xs font-semibold text-indigo-light shrink-0">
        {getInitials(user.name)}
      </div>

      {/* Name + role + email */}
      <div className="w-[200px] shrink-0">
        <p className="text-sm font-semibold text-text-primary">{user.name}</p>
        <p className="text-xs text-text-secondary truncate">{user.role}</p>
      </div>

      {/* Recent highlight */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-tertiary mb-0.5">Recent</p>
        <p className="text-sm text-text-primary truncate">{activity.recentHighlight}</p>
      </div>

      {/* Top topic + activity bar */}
      <div className="w-[140px] shrink-0">
        <p className="text-xs text-text-tertiary mb-1">Top activity</p>
        <p className="text-xs text-text-primary mb-1">{activity.topTopic}</p>
        <MiniActivityBar breakdown={activity.dayBreakdown} />
      </div>

      {/* Mood tag */}
      <div className="w-[110px] shrink-0">
        <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${moodStyle.color}`}>
          {moodStyle.label}
        </span>
      </div>

      {/* Last active */}
      <div className="w-[80px] shrink-0 text-right">
        <div className="flex items-center gap-1 justify-end">
          <Zap size={10} className="text-emerald" />
          <span className="text-xs text-text-secondary">{activity.lastActive}</span>
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight
        size={16}
        className="text-text-tertiary group-hover:text-text-secondary transition-colors shrink-0"
      />
    </div>
  );
}

export default function PeopleView() {
  const navigate = useNavigate();
  const { data: users = [], isLoading: loading, error } = useUsers();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="p-8 pb-0 space-y-6 shrink-0">
        {/* Header */}
        <h1 className="text-4xl font-bold text-text-primary">People</h1>

        {/* Search and Actions Bar */}
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
              size={20}
            />
            <Input
              placeholder="Search people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 bg-background-elevated border-transparent text-text-primary placeholder:text-text-secondary"
            />
          </div>
          <Button
            variant="outline"
            className="gap-2 bg-background-elevated border-transparent text-text-secondary hover:text-text-primary hover:bg-background-elevated/80"
          >
            <Filter size={20} />
            <span className="font-medium">Filter</span>
          </Button>
          <Button
            className="gap-2 bg-primary text-white hover:bg-primary/90"
            onClick={() => navigate("/people/new")}
          >
            <Plus size={20} />
            <span>Add New User</span>
          </Button>
        </div>

        {/* Column labels */}
        <div className="flex items-center gap-4 px-5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
          <div className="w-10 shrink-0" />
          <div className="w-[200px] shrink-0">Name</div>
          <div className="flex-1">Recent Highlight</div>
          <div className="w-[140px] shrink-0">Top Activity</div>
          <div className="w-[110px] shrink-0">Mood</div>
          <div className="w-[80px] shrink-0 text-right">Active</div>
          <div className="w-4 shrink-0" />
        </div>
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto mt-2">
        <div className="rounded-xl border border-stroke-subtle bg-canvas-raised mx-8 mb-8 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-3" />
                <p className="text-sm text-text-secondary">Loading people...</p>
              </div>
            </div>
          ) : error ? (
            <div className="text-center text-status-error py-12">Error: {error.message}</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center text-text-secondary py-12">
              {searchQuery ? `No people found matching "${searchQuery}"` : "No users found"}
            </div>
          ) : (
            filteredUsers.map((user, i) => (
              <PersonRow
                key={user.id}
                user={user}
                index={i}
                onClick={() => navigate(`/people/${user.id}`)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
