import { Bell, Settings, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSidebar } from "../../context/SidebarContext";
import { useUser } from "../../context/UserContext";
import Logo from "../navigation/Logo";
import Nav from "../navigation/Nav";

export default function Sidebar() {
  const { open } = useSidebar();
  const { logout } = useUser();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <aside
      className={`
        flex flex-col h-screen bg-gradient-to-b from-background-primary to-background-secondary text-white border-r border-border-subtle
        transition-all duration-300 ease-in-out
        ${open ? "w-64" : "w-16"}
      `}
    >
      {/* Header - Logo */}
      <div className="flex-shrink-0">
        <Logo />
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto py-4">
        <Nav />
      </div>

      {/* Footer - Notifications, Settings & Logout */}
      <div className="flex-shrink-0 p-2 space-y-1 border-t border-border-subtle">
        <button
          className="group flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-white/10 transition-all duration-200"
          title="Notifications"
        >
          <Bell className="w-5 h-5 flex-shrink-0 text-status-info group-hover:scale-110 transition-transform" />
          {open && (
            <span className="text-nav-item group-hover:text-white transition-colors">
              Notifications
            </span>
          )}
        </button>
        <button
          className="group flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-white/10 transition-all duration-200"
          title="Settings"
        >
          <Settings className="w-5 h-5 flex-shrink-0 text-text-secondary group-hover:text-white group-hover:scale-110 transition-all" />
          {open && (
            <span className="text-nav-item group-hover:text-white transition-colors">Settings</span>
          )}
        </button>
        <button
          onClick={handleLogout}
          className="group flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-red-500/10 transition-all duration-200 text-red-400 hover:text-red-300"
          title="Logout"
        >
          <LogOut className="w-5 h-5 flex-shrink-0 group-hover:scale-110 transition-transform" />
          {open && <span className="text-nav-item">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
