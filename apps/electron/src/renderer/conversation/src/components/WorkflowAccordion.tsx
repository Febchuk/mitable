import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, PlayCircle, CheckCircle } from "lucide-react";
import WorkflowOptions, {
  WorkflowPhase,
} from "../../../components/domain/workflow/WorkflowOptions";
import StepList from "../../../components/domain/workflow/StepList";
import AIMessage from "../../../components/domain/messages/AIMessage";
import { cn } from "../../../lib/utils";
import type { Message } from "../types";
import type { SolutionObject } from "@mitable/shared";

/**
 * Extended SolutionObject with workflow session metadata
 * These fields are added by the backend when workflow is stored in database
 */
interface WorkflowState extends SolutionObject {
  workflowSessionId: string;
  status: "active" | "paused" | "completed";
  // Note: currentStepIndex is already in SolutionObject, but can be -1 for pre-flight mode
}

interface WorkflowAccordionProps {
  workflow: WorkflowState;
  messages: Message[]; // Pre-filtered by workflowSessionId
  onOptionSelect: (option: any) => void;
  isStreaming: boolean;
  awaitingCustomQuestion?: boolean; // Whether user clicked "Type something" and we're waiting for input
}

export function WorkflowAccordion({
  workflow,
  messages,
  onOptionSelect,
  isStreaming,
  awaitingCustomQuestion = false,
}: WorkflowAccordionProps) {
  // Determine initial expanded state based on workflow status
  const [isExpanded, setIsExpanded] = useState(
    workflow.status === "active" || workflow.currentStepIndex === -1
  );

  // Track which steps are expanded to show their conversations
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(
    new Set([workflow.currentStepIndex])
  );

  // Group messages by their related step index
  const messagesByStep = useMemo(() => {
    const grouped: Record<number, Message[]> = {};
    messages.forEach((msg) => {
      const stepIdx = msg.relatedStepIndex ?? -1;
      if (!grouped[stepIdx]) grouped[stepIdx] = [];
      grouped[stepIdx].push(msg);
    });
    return grouped;
  }, [messages]);

  // Toggle step expansion
  const toggleStepExpansion = (stepIndex: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepIndex)) {
        next.delete(stepIndex);
      } else {
        next.add(stepIndex);
      }
      return next;
    });
  };

  // Pre-flight mode (workflow not started yet)
  if (workflow.currentStepIndex === -1) {
    return (
      <div className="workflow-accordion workflow-preflight bg-background-secondary rounded-lg border border-border-subtle p-4 mb-4">
        <AIMessage content={workflow.solutionExplanation} />

        <div className="mt-4">
          <StepList steps={workflow.stepList} currentStepIndex={-1} showCheckboxes={false} />
        </div>

        <div className="mt-4">
          <WorkflowOptions
            phase={"initial_proposal" as WorkflowPhase}
            onOptionSelect={onOptionSelect}
            disabled={isStreaming}
            hidden={awaitingCustomQuestion}
          />
        </div>
      </div>
    );
  }

  // Active or paused workflow
  return (
    <div className="workflow-accordion bg-background-secondary rounded-lg border border-border-subtle mb-4">
      {/* Accordion Header */}
      <button
        className="accordion-header w-full flex items-center justify-between p-4 hover:bg-background-elevated transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-text-secondary" />
          ) : (
            <ChevronRight className="w-5 h-5 text-text-secondary" />
          )}

          <span className="workflow-title font-medium text-text-primary">{workflow.solution}</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="workflow-progress text-sm text-text-secondary">
            Step {workflow.currentStepIndex + 1} of {workflow.stepList.length}
          </span>

          {workflow.status === "paused" && (
            <span className="workflow-status px-2 py-1 text-xs font-medium bg-status-warning/20 text-status-warning rounded">
              Paused
            </span>
          )}

          {workflow.status === "completed" && (
            <CheckCircle className="w-5 h-5 text-status-success" />
          )}
        </div>
      </button>

      {/* Accordion Body */}
      {isExpanded && (
        <div className="accordion-body border-t border-border-subtle">
          {/* Full step list with progress */}
          <div className="p-4">
            <StepList
              steps={workflow.stepList}
              currentStepIndex={workflow.currentStepIndex}
              showCheckboxes={true}
            />
          </div>

          {/* Steps with inline conversations */}
          <div className="workflow-steps px-4 pb-4">
            {workflow.stepList.map((step: any, idx: number) => {
              const isCurrentStep = idx === workflow.currentStepIndex;
              const isCompleted = idx < workflow.currentStepIndex;
              const isPending = idx > workflow.currentStepIndex;
              const stepMessages = messagesByStep[idx] || [];
              const hasMessages = stepMessages.length > 0;

              return (
                <div
                  key={idx}
                  className={cn(
                    "workflow-step-section border-l-2 ml-3 pl-4",
                    isCurrentStep && "border-primary bg-primary/10",
                    isCompleted && "border-status-success opacity-60",
                    isPending && "border-border-subtle opacity-40"
                  )}
                >
                  {/* Step Header - clickable if has messages */}
                  {(hasMessages || isCurrentStep) && (
                    <button
                      className="step-header w-full text-left py-2 flex items-center justify-between group"
                      onClick={() => hasMessages && toggleStepExpansion(idx)}
                      disabled={!hasMessages}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">
                          Step {idx + 1}: {step.description}
                        </span>

                        {hasMessages && (
                          <span className="message-count text-xs text-text-secondary bg-background-elevated px-2 py-0.5 rounded-full">
                            {stepMessages.length} message{stepMessages.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>

                      {hasMessages &&
                        (expandedSteps.has(idx) ? (
                          <ChevronDown className="w-4 h-4 text-text-secondary" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-text-secondary" />
                        ))}
                    </button>
                  )}

                  {/* Step content - show for current step or if expanded */}
                  {(isCurrentStep || expandedSteps.has(idx)) && (
                    <div className="step-messages pl-2 pb-2">
                      {/* Plan adjustment notice if applicable */}
                      {isCurrentStep && workflow.adjustmentHistory.length > 0 && (
                        <div className="plan-adjustment-notice bg-status-warning/20 border border-status-warning/40 rounded p-3 mb-3">
                          <p className="text-sm text-status-warning">
                            📝 <strong>Plan updated:</strong>{" "}
                            {
                              workflow.adjustmentHistory[workflow.adjustmentHistory.length - 1]
                                .reason
                            }
                          </p>
                        </div>
                      )}

                      {/* Current step guidance */}
                      {isCurrentStep && step.guidance && (
                        <div className="current-step-guidance mb-3">
                          <AIMessage content={step.guidance} />
                        </div>
                      )}

                      {/* Inline conversation for this step */}
                      {stepMessages.map((msg, msgIdx) => (
                        <div
                          key={msgIdx}
                          className={cn(
                            "step-message mb-2 p-2 rounded",
                            msg.role === "user" ? "bg-primary/20 ml-4" : "bg-background-elevated"
                          )}
                        >
                          <p className="text-sm text-text-primary">{msg.content}</p>
                        </div>
                      ))}

                      {/* Streaming indicator */}
                      {isCurrentStep && isStreaming && (
                        <div className="streaming-indicator flex items-center gap-2 text-sm text-text-secondary mt-2">
                          <div className="loading-dots flex gap-1">
                            <span
                              className="w-2 h-2 bg-primary rounded-full animate-bounce"
                              style={{ animationDelay: "0ms" }}
                            ></span>
                            <span
                              className="w-2 h-2 bg-primary rounded-full animate-bounce"
                              style={{ animationDelay: "150ms" }}
                            ></span>
                            <span
                              className="w-2 h-2 bg-primary rounded-full animate-bounce"
                              style={{ animationDelay: "300ms" }}
                            ></span>
                          </div>
                          AI is thinking...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Workflow options or resume button */}
          <div className="p-4 border-t border-border-subtle">
            {workflow.status === "active" ? (
              <WorkflowOptions
                phase={"step_progression" as WorkflowPhase}
                onOptionSelect={onOptionSelect}
                disabled={isStreaming}
                hidden={awaitingCustomQuestion}
              />
            ) : workflow.status === "paused" ? (
              <button
                className="resume-workflow-btn w-full flex items-center justify-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover transition-colors"
                onClick={() => onOptionSelect({ action: "resume_workflow" })}
              >
                <PlayCircle className="w-5 h-5" />
                Resume from Step {workflow.currentStepIndex + 1}
              </button>
            ) : (
              <div className="completed-indicator flex items-center justify-center gap-2 text-status-success">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Workflow Completed</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
