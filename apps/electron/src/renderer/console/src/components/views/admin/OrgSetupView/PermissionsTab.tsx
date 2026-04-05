import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { useUsers } from "@/console/src/hooks/queries/admin";
import { apiRequest } from "@/console/src/services/api";
import { useQueryClient } from "@tanstack/react-query";

interface UserWithPermissions {
  id: string;
  name: string;
  email: string;
  role: string;
  jobTitle: string | null;
  permissions: string[];
}

export default function PermissionsTab() {
  const { data: users = [], isLoading } = useUsers();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return (users as UserWithPermissions[]).filter(
      (u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const togglePermission = async (userId: string, permission: string, hasIt: boolean) => {
    setUpdating(userId);
    try {
      if (hasIt) {
        await apiRequest(`/admin/users/${userId}/permissions/${permission}`, { method: "DELETE" });
      } else {
        await apiRequest(`/admin/users/${userId}/permissions/${permission}`, { method: "PUT" });
      }
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (err) {
      console.error("Failed to update permission:", err);
    } finally {
      setUpdating(null);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: "64px 0", textAlign: "center" }}>
        <div
          className="animate-spin"
          style={{
            width: 24,
            height: 24,
            margin: "0 auto 12px",
            borderRadius: "50%",
            border: "2px solid rgba(var(--ui-rgb), 0.1)",
            borderTopColor: "var(--text-secondary)",
          }}
        />
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Loading users...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Section header */}
      <h2
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 20,
          fontWeight: 400,
          color: "var(--text-primary)",
          margin: "0 0 6px",
          letterSpacing: "-0.2px",
        }}
      >
        User Permissions
      </h2>
      <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 20 }}>
        Control which users can see org-wide data in the Team view.
      </p>

      {/* Search */}
      <div style={{ position: "relative", maxWidth: 320, marginBottom: 20 }}>
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

      {/* User list */}
      <div style={{ borderTop: "var(--border-hairline)" }}>
        {filteredUsers.map((user) => {
          const isAdmin = user.role === "admin";
          const hasOrgWide = isAdmin || (user.permissions || []).includes("canSeeOrgWide");
          const isUpdating = updating === user.id;

          return (
            <div
              key={user.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 0",
                borderBottom: "var(--border-hairline)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                    {user.name}
                  </span>
                  {isAdmin && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "rgba(var(--ui-rgb), 0.08)",
                        color: "var(--text-secondary)",
                        fontWeight: 500,
                      }}
                    >
                      Admin
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 3 }}>
                  {user.email}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  {isAdmin ? "Always has access" : "Can see org-wide"}
                </span>
                <button
                  disabled={isAdmin || isUpdating}
                  onClick={() => togglePermission(user.id, "canSeeOrgWide", hasOrgWide)}
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 10,
                    border: "none",
                    cursor: isAdmin ? "not-allowed" : "pointer",
                    position: "relative",
                    transition: "background 0.2s",
                    background: hasOrgWide
                      ? isAdmin
                        ? "rgba(var(--ui-rgb), 0.15)"
                        : "var(--mi-accent)"
                      : "rgba(var(--ui-rgb), 0.1)",
                    opacity: isAdmin ? 0.5 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: "white",
                      position: "absolute",
                      top: 2,
                      left: hasOrgWide ? 18 : 2,
                      transition: "left 0.2s",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
