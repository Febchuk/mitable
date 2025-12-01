import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, PlayCircle, CheckCircle, Check, Circle } from "lucide-react";
import WorkflowOptions, {
  WorkflowPhase,
} from "../../../components/domain/workflow/WorkflowOptions";
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

  // Calculate progress text
  const progressText =
    workflow.status === "completed"
      ? `Completed • ${workflow.stepList.length}/${workflow.stepList.length} steps`
      : workflow.status === "paused"
        ? `Paused • ${workflow.currentStepIndex + 1}/${workflow.stepList.length} steps`
        : `In Progress • ${workflow.currentStepIndex + 1}/${workflow.stepList.length} steps`;

  // Unified render for both pre-flight and active modes
  return (
    <div className="workflow-accordion my-4 border border-[#3A3A45] rounded-2xl overflow-hidden bg-[#2A2A35]">
      {/* Accordion Header - only show when workflow is active */}
      {!isPreFlight && (
        <button
          className="accordion-header w-full px-6 py-4 flex items-center justify-between hover:bg-[#2F2F3A] transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-3">
            {/* Status Icon */}
            {workflow.status === "completed" ? (
              <CheckCircle size={20} className="text-green-500 flex-shrink-0" />
            ) : workflow.status === "paused" ? (
              <Circle size={20} className="text-yellow-500 flex-shrink-0" />
            ) : (
              <Circle size={20} className="text-[#8B5CF6] flex-shrink-0" />
            )}

            {/* Title & Progress */}
            <div className="text-left">
              <h3 className="text-base font-semibold text-white">{workflow.solution}</h3>
              <p className="text-sm text-gray-400">{progressText}</p>
            </div>
          </div>

          {/* Expand/Collapse Icon */}
          {isExpanded ? (
            <ChevronDown size={20} className="text-gray-400" />
          ) : (
            <ChevronRight size={20} className="text-gray-400" />
          )}
        </button>
      )}

      {/* Accordion Body - always visible in pre-flight, collapsible when active */}
      {(isPreFlight || isExpanded) && (
        <div className={cn("accordion-body", !isPreFlight && "border-t border-[#3A3A45]")}>
          {/* Persistent explanation message */}
          <div className="px-6 py-4">
            <AIMessage content={workflow.solutionExplanation} />
          </div>

          {/* Steps with inline conversations */}
          <div className="workflow-steps px-6 pb-4">
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
                    "workflow-step-section rounded-lg mb-3 transition-all",
                    isCurrentStep && "bg-[#3A3A45] border-2 border-[#8B5CF6]",
                    !isCurrentStep && "bg-[#2A2A35] border border-[#3A3A45]",
                    isCompleted && "opacity-70"
                  )}
                >
                  {/* Step Header - always visible, clickable if expandable */}
                  <button
                    className={cn(
                      "step-header w-full text-left p-4 flex items-center gap-3 transition-colors",
                      isExpandable && "hover:bg-[#3A3A45]/50 cursor-pointer",
                      !isExpandable && "cursor-default"
                    )}
                    onClick={() => isExpandable && toggleStepExpansion(idx)}
                    disabled={!isExpandable}
                  >
                    {/* Status Icon */}
                    <div className="flex-shrink-0">
                      {isCompleted && (
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                      {isCurrentStep && (
                        <div className="w-5 h-5 rounded-full border-2 border-[#8B5CF6] flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-[#8B5CF6]"></div>
                        </div>
                      )}
                      {isPending && (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-600 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-transparent"></div>
                        </div>
                      )}
                    </div>

                    {/* Step Description */}
                    <div className="flex-1 min-w-0">
                      <span
                        className={cn(
                          "text-sm leading-relaxed",
                          isCurrentStep ? "font-medium text-white" : "text-gray-300",
                          isCompleted && "line-through text-gray-400"
                        )}
                      >
                        Step {idx + 1}: {step.description}
                      </span>
                    </div>

                    {/* Message Count Badge - only show in active mode */}
                    {!isPreFlight && hasMessages && (
                      <span className="message-count text-xs text-gray-400 bg-[#1A1A22] px-2 py-0.5 rounded-full flex-shrink-0">
                        {stepMessages.length} message{stepMessages.length !== 1 ? "s" : ""}
                      </span>
                    )}

                    {/* Expand/Collapse Icon - only show in active mode when expandable */}
                    {!isPreFlight &&
                      isExpandable &&
                      (expandedSteps.has(idx) ? (
                        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      ))}
                  </button>

                  {/* Step content - never show in pre-flight, show in active when current or expanded */}
                  {!isPreFlight && (isCurrentStep || expandedSteps.has(idx)) && (
                    <div className="step-content border-t border-[#3A3A45] px-4 pb-4 pt-3">
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

                      {/* Inline conversation for this step - keeping message bubbles */}
                      {stepMessages.map((msg, msgIdx) => (
                        <div
                          key={msgIdx}
                          className={cn(
                            "step-message mb-2 p-3 rounded-lg",
                            msg.role === "user"
                              ? "bg-[#8B5CF6]/20 ml-4 border border-[#8B5CF6]/30"
                              : "bg-[#1A1A22] border border-[#3A3A45]"
                          )}
                        >
                          <p className="text-sm text-gray-200">{msg.content}</p>
                        </div>
                      ))}

                      {/* Streaming indicator intentionally removed to keep a single consistent loading UI via LoadingMessage */}

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
            <div className="px-6 py-4 border-t border-[#3A3A45]">
              {isPreFlight ? (
                <>
                  {workflowLoadingMessage ? (
                    <LoadingMessage message={workflowLoadingMessage} />
                  ) : (
                    <WorkflowOptions
                      phase={"initial_proposal" as WorkflowPhase}
                      onOptionSelect={onOptionSelect}
                      disabled={isStreaming}
                      hidden={awaitingCustomQuestion}
                    />
                  )}
                </>
              ) : workflow.status === "paused" ? (
                <button
                  className="resume-workflow-btn w-full flex items-center justify-center gap-2 bg-[#8B5CF6] text-white px-5 py-2.5 rounded-[18px] hover:bg-[#8B5CF6]/90 transition-all hover:scale-105 font-medium text-sm"
                  onClick={() => onOptionSelect({ action: "resume_workflow" })}
                >
                  <PlayCircle className="w-5 h-5" />
                  Resume from Step {workflow.currentStepIndex + 1}
                </button>
              ) : (
                <div className="completed-indicator flex items-center justify-center gap-2 text-green-500">
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
