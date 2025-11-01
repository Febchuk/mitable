import { useState, useEffect, useRef } from "react";
import { ChevronRight, MessageSquare, X } from "lucide-react";

export type WorkflowPhase = "initial_proposal" | "step_progression" | "custom_question";

interface WorkflowOption {
  id: number;
  label: string;
  icon?: React.ReactNode;
  action: "progress_step" | "custom_question" | "exit_workflow" | "confirm_start" | "ask_questions";
}

interface WorkflowOptionsProps {
  phase: WorkflowPhase;
  onOptionSelect: (option: WorkflowOption) => void;
  disabled?: boolean;
  isLastStep?: boolean; // Hide "Move on" button on last step
}

/**
 * WorkflowOptions Component
 *
 * Keyboard-navigable option selector for workflow interactions (like Claude Code).
 * Shows different options based on the workflow phase:
 *
 * - initial_proposal: 2 options (confirm start / ask questions first)
 * - step_progression: 3 options (next step / type something / exit)
 * - custom_question: 3 options (I'm good next step / more questions / exit)
 *
 * Focus Behavior:
 * - Auto-focuses when mounted or when phase changes
 * - Keyboard navigation only works when THIS specific instance is focused
 * - Multiple instances on screen won't interfere with each other
 *
 * Keyboard Navigation (when focused):
 * - Arrow Up/Down: Navigate options
 * - Number keys (1-3): Select option directly
 * - Enter: Confirm selection
 * - Tab: Move focus to next/previous component
 */
export default function WorkflowOptions({
  phase,
  onOptionSelect,
  disabled = false,
  isLastStep = false,
}: WorkflowOptionsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showTextInput, setShowTextInput] = useState(false);
  const [customQuestion, setCustomQuestion] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Define options based on phase
  const getOptions = (): WorkflowOption[] => {
    switch (phase) {
      case "initial_proposal":
        return [
          {
            id: 1,
            label: "Yes, let's get started!",
            action: "confirm_start",
            icon: <ChevronRight size={16} />,
          },
          {
            id: 2,
            label: "No, I have some more questions first",
            action: "ask_questions",
            icon: <MessageSquare size={16} />,
          },
        ];

      case "step_progression":
        // On last step, change "Exit" to "Complete" and hide "Move on"
        if (isLastStep) {
          return [
            {
              id: 2,
              label: "Type something",
              action: "custom_question" as const,
              icon: <MessageSquare size={16} />,
            },
            {
              id: 3,
              label: "Complete workflow",
              action: "progress_step" as const,
              icon: <ChevronRight size={16} />,
            },
          ];
        }

        return [
          {
            id: 1,
            label: "Move on to next step",
            action: "progress_step" as const,
            icon: <ChevronRight size={16} />,
          },
          {
            id: 2,
            label: "Type something",
            action: "custom_question" as const,
            icon: <MessageSquare size={16} />,
          },
          {
            id: 3,
            label: "Exit task workflow",
            action: "exit_workflow" as const,
            icon: <X size={16} />,
          },
        ];

      case "custom_question":
        return [
          {
            id: 1,
            label: "I'm good, on to the next step",
            action: "progress_step",
            icon: <ChevronRight size={16} />,
          },
          {
            id: 2,
            label: "I have more questions",
            action: "custom_question",
            icon: <MessageSquare size={16} />,
          },
          { id: 3, label: "Exit workflow task", action: "exit_workflow", icon: <X size={16} /> },
        ];

      default:
        return [];
    }
  };

  const options = getOptions();

  // Reset selection when phase changes
  useEffect(() => {
    setSelectedIndex(0);
    setShowTextInput(false);
    setCustomQuestion("");
  }, [phase]);

  // Auto-focus when component mounts or phase changes
  useEffect(() => {
    if (!disabled && containerRef.current) {
      containerRef.current.focus();
    }
  }, [disabled, phase]);

  // Keyboard navigation - only when this specific component is focused
  useEffect(() => {
    if (disabled || showTextInput || !isFocused) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % options.length);
          break;

        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + options.length) % options.length);
          break;

        case "Enter":
          e.preventDefault();
          handleOptionSelect(options[selectedIndex]);
          break;

        case "1":
        case "2":
        case "3": {
          e.preventDefault();
          const index = parseInt(e.key) - 1;
          if (index < options.length) {
            setSelectedIndex(index);
            handleOptionSelect(options[index]);
          }
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [disabled, showTextInput, selectedIndex, options, isFocused]);

  const handleOptionSelect = (option: WorkflowOption) => {
    if (disabled) return;

    // If option requires text input, show input field
    if (option.action === "custom_question" || option.action === "ask_questions") {
      setShowTextInput(true);
      return;
    }

    // Trigger the action immediately (no UI feedback needed)
    onOptionSelect(option);
  };

  const handleTextSubmit = () => {
    if (!customQuestion.trim()) return;

    // Always use custom_question action (not the selectedIndex which could be wrong)
    onOptionSelect({
      id: 2,
      label: customQuestion,
      action: "custom_question",
    });

    setCustomQuestion("");
    setShowTextInput(false);
  };

  const handleTextCancel = () => {
    setCustomQuestion("");
    setShowTextInput(false);
  };

  if (showTextInput) {
    return (
      <div className="mt-4 space-y-2">
        <div className="text-sm text-muted-foreground mb-2">Type your question:</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleTextSubmit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                handleTextCancel();
              }
            }}
            placeholder="Ask a question..."
            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]"
            autoFocus
            disabled={disabled}
          />
          <button
            onClick={handleTextSubmit}
            disabled={disabled || !customQuestion.trim()}
            className="px-4 py-2 bg-[#8B5CF6] text-white rounded-lg text-sm font-medium hover:bg-[#8B5CF6]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
          <button
            onClick={handleTextCancel}
            disabled={disabled}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
        </div>
        <div className="text-xs text-muted-foreground">Press Enter to send, Esc to cancel</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={disabled ? -1 : 0}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className="mt-4 outline-none focus:outline-none"
    >
      <div className="text-sm text-muted-foreground mb-2 text-center">Choose an option:</div>
      <div className="flex flex-col items-center gap-2">
        {options.map((option, index) => (
          <button
            key={option.id}
            onClick={() => handleOptionSelect(option)}
            disabled={disabled}
            className={`
              flex items-center gap-3 px-5 py-2.5 rounded-[18px] text-left transition-all duration-200
              ${
                selectedIndex === index
                  ? "bg-[#8B5CF6] text-white ring-2 ring-[#8B5CF6] ring-offset-2 hover:scale-105 hover:shadow-lg"
                  : "bg-[#3A3A45] text-white hover:bg-[#4A4A55] hover:scale-105 hover:shadow-lg"
              }
              ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {option.icon}
              {option.label}
            </span>
            <span className="text-xs opacity-70">{index + 1}</span>
          </button>
        ))}
      </div>
      <div className="text-xs text-muted-foreground mt-2 text-center">
        Use arrow keys or number keys (1-{options.length}) to select, Enter to confirm
      </div>
    </div>
  );
}
