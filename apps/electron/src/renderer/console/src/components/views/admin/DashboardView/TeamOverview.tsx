import { FileText, Video, Clock } from "lucide-react";
import type { UserActivity } from "./mockData";

interface TeamOverviewProps {
  users: UserActivity[];
}

const activityTypeColors: Record<string, string> = {
  authoring: "bg-indigo/20 text-indigo-light",
  reviewing: "bg-indigo/10 text-indigo",
  meeting: "bg-yellow-500/15 text-yellow-400",
  research: "bg-emerald/15 text-emerald",
  communication: "bg-rose/15 text-rose",
};

function StatusDot({ status }: { status: UserActivity["status"] }) {
  const color = {
    active: "bg-emerald",
    idle: "bg-yellow-400",
    offline: "bg-text-tertiary",
  }[status];

  return <div className={`w-2 h-2 rounded-full ${color}`} />;
}

function UserCard({ user }: { user: UserActivity }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-4 hover:border-stroke transition-colors duration-normal">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />

      {/* Header: avatar + name + status */}
      <div className="relative flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-indigo/20 flex items-center justify-center text-xs font-semibold text-indigo-light shrink-0">
            {user.avatar}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">{user.name}</span>
              <StatusDot status={user.status} />
            </div>
            <span className="text-xs text-text-secondary">{user.role}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <Clock size={12} />
          {user.totalHoursToday}h
        </div>
      </div>

      {/* Top activities */}
      <div className="relative space-y-1.5 mb-3">
        {user.topActivities.map((activity, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${activityTypeColors[activity.type] || "bg-canvas-muted text-text-secondary"}`}
              >
                {activity.type.charAt(0).toUpperCase() + activity.type.slice(1)}
              </span>
              <span className="text-xs text-text-secondary truncate">{activity.label}</span>
            </div>
            <span className="text-xs text-text-tertiary shrink-0">{activity.duration}</span>
          </div>
        ))}
      </div>

      {/* Footer stats */}
      <div className="relative flex items-center gap-4 pt-2 border-t border-stroke-subtle">
        {user.meetings.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-text-secondary">
            <Video size={12} />
            {user.meetings.length} meeting{user.meetings.length !== 1 ? "s" : ""}
          </div>
        )}
        {user.docsCreated > 0 && (
          <div className="flex items-center gap-1 text-xs text-text-secondary">
            <FileText size={12} />
            {user.docsCreated} doc{user.docsCreated !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TeamOverview({ users }: TeamOverviewProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-text-primary mb-3">
        Team Activity
        <span className="text-text-secondary font-normal ml-2">Today</span>
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {users.map((user) => (
          <UserCard key={user.id} user={user} />
        ))}
      </div>
    </div>
  );
}
