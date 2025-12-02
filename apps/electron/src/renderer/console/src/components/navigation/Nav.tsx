import { Home, Layers, Users, MessageSquare, BarChart3, Plug } from "lucide-react";
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
      {/* <NavItem to="/home" icon={Home} label="Home" /> */}
      <NavItem to="/roadmap" icon={Layers} label="Roadmap" />
      <NavItem to="/nudges" icon={Users} label="Nudges" />
      <NavItem to="/chats" icon={MessageSquare} label="Chats" />
    </nav>
  );
}
