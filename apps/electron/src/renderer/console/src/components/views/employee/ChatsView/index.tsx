import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, MessageSquare } from "lucide-react";
import { groupByDay } from "@/console/src/components/shared/groupByDay";

interface DemoChat {
  id: string;
  title: string;
  timestamp: Date;
}

const now = new Date();
function daysAgo(n: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, 14, 30);
}

const DEMO_CHATS: DemoChat[] = [
  { id: "1", title: "What should I work on today?", timestamp: daysAgo(0) },
  { id: "2", title: "Summarise my week", timestamp: daysAgo(0) },
  { id: "3", title: "Draft standup update", timestamp: daysAgo(1) },
  { id: "4", title: "Help me prep for 1:1", timestamp: daysAgo(2) },
  { id: "5", title: "Review PR feedback", timestamp: daysAgo(3) },
  { id: "6", title: "Explain the new onboarding flow", timestamp: daysAgo(4) },
  { id: "7", title: "Write a Slack message to the team", timestamp: daysAgo(5) },
  { id: "8", title: "Compare Q1 and Q2 roadmap progress", timestamp: daysAgo(8) },
  { id: "9", title: "Brainstorm feature names", timestamp: daysAgo(12) },
  { id: "10", title: "Debug the Notion sync issue", timestamp: daysAgo(15) },
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

export default function ChatsView() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return DEMO_CHATS;
    const q = searchQuery.toLowerCase();
    return DEMO_CHATS.filter((c) => c.title.toLowerCase().includes(q));
  }, [searchQuery]);

  const grouped = useMemo(() => groupByDay(filtered, (c) => c.timestamp), [filtered]);

  return (
    <div className="app-no-drag" style={{ display: "flex", flexDirection: "column" }}>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 32,
              color: "var(--text-primary)",
              fontWeight: 400,
              letterSpacing: "-0.4px",
              lineHeight: 1,
              margin: 0,
            }}
          >
            Chats
          </h1>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 15,
              color: "var(--text-tertiary)",
              fontWeight: 400,
              fontStyle: "italic",
              margin: "12px 0 0",
            }}
          >
            Your conversations with Mitable
          </p>
        </div>

        <button
          onClick={() => navigate("/agent")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            border: "var(--border-subtle)",
            background: "transparent",
            color: "var(--text-primary)",
            fontSize: 12,
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
            marginTop: 4,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.05)";
            e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.12)";
          }}
        >
          <Plus size={12} strokeWidth={2} />
          New
        </button>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        <Search
          size={14}
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
          placeholder="Search chats..."
          style={{
            width: "100%",
            padding: "8px 12px 8px 34px",
            borderRadius: 8,
            border: "var(--border-subtle)",
            background: "rgba(var(--ui-rgb), 0.03)",
            color: "var(--text-primary)",
            fontSize: 13,
            fontFamily: "var(--font-sans)",
            outline: "none",
          }}
        />
      </div>

      {/* Chat list */}
      {grouped.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {grouped.map((group) => (
            <div key={group.label}>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  fontWeight: 500,
                  marginBottom: 8,
                }}
              >
                {group.label}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {group.items.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => navigate(`/chats/${chat.id}`)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      transition: "background 0.12s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.04)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text-primary)",
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {chat.title}
                    </div>

                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text-tertiary)",
                        flexShrink: 0,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatTime(chat.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ paddingTop: 40 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "48px 0",
              borderRadius: 12,
              border: "0.5px dashed rgba(var(--ui-rgb), 0.1)",
            }}
          >
            <MessageSquare size={20} style={{ color: "var(--text-tertiary)", marginBottom: 12 }} />
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              No chats matching &ldquo;{searchQuery}&rdquo;
            </p>
            <p
              style={{
                color: "var(--text-tertiary)",
                fontSize: 12,
                textAlign: "center",
                maxWidth: 260,
                lineHeight: 1.5,
              }}
            >
              Try a different search term
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
