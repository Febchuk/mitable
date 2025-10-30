import { Check, Circle, CircleDot } from "lucide-react";

export interface Step {
  stepNumber: number;
  description: string;
  status: "pending" | "current" | "completed";
}

interface StepListProps {
  steps: Step[];
  currentStepIndex: number;
  showCheckboxes?: boolean; // Only show checkboxes for step_progression phase
}

/**
 * StepList Component
 *
 * Displays a list of workflow steps with visual indicators:
 * - Completed steps: Green checkmark
 * - Current step: Highlighted with dot indicator
 * - Pending steps: Gray circle
 *
 * Used in two modes:
 * 1. initial_proposal: Show steps WITHOUT checkboxes (preview mode)
 * 2. step_progression: Show steps WITH checkboxes (active tracking)
 * 3. custom_question: HIDDEN (not rendered)
 */
export default function StepList({ steps, currentStepIndex, showCheckboxes = false }: StepListProps) {
  return (
    <div className="mt-4 space-y-2 bg-secondary/30 rounded-lg p-4">
      <div className="text-sm font-medium text-foreground mb-3">
        Steps ({currentStepIndex + 1}/{steps.length})
      </div>
      <div className="space-y-2">
        {steps.map((step, index) => {
          const isCompleted = step.status === "completed";
          const isCurrent = step.status === "current";
          const isPending = step.status === "pending";

          return (
            <div
              key={step.stepNumber}
              className={`
                flex items-start gap-3 p-3 rounded-md transition-all
                ${isCurrent ? "bg-primary/10 border border-primary/30" : "bg-background/50"}
                ${isCompleted ? "opacity-70" : "opacity-100"}
              `}
            >
              {/* Step Icon/Checkbox */}
              {showCheckboxes ? (
                <div className="flex-shrink-0 mt-0.5">
                  {isCompleted && (
                    <div className="w-5 h-5 rounded-full bg-status-success flex items-center justify-center">
                      <Check size={14} className="text-white" />
                    </div>
                  )}
                  {isCurrent && (
                    <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center">
                      <CircleDot size={12} className="text-primary" />
                    </div>
                  )}
                  {isPending && (
                    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
                      <Circle size={12} className="text-muted-foreground/30" />
                    </div>
                  )}
                </div>
              ) : (
                // Preview mode: just show step number
                <div
                  className={`
                    flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium mt-0.5
                    ${isCurrent ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}
                  `}
                >
                  {step.stepNumber}
                </div>
              )}

              {/* Step Description */}
              <div className="flex-1 min-w-0">
                <p
                  className={`
                    text-sm leading-relaxed
                    ${isCurrent ? "font-medium text-foreground" : "text-muted-foreground"}
                    ${isCompleted ? "line-through" : ""}
                  `}
                >
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
