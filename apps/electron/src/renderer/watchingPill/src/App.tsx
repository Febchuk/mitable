import { useState, useEffect, useRef, type MouseEvent } from "react";
import { Eye, EyeOff, Mic, MicOff, Pause, Play } from "lucide-react";
import LogoIcon from "@/assets/logo-icon.svg";
import type { MonitoringSessionState, SelectedWindowInfo } from "@mitable/shared";
import { createLogger } from "../../lib/logger";

const logger = createLogger("WatchingPill");

export default function App() {
  const [sessionState, setSessionState] = useState<MonitoringSessionState | null>(null);
  const [selectedWindows, setSelectedWindows] = useState<SelectedWindowInfo[]>([]);
  const [audioRecordingEnabled, setAudioRecordingEnabled] = useState(false);
  const [audioRecordingActive, setAudioRecordingActive] = useState(false);
  const audioRecordingActiveRef = useRef(false);

  const [eyeDropdownOpen, setEyeDropdownOpen] = useState(false);
  const [showFocusTrackerWindowPickerOnPill, setShowFocusTrackerWindowPickerOnPill] = useState(false);

  const [isExpanded, setIsExpanded] = useState(false);
  const [pillMode, setPillMode] = useState<"compact" | "expanded">("compact");
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = sessionState?.status === "active";
  const isPaused = sessionState?.status === "paused";
  const hasSession = isActive || isPaused;
  const showFocusPicker = showFocusTrackerWindowPickerOnPill;
  const isDropdownOpen = eyeDropdownOpen;

  useEffect(() => {
    if (!window.watchingPillAPI) {
      logger.warn(" watchingPillAPI not available - IPC disabled");
      return;
    }

    window.watchingPillAPI.getSessionState().then((state) => {
      setSessionState(state);
    });

    window.watchingPillAPI.getSelectedWindows().then((windows) => {
      setSelectedWindows(windows);
    });

    window.watchingPillAPI.getShowFocusTrackerWindowPickerOnPill().then((r) => {
      setShowFocusTrackerWindowPickerOnPill(r.enabled);
    });
    const unsubPillFocusPicker = window.watchingPillAPI.onShowFocusTrackerWindowPickerOnPillChanged(
      (enabled) => {
        setShowFocusTrackerWindowPickerOnPill(enabled);
      }
    );

    window.watchingPillAPI.getCurrentUser().then((user) => {
      if (user?.userId) {
        window.watchingPillAPI.getPillDisplayMode(user.userId).then((mode) => {
          setPillMode(mode);
          if (mode === "expanded") setIsExpanded(true);
        });
      }
    });

    const unsubSession = window.watchingPillAPI.onSessionUpdate(async (state) => {
      setSessionState(state);

      if (
        audioRecordingActiveRef.current &&
        (!state || (state.status !== "active" && state.status !== "paused"))
      ) {
        const { audioCaptureService } = await import("./services/audioCapture");
        await audioCaptureService.stopCapture();
        await window.watchingPillAPI?.stopAudioRecording();
        setAudioRecordingEnabled(false);
        setAudioRecordingActive(false);
        audioRecordingActiveRef.current = false;
      }
    });

    const unsubWindows = window.watchingPillAPI.onWindowsUpdated((windows) => {
      setSelectedWindows(windows);
    });

    const unsubEyeClose = window.watchingPillAPI.onEyeDropdownClosed(() => {
      setEyeDropdownOpen(false);
    });

    const unsubForceStopAudio = window.watchingPillAPI.onForceStopAudio(async () => {
      const { audioCaptureService } = await import("./services/audioCapture");
      await audioCaptureService.stopCapture();
      setAudioRecordingEnabled(false);
      setAudioRecordingActive(false);
      audioRecordingActiveRef.current = false;
    });

    const unsubForceStartAudio = window.watchingPillAPI.onForceStartAudio(async () => {
      const result = await window.watchingPillAPI?.startAudioRecording();
      if (!result?.success) return;

      const state = await window.watchingPillAPI?.getSessionState();
      const { audioCaptureService } = await import("./services/audioCapture");
      const captureResult = await audioCaptureService.startCapture(state?.id || "");

      if (!captureResult.success) {
        await window.watchingPillAPI?.stopAudioRecording();
        return;
      }

      setAudioRecordingEnabled(true);
      setAudioRecordingActive(true);
      audioRecordingActiveRef.current = true;
    });

    const unsubPillMode = window.watchingPillAPI.onPillDisplayModeChanged((mode) => {
      setPillMode(mode);
      if (mode === "expanded") setIsExpanded(true);
    });

    return () => {
      unsubPillFocusPicker();
      unsubSession();
      unsubWindows();
      unsubEyeClose();
      unsubForceStopAudio();
      unsubForceStartAudio();
      unsubPillMode();
    };
  }, []);

  const handleMouseEnter = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setIsExpanded(true);
  };

  const handleMouseLeave = () => {
    if (pillMode === "expanded") return;
    if (eyeDropdownOpen) return;
    collapseTimerRef.current = setTimeout(() => {
      setIsExpanded(false);
    }, 400);
  };

  useEffect(() => {
    if (pillMode === "expanded") return;
    if (!isDropdownOpen && !isExpanded) return;
    if (!isDropdownOpen) {
      collapseTimerRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, 400);
    }
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, [isDropdownOpen, pillMode, isExpanded]);

  const handleLogoClick = () => {
    window.watchingPillAPI?.showConsole();
  };

  const handleEyeClick = async () => {
    if (!showFocusPicker) return;
    setEyeDropdownOpen(true);
    await window.watchingPillAPI?.showEyeDropdown();
  };

  /** Same main handlers as console: `monitoring-session-pause` / `monitoring-session-resume` */
  const handlePauseResumeClick = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!hasSession || !window.watchingPillAPI) return;
    try {
      const result = isPaused
        ? await window.watchingPillAPI.resumeSession()
        : await window.watchingPillAPI.pauseSession();
      if (!result?.success) {
        logger.warn("Pause/resume IPC returned failure:", result?.error);
      }
      const fresh = await window.watchingPillAPI.getSessionState();
      setSessionState(fresh);
    } catch (err) {
      logger.error("Pause/resume invoke failed:", err);
    }
  };

  const handleMicClick = async () => {
    const newState = !audioRecordingEnabled;
    setAudioRecordingEnabled(newState);

    if (newState) {
      const result = await window.watchingPillAPI?.startAudioRecording();

      if (!result?.success) {
        setAudioRecordingEnabled(false);
        return;
      }

      const { audioCaptureService } = await import("./services/audioCapture");
      const captureResult = await audioCaptureService.startCapture(sessionState?.id || "");

      if (!captureResult.success) {
        await window.watchingPillAPI?.stopAudioRecording();
        setAudioRecordingEnabled(false);
        return;
      }

      setAudioRecordingActive(true);
      audioRecordingActiveRef.current = true;
    } else {
      const { audioCaptureService } = await import("./services/audioCapture");
      await audioCaptureService.stopCapture();

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
      <div className="flex flex-col items-center bg-[#1A1A1A]/95 backdrop-blur-lg rounded-full p-2 transition-all duration-300 ease-in-out">
        <button
          type="button"
          onClick={handleLogoClick}
          className="relative w-7 h-7 flex items-center justify-center app-no-drag cursor-pointer group"
          aria-label="Open Mitable console"
          title="Open Console"
        >
          <img
            src={LogoIcon}
            alt="Mitable"
            className="h-5 w-auto transition-all duration-150 group-hover:scale-110 group-hover:brightness-125 opacity-100"
          />

          {isActive && (
            <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          )}

          {isPaused && (
            <div className="absolute top-0 right-0 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          )}
        </button>

        <div
          className={`flex flex-col items-center gap-1.5 transition-all duration-300 ease-in-out ${
            isExpanded ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
          }`}
          style={{ clipPath: isExpanded ? "inset(0 -10px 0 -10px)" : "inset(0 -10px 100% -10px)" }}
        >
          <div className="w-5 h-px bg-white/10" />

          {hasSession && (
            <button
              type="button"
              onClick={handlePauseResumeClick}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 active:scale-95 text-white/70 app-no-drag"
              aria-label={isPaused ? "Resume session" : "Pause session"}
              title={isPaused ? "Resume session" : "Pause session"}
            >
              {isPaused ? <Play size={13} /> : <Pause size={13} />}
            </button>
          )}

          <button
            type="button"
            onClick={handleMicClick}
            className={`relative w-7 h-7 flex items-center justify-center rounded-full transition-all app-no-drag ${
              audioRecordingEnabled
                ? "bg-red-500/30 text-white hover:bg-red-500/40 active:bg-red-500/50 active:scale-95"
                : "hover:bg-white/10 active:bg-white/20 active:scale-95 text-white/70"
            }`}
            aria-label={audioRecordingEnabled ? "Stop audio recording" : "Start audio recording"}
          >
            {audioRecordingEnabled ? <Mic size={13} /> : <MicOff size={13} />}

            {audioRecordingActive && (
              <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>

          {showFocusPicker && (
            <button
              type="button"
              onClick={handleEyeClick}
              className={`relative w-7 h-7 flex items-center justify-center rounded-full transition-all app-no-drag ${
                eyeDropdownOpen
                  ? "bg-accent/30 text-white"
                  : selectedWindows.length > 0
                    ? "bg-accent/20 text-white hover:bg-accent/30 active:bg-accent/40 active:scale-95"
                    : "hover:bg-white/10 active:bg-white/20 active:scale-95 text-white/70"
              }`}
              aria-label="Windows captured by focus tracker"
              title="Focus-tracker window list"
            >
              {selectedWindows.length > 0 ? (
                <>
                  <Eye size={13} />
                  <span className="absolute -top-0.5 right-0 min-w-[12px] h-[12px] bg-accent rounded-full text-[7px] text-white flex items-center justify-center font-medium leading-none">
                    {selectedWindows.length}
                  </span>
                </>
              ) : (
                <EyeOff size={13} />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
