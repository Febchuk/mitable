import { useState } from "react";
import { ArrowUp, Circle, Square } from "lucide-react";
import logoIconSvg from "../../../assets/logo-icon.svg";
import ToggleSwitch from "../../../components/legacy/ToggleSwitch";

interface AgentPillProps {
  onSubmit: (message: string) => void;
}

export default function AgentPill({ onSubmit }: AgentPillProps) {
  const [inputMode, setInputMode] = useState<"text" | "audio">("text");
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === "text" && inputValue.trim()) {
      onSubmit(inputValue);
      setInputValue("");
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
  };

  return (
    <div
      className={`${
        inputMode === "text" ? "w-[740px] px-6" : "w-[280px] px-4"
      } h-full flex items-center py-2 bg-agent-pill rounded-full app-drag transition-all duration-300`}
    >
      {/* Logo Icon */}
      <div className="cursor-move">
        <img src={logoIconSvg} alt="Mitable" className="w-8 h-8 mr-3 flex-shrink-0" />
      </div>

      {/* Input Area (Text mode only) */}
      {inputMode === "text" && (
        <form onSubmit={handleSubmit} className="flex-1 flex items-center mr-3 app-no-drag">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask me anything"
            className="flex-1 bg-transparent text-text-primary placeholder-text-tertiary outline-none text-sm"
          />
        </form>
      )}

      {/* Toggle Switch */}
      <div className="mr-3 app-no-drag">
        <ToggleSwitch mode={inputMode} onChange={handleModeChange} />
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
