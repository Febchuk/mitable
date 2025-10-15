import { NavLink } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

interface NavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
}

export default function NavItem({ to, icon: Icon, label }: NavItemProps) {
  const { open } = useSidebar();

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
          isActive ? "bg-white text-black hover:bg-white/90 hover:text-black" : "hover:bg-white/10"
        }`
      }
      title={label}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {open && <span className="text-nav-item">{label}</span>}
    </NavLink>
  );
}
