import { Type, Mic } from "lucide-react";

interface ToggleSwitchProps {
  mode: "text" | "audio";
  onChange: (mode: "text" | "audio") => void;
}

export default function ToggleSwitch({ mode, onChange }: ToggleSwitchProps) {
  return (
    <div className="relative flex items-center bg-agent-toggle-inactive rounded-full p-1 w-20 h-10">
      {/* Sliding background indicator */}
      <div
        className={`absolute w-9 h-8 bg-agent-toggle-active rounded-full transition-transform duration-200 ease-in-out ${
          mode === "audio" ? "translate-x-10" : "translate-x-0"
        }`}
      />

      {/* Text button */}
      <button
        onClick={() => onChange("text")}
        className="relative z-10 w-9 h-8 flex items-center justify-center transition-colors"
        aria-label="Text mode"
      >
        <Type size={16} className={mode === "text" ? "text-black" : "text-text-tertiary"} />
      </button>

      {/* Mic button */}
      <button
        onClick={() => onChange("audio")}
        className="relative z-10 w-9 h-8 flex items-center justify-center transition-colors"
        aria-label="Audio mode"
      >
        <Mic size={16} className={mode === "audio" ? "text-black" : "text-text-tertiary"} />
      </button>
    </div>
  );
}
