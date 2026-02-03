import { LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useSidebar } from "../../context/SidebarContext";

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
        `group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-normal ${
          isActive
            ? "bg-canvas-overlay text-ink-primary shadow-sm"
            : "text-ink-secondary hover:text-ink-primary hover:bg-canvas-muted/50"
        }`
      }
      title={label}
    >
      {({ isActive }) => (
        <>
          {/* Glow indicator for active state */}
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo rounded-r shadow-[0_0_12px_rgba(99,102,241,0.6)]" />
          )}

          {/* Icon with tilt effect on hover */}
          <span
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-all duration-fast ${
              isActive
                ? "bg-indigo/10 text-indigo"
                : "text-ink-secondary group-hover:text-ink-primary group-hover:rotate-3 group-hover:scale-105"
            }`}
          >
            <Icon className="w-[18px] h-[18px]" />
          </span>

          {/* Label with letter-spacing animation */}
          {open && (
            <span
              className={`text-sm font-medium tracking-tight transition-all duration-normal ${
                isActive
                  ? "text-ink-primary"
                  : "text-ink-secondary group-hover:text-ink-primary group-hover:tracking-normal"
              }`}
            >
              {label}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
