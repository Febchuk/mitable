import { useState, useEffect, useRef } from "react";
import { MoreVertical, Eye, EyeOff, Mic, MicOff } from "lucide-react";
import LogoIcon from "@/assets/logo-icon.svg";
import type { MonitoringSessionState, SelectedWindowInfo } from "@mitable/shared";
import { createLogger } from "../../lib/logger";

const logger = createLogger("WatchingPill");

export default function App() {
  // Session state
  const [sessionState, setSessionState] = useState<MonitoringSessionState | null>(null);

  // Window management (for badge count)
  const [selectedWindows, setSelectedWindows] = useState<SelectedWindowInfo[]>([]);

  // Audio recording state
  const [audioRecordingEnabled, setAudioRecordingEnabled] = useState(false);
  const [audioRecordingActive, setAudioRecordingActive] = useState(false);
  // Ref mirrors audioRecordingActive so closures always see the current value
  const audioRecordingActiveRef = useRef(false);

  // Track which dropdown is open (for UI state only)
  const [eyeDropdownOpen, setEyeDropdownOpen] = useState(false);
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);

  // Collapsed/expanded pill state
  const [isExpanded, setIsExpanded] = useState(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived state
  const isActive = sessionState?.status === "active";
  const isPaused = sessionState?.status === "paused";
  const isDropdownOpen = eyeDropdownOpen || menuDropdownOpen;

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
    const unsubSession = window.watchingPillAPI.onSessionUpdate(async (state) => {
      logger.info(" Session update:", state);
      setSessionState(state);

      // If session ended, stop audio capture (use ref to avoid stale closure)
      if (
        audioRecordingActiveRef.current &&
        (!state || (state.status !== "active" && state.status !== "paused"))
      ) {
        logger.info("🔇 Session ended, stopping audio capture");
        const { audioCaptureService } = await import("./services/audioCapture");
        await audioCaptureService.stopCapture();
        await window.watchingPillAPI?.stopAudioRecording();
        setAudioRecordingEnabled(false);
        setAudioRecordingActive(false);
        audioRecordingActiveRef.current = false;
      }
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

    // Main process forces audio stop when session ends without explicit mic toggle
    const unsubForceStopAudio = window.watchingPillAPI.onForceStopAudio(async () => {
      logger.info("🔇 Force-stop audio received from main process");
      const { audioCaptureService } = await import("./services/audioCapture");
      await audioCaptureService.stopCapture();
      setAudioRecordingEnabled(false);
      setAudioRecordingActive(false);
      audioRecordingActiveRef.current = false;
    });

    return () => {
      unsubSession();
      unsubWindows();
      unsubEyeClose();
      unsubMenuClose();
      unsubForceStopAudio();
    };
  }, []);

  // Expand on hover, collapse on leave (with delay)
  const handleMouseEnter = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setIsExpanded(true);
  };

  const handleMouseLeave = () => {
    // Don't collapse if a dropdown is open
    if (eyeDropdownOpen || menuDropdownOpen) return;
    collapseTimerRef.current = setTimeout(() => {
      setIsExpanded(false);
    }, 400);
  };

  // Keep expanded while dropdowns are open, collapse when they close
  useEffect(() => {
    if (!isDropdownOpen && !isExpanded) return;
    if (!isDropdownOpen) {
      // Dropdown just closed — start collapse timer
      collapseTimerRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, 400);
    }
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, [isDropdownOpen]);

  // Click logo opens console
  const handleLogoClick = () => {
    window.watchingPillAPI?.showConsole();
  };

  // Eye button toggles window selector dropdown (main process handles toggle logic)
  const handleEyeClick = async () => {
    await window.watchingPillAPI?.showEyeDropdown();
  };

  // Menu button toggles session controls dropdown (main process handles toggle logic)
  const handleMenuClick = async () => {
    await window.watchingPillAPI?.showMenuDropdown();
  };

  // Microphone button toggles audio recording
  const handleMicClick = async () => {
    const newState = !audioRecordingEnabled;
    setAudioRecordingEnabled(newState);

    if (newState) {
      // Start audio recording
      logger.info("🎤 Enabling audio recording");

      // Step 1: Connect WebSocket in main process
      const result = await window.watchingPillAPI?.startAudioRecording();

      if (!result?.success) {
        logger.error("❌ Failed to start audio recording:", result?.error);
        setAudioRecordingEnabled(false);
        return;
      }

      // Step 2: Start audio capture in renderer
      const { audioCaptureService } = await import("./services/audioCapture");
      const captureResult = await audioCaptureService.startCapture(sessionState?.id || "");

      if (!captureResult.success) {
        logger.error("❌ Failed to start audio capture:", captureResult.error);
        await window.watchingPillAPI?.stopAudioRecording();
        setAudioRecordingEnabled(false);
        return;
      }

      logger.info("✅ Audio recording started", { hasSystemAudio: captureResult.hasSystemAudio });
      setAudioRecordingActive(true);
      audioRecordingActiveRef.current = true;
    } else {
      // Stop audio recording
      logger.info("🔇 Disabling audio recording");

      // Stop renderer capture
      const { audioCaptureService } = await import("./services/audioCapture");
      await audioCaptureService.stopCapture();

      // Stop main WebSocket
      await window.watchingPillAPI?.stopAudioRecording();
      setAudioRecordingActive(false);
      audioRecordingActiveRef.current = false;
    }
  };

  return (
    <div
      className="h-full w-full flex items-start justify-center app-drag"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Vertical Pill Container */}
      <div className="flex flex-col items-center bg-[#1A1A1A]/95 backdrop-blur-lg rounded-full shadow-2xl border border-white/10 p-2.5 gap-1.5 transition-all duration-300 ease-in-out">
        {/* Top: Mitable Logo with status indicator — always visible */}
        <button
          onClick={handleLogoClick}
          className="relative w-6 h-6 flex items-center justify-center app-no-drag cursor-pointer"
          aria-label="Open Mitable console"
        >
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
        </button>

        {/* Expandable section — visible on hover */}
        <div
          className={`flex flex-col items-center gap-1.5 overflow-hidden transition-all duration-300 ease-in-out ${
            isExpanded ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
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

          {/* Microphone Button - Audio Recording Toggle */}
          <button
            onClick={handleMicClick}
            className={`relative w-6 h-6 flex items-center justify-center rounded-full transition-all app-no-drag ${
              audioRecordingEnabled
                ? "bg-red-500/30 text-white hover:bg-red-500/40 active:bg-red-500/50 active:scale-95"
                : "hover:bg-white/10 active:bg-white/20 active:scale-95 text-white/70"
            }`}
            aria-label={audioRecordingEnabled ? "Stop audio recording" : "Start audio recording"}
          >
            {audioRecordingEnabled ? <Mic size={12} /> : <MicOff size={12} />}

            {/* Recording indicator - pulsing red dot */}
            {audioRecordingActive && (
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
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
    </div>
  );
}
