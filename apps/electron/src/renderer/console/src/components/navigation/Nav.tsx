import { useState, useEffect, useCallback } from "react";
import { Calendar, FileText, Download } from "lucide-react";
import NavItem from "./NavItem";
import MitableIcon from "../icons/MitableIcon";
import { useUser } from "../../context/UserContext";

export default function Nav() {
  const { user } = useUser();
  const [agentEnabled, setAgentEnabled] = useState(false);

  const refreshAgentEnabled = useCallback(() => {
    if (!user?.id) return;
    window.consoleAPI?.getAgentEnabled(user.id).then(setAgentEnabled);
  }, [user?.id]);

  useEffect(() => {
    refreshAgentEnabled();
  }, [refreshAgentEnabled]);

  // Listen for toggle changes from Settings
  useEffect(() => {
    const handler = () => refreshAgentEnabled();
    window.addEventListener("agent-enabled-changed", handler);
    return () => window.removeEventListener("agent-enabled-changed", handler);
  }, [refreshAgentEnabled]);

  return (
    <>
      <NavItem to="/calendar" icon={Calendar} label="Calendar" />
      {agentEnabled && <NavItem to="/agent" icon={MitableIcon} label="Agent" />}
      <NavItem to="/docs" icon={FileText} label="Docs" />
      <NavItem to="/uploads" icon={Download} label="Uploads" />
    </>
  );
}
