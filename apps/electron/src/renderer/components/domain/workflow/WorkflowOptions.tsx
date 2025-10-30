import { useState, useEffect } from "react";
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
 * Keyboard Navigation:
 * - Arrow Up/Down: Navigate options
 * - Number keys (1-3): Select option directly
 * - Enter: Confirm selection
 * - Esc: Deselect (if needed)
 */
export default function WorkflowOptions({ phase, onOptionSelect, disabled = false }: WorkflowOptionsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showTextInput, setShowTextInput] = useState(false);
  const [customQuestion, setCustomQuestion] = useState("");

  // Define options based on phase
  const getOptions = (): WorkflowOption[] => {
    switch (phase) {
      case "initial_proposal":
        return [
          { id: 1, label: "Yes, let's get started!", action: "confirm_start", icon: <ChevronRight size={16} /> },
          { id: 2, label: "No, I have some more questions first", action: "ask_questions", icon: <MessageSquare size={16} /> },
        ];

      case "step_progression":
        return [
          { id: 1, label: "Move on to next step", action: "progress_step", icon: <ChevronRight size={16} /> },
          { id: 2, label: "Type something", action: "custom_question", icon: <MessageSquare size={16} /> },
          { id: 3, label: "Exit task workflow", action: "exit_workflow", icon: <X size={16} /> },
        ];

      case "custom_question":
        return [
          { id: 1, label: "I'm good, on to the next step", action: "progress_step", icon: <ChevronRight size={16} /> },
          { id: 2, label: "I have more questions", action: "custom_question", icon: <MessageSquare size={16} /> },
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

  // Keyboard navigation
  useEffect(() => {
    if (disabled || showTextInput) return;

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
        case "3":
          e.preventDefault();
          const index = parseInt(e.key) - 1;
          if (index < options.length) {
            setSelectedIndex(index);
            handleOptionSelect(options[index]);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, showTextInput, selectedIndex, options]);

  const handleOptionSelect = (option: WorkflowOption) => {
    if (disabled) return;

    // If option requires text input, show input field
    if (option.action === "custom_question" || option.action === "ask_questions") {
      setShowTextInput(true);
      return;
    }

    // Otherwise, trigger the action immediately
    onOptionSelect(option);
  };

  const handleTextSubmit = () => {
    if (!customQuestion.trim()) return;

    const selectedOption = options[selectedIndex];
    onOptionSelect({
      ...selectedOption,
      label: customQuestion, // Pass the custom question as the label
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
        <div className="text-sm text-muted-foreground mb-2">
          Type your question:
        </div>
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
            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
            disabled={disabled}
          />
          <button
            onClick={handleTextSubmit}
            disabled={disabled || !customQuestion.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
        <div className="text-xs text-muted-foreground">
          Press Enter to send, Esc to cancel
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="text-sm text-muted-foreground mb-2">
        Choose an option:
      </div>
      {options.map((option, index) => (
        <button
          key={option.id}
          onClick={() => handleOptionSelect(option)}
          disabled={disabled}
          className={`
            w-full flex items-center justify-between px-4 py-3 rounded-lg text-left transition-all
            ${selectedIndex === index
              ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }
            ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          `}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            {option.icon}
            {option.label}
          </span>
          <span className="text-xs opacity-70">
            {index + 1}
          </span>
        </button>
      ))}
      <div className="text-xs text-muted-foreground mt-2">
        Use arrow keys or number keys (1-{options.length}) to select, Enter to confirm
      </div>
    </div>
  );
}
