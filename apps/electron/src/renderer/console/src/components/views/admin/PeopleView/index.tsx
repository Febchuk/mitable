import { useMemo, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, Plus, ChevronRight, Zap, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUsers, useDashboardPeople } from "@/console/src/hooks/queries/admin";
import type { User, DashboardPerson } from "@/console/src/services/adminService";

type MoodKey = "focused" | "collaborative" | "meeting-heavy" | "ramping-up";

interface ActiveFilters {
  roles: Set<string>;
  moods: Set<MoodKey>;
  activityStatus: "all" | "has-data" | "no-data";
}

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

const CATEGORY_COLORS: Record<string, string> = {
  development: "#6366F1",
  communication: "#F472B6",
  research: "#F59E0B",
  design: "#818CF8",
  review: "#34D399",
  documentation: "#60A5FA",
  other: "#A1A1A1",
};

function deriveMood(person: DashboardPerson): UserActivityMeta["mood"] {
  if (person.meetingPercentage > 50) return "meeting-heavy";
  if (person.workPercentage > 70) return "focused";
  // Use per-day average if available, otherwise fall back to total
  const avgPerDay = person.avgActiveMinutesPerDay ?? person.totalActiveMinutes;
  if (avgPerDay < 60) return "ramping-up";
  return "collaborative";
}

function deriveActivityFromDashboard(person: DashboardPerson): UserActivityMeta {
  const topCategory = (person.categoryBreakdown || [])[0];
  const topTopic = topCategory
    ? topCategory.category.charAt(0).toUpperCase() + topCategory.category.slice(1)
    : "General";

  const breakdown = (person.categoryBreakdown || []).slice(0, 3).map((c) => ({
    color: CATEGORY_COLORS[c.category] || CATEGORY_COLORS.other,
    pct: c.percentage,
  }));
  if (breakdown.length === 0) {
    breakdown.push(
      { color: "#6366F1", pct: person.workPercentage },
      { color: "#F59E0B", pct: person.meetingPercentage }
    );
  }

  const highlight = person.recentHighlight || "No recent activity";

  // Format lastActive as relative time
  let lastActive = "—";
  if (person.lastActiveAt) {
    const diff = Date.now() - new Date(person.lastActiveAt).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) lastActive = "Just now";
    else if (hours < 24) lastActive = `${hours}h ago`;
    else {
      const days = Math.floor(hours / 24);
      lastActive = days === 1 ? "Yesterday" : `${days}d ago`;
    }
  }

  return {
    lastActive,
    topTopic,
    recentHighlight: highlight.length > 60 ? highlight.slice(0, 57) + "..." : highlight,
    dayBreakdown: breakdown,
    mood: deriveMood(person),
    docsThisWeek: 0,
    questionsAsked: 0,
  };
}

const emptyActivity: UserActivityMeta = {
  lastActive: "—",
  topTopic: "No data",
  recentHighlight: "No activity tracked yet",
  dayBreakdown: [{ color: "#A1A1A1", pct: 100 }],
  mood: "ramping-up",
  docsThisWeek: 0,
  questionsAsked: 0,
};

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

