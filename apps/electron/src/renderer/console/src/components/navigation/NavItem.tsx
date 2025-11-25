import { NavLink } from "react-router-dom";
import { LucideIcon } from "lucide-react";

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
  const iconColor = iconColors[to] || "text-text-secondary";

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group relative flex flex-col items-center justify-center py-3 rounded-lg transition-all duration-200 ${
          isActive
            ? "bg-white text-black hover:bg-white/90"
            : "hover:bg-white/10"
        }`
      }
      title={label}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-10 bg-gradient-purple-blue rounded-r" />
          )}
          <Icon
            className={`w-6 h-6 transition-all duration-200 mb-1 ${
              isActive ? "" : `${iconColor} group-hover:text-white group-hover:scale-110`
            }`}
          />
          <span
            className={`text-[10px] transition-colors leading-tight text-center ${
              isActive ? "text-black" : "text-text-tertiary group-hover:text-white"
            }`}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}
