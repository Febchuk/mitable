import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, ChevronRight, Zap } from "lucide-react";
import { useUsers, useDashboardPeople } from "@/console/src/hooks/queries/admin";
import type { User, DashboardPerson } from "@/console/src/services/adminService";

interface UserActivityMeta {
  lastActive: string;
  indicatorColor: string | null;
}

const RECENT_BRIGHT = "#2F7D5A";
const RECENT_MEDIUM = "#54705F";
const RECENT_DARK = "#435147";
const RECENT_DIM = "var(--text-tertiary)";

function deriveActivityFromDashboard(person: DashboardPerson): UserActivityMeta {
  if (!person.lastActiveAt) {
    return { lastActive: "—", indicatorColor: null };
  }

  const diffMs = Date.now() - new Date(person.lastActiveAt).getTime();
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(hours / 24);

  let lastActive = "—";
  if (hours < 1) lastActive = "Just now";
  else if (hours < 24) lastActive = `${hours}h ago`;
  else lastActive = days === 1 ? "Yesterday" : `${days}d ago`;

  let indicatorColor: string | null = RECENT_DIM;
  if (hours < 24) {
    indicatorColor = RECENT_BRIGHT;
  } else if (days <= 5) {
    indicatorColor = RECENT_MEDIUM;
  } else if (days <= 30) {
    indicatorColor = RECENT_DARK;
  }

  return { lastActive, indicatorColor };
}

const emptyActivity: UserActivityMeta = {
  lastActive: "—",
  indicatorColor: null,
};

function getInitial(name: string): string {
  return (name?.charAt(0) || "U").toUpperCase();
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

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 0",
        borderBottom: "var(--border-hairline)",
        cursor: "pointer",
        transition: "background 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.02)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "rgba(var(--ui-rgb), 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-primary)",
          flexShrink: 0,
        }}
      >
        {getInitial(user.name)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-primary)",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {user.name}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            marginTop: 5,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {user.jobTitle || user.role}
        </div>
      </div>

      <div style={{ flexShrink: 0, minWidth: 92, textAlign: "right" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 5,
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.2,
          }}
        >
          {activity.indicatorColor ? (
            <Zap size={11} style={{ color: activity.indicatorColor, flexShrink: 0 }} />
          ) : null}
          <span>{activity.lastActive}</span>
        </div>
      </div>

      <ChevronRight size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
    </div>
  );
}

export default function PeopleView() {
  const navigate = useNavigate();
  const { data: users = [], isLoading: loading, error } = useUsers();
  const { data: dashboardPeople = [] } = useDashboardPeople();
  const [searchQuery, setSearchQuery] = useState("");

  const dashboardMap = useMemo(() => {
    const map = new Map<string, DashboardPerson>();
    for (const person of dashboardPeople) {
      map.set(person.userId, person);
    }
    return map;
  }, [dashboardPeople]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return users.filter((user) => {
      if (
        query &&
        !(
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.role.toLowerCase().includes(query)
        )
      ) {
        return false;
      }

      return true;
    });
  }, [users, searchQuery]);

  const countLabel = loading
    ? "Loading people..."
    : `${filteredUsers.length} ${filteredUsers.length === 1 ? "person" : "people"}`;

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 26,
              color: "var(--text-primary)",
              fontWeight: 400,
              letterSpacing: "-0.3px",
              margin: 0,
            }}
          >
            People
          </h1>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              marginTop: 8,
            }}
          >
            {countLabel}
          </div>
        </div>

        <div
          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 396 }}
        >
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-tertiary)",
                pointerEvents: "none",
              }}
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search people"
              style={{
                width: "100%",
                height: 34,
                padding: "0 12px 0 36px",
                borderRadius: 8,
                border: "var(--border-subtle)",
                background: "var(--bg-raised)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          <button
            onClick={() => navigate("/people/new")}
            style={{
              height: 34,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
              borderRadius: 8,
              border: "var(--border-subtle)",
              background: "var(--bg-overlay)",
              color: "var(--text-primary)",
              fontSize: 13,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Plus size={14} />
            Add user
          </button>
        </div>
      </div>

      <div style={{ borderTop: "var(--border-hairline)" }}>
        {loading ? (
          <div style={{ padding: "64px 0", textAlign: "center" }}>
            <div
              className="animate-spin"
              style={{
                width: 24,
                height: 24,
                margin: "0 auto 12px",
                borderRadius: "50%",
                border: "2px solid rgba(var(--status-success-rgb), 0.2)",
                borderTopColor: RECENT_BRIGHT,
              }}
            />
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Loading people...</div>
          </div>
        ) : error ? (
          <div
            style={{
              padding: "64px 0",
              textAlign: "center",
              fontSize: 13,
              color: "var(--status-error)",
            }}
          >
            Error: {error.message}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: "64px 0", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {searchQuery ? `No people found matching "${searchQuery}"` : "No users found"}
            </div>
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
  );
}
