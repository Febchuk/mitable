import { useState, useRef, useEffect } from "react";
import { MoreVertical, Eye, EyeOff, Play, Plus, X } from "lucide-react";
import LogoIcon from "@/assets/logo-icon.svg";
import type { MonitoringSessionState, SelectedWindowInfo, WatchableWindow } from "@mitable/shared";

export default function App() {
  // Session state
  const [sessionState, setSessionState] = useState<MonitoringSessionState | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);

  // Window management
  const [selectedWindows, setSelectedWindows] = useState<SelectedWindowInfo[]>([]);
  const [availableWindows, setAvailableWindows] = useState<WatchableWindow[]>([]);
  const [showWindowDropdown, setShowWindowDropdown] = useState(false);

  // Menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const eyeRef = useRef<HTMLDivElement>(null);

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
      if (eyeRef.current && !eyeRef.current.contains(event.target as Node)) {
        setShowWindowDropdown(false);
      }
    };

    if (menuOpen || showWindowDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen, showWindowDropdown]);

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

  // Eye button opens dropdown to select windows
  const handleEyeClick = async () => {
    if (showWindowDropdown) {
      setShowWindowDropdown(false);
    } else {
      // Fetch available windows before showing dropdown
      const result = await window.watchingPillAPI.getVisibleWindows();
      if (result.success) {
        setAvailableWindows(result.windows);
      }
      setShowWindowDropdown(true);
    }
  };

  // Toggle window selection in dropdown
  const handleToggleWindow = async (windowInfo: WatchableWindow) => {
    const isSelected = selectedWindows.some((w) => w.windowId === windowInfo.windowId);
    if (isSelected) {
      await window.watchingPillAPI.unselectWindow(windowInfo.windowId);
    } else {
      await window.watchingPillAPI.selectWindow({
        windowId: windowInfo.windowId,
        appName: windowInfo.appName,
        windowTitle: windowInfo.windowTitle,
      });
    }
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

    try {
      // Step 1: End Electron session and get captures
      const result = await window.watchingPillAPI.endSession();
      console.log("[WatchingPill] Electron session ended:", result);

      if (!result.success || !result.sessionId) {
        console.error("[WatchingPill] Failed to end session:", result.error);
        window.watchingPillAPI.showConsole();
        return;
      }

      // Step 2: Upload captures to backend and trigger summarization
      if (result.captures && result.captures.length > 0) {
        console.log("[WatchingPill] Finalizing session with", result.captures.length, "captures");
        const finalizeResult = await window.watchingPillAPI.finalizeSession(
          result.sessionId,
          result.captures
        );

        if (!finalizeResult.success) {
          console.error("[WatchingPill] Failed to finalize session:", finalizeResult.error);
        } else {
          console.log("[WatchingPill] Session finalized successfully - summary generation started");
        }
      } else {
        // No captures, still call finalize to mark session as ended in backend
        console.log("[WatchingPill] No captures, finalizing empty session");
        await window.watchingPillAPI.finalizeSession(result.sessionId, []);
      }

      // Open console to show the session detail
      window.watchingPillAPI.showConsole();
    } catch (error) {
      console.error("[WatchingPill] Error ending session:", error);
      window.watchingPillAPI.showConsole();
    }
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

        {/* Eye Button - opens window selector dropdown */}
        <div className="relative app-no-drag" ref={eyeRef}>
          <button
            onClick={handleEyeClick}
            className={`relative w-6 h-6 flex items-center justify-center rounded-full transition-all ${
              showWindowDropdown || selectedWindows.length > 0
                ? "bg-primary/20 text-white"
                : "hover:bg-white/10 text-white/70"
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

          {/* Window selector dropdown */}
          {showWindowDropdown && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-[#2A2A2A] rounded-lg shadow-xl border border-white/10 py-2 animate-in fade-in slide-in-from-top-2 duration-150 z-50 app-no-drag">
              {/* Selected windows as chips */}
              <div className="px-3 pb-2">
                <div className="text-[10px] text-white/50 mb-1.5">Watching</div>
                {selectedWindows.length === 0 ? (
                  <div className="text-xs text-white/30 italic">No windows selected</div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {selectedWindows.map((win) => (
                      <div
                        key={win.windowId}
                        className="flex items-center gap-1 bg-primary/20 border border-primary/30 rounded-full pl-2 pr-1 py-0.5"
                      >
                        <span className="text-[10px] text-white truncate max-w-[120px]">
                          {win.appName}
                        </span>
                        <button
                          onClick={() => window.watchingPillAPI.unselectWindow(win.windowId)}
                          className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                        >
                          <X size={10} className="text-white/70" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="h-px bg-white/10 mx-2 my-1" />

              {/* Available windows to add */}
              <div className="text-[10px] text-white/50 px-3 py-1">Add Window</div>
              <div className="max-h-32 overflow-y-auto">
                {availableWindows.filter(
                  (w) => !w.isBlocked && !selectedWindows.some((s) => s.windowId === w.windowId)
                ).length === 0 ? (
                  <div className="px-3 py-2 text-xs text-white/30">
                    {availableWindows.length === 0 ? "No windows available" : "All windows added"}
                  </div>
                ) : (
                  availableWindows
                    .filter(
                      (w) => !w.isBlocked && !selectedWindows.some((s) => s.windowId === w.windowId)
                    )
                    .map((windowInfo) => (
                      <button
                        key={windowInfo.windowId}
                        onClick={() => handleToggleWindow(windowInfo)}
                        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-white/5 transition-colors text-left"
                      >
                        <div className="w-4 h-4 rounded-full border border-white/30 flex items-center justify-center flex-shrink-0 hover:border-primary hover:bg-primary/10">
                          <Plus size={10} className="text-white/50" />
                        </div>
                        <span className="text-xs text-white truncate flex-1">
                          {windowInfo.appName}
                          {windowInfo.windowTitle && (
                            <span className="text-white/50"> - {windowInfo.windowTitle}</span>
                          )}
                        </span>
                      </button>
                    ))
                )}
              </div>
            </div>
          )}
        </div>

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
