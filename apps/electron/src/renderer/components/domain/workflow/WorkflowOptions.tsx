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
  hidden?: boolean; // Hide options when awaiting custom question input
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
  hidden = false,
}: WorkflowOptionsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
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
        return [
          {
            id: 1,
            label: "Move on to next step",
            action: "progress_step",
            icon: <ChevronRight size={16} />,
          },
          {
            id: 2,
            label: "Type something",
            action: "custom_question",
            icon: <MessageSquare size={16} />,
          },
          { id: 3, label: "Exit task workflow", action: "exit_workflow", icon: <X size={16} /> },
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
  }, [phase]);

  // Auto-focus when component mounts or phase changes
  useEffect(() => {
    if (!disabled && containerRef.current) {
      containerRef.current.focus();
    }
  }, [disabled, phase]);

  // Keyboard navigation - only when this specific component is focused
  useEffect(() => {
    if (disabled || !isFocused) return;

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
  }, [disabled, selectedIndex, options, isFocused]);

  const handleOptionSelect = (option: WorkflowOption) => {
    if (disabled) return;

    // For custom questions, just notify parent and hide WorkflowOptions
    // User will type in the agent pill instead of showing a separate input
    if (option.action === "custom_question" || option.action === "ask_questions") {
      onOptionSelect(option);
      return;
    }

    // Otherwise, trigger the action immediately
    onOptionSelect(option);
  };

  // No longer using showTextInput - user types in agent pill instead

  // Hide component when awaiting custom question input
  // IMPORTANT: This must come AFTER all hooks to avoid React hooks rule violations
  if (hidden) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      tabIndex={disabled ? -1 : 0}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className="mt-4 outline-none focus:outline-none"
    >
      <div className="text-sm text-gray-400 mb-3 text-center">Choose an option:</div>
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
                  ? "bg-accent text-canvas-base ring-2 ring-accent ring-offset-2 ring-offset-[#2A2A35] hover:scale-105 hover:shadow-lg"
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
      <div className="text-xs text-gray-500 mt-3 text-center">
        Use arrow keys or number keys (1-{options.length}) to select, Enter to confirm
      </div>
    </div>
  );
}
