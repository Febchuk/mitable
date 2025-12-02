import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowUp, Mic, Type, Square } from "lucide-react";
import WatchModeBar from "./WatchModeBar";
import type { SelectedWindowInfo } from "../global";

interface InputBarProps {
  inputMode: "text" | "voice";
  onInputModeChange: (mode: "text" | "voice") => void;
  isRecording: boolean;
  onRecordingChange: (recording: boolean) => void;
  selectedWindows: SelectedWindowInfo[];
  onToggleWatchExpanded: (expanded: boolean) => void;
  onRemoveWindow: (windowId: string) => void;
  watchExpanded: boolean;
  onSendMessage: (content: string) => void;
  disabled?: boolean;
}

function InputBar({
  inputMode,
  onInputModeChange,
  isRecording,
  onRecordingChange,
  selectedWindows,
  onToggleWatchExpanded,
  onRemoveWindow,
  watchExpanded,
  onSendMessage,
  disabled = false,
}: InputBarProps) {
  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  const handleSubmit = () => {
    if (inputMode === "text" && inputValue.trim()) {
      onSendMessage(inputValue);
      setInputValue("");
    } else if (inputMode === "voice") {
      // Toggle recording
      onRecordingChange(!isRecording);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && inputMode === "text") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleEyeClick = () => {
    onToggleWatchExpanded(!watchExpanded);
  };

  return (
    <div className="px-4 py-3 space-y-3">
      {/* TOP: Watch Mode Bar */}
      <WatchModeBar
        isExpanded={watchExpanded}
        windows={selectedWindows}
        onEyeClick={handleEyeClick}
        onRemoveWindow={onRemoveWindow}
      />

      {/* MIDDLE: Textarea */}
      <Textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="How can I help?"
        disabled={disabled || inputMode === "voice"}
        className="min-h-[60px] max-h-[120px] resize-none bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-1 focus-visible:ring-white/30"
        rows={2}
      />

      {/* BOTTOM: Mode toggle (left) + Send button (right) */}
      <div className="flex items-center justify-between">
        {/* Left: Mode toggle */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center bg-white/10 rounded-full p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onInputModeChange("text")}
                  className={`h-8 w-8 rounded-full ${
                    inputMode === "text"
                      ? "bg-white/20 text-white"
                      : "text-white/50 hover:text-white hover:bg-transparent"
                  }`}
                  aria-label="Text mode"
                >
                  <Type className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    onInputModeChange("voice");
                    if (isRecording) onRecordingChange(false);
                  }}
                  className={`h-8 w-8 rounded-full ${
                    inputMode === "voice"
                      ? "bg-white/20 text-white"
                      : "text-white/50 hover:text-white hover:bg-transparent"
                  }`}
                  aria-label="Voice mode"
                >
                  <Mic className="h-4 w-4" />
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {inputMode === "text" ? "Currently in text mode" : "Currently in voice mode"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Right: Send button */}
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={disabled || (inputMode === "text" && !inputValue.trim())}
          className="h-10 w-10 rounded-full"
        >
          {inputMode === "text" ? (
            <ArrowUp className="h-5 w-5" />
          ) : isRecording ? (
            <Square className="h-5 w-5" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </Button>
      </div>
    </div>
  );
}

export default InputBar;
