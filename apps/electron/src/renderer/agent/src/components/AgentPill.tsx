import { useState, useEffect } from "react";
import type { SelectedWindowInfo } from "@mitable/shared";
import {
  ArrowUp,
  Circle,
  Square,
  Type,
  Mic,
  Eye,
  EyeOff,
  ChevronDown,
  X,
  Maximize2,
} from "lucide-react";
import logoIconSvg from "../../../assets/logo-icon.svg";

interface AgentPillProps {
  onSubmit: (message: string) => void;
}

export default function AgentPill({ onSubmit }: AgentPillProps) {
  const [inputMode, setInputMode] = useState<"text" | "audio">("text");
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [watchingScreen, setWatchingScreen] = useState(false);
  const [selectedWindows, setSelectedWindows] = useState<SelectedWindowInfo[]>([]);
  const [dropdownExpanded, setDropdownExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === "text" && inputValue.trim()) {
      console.log("🔵 [AgentPill] Submitting message:", inputValue);
      onSubmit(inputValue);
      setInputValue("");
      console.log("🔵 [AgentPill] Input cleared, message sent");
    } else {
      console.log(
        "🔴 [AgentPill] Submit blocked - inputMode:",
        inputMode,
        "hasValue:",
        !!inputValue.trim()
      );
    }
  };

  const handleRecord = () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      // TODO: Process audio and submit
      onSubmit("[Audio message]");
    } else {
      // Start recording
      setIsRecording(true);
    }
  };

  const handleModeChange = (mode: "text" | "audio") => {
    setInputMode(mode);
    if (mode === "audio") {
      setInputValue("");
    }

    // Resize the Electron window to match pill content
    // Text mode: 800px wide, Audio mode: 280px wide
    window.agentAPI.resizeWindow(mode === "text" ? "text-mode" : "audio-mode");
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log("[AgentPill] Logo clicked - toggling conversation");
    // Open collapsed conversation combobox to switch conversations
    window.agentAPI.toggleConversation();
  };

  const handleWatchToggle = async () => {
    const newState = !watchingScreen;
    setWatchingScreen(newState);

    // Toggle watch mode in main process
    await window.agentAPI.toggleWatchMode(newState);

    // If turning off, clear selected apps
    if (!newState) {
      setSelectedWindows([]);
      setDropdownExpanded(false);
    }
  };

  const handleRemoveWindow = async (windowId: string) => {
    await window.agentAPI.unselectWindow(windowId);
    // State will be updated by the WATCH_WINDOWS_UPDATED event
  };

  // Listen for watch window updates from main process
  useEffect(() => {
    const handleWatchWindowsUpdated = (windows: SelectedWindowInfo[]) => {
      console.log("[AgentPill] Watch windows updated:", windows);
      setSelectedWindows(windows);
    };

    // Register listener
    window.agentAPI.onWatchWindowsUpdated(handleWatchWindowsUpdated);

    // Cleanup listener on unmount
    return () => {
      window.agentAPI.offWatchWindowsUpdated(handleWatchWindowsUpdated);
    };
  }, []);

  return (
    <div
      className={`$${
        inputMode === "text" ? "w-[800px] px-6" : "w-[280px] px-4"
      } h-full flex items-center py-2 bg-agent-pill rounded-full app-drag transition-all duration-300`}
    >
      {/* Logo Icon - Click to open conversation switcher */}
      <button
        onClick={handleLogoClick}
        className="cursor-pointer hover:opacity-80 transition-opacity app-no-drag"
      >
        <img src={logoIconSvg} alt="Mitable" className="w-8 h-8 mr-3 flex-shrink-0" />
      </button>

      {/* Watch Mode Controls - Only show in text mode */}
      {inputMode === "text" && (
        <div className="relative flex items-center mr-3">
          {/* Eye Button */}
          <button
            onClick={handleWatchToggle}
            className={`flex items-center justify-center w-9 h-9 rounded-lg transition-all app-no-drag ${
              watchingScreen
                ? "bg-primary text-white hover:bg-primary-hover"
                : "bg-[#3e3e3e] text-muted-foreground hover:bg-[#4a4a4a]"
            }`}
            aria-label={watchingScreen ? "Stop watching screen" : "Start watching screen"}
          >
            {watchingScreen ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>

          {/* Chevron + Count Badge - Only show when apps selected */}
          {selectedWindows.length > 0 && (
            <button
              onClick={() => setDropdownExpanded(!dropdownExpanded)}
              className="flex items-center ml-1 px-2 h-9 rounded-lg bg-[#3e3e3e] hover:bg-[#4a4a4a] transition-colors app-no-drag"
              aria-label="Toggle app list"
            >
              <span className="text-xs text-muted-foreground mr-1">{selectedWindows.length}</span>
              <ChevronDown
                size={14}
                className={`text-muted-foreground transition-transform ${
                  dropdownExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
          )}

          {/* Dropdown List */}
          {dropdownExpanded && selectedWindows.length > 0 && (
            <div className="absolute top-full mt-2 left-0 w-64 bg-[#2a2a2a] rounded-lg shadow-lg border border-[#3e3e3e] py-2 z-50">
              <div className="text-xs text-muted-foreground px-3 py-1 mb-1">
                Watching {selectedWindows.length} window{selectedWindows.length !== 1 ? "s" : ""}
              </div>
              {selectedWindows.map((windowInfo) => (
                <div
                  key={windowInfo.windowId}
                  className="flex items-center justify-between px-3 py-2 hover:bg-[#3e3e3e] transition-colors"
                >
                  <span className="text-sm text-text-primary truncate">
                    {windowInfo.appName} - {windowInfo.windowTitle}
                  </span>
                  <button
                    onClick={() => handleRemoveWindow(windowInfo.windowId)}
                    className="ml-2 p-1 rounded hover:bg-[#4a4a4a] transition-colors"
                    aria-label={`Stop watching ${windowInfo.appName}`}
                  >
                    <X size={14} className="text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Input Area (Text mode only) */}
      {inputMode === "text" && (
        <form onSubmit={handleSubmit} className="flex-1 flex items-center mr-3 app-no-drag">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask me anything"
            className="flex-1 bg-transparent text-text-primary placeholder-text-tertiary outline-none text-[15px]"
          />
        </form>
      )}

      {/* Mode Toggle (Text/Audio) */}
      <div className="relative flex items-center bg-[#3e3e3e] rounded-full p-1 w-20 h-10 mr-3 app-no-drag">
        {/* Sliding background indicator */}
        <div
          className={`absolute w-9 h-8 bg-[#1a1a1a] rounded-full transition-transform duration-200 ease-in-out ${
            inputMode === "audio" ? "translate-x-10" : "translate-x-0"
          }`}
        />

        {/* Text button */}
        <button
          onClick={() => handleModeChange("text")}
          className="relative z-10 w-9 h-8 flex items-center justify-center transition-colors"
          aria-label="Text mode"
        >
          <Type
            size={16}
            className={inputMode === "text" ? "text-primary-foreground" : "text-muted-foreground"}
          />
        </button>

        {/* Audio button */}
        <button
          onClick={() => handleModeChange("audio")}
          className="relative z-10 w-9 h-8 flex items-center justify-center transition-colors"
          aria-label="Audio mode"
        >
          <Mic
            size={16}
            className={inputMode === "audio" ? "text-primary-foreground" : "text-muted-foreground"}
          />
        </button>
      </div>

      {/* Action Buttons */}
      {inputMode === "text" ? (
        <div className="flex items-center gap-2 app-no-drag">
          <button
            onClick={handleSubmit}
            disabled={!inputValue.trim()}
            className="w-10 h-10 rounded-full bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Send message"
          >
            <ArrowUp size={20} className="text-white" />
          </button>
          <button
            onClick={() => {
              console.log("[AgentPill] Maximize clicked - opening Console window and hiding pill");
              // Open the main Console window
              window.agentAPI.showConsole();
              // Hide the agent pill
              window.agentAPI.toggle();
            }}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-primary hover:shadow-glow-purple flex items-center justify-center transition-all duration-200 flex-shrink-0 group"
            aria-label="Open Console"
            title="Open Console"
          >
            <Maximize2
              size={18}
              className="text-white/60 group-hover:text-white group-hover:scale-110 transition-all"
            />
          </button>
        </div>
      ) : isRecording ? (
        <button
          onClick={handleRecord}
          className="w-10 h-10 rounded-full bg-status-error hover:bg-status-error/90 flex items-center justify-center transition-colors flex-shrink-0 app-no-drag"
          aria-label="Stop recording"
        >
          <Square size={16} className="text-white fill-white" />
        </button>
      ) : (
        <button
          onClick={handleRecord}
          className="w-10 h-10 rounded-full bg-primary hover:bg-primary-hover flex items-center justify-center transition-colors flex-shrink-0 app-no-drag"
          aria-label="Start recording"
        >
          <Circle size={20} className="text-white" />
        </button>
      )}
    </div>
  );
}
