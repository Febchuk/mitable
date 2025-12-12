import { useState, useRef, useEffect } from "react";
import { MoreVertical } from "lucide-react";
import LogoIcon from "@/assets/logo-icon.svg";
import { DEMO_CONFIG } from "../../console/src/data/demoConfig";

export default function App() {
  const [isPaused, setIsPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  const handlePauseResume = () => {
    if (isPaused) {
      window.watchingPillAPI?.resume();
      setIsPaused(false);
    } else {
      window.watchingPillAPI?.pause();
      setIsPaused(true);
    }
    setMenuOpen(false);
  };

  const handleSendUpdate = () => {
    window.watchingPillAPI?.sendUpdate();
    setMenuOpen(false);
  };

  return (
    <div className="h-full w-full flex items-start justify-end p-1 app-drag">
      {/* Vertical Pill Container - 75% scale */}
      <div className="relative flex flex-col items-center bg-[#1A1A1A]/95 backdrop-blur-lg rounded-full shadow-2xl border border-white/10 py-2 px-1.5 gap-1.5">
        {/* Top: Mitable Logo */}
        <div className="w-6 h-6 flex items-center justify-center">
          <img
            src={LogoIcon}
            alt="Mitable"
            className={`h-5 w-auto transition-opacity ${isPaused ? "opacity-40" : "opacity-100"}`}
          />
        </div>

        {/* Paused indicator dot */}
        {isPaused && (
          <div className="absolute top-1.5 right-0.5 w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
        )}

        {/* Divider */}
        <div className="w-5 h-px bg-white/10" />

        {/* Bottom: Menu Button */}
        <div className="relative app-no-drag" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            <MoreVertical size={12} className="text-white/70" />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div className="absolute top-full right-0 mt-3 bg-[#2A2A2A] rounded-lg shadow-xl border border-white/10 py-0.5 animate-in fade-in slide-in-from-top-2 duration-150 app-no-drag">
              <button
                onClick={handlePauseResume}
                className="block w-full text-left px-3 py-1.5 text-xs text-white/90 hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                {isPaused ? DEMO_CONFIG.notifications.watchingPill.resumeButton : DEMO_CONFIG.notifications.watchingPill.pauseButton}
              </button>
              <button
                onClick={handleSendUpdate}
                className="block w-full text-left px-3 py-1.5 text-xs text-white/90 hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                {DEMO_CONFIG.notifications.watchingPill.sendUpdateButton}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
