import { ArrowLeftRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSidebar } from "../../context/SidebarContext";
import { useUser } from "../../context/UserContext";
import Nav from "../navigation/Nav";
import { useState } from "react";

const isMac = navigator.platform.toLowerCase().includes("mac");

export default function Sidebar() {
  const { open } = useSidebar();
  const { user, updateUser } = useUser();
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

  return (
    <aside
      style={{
        width: open ? 220 : 0,
        minWidth: open ? 220 : 0,
        opacity: open ? 1 : 0,
        background: "#211F1B",
        borderRight: open ? "0.5px solid rgba(236, 232, 224, 0.07)" : "none",
        display: "flex",
        flexDirection: "column",
        paddingBottom: open ? 12 : 0,
        flexShrink: 0,
        overflow: "hidden",
        transition:
          "width 0.2s ease, min-width 0.2s ease, opacity 0.15s ease, border 0.2s ease",
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
        <Nav />
      </nav>

      {/* Bottom section */}
      <div
        style={{
          marginTop: "auto",
          padding: "10px 8px 0",
          borderTop: "0.5px solid rgba(236, 232, 224, 0.07)",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {/* Switch view button */}
        {canSwitchRoles && (
          <button
            onClick={handleSwitchView}
            className="flex items-center gap-[11px] rounded-md cursor-pointer whitespace-nowrap hover:bg-[rgba(236,232,224,0.05)]"
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 13,
              color: "#9B9689",
              background: "none",
              border: "none",
              textAlign: "left",
              width: "100%",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(236, 232, 224, 0.05)";
              e.currentTarget.style.color = "#ECE8E0";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "#9B9689";
            }}
          >
            <ArrowLeftRight
              size={15}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <span>{inAdminView ? "Switch to IC View" : "Switch to Admin View"}</span>
          </button>
        )}

        {/* Divider — breaks out of parent padding to span full sidebar width */}
        <div
          style={{
            height: 0.5,
            background: "rgba(236, 232, 224, 0.06)",
            margin: "4px -8px",
          }}
        />

        {/* User row */}
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
            e.currentTarget.style.background = "rgba(236, 232, 224, 0.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
          }}
          onClick={() => navigate("/profile")}
        >
          {/* Avatar circle */}
          <div
            style={{
              width: 32,
              height: 32,
              background: "rgba(236, 232, 224, 0.1)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              color: "#ECE8E0",
              flexShrink: 0,
            }}
          >
            {firstInitial}
          </div>
          <div>
            <div
              style={{
                fontSize: 13,
                color: "#ECE8E0",
                fontWeight: 500,
                lineHeight: 1,
              }}
            >
              {user?.firstName || user?.name?.split(" ")[0] || "User"}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#6B665C",
                marginTop: 6,
                lineHeight: 1,
              }}
            >
              Free plan
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
