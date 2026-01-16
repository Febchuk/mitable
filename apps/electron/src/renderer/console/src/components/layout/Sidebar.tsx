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
        flex flex-col h-full bg-transparent text-white
        transition-all duration-300 ease-in-out relative z-10
        ${open ? "w-64" : "w-16"}
      `}
    >
      {/* Header - Logo */}
      <div className="flex-shrink-0">
        <Logo />
      </div>

      {/* Main Navigation */}
      <div className="overflow-y-auto py-4">
        <Nav />
      </div>

      {/* Spacer to push profile to middle-lower area */}
      <div className="flex-1"></div>

      {/* Profile Avatar with Dropdown */}
      <div className="flex-shrink-0 px-2 pb-8 relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="group flex items-center justify-start p-2"
          title="Profile"
        >
          {/* Circular Avatar */}
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-semibold text-base hover:bg-primary-hover transition-colors duration-200 cursor-pointer">
            {(() => {
              const nameParts = user?.name?.split(" ") || [];
              const firstInitial = nameParts[0]?.[0]?.toUpperCase() || "U";
              const lastInitial = nameParts[nameParts.length - 1]?.[0]?.toUpperCase() || "";
              return nameParts.length > 1 ? `${firstInitial}${lastInitial}` : firstInitial;
            })()}
          </div>
        </button>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div
            className="absolute bottom-full left-2 right-2 mb-2 bg-background-elevated border border-border-subtle rounded-lg shadow-xl overflow-hidden origin-bottom animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{
              animation: "slideUp 0.2s ease-out",
            }}
          >
            <button
              onClick={() => {
                navigate("/profile");
                setDropdownOpen(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-white/5 transition-colors text-text-primary hover:text-white"
            >
              <User className="w-4 h-4" />
              <span className="text-sm font-medium">Profile & Settings</span>
            </button>
            <div className="h-px bg-border-subtle" />
            <button
              onClick={() => {
                handleLogout();
                setDropdownOpen(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-red-500/10 transition-colors text-red-400 hover:text-red-300"
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
