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
  const [pillMode, setPillMode] = useState<"compact" | "expanded">("compact");
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

    // Load pill display mode preference
    window.watchingPillAPI.getCurrentUser().then((user) => {
      if (user?.userId) {
        window.watchingPillAPI.getPillDisplayMode(user.userId).then((mode) => {
          setPillMode(mode);
          if (mode === "expanded") setIsExpanded(true);
        });
      }
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

    // Main process forces audio stop when session ends or pauses
    const unsubForceStopAudio = window.watchingPillAPI.onForceStopAudio(async () => {
      logger.info("\uD83D\uDD07 Force-stop audio received from main process");
      const { audioCaptureService } = await import("./services/audioCapture");
      await audioCaptureService.stopCapture();
      setAudioRecordingEnabled(false);
      setAudioRecordingActive(false);
      audioRecordingActiveRef.current = false;
    });

    // Main process restarts audio after session resume (if it was recording before pause)
    const unsubForceStartAudio = window.watchingPillAPI.onForceStartAudio(async () => {
      logger.info("🎤 Force-start audio received from main process (resume)");

      const result = await window.watchingPillAPI?.startAudioRecording();
      if (!result?.success) {
        logger.error("❌ Failed to restart audio after resume:", result?.error);
        return;
      }

      const state = await window.watchingPillAPI?.getSessionState();
      const { audioCaptureService } = await import("./services/audioCapture");
      const captureResult = await audioCaptureService.startCapture(state?.id || "");

      if (!captureResult.success) {
        logger.error("❌ Failed to restart audio capture after resume:", captureResult.error);
        await window.watchingPillAPI?.stopAudioRecording();
        return;
      }

      logger.info("✅ Audio recording restarted after resume");
      setAudioRecordingEnabled(true);
      setAudioRecordingActive(true);
      audioRecordingActiveRef.current = true;
    });

    // Listen for pill display mode changes from settings
    const unsubPillMode = window.watchingPillAPI.onPillDisplayModeChanged((mode) => {
      logger.info(" Pill display mode changed:", mode);
      setPillMode(mode);
      if (mode === "expanded") setIsExpanded(true);
    });

    return () => {
      unsubSession();
      unsubWindows();
      unsubEyeClose();
      unsubMenuClose();
      unsubForceStopAudio();
      unsubForceStartAudio();
      unsubPillMode();
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
    // Never collapse if user prefers always-expanded mode
    if (pillMode === "expanded") return;
    // Don't collapse if a dropdown is open
    if (eyeDropdownOpen || menuDropdownOpen) return;
    collapseTimerRef.current = setTimeout(() => {
      setIsExpanded(false);
    }, 400);
  };

  // Keep expanded while dropdowns are open, collapse when they close
  useEffect(() => {
    // Never collapse in expanded mode
    if (pillMode === "expanded") return;
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
  }, [isDropdownOpen, pillMode]);

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
      className="h-full w-full flex items-start justify-center px-1.5 pt-1 app-drag"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Vertical Pill Container */}
      <div className="flex flex-col items-center bg-[#1A1A1A]/95 backdrop-blur-lg rounded-full p-2 transition-all duration-300 ease-in-out">
        {/* Top: Mitable Logo with status indicator — always visible */}
        <button
          onClick={handleLogoClick}
          className="relative w-7 h-7 flex items-center justify-center app-no-drag cursor-pointer group"
          aria-label="Open Mitable console"
          title="Open Console"
        >
          <img
            src={LogoIcon}
            alt="Mitable"
            className={`h-5 w-auto transition-all duration-150 group-hover:scale-110 group-hover:brightness-125 ${isPaused ? "opacity-40" : "opacity-100"}`}
          />

          {/* Recording indicator - red dot */}
          {isActive && (
            <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          )}

          {/* Paused indicator - amber dot */}
          {isPaused && (
            <div className="absolute top-0 right-0 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          )}
        </button>

        {/* Expandable section — visible on hover */}
        <div
          className={`flex flex-col items-center gap-1.5 transition-all duration-300 ease-in-out ${
            isExpanded ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
          }`}
          style={{ clipPath: isExpanded ? "inset(0 -10px 0 -10px)" : "inset(0 -10px 100% -10px)" }}
        >
          {/* Divider */}
          <div className="w-5 h-px bg-white/10" />

          {/* Eye Button - opens window selector dropdown */}
          <button
            onClick={handleEyeClick}
            className={`relative w-7 h-7 flex items-center justify-center rounded-full transition-all app-no-drag ${
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
                <Eye size={13} />
                <span className="absolute -top-0.5 right-0 min-w-[12px] h-[12px] bg-primary rounded-full text-[7px] text-white flex items-center justify-center font-medium leading-none">
                  {selectedWindows.length}
                </span>
              </>
            ) : (
              <EyeOff size={13} />
            )}
          </button>

          {/* Microphone Button - Audio Recording Toggle */}
          <button
            onClick={handleMicClick}
            className={`relative w-7 h-7 flex items-center justify-center rounded-full transition-all app-no-drag ${
              audioRecordingEnabled
                ? "bg-red-500/30 text-white hover:bg-red-500/40 active:bg-red-500/50 active:scale-95"
                : "hover:bg-white/10 active:bg-white/20 active:scale-95 text-white/70"
            }`}
            aria-label={audioRecordingEnabled ? "Stop audio recording" : "Start audio recording"}
          >
            {audioRecordingEnabled ? <Mic size={13} /> : <MicOff size={13} />}

            {/* Recording indicator - pulsing red dot */}
            {audioRecordingActive && (
              <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>

          {/* Divider */}
          <div className="w-5 h-px bg-white/10" />

          {/* Menu Button */}
          <button
            onClick={handleMenuClick}
            className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors app-no-drag ${
              menuDropdownOpen ? "bg-white/10" : "hover:bg-white/10"
            }`}
            aria-label="Open menu"
          >
            <MoreVertical size={13} className="text-white/70" />
          </button>
        </div>
      </div>
    </div>
  );
}
