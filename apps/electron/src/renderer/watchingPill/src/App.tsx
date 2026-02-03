import { useState, useEffect } from "react";
import { MoreVertical, Eye, EyeOff } from "lucide-react";
import LogoIcon from "@/assets/logo-icon.svg";
import type { MonitoringSessionState, SelectedWindowInfo } from "@mitable/shared";
import { createLogger } from "../../lib/logger";

const logger = createLogger("WatchingPill");

export default function App() {
  // Session state
  const [sessionState, setSessionState] = useState<MonitoringSessionState | null>(null);

  // Window management (for badge count)
  const [selectedWindows, setSelectedWindows] = useState<SelectedWindowInfo[]>([]);

  // Track which dropdown is open (for UI state only)
  const [eyeDropdownOpen, setEyeDropdownOpen] = useState(false);
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);

  // Derived state
  const isActive = sessionState?.status === "active";
  const isPaused = sessionState?.status === "paused";

  // Subscribe to session and window updates
  useEffect(() => {
    // Skip if preload API not ready
    if (!window.watchingPillAPI) {
      logger.warn(" watchingPillAPI not available - IPC disabled");
      return;
    }

    // Get initial state
    window.watchingPillAPI.getSessionState().then((state) => {
      logger.info(" Initial session state:", state);
      setSessionState(state);
    });

    window.watchingPillAPI.getSelectedWindows().then((windows) => {
      logger.info(" Initial selected windows:", windows);
      setSelectedWindows(windows);
    });

    // Subscribe to updates
    const unsubSession = window.watchingPillAPI.onSessionUpdate((state) => {
      logger.info(" Session update:", state);
      setSessionState(state);
    });

    const unsubWindows = window.watchingPillAPI.onWindowsUpdated((windows) => {
      logger.info(" Windows updated:", windows);
      setSelectedWindows(windows);
    });

    // Listen for dropdown close events from main process
    const unsubEyeClose = window.watchingPillAPI.onEyeDropdownClosed(() => {
      setEyeDropdownOpen(false);
    });

    const unsubMenuClose = window.watchingPillAPI.onMenuDropdownClosed(() => {
      setMenuDropdownOpen(false);
    });

    return () => {
      unsubSession();
      unsubWindows();
      unsubEyeClose();
      unsubMenuClose();
    };
  }, []);

  // Eye button toggles window selector dropdown (main process handles toggle logic)
  const handleEyeClick = async () => {
    await window.watchingPillAPI?.showEyeDropdown();
  };

  // Menu button toggles session controls dropdown (main process handles toggle logic)
  const handleMenuClick = async () => {
    await window.watchingPillAPI?.showMenuDropdown();
  };

  return (
    <div className="h-full w-full flex items-center justify-center app-drag">
      {/* Vertical Pill Container */}
      <div className="flex flex-col items-center bg-[#1A1A1A]/95 backdrop-blur-lg rounded-full shadow-2xl border border-white/10 py-2 px-1.5 gap-1.5">
        {/* Top: Mitable Logo with status indicator */}
        <div className="relative w-6 h-6 flex items-center justify-center">
          <img
            src={LogoIcon}
            alt="Mitable"
            className={`h-5 w-auto transition-opacity ${isPaused ? "opacity-40" : "opacity-100"}`}
          />

          {/* Recording indicator - red dot */}
          {isActive && (
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          )}

          {/* Paused indicator - amber dot */}
          {isPaused && (
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          )}
        </div>

        {/* Divider */}
        <div className="w-5 h-px bg-white/10" />

        {/* Eye Button - opens window selector dropdown */}
        <button
          onClick={handleEyeClick}
          className={`relative w-6 h-6 flex items-center justify-center rounded-full transition-all app-no-drag ${
            eyeDropdownOpen
              ? "bg-primary/30 text-white"
              : selectedWindows.length > 0
                ? "bg-primary/20 text-white hover:bg-primary/30 active:bg-primary/40 active:scale-95"
                : "hover:bg-white/10 active:bg-white/20 active:scale-95 text-white/70"
          }`}
          aria-label="Select windows to watch"
        >
          {selectedWindows.length > 0 ? (
            <>
              <Eye size={12} />
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-primary rounded-full text-[8px] text-white flex items-center justify-center font-medium px-0.5">
                {selectedWindows.length}
              </span>
            </>
          ) : (
            <EyeOff size={12} />
          )}
        </button>

        {/* Divider */}
        <div className="w-5 h-px bg-white/10" />

        {/* Menu Button */}
        <button
          onClick={handleMenuClick}
          className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors app-no-drag ${
            menuDropdownOpen ? "bg-white/10" : "hover:bg-white/10"
          }`}
          aria-label="Open menu"
        >
          <MoreVertical size={12} className="text-white/70" />
        </button>
      </div>
    </div>
  );
}
