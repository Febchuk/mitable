import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Search, Trash2 } from "lucide-react";
import { groupByDay } from "@/console/src/components/shared/groupByDay";
import type { AgentConversationSummary } from "../../../../services/agentChatService";

interface ChatHistorySidebarProps {
  conversations: AgentConversationSummary[];
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export default function ChatHistorySidebar({
  conversations,
  onDelete,
  onRename,
}: ChatHistorySidebarProps) {
  const navigate = useNavigate();
  const { chatId } = useParams<{ chatId: string }>();
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => (c.title || "").toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const grouped = useMemo(() => groupByDay(filtered, (c) => c.updatedAt), [filtered]);

  return (
    <div
      style={{
        width: 260,
        minWidth: 260,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRight: "var(--border-hairline)",
        background: "var(--bg-base)",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 16px 12px", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-secondary)",
              letterSpacing: "0.02em",
            }}
          >
            Chats
          </span>
          <button
            onClick={() => navigate("/agent")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              borderRadius: 6,
              border: "var(--border-subtle)",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 0.12s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.06)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
            title="New chat"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search
            size={13}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-tertiary)",
              pointerEvents: "none",
            }}
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            style={{
              width: "100%",
              padding: "6px 10px 6px 30px",
              borderRadius: 6,
              border: "var(--border-subtle)",
              background: "rgba(var(--ui-rgb), 0.03)",
              color: "var(--text-primary)",
              fontSize: 12,
              fontFamily: "var(--font-sans)",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Conversation list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 8px 16px",
        }}
        className="scrollbar-hide"
      >
        {grouped.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {grouped.map((group) => (
              <div key={group.label}>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    fontWeight: 500,
                    padding: "0 8px",
                    marginBottom: 4,
                  }}
                >
                  {group.label}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {group.items.map((convo) => {
                    const isActive = convo.id === chatId;
                    const isHovered = hoveredId === convo.id;

                    const isEditing = editingId === convo.id;

                    return (
                      <div
                        key={convo.id}
                        onClick={() => {
                          if (!isEditing) navigate(`/agent/${convo.id}`);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingId(convo.id);
                          setEditValue(convo.title || "");
                        }}
                        onMouseEnter={() => setHoveredId(convo.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "7px 8px",
                          borderRadius: 6,
                          cursor: "pointer",
                          transition: "background 0.1s ease",
                          background: isActive
                            ? "rgba(var(--mi-accent-rgb, 130,192,204), 0.1)"
                            : isHovered
                              ? "rgba(var(--ui-rgb), 0.04)"
                              : "transparent",
                        }}
                      >
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              flex: 1,
                              fontSize: 12,
                              color: "var(--text-primary)",
                              background: "rgba(var(--ui-rgb), 0.06)",
                              border: "var(--border-subtle)",
                              borderRadius: 4,
                              padding: "2px 6px",
                              outline: "none",
                              fontFamily: "var(--font-sans)",
                              minWidth: 0,
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              flex: 1,
                              fontSize: 12,
                              color: isActive ? "var(--mi-accent)" : "var(--text-primary)",
                              fontWeight: isActive ? 500 : 400,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              minWidth: 0,
                            }}
                          >
                            {convo.title || "New chat"}
                          </span>
                        )}

                        {isHovered && !isEditing && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(convo.id);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 20,
                              height: 20,
                              borderRadius: 4,
                              border: "none",
                              background: "transparent",
                              color: "var(--text-tertiary)",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = "var(--status-error)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = "var(--text-tertiary)";
                            }}
                            title="Delete chat"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : searchQuery ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 16px",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              No matching chats
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
