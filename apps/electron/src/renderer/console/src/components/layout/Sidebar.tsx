import { User, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSidebar } from "../../context/SidebarContext";
import { useUser } from "../../context/UserContext";
import Logo from "../navigation/Logo";
import Nav from "../navigation/Nav";
import { useState, useRef, useEffect } from "react";

export default function Sidebar() {
  const { open } = useSidebar();
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <aside
      className={`
        flex flex-col h-[calc(100%-16px)] my-2 ml-2 text-white
        transition-all duration-300 ease-in-out relative z-10
        rounded-2xl glass border border-stroke-subtle
        ${open ? "w-64" : "w-16"}
      `}
    >
      {/* Header - Logo with breathing animation */}
      <div className="flex-shrink-0 pt-1">
        <Logo />
      </div>

      {/* Main Navigation with stagger animation */}
      <div className="overflow-y-auto py-4 px-2 flex-1">
        <Nav />
      </div>

      {/* Profile Avatar with Dropdown */}
      <div className="flex-shrink-0 px-2 pb-4 relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="group flex items-center justify-start p-2 w-full rounded-xl hover:bg-canvas-muted/50 transition-all duration-normal"
          title="Profile"
        >
          {/* Circular Avatar with gradient ring on hover */}
          <div className="relative">
            <div
              className={`
                w-10 h-10 rounded-full bg-indigo flex items-center justify-center
                text-white font-display font-semibold text-sm
                transition-all duration-normal
                group-hover:shadow-[0_0_20px_rgba(99,102,241,0.4)]
              `}
            >
              {(() => {
                const nameParts = user?.name?.split(" ") || [];
                const firstInitial = nameParts[0]?.[0]?.toUpperCase() || "U";
                const lastInitial = nameParts[nameParts.length - 1]?.[0]?.toUpperCase() || "";
                return nameParts.length > 1 ? `${firstInitial}${lastInitial}` : firstInitial;
              })()}
            </div>
            {/* Gradient ring effect */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo via-rose to-indigo opacity-0 group-hover:opacity-30 blur-sm transition-opacity duration-normal -z-10 scale-110" />
          </div>

          {/* User name when expanded */}
          {open && (
            <div className="ml-3 text-left overflow-hidden">
              <p className="text-sm font-medium text-ink-primary truncate">
                {user?.name || "User"}
              </p>
              <p className="text-xs text-ink-tertiary truncate">{user?.email || ""}</p>
            </div>
          )}
        </button>

        {/* Dropdown Menu with glass effect */}
        {dropdownOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-2 glass border border-stroke rounded-xl shadow-2xl overflow-hidden animate-reveal-up">
            <button
              onClick={() => {
                navigate("/profile");
                setDropdownOpen(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-canvas-muted/50 transition-all duration-fast text-ink-primary"
            >
              <User className="w-4 h-4 text-ink-secondary" />
              <span className="text-sm font-medium">Profile & Settings</span>
            </button>
            <div className="h-px bg-stroke-subtle mx-2" />
            <button
              onClick={() => {
                handleLogout();
                setDropdownOpen(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-red-500/10 transition-all duration-fast text-red-400 hover:text-red-300"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
