import { LucideIcon } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useSidebar } from "../../context/SidebarContext";

interface NavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
}

export default function NavItem({ to, icon: Icon, label }: NavItemProps) {
  const { open } = useSidebar();
  const location = useLocation();

  // Resolve the target path: use last visited sub-path if available
  const section = to.replace(/^\//, ""); // e.g. "docs", "recaps"
  const lastPath = sessionStorage.getItem(`nav:last:${section}`);
  const resolvedTo = lastPath && lastPath.startsWith(to) ? lastPath : to;

  // Check if current location is within this section
  const isInSection = location.pathname === to || location.pathname.startsWith(to + "/");

  if (!open) {
    return (
      <NavLink
        to={resolvedTo}
        className={() =>
          `group relative flex flex-col items-center justify-center py-3 rounded-xl transition-all duration-200 ${
            isInSection ? "text-indigo" : "text-white/40 hover:text-white/80"
          }`
        }
        title={label}
      >
        <Icon className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
        {isInSection && (
          <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-indigo shadow-[0_0_6px_rgba(99,102,241,0.8)]" />
        )}
      </NavLink>
    );
  }

  return (
    <NavLink
      to={resolvedTo}
      className={() =>
        `group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-normal ${
          isInSection
            ? "bg-canvas-overlay text-ink-primary shadow-sm"
            : "text-ink-secondary hover:text-ink-primary hover:bg-canvas-muted/50"
        }`
      }
      title={label}
    >
      {isInSection && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-indigo rounded-r shadow-[0_0_12px_rgba(99,102,241,0.6)]" />
      )}
      <span
        className={`flex items-center justify-center w-8 h-8 rounded-md transition-all duration-fast ${
          isInSection
            ? "bg-indigo/10 text-indigo"
            : "text-ink-secondary group-hover:text-ink-primary group-hover:rotate-3 group-hover:scale-105"
        }`}
      >
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span
        className={`text-sm font-medium tracking-tight transition-all duration-normal ${
          isInSection
            ? "text-ink-primary"
            : "text-ink-secondary group-hover:text-ink-primary group-hover:tracking-normal"
        }`}
      >
        {label}
      </span>
    </NavLink>
  );
}
