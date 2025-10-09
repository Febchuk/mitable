import { Home, Layers, Users, MessageSquare } from "lucide-react";
import NavItem from "./NavItem";

export default function Nav() {
  return (
    <nav className="flex flex-col gap-xs p-md">
      <NavItem to="/home" icon={Home} label="Home" />
      <NavItem to="/roadmap" icon={Layers} label="Roadmap" />
      <NavItem to="/nudges" icon={Users} label="Nudges" />
      <NavItem to="/chats" icon={MessageSquare} label="Chats" />
    </nav>
  );
}
