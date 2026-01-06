import { useState, useEffect } from "react";
import { Play } from "lucide-react";
import type { MonitoringSessionState, SelectedWindowInfo } from "@mitable/shared";

export default function MenuDropdownApp() {
  const [sessionState, setSessionState] = useState<MonitoringSessionState | null>(null);
  const [selectedWindows, setSelectedWindows] = useState<SelectedWindowInfo[]>([]);

  // Derived state
  const isActive = sessionState?.status === "active";
  const isPaused = sessionState?.status === "paused";
  const hasSession = isActive || isPaused;
  const showStartSession = !hasSession;
  const canStartSession = !hasSession && selectedWindows.length > 0;

  // Listen for data from main process
  useEffect(() => {
    // Skip if preload API not ready
    if (!window.dropdownAPI) {
      console.warn("[MenuDropdownApp] dropdownAPI not available");
      return;
    }

    const unsubscribe = window.dropdownAPI.onData((data) => {
      if (data.type === "menu") {
        setSessionState(data.sessionState);
        setSelectedWindows(data.selectedWindows);
      }
    });

    return unsubscribe;
  }, []);

  const handleAction = async (actionType: string) => {
    await window.dropdownAPI?.action(actionType);
    window.dropdownAPI?.closeMenuDropdown();
  };

  return (
    <div className="w-full h-full bg-[#2A2A2A] rounded-lg shadow-xl border border-white/10 py-1 overflow-hidden">
      {/* Start Session - always show when no session */}
      {showStartSession && (
        <>
          <button
            onClick={() => handleAction("start-session")}
            disabled={!canStartSession}
            className={`flex items-center gap-1.5 w-full text-left px-3 py-1.5 text-xs transition-colors whitespace-nowrap ${
              canStartSession
                ? "text-green-400 hover:bg-white/10"
                : "text-white/30 cursor-not-allowed"
            }`}
            title={!canStartSession ? "Select windows to watch first" : undefined}
          >
            <Play size={10} />
            Start New Session
          </button>
          <div className="h-px bg-white/10 my-1" />
        </>
      )}

      {/* Session controls based on state */}
      {isActive && (
        <button
          onClick={() => handleAction("pause-session")}
          className="block w-full text-left px-3 py-1.5 text-xs text-white/90 hover:bg-white/10 transition-colors whitespace-nowrap"
        >
          Pause Session
        </button>
      )}

      {isPaused && (
        <button
          onClick={() => handleAction("resume-session")}
          className="block w-full text-left px-3 py-1.5 text-xs text-white/90 hover:bg-white/10 transition-colors whitespace-nowrap"
        >
          Resume Session
        </button>
      )}

      {hasSession && (
        <button
          onClick={() => handleAction("end-session")}
          className="block w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-white/10 transition-colors whitespace-nowrap"
        >
          End Session
        </button>
      )}

      {/* Divider if there are session controls */}
      {hasSession && <div className="h-px bg-white/10 my-1" />}

      {/* Always show Open Console */}
      <button
        onClick={() => handleAction("show-console")}
        className="block w-full text-left px-3 py-1.5 text-xs text-white/90 hover:bg-white/10 transition-colors whitespace-nowrap"
      >
        Open Console
      </button>

      {/* Hide pill option */}
      <button
        onClick={() => handleAction("hide-pill")}
        className="block w-full text-left px-3 py-1.5 text-xs text-white/50 hover:bg-white/10 transition-colors whitespace-nowrap"
      >
        Hide Pill
      </button>
    </div>
  );
}
