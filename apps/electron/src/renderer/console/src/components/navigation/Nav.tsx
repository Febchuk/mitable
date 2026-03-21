import { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Download,
  LayoutGrid,
  User,
  BarChart2,
  FileText,
  ChevronDown,
  MessageSquare,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import NavItem from "./NavItem";
import MitableIcon from "../icons/MitableIcon";
import { useUser } from "../../context/UserContext";

interface NavProps {
  isAdminView?: boolean;
}

const DEMO_CHATS = [
  { id: "1", title: "What should I work on today?" },
  { id: "2", title: "Summarise my week" },
  { id: "3", title: "Draft standup update" },
  { id: "4", title: "Help me prep for 1:1" },
  { id: "5", title: "Review PR feedback" },
  { id: "6", title: "Explain the new onboarding flow" },
  { id: "7", title: "Write a Slack message to the team" },
  { id: "8", title: "Compare Q1 and Q2 roadmap progress" },
];

function ChatsSidebar() {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const isInChats = location.pathname === "/chats" || location.pathname.startsWith("/chats/");

  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Divider */}
      <div
        style={{
          height: 0.5,
          background: "rgba(236, 232, 224, 0.06)",
          margin: "0 16px 6px",
          flexShrink: 0,
        }}
      />

      {/* Chats header — navigates to /chats on click, chevron toggles the list */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "8px 12px",
          margin: "1px 8px",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 13,
          color: isInChats ? "var(--mi-accent)" : "#9B9689",
          background: isInChats ? "rgba(var(--mi-accent-rgb, 200,169,96), 0.13)" : "transparent",
          textDecoration: "none",
          transition: "background 0.15s ease, color 0.15s ease",
          flexShrink: 0,
        }}
        onClick={() => navigate("/chats")}
        onMouseEnter={(e) => {
          if (!isInChats) {
            e.currentTarget.style.background = "rgba(236, 232, 224, 0.05)";
            e.currentTarget.style.color = "#ECE8E0";
          }
        }}
        onMouseLeave={(e) => {
          if (!isInChats) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "#9B9689";
          }
        }}
      >
        <MessageSquare size={15} strokeWidth={1.5} />
        <span style={{ flex: 1 }}>Chats</span>
        <ChevronDown
          size={12}
          style={{
            opacity: 0.4,
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.15s ease",
          }}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        />
      </div>

      {/* Chat list — scrollable, fills remaining sidebar space */}
      {open && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 1,
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
          }}
          className="scrollbar-hide"
        >
          {DEMO_CHATS.map((chat) => (
            <button
              key={chat.id}
              onClick={() => navigate(`/chats/${chat.id}`)}
              style={{
                display: "block",
                padding: "5px 12px",
                margin: "0 8px",
                borderRadius: 5,
                border: "none",
                background: "none",
                cursor: "pointer",
                textAlign: "left",
                width: "calc(100% - 16px)",
                color: "#6B665C",
                fontSize: 12,
                lineHeight: 1.4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                transition: "background 0.12s ease, color 0.12s ease",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(236, 232, 224, 0.05)";
                e.currentTarget.style.color = "#ECE8E0";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = "#6B665C";
              }}
            >
              {chat.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Nav({ isAdminView = false }: NavProps) {
  const { user } = useUser();
  const [agentEnabled, setAgentEnabled] = useState(false);

  const refreshAgentEnabled = useCallback(() => {
    if (!user?.id) return;
    window.consoleAPI?.getAgentEnabled(user.id).then(setAgentEnabled);
  }, [user?.id]);

  useEffect(() => {
    refreshAgentEnabled();
  }, [refreshAgentEnabled]);

  useEffect(() => {
    const handler = () => refreshAgentEnabled();
    window.addEventListener("agent-enabled-changed", handler);
    return () => window.removeEventListener("agent-enabled-changed", handler);
  }, [refreshAgentEnabled]);

  if (isAdminView) {
    return (
      <>
        <NavItem to="/dashboard" icon={LayoutGrid} label="Dashboard" />
        {agentEnabled && <NavItem to="/agent" icon={MitableIcon} label="Agent" />}
        <NavItem to="/reports" icon={BarChart2} label="Reports" />
        <NavItem to="/people" icon={User} label="People" />
        {agentEnabled && <ChatsSidebar />}
      </>
    );
  }

  return (
    <>
      <NavItem to="/calendar" icon={Calendar} label="Calendar" />
      {agentEnabled && <NavItem to="/agent" icon={MitableIcon} label="Agent" />}
      <NavItem to="/docs" icon={FileText} label="Docs" />
      <NavItem to="/uploads" icon={Download} label="Uploads" />
      {agentEnabled && <ChatsSidebar />}
    </>
  );
}
