import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUp, Mic, Eye, MessageSquare, Square } from "lucide-react";

interface InputBarProps {
  inputMode: "text" | "voice";
  onInputModeChange: (mode: "text" | "voice") => void;
  isRecording: boolean;
  onRecordingChange: (recording: boolean) => void;
  watchingScreen: boolean;
  onToggleWatch: () => void;
  selectedWindowCount: number;
  onSendMessage: (content: string) => void;
  disabled?: boolean;
}

function InputBar({
  inputMode,
  onInputModeChange,
  isRecording,
  onRecordingChange,
  watchingScreen,
  onToggleWatch,
  selectedWindowCount,
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

  const toggleMode = () => {
    onInputModeChange(inputMode === "text" ? "voice" : "text");
    if (isRecording) {
      onRecordingChange(false);
    }
  };

  return (
    <div className="border-t border-white/10 px-4 py-3 space-y-3">
      {/* Input row */}
      <div className="relative flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="How can I help?"
          disabled={disabled || inputMode === "voice"}
          className="min-h-[40px] max-h-[120px] resize-none pr-12 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-1 focus-visible:ring-white/30"
          rows={1}
        />

        {/* Submit button (inside input) */}
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={disabled || (inputMode === "text" && !inputValue.trim())}
          className="absolute right-2 bottom-2 h-8 w-8"
        >
          {inputMode === "text" ? (
            <ArrowUp className="h-4 w-4" />
          ) : isRecording ? (
            <Square className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between">
        {/* Left: Voice mode toggle */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={inputMode === "voice" ? "secondary" : "ghost"}
                size="sm"
                onClick={toggleMode}
                className="flex items-center gap-1.5 text-white/70 hover:text-white hover:bg-white/10"
              >
                {inputMode === "voice" ? (
                  <MessageSquare className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
                <span className="text-xs">
                  {inputMode === "voice" ? "Text mode" : "Voice mode"}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Switch to {inputMode === "voice" ? "text" : "voice"} input
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Right: Watch button */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={watchingScreen ? "secondary" : "ghost"}
                size="sm"
                onClick={onToggleWatch}
                className="flex items-center gap-1.5 text-white/70 hover:text-white hover:bg-white/10"
              >
                <Eye className="h-4 w-4" />
                {selectedWindowCount > 0 && (
                  <span className="text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                    {selectedWindowCount}
                  </span>
                )}
                {selectedWindowCount === 0 && (
                  <span className="text-xs">Watch</span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {watchingScreen
                ? "Stop watching screen"
                : "Watch screen for context"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

export default InputBar;
