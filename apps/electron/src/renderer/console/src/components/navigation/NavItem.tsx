import { NavLink } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { useSidebar } from "../../context/SidebarContext";

interface NavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
}

// Map route paths to colors
const iconColors: Record<string, string> = {
  "/home": "text-blue-400",
  "/roadmap": "text-purple-400",
  "/nudges": "text-green-400",
  "/chats": "text-pink-400",
  "/dashboard": "text-blue-400",
  "/people": "text-green-400",
  "/templates": "text-purple-400",
  "/integrations": "text-amber-400",
};

export default function NavItem({ to, icon: Icon, label }: NavItemProps) {
  const { open } = useSidebar();
  const iconColor = iconColors[to] || "text-text-secondary";

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
          isActive 
            ? "bg-white text-black hover:bg-white/90 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-8 before:bg-gradient-purple-blue before:rounded-r" 
            : "hover:bg-white/10"
        }`
      }
      title={label}
    >
      {({ isActive }) => (
        <>
          <Icon className={`w-5 h-5 flex-shrink-0 transition-all duration-200 ${
            isActive ? "" : `${iconColor} group-hover:text-white group-hover:scale-110`
          }`} />
          {open && <span className={`text-nav-item transition-colors ${
            !isActive && "group-hover:text-white"
          }`}>{label}</span>}
        </>
      )}
    </NavLink>
  );
}
