import { useSidebar } from "../../context/SidebarContext";

export default function Logo() {
  const { isCollapsed } = useSidebar();

  return (
    <div className="p-lg border-b border-border">
      <div className="text-text-primary font-bold text-xl">
        {isCollapsed ? "M" : "mitable"}
      </div>
    </div>
  );
}
