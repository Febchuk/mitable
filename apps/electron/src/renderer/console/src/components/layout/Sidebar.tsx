import { ArrowLeftRight, Settings, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSidebar } from "../../context/SidebarContext";
import { useUser } from "../../context/UserContext";
import Nav from "../navigation/Nav";
import { useState, useRef, useEffect } from "react";

const isMac = navigator.platform.toLowerCase().includes("mac");

export default function Sidebar() {
  const { open } = useSidebar();
  const { user, updateUser, logout, organization } = useUser();
  const navigate = useNavigate();
  const [inAdminView, setInAdminView] = useState(user?.role === "admin");

  const canSwitchRoles = user?.role === "admin" || user?.originalRole === "admin";

  const handleSwitchView = () => {
    if (!user) return;
    const newRole = inAdminView ? "employee" : "admin";
    setInAdminView(!inAdminView);
    updateUser({
      ...user,
      role: newRole as "admin" | "employee",
      originalRole: user.originalRole ?? user.role,
    });
    localStorage.setItem("mitable:lastMode", newRole);
    navigate(newRole === "admin" ? "/dashboard" : "/calendar");
  };

  const firstInitial = user?.name?.charAt(0)?.toUpperCase() || "U";
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserMenu]);

  return (
    <aside
      style={{
        width: open ? 220 : 0,
        minWidth: open ? 220 : 0,
        opacity: open ? 1 : 0,
        background: "rgba(0, 0, 0, 0.08)",
        borderRight: open ? "var(--border-hairline)" : "none",
        display: "flex",
        flexDirection: "column",
        paddingBottom: open ? 12 : 0,
        flexShrink: 0,
        overflow: "hidden",
        transition: "width 0.2s ease, min-width 0.2s ease, opacity 0.15s ease, border 0.2s ease",
      }}
    >
      {/* Titlebar spacer — clears macOS traffic lights */}
      <div
        className="app-drag"
        style={{
          height: isMac ? 52 : 12,
          flexShrink: 0,
        }}
      />

      {/* Navigation */}
      <nav style={{ padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 1 }}>
        <Nav isAdminView={inAdminView} />
      </nav>

      {/* Bottom section */}
      <div
        style={{
          marginTop: "auto",
          padding: "10px 8px 0",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {/* Switch view button */}
        {canSwitchRoles && (
          <>
            <div
              style={{
                height: 0.5,
                background: "var(--divider)",
                margin: "0 -8px 4px",
              }}
            />
            <button
              onClick={handleSwitchView}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "8px 12px",
                borderRadius: 6,
                fontSize: 13,
                color: "var(--text-secondary)",
                background: "none",
                border: "none",
                textAlign: "left",
                width: "100%",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.05)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              <ArrowLeftRight size={15} strokeWidth={1.5} />
              <span>{inAdminView ? "Switch to IC View" : "Switch to Admin View"}</span>
            </button>
          </>
        )}

        {/* Divider before user row */}
        <div
          style={{
            height: 0.5,
            background: "var(--divider)",
            margin: canSwitchRoles ? "4px -8px" : "0 -8px",
          }}
        />

        {/* User row + popover */}
        <div ref={userMenuRef} style={{ position: "relative" }}>
          <div
            className="cursor-pointer"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 6,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
            }}
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            {/* Avatar circle */}
            <div
              style={{
                width: 32,
                height: 32,
                background: "rgba(var(--ui-rgb), 0.1)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                color: "var(--text-primary)",
                flexShrink: 0,
              }}
            >
              {firstInitial}
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-primary)",
                  fontWeight: 500,
                  lineHeight: 1,
                }}
              >
                {user?.firstName || user?.name?.split(" ")[0] || "User"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  marginTop: 6,
                  lineHeight: 1,
                }}
              >
                {inAdminView && organization?.name ? organization.name : "Free plan"}
              </div>
            </div>
          </div>

          {/* Popover menu */}
          {showUserMenu && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                left: 0,
                right: 0,
                background: "var(--bg-overlay)",
                border: "var(--border-subtle)",
                borderRadius: 8,
                padding: 4,
                zIndex: 50,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  navigate("/profile");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: "none",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.06)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                <Settings size={14} strokeWidth={1.5} />
                Settings
              </button>

              <div
                style={{
                  height: 0.5,
                  background: "var(--divider)",
                  margin: "2px 8px",
                }}
              />

              <button
                onClick={() => {
                  setShowUserMenu(false);
                  logout();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: "none",
                  color: "var(--text-secondary)",
                  fontSize: 13,
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(var(--status-error-rgb), 0.08)";
                  e.currentTarget.style.color = "var(--status-error)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                <LogOut size={14} strokeWidth={1.5} />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
