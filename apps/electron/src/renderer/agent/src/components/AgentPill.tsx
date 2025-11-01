import { useState } from "react";
import { ArrowUp, Circle, Square, Type, Mic } from "lucide-react";
import logoIconSvg from "../../../assets/logo-icon.svg";

interface AgentPillProps {
  onSubmit: (message: string) => void;
}

export default function AgentPill({ onSubmit }: AgentPillProps) {
  const [inputMode, setInputMode] = useState<"text" | "audio">("text");
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);

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
    // Text mode: 740px wide, Audio mode: 280px wide
    window.agentAPI.resizeWindow(mode === "text" ? "text-mode" : "audio-mode");
  };

  const handleLogoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log("[AgentPill] Logo clicked - toggling conversation");
    // Open collapsed conversation combobox to switch conversations
    window.agentAPI.toggleConversation();
  };

  return (
    <div
      className={`${
        inputMode === "text" ? "w-[740px] px-6" : "w-[280px] px-4"
      } h-full flex items-center py-2 bg-agent-pill rounded-full app-drag transition-all duration-300`}
    >
      {/* Logo Icon - Click to open conversation switcher */}
      <button
        onClick={handleLogoClick}
        className="cursor-pointer hover:opacity-80 transition-opacity app-no-drag"
      >
        <img src={logoIconSvg} alt="Mitable" className="w-8 h-8 mr-3 flex-shrink-0" />
      </button>

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

      {/* Action Button */}
      {inputMode === "text" ? (
        <button
          onClick={handleSubmit}
          disabled={!inputValue.trim()}
          className="w-10 h-10 rounded-full bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0 app-no-drag"
          aria-label="Send message"
        >
          <ArrowUp size={20} className="text-white" />
        </button>
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
