import { Bell, Settings } from "lucide-react";
import { useSidebar } from "../../context/SidebarContext";
import Logo from "../navigation/Logo";
import Nav from "../navigation/Nav";

export default function Sidebar() {
  const { isCollapsed } = useSidebar();

  return (
    <aside
      className={`${
        isCollapsed ? "w-sidebar-collapsed" : "w-sidebar-expanded"
      } h-full bg-background-primary flex flex-col transition-width duration-300 app-no-drag`}
    >
      <Logo />
      <div className="flex-1 overflow-y-auto">
        <Nav />
      </div>
      {/* Bottom Navigation */}
      <div className="p-md space-y-xs border-t border-border">
        <button
          className={`flex items-center gap-md w-full px-md py-sm rounded-md transition-colors text-text-secondary hover:bg-background-elevated hover:text-text-primary ${
            isCollapsed ? "justify-center" : ""
          }`}
        >
          <Bell size={20} />
          {!isCollapsed && <span className="text-sm font-medium">Notifications</span>}
        </button>
        <button
          className={`flex items-center gap-md w-full px-md py-sm rounded-md transition-colors text-text-secondary hover:bg-background-elevated hover:text-text-primary ${
            isCollapsed ? "justify-center" : ""
          }`}
        >
          <Settings size={20} />
          {!isCollapsed && <span className="text-sm font-medium">Settings</span>}
        </button>
      </div>
    </aside>
  );
}
