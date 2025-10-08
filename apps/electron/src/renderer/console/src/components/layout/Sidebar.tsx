import { useSidebar } from "../../context/SidebarContext";

export default function Sidebar() {
  const { isCollapsed } = useSidebar();

  return (
    <aside
      className={`${
        isCollapsed ? "w-sidebar-collapsed" : "w-sidebar-expanded"
      } h-full bg-background-secondary border-r border-border flex flex-col transition-width duration-300`}
    >
      <div className="p-lg">
        <div className="text-text-primary font-bold text-xl">
          {isCollapsed ? "M" : "mitable"}
        </div>
      </div>

      <nav className="flex-1 px-md py-lg space-y-sm">
        <div className="text-text-secondary p-md">Navigation - To be implemented</div>
      </nav>

      <div className="p-lg border-t border-border">
        <div className="text-text-secondary text-sm">Bottom Actions</div>
      </div>
    </aside>
  );
}