function PersonRow({
  user,
  onClick,
  dashboardPerson,
}: {
  user: User;
  onClick: () => void;
  dashboardPerson?: DashboardPerson;
}) {
  const activity = dashboardPerson ? deriveActivityFromDashboard(dashboardPerson) : emptyActivity;
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
        <p className="text-xs text-text-secondary truncate">{user.jobTitle || user.role}</p>
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
  const { data: dashboardPeople = [] } = useDashboardPeople();
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<ActiveFilters>(() => {
    try {
      const saved = localStorage.getItem("mitable:peopleFilters");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          roles: new Set(parsed.roles || []),
          moods: new Set(parsed.moods || []),
          activityStatus: parsed.activityStatus || "all",
        };
      }
    } catch {
      /* ignore */
    }
    return { roles: new Set(), moods: new Set(), activityStatus: "all" };
  });
  const [filterOpen, setFilterOpen] = useState(false);

  // Persist filters to localStorage on change
  useEffect(() => {
    localStorage.setItem(
      "mitable:peopleFilters",
      JSON.stringify({
        roles: [...filters.roles],
        moods: [...filters.moods],
        activityStatus: filters.activityStatus,
      })
    );
  }, [filters]);

  // Build lookup map: userId → DashboardPerson
  const dashboardMap = useMemo(() => {
    const map = new Map<string, DashboardPerson>();
    for (const p of dashboardPeople) {
      map.set(p.userId, p);
    }
    return map;
  }, [dashboardPeople]);

  // Derive available filter options from data
  const filterOptions = useMemo(() => {
    const roles = [...new Set(users.map((u) => u.role))].sort();
    const moods: MoodKey[] = ["focused", "collaborative", "meeting-heavy", "ramping-up"];
    return { roles, moods };
  }, [users]);

  // Count active filters
  const activeFilterCount =
    filters.roles.size + filters.moods.size + (filters.activityStatus !== "all" ? 1 : 0);

  const toggleRole = useCallback((role: string) => {
    setFilters((prev) => {
      const next = new Set(prev.roles);
      next.has(role) ? next.delete(role) : next.add(role);
      return { ...prev, roles: next };
    });
  }, []);

  const toggleMood = useCallback((mood: MoodKey) => {
    setFilters((prev) => {
      const next = new Set(prev.moods);
      next.has(mood) ? next.delete(mood) : next.add(mood);
      return { ...prev, moods: next };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ roles: new Set(), moods: new Set(), activityStatus: "all" });
  }, []);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return users.filter((user) => {
      // Text search
      if (
        query &&
        !(
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.role.toLowerCase().includes(query)
        )
      )
        return false;

      // Role filter
      if (filters.roles.size > 0 && !filters.roles.has(user.role)) return false;

      // Mood & activity status filters (need dashboard data)
      const dp = dashboardMap.get(user.id);
      const mood: MoodKey = dp ? deriveMood(dp) : "ramping-up";
      const hasData = dp?.hasActivity ?? false;

      if (filters.moods.size > 0 && !filters.moods.has(mood)) return false;
      if (filters.activityStatus === "has-data" && !hasData) return false;
      if (filters.activityStatus === "no-data" && hasData) return false;

      return true;
    });
  }, [users, searchQuery, filters, dashboardMap]);

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
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="gap-2 bg-background-elevated border-transparent text-text-secondary hover:text-text-primary hover:bg-background-elevated/80"
              >
                <Filter size={20} />
                <span className="font-medium">Filter</span>
                {activeFilterCount > 0 && (
                  <span className="ml-1 text-[10px] font-bold bg-indigo text-white rounded-full w-4 h-4 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-72 bg-[#1A1A1A] border-white/10 text-white p-0"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Filters
                </span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-[10px] text-indigo-light hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Activity Status */}
              <div className="px-4 py-3 border-b border-white/10">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                  Activity
                </p>
                <div className="flex gap-1">
                  {(["all", "has-data", "no-data"] as const).map((status) => {
                    const label = { all: "All", "has-data": "Has data", "no-data": "No data" }[
                      status
                    ];
                    const active = filters.activityStatus === status;
                    return (
                      <button
                        key={status}
                        onClick={() => setFilters((p) => ({ ...p, activityStatus: status }))}
                        className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                          active
                            ? "bg-indigo text-white"
                            : "bg-white/5 text-text-secondary hover:bg-white/10"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mood */}
              <div className="px-4 py-3 border-b border-white/10">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                  Mood
                </p>
                <div className="space-y-1">
                  {filterOptions.moods.map((mood) => {
                    const active = filters.moods.has(mood);
                    const cfg = moodConfig[mood];
                    return (
                      <button
                        key={mood}
                        onClick={() => toggleMood(mood)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left hover:bg-white/5 transition-colors"
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                            active ? "bg-indigo border-indigo" : "border-white/20"
                          }`}
                        >
                          {active && <Check size={10} className="text-white" />}
                        </div>
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cfg.color}`}
                        >
                          {cfg.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Role */}
              <div className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                  Role
                </p>
                <div className="space-y-1 max-h-[140px] overflow-y-auto">
                  {filterOptions.roles.map((role) => {
                    const active = filters.roles.has(role);
                    return (
                      <button
                        key={role}
                        onClick={() => toggleRole(role)}
                        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left hover:bg-white/5 transition-colors"
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                            active ? "bg-indigo border-indigo" : "border-white/20"
                          }`}
                        >
                          {active && <Check size={10} className="text-white" />}
                        </div>
                        <span className="text-xs text-text-primary capitalize">{role}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>
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
            filteredUsers.map((user) => (
              <PersonRow
                key={user.id}
                user={user}
                onClick={() => navigate(`/people/${user.id}`)}
                dashboardPerson={dashboardMap.get(user.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
