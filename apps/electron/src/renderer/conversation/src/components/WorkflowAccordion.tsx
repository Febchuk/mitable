import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, PlayCircle, CheckCircle, Check, Circle, CircleDot } from "lucide-react";
import WorkflowOptions, { WorkflowPhase } from "../../../components/domain/workflow/WorkflowOptions";
import AIMessage from "../../../components/domain/messages/AIMessage";
import LoadingMessage from "./LoadingMessage";
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
  workflowLoadingMessage?: string | null; // Loading message for workflow-specific operations
}

export function WorkflowAccordion({
  workflow,
  messages,
  onOptionSelect,
  isStreaming,
  awaitingCustomQuestion = false,
  workflowLoadingMessage = null,
}: WorkflowAccordionProps) {
  // Determine if we're in pre-flight mode (workflow not started yet)
  const isPreFlight = workflow.currentStepIndex === -1;

  // Accordion is always expanded by default (and non-collapsible in pre-flight)
  const [isExpanded, setIsExpanded] = useState(true);

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

  // Unified render for both pre-flight and active modes
  return (
    <div className="workflow-accordion bg-background-secondary rounded-lg border border-border-subtle mb-4">
      {/* Accordion Header - only show when workflow is active */}
      {!isPreFlight && (
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

            <span className="workflow-title font-medium text-text-primary">
              {workflow.solution}
            </span>
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
      )}

      {/* Accordion Body - always visible in pre-flight, collapsible when active */}
      {(isPreFlight || isExpanded) && (
        <div className={cn(
          "accordion-body",
          !isPreFlight && "border-t border-border-subtle"
        )}>
          {/* Persistent explanation message */}
          <div className="p-4 pb-2">
            <AIMessage content={workflow.solutionExplanation} />
          </div>

          {/* Steps with inline conversations */}
          <div className="workflow-steps px-4 pb-4 pt-2">
            {workflow.stepList.map((step: any, idx: number) => {
              const isCurrentStep = idx === workflow.currentStepIndex;
              const isCompleted = idx < workflow.currentStepIndex;
              const isPending = idx > workflow.currentStepIndex;
              const stepMessages = messagesByStep[idx] || [];
              const hasMessages = stepMessages.length > 0;

              // In pre-flight mode, nothing is expandable
              const isExpandable = !isPreFlight && (hasMessages || isCurrentStep);

              return (
                <div
                  key={idx}
                  className={cn(
                    "workflow-step-section rounded-md mb-3 transition-all",
                    isCurrentStep && "bg-primary/10 border-2 border-primary/30",
                    !isCurrentStep && "bg-background/50 border border-border-subtle",
                    isCompleted && "opacity-70"
                  )}
                >
                  {/* Step Header - always visible, clickable if expandable */}
                  <button
                    className={cn(
                      "step-header w-full text-left p-3 flex items-center gap-3 transition-colors",
                      isExpandable && "hover:bg-background-elevated cursor-pointer",
                      !isExpandable && "cursor-default"
                    )}
                    onClick={() => isExpandable && toggleStepExpansion(idx)}
                    disabled={!isExpandable}
                  >
                    {/* Status Icon */}
                    <div className="flex-shrink-0">
                      {isCompleted && (
                        <div className="w-5 h-5 rounded-full bg-status-success flex items-center justify-center">
                          <Check size={14} className="text-white" />
                        </div>
                      )}
                      {isCurrentStep && (
                        <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center">
                          <CircleDot size={12} className="text-primary" />
                        </div>
                      )}
                      {isPending && (
                        <div className="w-5 h-5 rounded-full border-2 border-border-subtle flex items-center justify-center">
                          <Circle size={12} className="text-text-secondary" />
                        </div>
                      )}
                    </div>

                    {/* Step Description */}
                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        "text-sm leading-relaxed",
                        isCurrentStep ? "font-medium text-text-primary" : "text-text-secondary",
                        isCompleted && "line-through"
                      )}>
                        Step {idx + 1}: {step.description}
                      </span>
                    </div>

                    {/* Message Count Badge - only show in active mode */}
                    {!isPreFlight && hasMessages && (
                      <span className="message-count text-xs text-text-secondary bg-background-elevated px-2 py-0.5 rounded-full flex-shrink-0">
                        {stepMessages.length} message{stepMessages.length !== 1 ? "s" : ""}
                      </span>
                    )}

                    {/* Expand/Collapse Icon - only show in active mode when expandable */}
                    {!isPreFlight && isExpandable && (
                      expandedSteps.has(idx) ? (
                        <ChevronDown className="w-4 h-4 text-text-secondary flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-text-secondary flex-shrink-0" />
                      )
                    )}
                  </button>

                  {/* Step content - never show in pre-flight, show in active when current or expanded */}
                  {!isPreFlight && (isCurrentStep || expandedSteps.has(idx)) && (
                    <div className="step-content border-t border-border-subtle px-3 pb-3 pt-2">
                      {/* Plan adjustment notice if applicable */}
                      {isCurrentStep && workflow.adjustmentHistory.length > 0 && (
                        <div className="plan-adjustment-notice bg-status-warning/20 border border-status-warning/40 rounded p-3 mb-3">
                          <p className="text-sm text-status-warning">
                            📝 <strong>Plan updated:</strong> {workflow.adjustmentHistory[workflow.adjustmentHistory.length - 1].reason}
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
                            msg.role === "user"
                              ? "bg-primary/20 ml-4"
                              : "bg-background-elevated"
                          )}
                        >
                          <p className="text-sm text-text-primary">{msg.content}</p>
                        </div>
                      ))}

                      {/* Streaming indicator */}
                      {isCurrentStep && isStreaming && (
                        <div className="streaming-indicator flex items-center gap-2 text-sm text-text-secondary mt-2">
                          <div className="loading-dots flex gap-1">
                            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                            <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                          </div>
                          AI is thinking...
                        </div>
                      )}

                      {/* Loading message - show when workflow operation is in progress */}
                      {isCurrentStep && workflowLoadingMessage && (
                        <div className="mt-3">
                          <LoadingMessage message={workflowLoadingMessage} />
                        </div>
                      )}

                      {/* WorkflowOptions - ONLY in current step when active and not loading */}
                      {isCurrentStep && workflow.status === "active" && !workflowLoadingMessage && (
                        <div className="mt-3">
                          <WorkflowOptions
                            phase={"step_progression" as WorkflowPhase}
                            onOptionSelect={onOptionSelect}
                            disabled={isStreaming}
                            hidden={awaitingCustomQuestion}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Workflow options (pre-flight only) or resume/complete button */}
          {(isPreFlight || workflow.status === "paused" || workflow.status === "completed") && (
            <div className="p-4 border-t border-border-subtle">
              {isPreFlight ? (
                <WorkflowOptions
                  phase={"initial_proposal" as WorkflowPhase}
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
          )}
        </div>
      )}
    </div>
  );
}