import { Layers, Users, BarChart3, Plug, Activity, FileText, CheckSquare } from "lucide-react";
// Note: Users icon is still used in admin navigation for People
import NavItem from "./NavItem";
import { useUser } from "../../context/UserContext";

export default function Nav() {
  const { user } = useUser();
  const isAdmin = user?.role === "admin";

  if (isAdmin) {
    // Admin navigation
    return (
      <nav className="space-y-1 px-2">
        <NavItem to="/dashboard" icon={BarChart3} label="Dashboard" />
        <NavItem to="/people" icon={Users} label="People" />
        <NavItem to="/templates" icon={Layers} label="Templates" />
        <NavItem to="/integrations" icon={Plug} label="Integrations" />
      </nav>
    );
  }

  // Employee navigation
  return (
    <nav className="space-y-1 px-2">
      <NavItem to="/docs" icon={FileText} label="Docs" />
      <NavItem to="/monitoring" icon={Activity} label="Sessions" />
      <NavItem to="/todos" icon={CheckSquare} label="Todos" />
    </nav>
  );
}
