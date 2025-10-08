import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSidebar } from "../../context/SidebarContext";

export default function CollapseToggle() {
  const { isCollapsed, toggle } = useSidebar();

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center w-full p-md border-t border-border hover:bg-background-elevated transition-colors text-text-secondary hover:text-text-primary"
      aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
      {!isCollapsed && <span className="ml-md text-sm">Collapse</span>}
    </button>
  );
}
