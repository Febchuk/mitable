import { PanelLeftClose, PanelLeft } from "lucide-react";
import { useSidebar } from "../../context/SidebarContext";
import logoIconSvg from "../../../../assets/logo-icon.svg";

export default function Logo() {
  const { isCollapsed, toggle } = useSidebar();

  return (
    <div className="p-lg flex items-center justify-between">
      <div className="flex items-center gap-md">
        <img src={logoIconSvg} alt="Mitable Logo" className="w-8 h-8" />
        {!isCollapsed && <span className="text-text-primary font-bold text-xl">mitable</span>}
      </div>
      <button
        onClick={toggle}
        className="text-text-secondary hover:text-text-primary transition-colors"
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
      </button>
    </div>
  );
}
