import logoIconSvg from "../../../../assets/logo-icon.svg";
import { useSidebar } from "../../context/SidebarContext";

export default function Logo() {
  const { open } = useSidebar();

  return (
    <div
      className={`
        group flex items-center w-full px-4 pt-5 pb-4 transition-all duration-normal
        ${open ? "justify-start" : "justify-center"}
      `}
    >
      <div className="flex items-center gap-3">
        {/* Logo icon with subtle hover animation */}
        <div className="relative">
          <img
            src={logoIconSvg}
            alt="Mitable Logo"
            className="w-8 h-8 flex-shrink-0 transition-transform duration-normal group-hover:scale-105"
          />
          {/* Glow effect on hover */}
          <div className="absolute inset-0 bg-indigo/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-normal -z-10" />
        </div>

        {/* Brand name with display font */}
        {open && (
          <span className="font-display text-ink-primary font-semibold text-lg tracking-tight">
            mitable
          </span>
        )}
      </div>
    </div>
  );
}
