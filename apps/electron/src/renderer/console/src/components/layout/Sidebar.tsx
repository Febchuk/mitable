import { useState, useRef, useEffect } from "react";
import { Bell, Settings, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import Nav from "../navigation/Nav";

export default function Sidebar() {
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await logout();
    // Use navigate with replace to ensure proper routing with HashRouter
    navigate("/login", { replace: true });
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get user initials
  const getInitials = () => {
    if (!user?.name) return "U";
    const names = user.name.split(" ");
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return user.name.slice(0, 2).toUpperCase();
  };

  return (
    <aside className="flex flex-col h-screen w-24 bg-gradient-to-b from-[#0f0d1a] to-[#0a0810] text-white border-r border-white/5">
      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto py-6 pt-8">
        <Nav />
      </div>

      {/* Footer - User Profile */}
      <div className="flex-shrink-0 p-3 border-t border-white/5 relative" ref={menuRef}>
        {/* User Menu Dropdown - Pops out to the right */}
        {showUserMenu && (
          <div className="fixed bottom-4 left-28 w-56 bg-[#1a1625] border border-purple-500/30 rounded-xl shadow-2xl shadow-purple-500/20 overflow-hidden backdrop-blur-xl z-50 animate-in slide-in-from-left-2 fade-in duration-200">
            {/* User Info Header - Compact */}
            <div className="px-3 py-2.5 border-b border-white/10 bg-gradient-to-r from-purple-600/15 to-blue-600/15">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg flex-shrink-0">
                  <span className="text-xs font-bold text-white">{getInitials()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{user?.name || "User"}</p>
                  <p className="text-[10px] text-white/40 truncate capitalize">{user?.role || "Member"}</p>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-1.5">
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors text-left group"
                title="Notifications"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                  <Bell className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <span className="text-sm text-white/90">Notifications</span>
              </button>
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors text-left group"
                title="Settings"
              >
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                  <Settings className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <span className="text-sm text-white/90">Settings</span>
              </button>
              <div className="mx-3 my-1.5 border-t border-white/5"></div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-red-500/10 transition-colors text-left text-red-400 hover:text-red-300 group"
                title="Logout"
              >
                <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                  <LogOut className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm">Logout</span>
              </button>
            </div>
          </div>
        )}

        {/* User Profile Button */}
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className={`
            w-full flex items-center justify-center py-3 rounded-xl transition-all duration-200
            ${showUserMenu 
              ? 'bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/40' 
              : 'hover:bg-white/5 border border-transparent'
            }
          `}
        >
          {/* Avatar Circle */}
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg">
              <span className="text-sm font-bold text-white">{getInitials()}</span>
            </div>
            {/* Online indicator */}
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0a0810]"></div>
          </div>
        </button>
      </div>
    </aside>
  );
}
