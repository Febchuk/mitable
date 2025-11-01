import { useState, useRef } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, Circle, XCircle, Send } from "lucide-react";
import type { WorkflowData, WorkflowInteraction, WorkflowStep } from "../hooks/useWorkflow";

interface WorkflowAccordionProps {
  title: string;
  workflow: WorkflowData;
  interactions: WorkflowInteraction[];
  onOptionSelect: (option: any) => void;
  isLoading?: boolean;
}

export default function WorkflowAccordion({
  title,
  workflow,
  interactions,
  onOptionSelect,
  isLoading = false,
}: WorkflowAccordionProps) {
  console.log("[WorkflowAccordion] Rendering with:", {
    title,
    workflowId: workflow.id,
    status: workflow.status,
    currentStepIndex: workflow.currentStepIndex,
    workflowData: workflow.workflowData,
    interactionCount: interactions.length,
  });

  const isActive = workflow.status === "active";
  const isCancelled = workflow.status === "cancelled";
  const isCompleted = workflow.status === "completed";
  const [isExpanded, setIsExpanded] = useState(false); // Start collapsed to avoid scrolling past long workflows

  // Chat input state
  const [chatInput, setChatInput] = useState("");
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Track which step conversations are expanded (Map of stepIndex -> boolean)
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  // Extract data from workflow
  const currentStepIndex = workflow.currentStepIndex;
  const stepList = workflow.workflowData?.stepList || [];
  const totalSteps = stepList.length;

  console.log("[WorkflowAccordion] Step data:", {
    currentStepIndex,
    totalSteps,
    stepList,
    firstStep: stepList[0],
    mappedSteps: stepList.map((step: WorkflowStep) => ({
      stepNumber: step.stepNumber,
      description: step.description,
      status: step.status,
    })),
  });

  // Calculate completion status
  const stepsCompleted = isCompleted ? totalSteps : currentStepIndex;
  const progress = isCancelled
    ? `Cancelled • ${currentStepIndex}/${totalSteps} steps`
    : isCompleted
      ? `Completed • ${totalSteps}/${totalSteps} steps`
      : `In Progress • ${currentStepIndex + 1}/${totalSteps} steps`;

  // Check if we're on pre-flight step (step 0)
  const isPreFlight = currentStepIndex === 0 && stepList[0]?.description?.includes("Pre-flight");

  // Handle chat input submission
  const handleChatSubmit = () => {
    if (!chatInput.trim()) return;

    onOptionSelect({
      id: 2,
      label: chatInput,
      action: "custom_question",
    });

    setChatInput("");
  };

  return (
    <div className="my-4 border border-[#3A3A45] rounded-2xl overflow-hidden bg-[#2A2A35]">
      {/* Accordion Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#2F2F3A] transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Status Icon */}
          {isCancelled ? (
            <XCircle size={20} className="text-red-500 flex-shrink-0" />
          ) : isCompleted ? (
            <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />
          ) : (
            <Circle size={20} className="text-[#8B5CF6] flex-shrink-0" />
          )}

          {/* Title & Progress */}
          <div className="text-left">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <p className="text-sm text-gray-400">{progress}</p>
          </div>
        </div>

        {/* Expand/Collapse Icon */}
        {isExpanded ? (
          <ChevronUp size={20} className="text-gray-400" />
        ) : (
          <ChevronDown size={20} className="text-gray-400" />
        )}
      </button>

      {/* Accordion Content */}
      {isExpanded && (
        <div className="px-6 py-4 space-y-4 border-t border-[#3A3A45] max-h-[600px] overflow-y-auto custom-scrollbar">
          {/* AI CONTEXT MESSAGES - General messages not tied to specific steps */}
          {(() => {
            const contextMessages = interactions.filter(
              (int) => int.type === "ai_context_message" && int.relatedStepIndex === null
            );

            if (contextMessages.length === 0) return null;

            return (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">💬 AI Messages</p>
                {contextMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="bg-[#2A2A35] rounded-lg p-3 border border-blue-500/30"
                  >
                    <p className="text-sm text-gray-300 leading-relaxed">{msg.content || ""}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* COMPLETED STEPS - Show journey with AI guidance AND user Q&A */}
          {stepsCompleted > 0 && stepList && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Completed Steps</p>
              {stepList.slice(0, stepsCompleted).map((step: WorkflowStep, index) => {
                // Get ALL interactions for this completed step
                const stepInteractions = interactions.filter(
                  (int) => int.relatedStepIndex === index
                );

                // Find initial AI response
                const aiResponse = stepInteractions.find(
                  (int) => int.role === "assistant" && int.type === "ai_response"
                );

                // Find user questions
                const userQuestions = stepInteractions.filter((int) => int.role === "user");
                const hasConversation =
                  (aiResponse && aiResponse.content) || userQuestions.length > 0;

                // Check if this step's conversation is expanded
                const isConversationExpanded = expandedSteps.has(index);

                // Toggle function for this step
                const toggleExpanded = () => {
                  setExpandedSteps((prev) => {
                    const newSet = new Set(prev);
                    if (newSet.has(index)) {
                      newSet.delete(index);
                    } else {
                      newSet.add(index);
                    }
                    return newSet;
                  });
                };

                return (
                  <div key={index} className="bg-[#2A2A35] rounded-lg p-3 border border-[#3A3A45]">
                    {/* Completed Step */}
                    <div className="flex items-start gap-3 opacity-70">
                      <div className="w-5 h-5 rounded-full bg-status-success flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-300 line-through flex-1">
                        {step.stepNumber}. {step.description}
                      </p>

                      {/* Toggle conversation button */}
                      {hasConversation && (
                        <button
                          onClick={toggleExpanded}
                          className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
                        >
                          {isConversationExpanded
                            ? "Hide"
                            : `Show (${userQuestions.length > 0 ? userQuestions.length + " Q" : "details"})`}
                        </button>
                      )}
                    </div>

                    {/* Collapsible Conversation history for this step */}
                    {hasConversation && isConversationExpanded && (
                      <div className="mt-2 ml-8 space-y-1.5">
                        {/* Initial AI Guidance */}
                        {aiResponse && aiResponse.content && (
                          <div className="text-xs text-gray-400 leading-relaxed">
                            {aiResponse.content
                              .split("\n\n")
                              .filter(
                                (para) =>
                                  !para.trim().startsWith("📋 Plan Updated:") &&
                                  !para.trim().startsWith("Plan Updated:")
                              )
                              .join("\n\n")}
                          </div>
                        )}

                        {/* User Questions & Answers - Simple text */}
                        {userQuestions.length > 0 &&
                          userQuestions.map((userQ) => {
                            if (!userQ.content || !userQ.content.trim()) return null;

                            const aiAnswer = stepInteractions.find(
                              (int) =>
                                int.role === "assistant" &&
                                int.createdAt > userQ.createdAt &&
                                int.type !== "ai_response"
                            );

                            return (
                              <div
                                key={userQ.id}
                                className="space-y-1 pt-2 border-t border-gray-700/30"
                              >
                                {/* User Question - Simple */}
                                <p className="text-xs text-blue-300">
                                  <span className="opacity-60">Q:</span> {userQ.content}
                                </p>

                                {/* AI Answer - Simple */}
                                {aiAnswer && aiAnswer.content && (
                                  <p className="text-xs text-gray-400">
                                    <span className="opacity-60">A:</span> {aiAnswer.content}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* CURRENT STEP - Highlighted with AI guidance (only show if workflow is active) */}
          {!isCompleted && stepList && stepList[currentStepIndex] && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Current Step</p>
              <div className="bg-[#3A3A45] rounded-lg p-4 border border-[#8B5CF6]">
                {/* Current Step */}
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full border-2 border-[#8B5CF6] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-[#8B5CF6]"></div>
                  </div>
                  <p className="text-sm font-medium text-white flex-1">
                    {stepList[currentStepIndex].stepNumber}.{" "}
                    {stepList[currentStepIndex].description}
                  </p>
                </div>

                {/* AI Guidance and User Q&A for current step */}
                {(() => {
                  // Get all interactions for this step
                  const stepInteractions = interactions.filter(
                    (int) => int.relatedStepIndex === currentStepIndex
                  );

                  // Find initial AI response
                  const initialAiResponse = stepInteractions.find(
                    (int) => int.role === "assistant" && int.type === "ai_response"
                  );

                  // Find user questions
                  const userQuestions = stepInteractions.filter((int) => int.role === "user");

                  return (
                    <div className="mt-3 space-y-1.5">
                      {/* Initial AI Guidance - Simple text */}
                      {initialAiResponse && initialAiResponse.content && (
                        <div className="text-sm text-gray-300 leading-relaxed">
                          {initialAiResponse.content
                            .split("\n\n")
                            .filter(
                              (para) =>
                                !para.trim().startsWith("📋 Plan Updated:") &&
                                !para.trim().startsWith("Plan Updated:")
                            )
                            .join("\n\n")}
                        </div>
                      )}

                      {/* User Questions & Answers - Simple text */}
                      {userQuestions.length > 0 &&
                        userQuestions.map((userQ) => {
                          // Only show if there's actual content
                          if (!userQ.content || !userQ.content.trim()) {
                            return null;
                          }

                          const aiAnswer = stepInteractions.find(
                            (int) =>
                              int.role === "assistant" &&
                              int.createdAt > userQ.createdAt &&
                              int.type !== "ai_response"
                          );

                          return (
                            <div
                              key={userQ.id}
                              className="space-y-1 pt-2 border-t border-gray-600/30"
                            >
                              {/* User Question - Simple */}
                              <p className="text-sm text-blue-300">
                                <span className="opacity-60">Q:</span> {userQ.content}
                              </p>

                              {/* AI Answer - Simple */}
                              {aiAnswer && aiAnswer.content && (
                                <p className="text-sm text-gray-300">
                                  <span className="opacity-60">A:</span> {aiAnswer.content}
                                </p>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* REMAINING/CANCELLED STEPS - Show pending steps */}
          {!isCompleted && currentStepIndex < totalSteps - 1 && stepList && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                {isCancelled ? "Cancelled Steps" : "Remaining Steps"}
              </p>
              {stepList.slice(currentStepIndex + 1).map((step: WorkflowStep, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 pl-3"
                  style={{ opacity: isCancelled ? 0.7 : 0.5 }}
                >
                  {isCancelled ? (
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <XCircle size={16} className="text-red-500" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-transparent"></div>
                    </div>
                  )}
                  <p className="text-sm text-gray-400">
                    {step.stepNumber}. {step.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* User Q&A is now shown inline with steps above - no need for separate section */}
          <div className="space-y-3">
            {/* Loading indicator for when AI is thinking */}
            {isLoading && (
              <div className="ml-4 border-l-2 border-[#8B5CF6]/30 pl-3">
                <p className="text-xs text-gray-500 mb-1">Thinking...</p>
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <div className="flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>
                      ●
                    </span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>
                      ●
                    </span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>
                      ●
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Always-visible chat input (only if active) */}
          {isActive && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleChatSubmit();
                    }
                  }}
                  placeholder="Type your message..."
                  className="flex-1 px-3 py-2 bg-[#1A1A22] border border-[#3A3A45] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]"
                />
                <button
                  onClick={handleChatSubmit}
                  disabled={!chatInput.trim()}
                  className="px-4 py-2 bg-[#8B5CF6] text-white rounded-lg text-sm font-medium hover:bg-[#8B5CF6]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <Send size={16} />
                  Send
                </button>
              </div>

              {/* Workflow action buttons */}
              <div className="flex justify-center gap-2">
                {isPreFlight ? (
                  /* Pre-flight buttons: Continue only */
                  <button
                    onClick={() =>
                      onOptionSelect({ id: 1, label: "Continue", action: "progress_step" })
                    }
                    className="px-5 py-2.5 bg-[#8B5CF6] text-white rounded-[18px] text-sm font-medium hover:bg-[#8B5CF6]/90 transition-all hover:scale-105"
                  >
                    ✓ Ready, Continue
                  </button>
                ) : currentStepIndex === totalSteps - 1 ? (
                  /* Last step buttons */
                  <>
                    <button
                      onClick={() =>
                        onOptionSelect({
                          id: 3,
                          label: "Complete workflow",
                          action: "progress_step",
                        })
                      }
                      className="px-5 py-2.5 bg-green-600 text-white rounded-[18px] text-sm font-medium hover:bg-green-600/90 transition-all hover:scale-105"
                    >
                      ✓ Complete Workflow
                    </button>
                  </>
                ) : (
                  /* Regular step buttons */
                  <>
                    <button
                      onClick={() =>
                        onOptionSelect({
                          id: 1,
                          label: "Move on to next step",
                          action: "progress_step",
                        })
                      }
                      className="px-5 py-2.5 bg-[#8B5CF6] text-white rounded-[18px] text-sm font-medium hover:bg-[#8B5CF6]/90 transition-all hover:scale-105"
                    >
                      → Next Step
                    </button>
                    <button
                      onClick={() =>
                        onOptionSelect({
                          id: 3,
                          label: "Exit task workflow",
                          action: "exit_workflow",
                        })
                      }
                      className="px-5 py-2.5 bg-[#3A3A45] text-white rounded-[18px] text-sm font-medium hover:bg-[#4A4A55] transition-all hover:scale-105"
                    >
                      ✕ Exit
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
