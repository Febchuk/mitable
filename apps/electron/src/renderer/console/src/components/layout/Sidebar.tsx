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
        flex flex-col h-screen bg-[#1A1A1A] text-white
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
      <div className="flex-shrink-0 p-2 space-y-1">
        <button
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-white/10 transition-colors"
          title="Notifications"
        >
          <Bell className="w-5 h-5 flex-shrink-0" />
          {open && <span className="text-nav-item">Notifications</span>}
        </button>
        <button
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-white/10 transition-colors"
          title="Settings"
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {open && <span className="text-nav-item">Settings</span>}
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-white/10 transition-colors text-red-400 hover:text-red-300"
          title="Logout"
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {open && <span className="text-nav-item">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
