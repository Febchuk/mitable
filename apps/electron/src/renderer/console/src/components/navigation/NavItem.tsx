import { NavLink } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { useSidebar } from "../../context/SidebarContext";

interface NavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
}

export default function NavItem({ to, icon: Icon, label }: NavItemProps) {
  const { isCollapsed } = useSidebar();

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-md px-md py-sm rounded-md transition-colors ${
          isActive
            ? "bg-primary text-white"
            : "text-text-secondary hover:bg-background-elevated hover:text-text-primary"
        } ${isCollapsed ? "justify-center" : ""}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={20} className={isCollapsed ? "" : "flex-shrink-0"} />
          {!isCollapsed && <span className="text-sm font-medium">{label}</span>}
        </>
      )}
    </NavLink>
  );
}
