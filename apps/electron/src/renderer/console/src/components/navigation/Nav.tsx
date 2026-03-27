import { useState, useEffect, useCallback } from "react";
import { Calendar, Download, LayoutGrid, User, BarChart2, FileText } from "lucide-react";
import NavItem from "./NavItem";
import MitableIcon from "../icons/MitableIcon";
import { useUser } from "../../context/UserContext";

interface NavProps {
  isAdminView?: boolean;
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
      </>
    );
  }

  return (
    <>
      <NavItem to="/calendar" icon={Calendar} label="Calendar" />
      <NavItem to="/me" icon={User} label="Me" />
      {agentEnabled && <NavItem to="/agent" icon={MitableIcon} label="Agent" />}
      <NavItem to="/docs" icon={FileText} label="Docs" />
      <NavItem to="/uploads" icon={Download} label="Uploads" />
    </>
  );
}
