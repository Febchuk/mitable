import { useState, useRef, useEffect } from "react";
import { MoreVertical, Eye, EyeOff, X, ChevronDown, Play } from "lucide-react";
import LogoIcon from "@/assets/logo-icon.svg";
import type { MonitoringSessionState, SelectedWindowInfo } from "@mitable/shared";

export default function App() {
  // Session state
  const [sessionState, setSessionState] = useState<MonitoringSessionState | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);

  // Window management
  const [selectedWindows, setSelectedWindows] = useState<SelectedWindowInfo[]>([]);
  const [watchModeActive, setWatchModeActive] = useState(false);
  const [showWindowList, setShowWindowList] = useState(false);

  // Menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const windowListRef = useRef<HTMLDivElement>(null);

  // Derived state
  const isActive = sessionState?.status === "active";
  const isPaused = sessionState?.status === "paused";
  const hasSession = isActive || isPaused;
  const showStartSession = !hasSession; // Always show when no session
  const canStartSession = !hasSession && selectedWindows.length > 0; // Can click only with windows

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (windowListRef.current && !windowListRef.current.contains(event.target as Node)) {
        setShowWindowList(false);
      }
    };

    if (menuOpen || showWindowList) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen, showWindowList]);

  // Subscribe to session updates
  useEffect(() => {
    // Get initial state
    window.watchingPillAPI.getSessionState().then((state) => {
      console.log("[WatchingPill] Initial session state:", state);
      setSessionState(state);
    });

    window.watchingPillAPI.getSelectedWindows().then((windows) => {
      console.log("[WatchingPill] Initial selected windows:", windows);
      setSelectedWindows(windows);
    });

    // Subscribe to updates
    const unsubSession = window.watchingPillAPI.onSessionUpdate((state) => {
      console.log("[WatchingPill] Session update:", state);
      setSessionState(state);
    });

    const unsubWindows = window.watchingPillAPI.onWindowsUpdated((windows) => {
      console.log("[WatchingPill] Windows updated:", windows);
      setSelectedWindows(windows);
    });

    return () => {
      unsubSession();
      unsubWindows();
    };
  }, []);

  // Eye button toggles watch mode overlay
  const handleEyeClick = async () => {
    const newState = !watchModeActive;
    setWatchModeActive(newState);
    await window.watchingPillAPI.toggleWatchMode(newState);

    // If turning off, close window list
    if (!newState) {
      setShowWindowList(false);
    }
  };

  // Remove window from watchlist
  const handleRemoveWindow = async (windowId: string) => {
    await window.watchingPillAPI.unselectWindow(windowId);
  };

  // Session controls
  const handlePauseSession = async () => {
    setMenuOpen(false);
    await window.watchingPillAPI.pauseSession();
  };

  const handleResumeSession = async () => {
    setMenuOpen(false);
    await window.watchingPillAPI.resumeSession();
  };

  const handleEndSession = async () => {
    setMenuOpen(false);
    // End session and get captures
    const result = await window.watchingPillAPI.endSession();
    console.log("[WatchingPill] Session ended:", result);

    // Open console to show the session detail
    window.watchingPillAPI.showConsole();
  };

  // Start a new monitoring session
  const handleStartSession = async () => {
    if (isStartingSession || selectedWindows.length === 0) return;

    setIsStartingSession(true);
    setMenuOpen(false);

    try {
      // Get user context from main process
      const userContext = await window.watchingPillAPI.getCurrentUser();
      if (!userContext) {
        console.error("[WatchingPill] No user context available - please log in first");
        // Open console so user can log in
        window.watchingPillAPI.showConsole();
        return;
      }

      // Step 1: Create session in backend to get session ID
      const backendResult = await window.watchingPillAPI.createBackendSession({
        selectedWindows: selectedWindows.map((w) => ({
          windowId: w.windowId,
          appName: w.appName,
          windowTitle: w.windowTitle,
        })),
        captureIntervalMs: 5000, // 5 second default interval
      });

      if (backendResult.error || !backendResult.session?.id) {
        console.error("[WatchingPill] Failed to create backend session:", backendResult.error);
        return;
      }

      const sessionId = backendResult.session.id;
      console.log("[WatchingPill] Backend session created:", sessionId);

      // Step 2: Start Electron capture loop with backend's session ID
      const result = await window.watchingPillAPI.startSession({
        sessionId,
        selectedWindows,
        captureIntervalMs: 5000,
        userId: userContext.userId,
        organizationId: userContext.organizationId,
      });

      if (result.error) {
        console.error("[WatchingPill] Failed to start session:", result.error);
      } else {
        console.log("[WatchingPill] Session started:", result.sessionId);
        // Turn off watch mode since session is now active
        setWatchModeActive(false);
        await window.watchingPillAPI.toggleWatchMode(false);
      }
    } catch (error) {
      console.error("[WatchingPill] Error starting session:", error);
    } finally {
      setIsStartingSession(false);
    }
  };

  return (
    <div className="h-full w-full flex items-start justify-end p-1 app-drag">
      {/* Vertical Pill Container */}
      <div className="relative flex flex-col items-center bg-[#1A1A1A]/95 backdrop-blur-lg rounded-full shadow-2xl border border-white/10 py-2 px-1.5 gap-1.5">
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

        {/* Eye Button - toggles watch mode to add windows */}
        <button
          onClick={handleEyeClick}
          className={`w-6 h-6 flex items-center justify-center rounded-full transition-all app-no-drag ${
            watchModeActive
              ? "bg-primary text-white"
              : "hover:bg-white/10 text-white/70"
          }`}
          aria-label={watchModeActive ? "Stop selecting windows" : "Select windows to watch"}
        >
          {watchModeActive ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>

        {/* Window count badge - click to expand list */}
        {selectedWindows.length > 0 && (
          <div className="relative app-no-drag" ref={windowListRef}>
            <button
              onClick={() => setShowWindowList(!showWindowList)}
              className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Show watched windows"
            >
              <span className="text-[10px] text-white font-medium">
                {selectedWindows.length}
              </span>
              <ChevronDown
                size={8}
                className={`text-white/70 ml-0.5 transition-transform ${
                  showWindowList ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Window list dropdown */}
            {showWindowList && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-[#2A2A2A] rounded-lg shadow-xl border border-white/10 py-2 animate-in fade-in slide-in-from-top-2 duration-150 z-50 app-no-drag">
                <div className="text-[10px] text-white/50 px-3 py-1 mb-1">
                  Watching {selectedWindows.length} window{selectedWindows.length !== 1 ? "s" : ""}
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {selectedWindows.map((windowInfo) => (
                    <div
                      key={windowInfo.windowId}
                      className="flex items-center justify-between px-3 py-1.5 hover:bg-white/5 transition-colors"
                    >
                      <span className="text-xs text-white truncate flex-1 mr-2">
                        {windowInfo.appName}
                        {windowInfo.windowTitle && (
                          <span className="text-white/50"> - {windowInfo.windowTitle}</span>
                        )}
                      </span>
                      <button
                        onClick={() => handleRemoveWindow(windowInfo.windowId)}
                        className="p-0.5 rounded hover:bg-white/10 transition-colors flex-shrink-0"
                        aria-label={`Stop watching ${windowInfo.appName}`}
                      >
                        <X size={10} className="text-white/50 hover:text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="w-5 h-px bg-white/10" />

        {/* Menu Button */}
        <div className="relative app-no-drag" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            <MoreVertical size={12} className="text-white/70" />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div className="absolute top-full right-0 mt-2 bg-[#2A2A2A] rounded-lg shadow-xl border border-white/10 py-1 animate-in fade-in slide-in-from-top-2 duration-150 z-50 min-w-[120px] app-no-drag">
              {/* Start Session - always show when no session */}
              {showStartSession && (
                <button
                  onClick={handleStartSession}
                  disabled={!canStartSession || isStartingSession}
                  className={`flex items-center gap-1.5 w-full text-left px-3 py-1.5 text-xs transition-colors whitespace-nowrap ${
                    canStartSession
                      ? "text-green-400 hover:bg-white/10"
                      : "text-white/30 cursor-not-allowed"
                  }`}
                  title={!canStartSession ? "Select windows to watch first" : undefined}
                >
                  <Play size={10} />
                  {isStartingSession ? "Starting..." : "Start New Session"}
                </button>
              )}

              {/* Divider after Start Session */}
              {showStartSession && <div className="h-px bg-white/10 my-1" />}

              {/* Session controls based on state */}
              {isActive && (
                <button
                  onClick={handlePauseSession}
                  className="block w-full text-left px-3 py-1.5 text-xs text-white/90 hover:bg-white/10 transition-colors whitespace-nowrap"
                >
                  Pause Session
                </button>
              )}

              {isPaused && (
                <button
                  onClick={handleResumeSession}
                  className="block w-full text-left px-3 py-1.5 text-xs text-white/90 hover:bg-white/10 transition-colors whitespace-nowrap"
                >
                  Resume Session
                </button>
              )}

              {hasSession && (
                <button
                  onClick={handleEndSession}
                  className="block w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/10 transition-colors whitespace-nowrap"
                >
                  End Session
                </button>
              )}

              {/* Divider if there are session controls */}
              {hasSession && <div className="h-px bg-white/10 my-1" />}

              {/* Always show Open Console */}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  window.watchingPillAPI.showConsole();
                }}
                className="block w-full text-left px-3 py-1.5 text-xs text-white/90 hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                Open Console
              </button>

              {/* Hide pill option */}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  window.watchingPillAPI.hide();
                }}
                className="block w-full text-left px-3 py-1.5 text-xs text-white/50 hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                Hide Pill
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
