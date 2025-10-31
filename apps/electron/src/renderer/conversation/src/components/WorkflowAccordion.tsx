import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, Circle } from "lucide-react";
import AIMessage from "../../../components/domain/messages/AIMessage";
import UserMessage from "../../../components/domain/messages/UserMessage";
import WorkflowOptions from "../../../components/domain/workflow/WorkflowOptions";
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
  const isCompleted = workflow.status === "completed" || workflow.status === "cancelled";
  const [isExpanded, setIsExpanded] = useState(false); // Start collapsed to avoid scrolling past long workflows

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
  const progress = isCompleted 
    ? `${workflow.status === "completed" ? "Completed" : "Cancelled"} • ${totalSteps}/${totalSteps} steps`
    : `In Progress • ${currentStepIndex + 1}/${totalSteps} steps`;

  return (
    <div className="my-4 border border-[#3A3A45] rounded-2xl overflow-hidden bg-[#2A2A35]">
      {/* Accordion Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-[#2F2F3A] transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Status Icon */}
          {isCompleted ? (
            <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />
          ) : (
            <Circle size={20} className="text-[#8B5CF6] flex-shrink-0" />
          )}

          {/* Title & Progress */}
          <div className="text-left">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <p className="text-sm text-gray-400">
              {isCompleted ? "Completed" : isActive ? "In Progress" : "Paused"} • {progress} steps
            </p>
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
          
          {/* COMPLETED STEPS - Show journey with AI guidance */}
          {stepsCompleted > 0 && stepList && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Completed Steps</p>
              {stepList.slice(0, stepsCompleted).map((step: WorkflowStep, index) => {
                // Find AI response for this step
                const aiResponse = interactions.find(
                  int => int.role === "assistant" && int.relatedStepIndex === index
                );
                
                return (
                  <div key={index} className="bg-[#2A2A35] rounded-lg p-3 border border-[#3A3A45]">
                    {/* Completed Step */}
                    <div className="flex items-start gap-3 opacity-70">
                      <div className="w-5 h-5 rounded-full bg-status-success flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-300 line-through flex-1">
                        {step.stepNumber}. {step.description}
                      </p>
                    </div>
                    
                    {/* AI Guidance for this step */}
                    {aiResponse && aiResponse.content && (
                      <div className="mt-2 ml-8 pl-3 border-l-2 border-green-500/30">
                        <p className="text-xs text-gray-500 mb-1">Answer</p>
                        <AIMessage content={
                          // Filter out "Plan Updated:" notices - they're internal model reasoning
                          aiResponse.content.split('\n\n').filter(para => 
                            !para.trim().startsWith('📋 Plan Updated:') &&
                            !para.trim().startsWith('Plan Updated:')
                          ).join('\n\n')
                        } />
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
                    {stepList[currentStepIndex].stepNumber}. {stepList[currentStepIndex].description}
                  </p>
                </div>
                
                {/* AI Guidance and User Q&A for current step */}
                {(() => {
                  // Get all interactions for this step
                  const stepInteractions = interactions.filter(
                    int => int.relatedStepIndex === currentStepIndex
                  );
                  
                  // Find initial AI response
                  const initialAiResponse = stepInteractions.find(
                    int => int.role === "assistant" && int.type === "ai_response"
                  );
                  
                  // Find user questions
                  const userQuestions = stepInteractions.filter(
                    int => int.role === "user"
                  );
                  
                  return (
                    <div className="mt-3 space-y-3">
                      {/* Initial AI Guidance */}
                      {initialAiResponse && initialAiResponse.content && (
                        <div className="pl-3 border-l-2 border-[#8B5CF6]/30">
                          <p className="text-xs text-gray-500 mb-1">Answer</p>
                          <AIMessage content={
                            // Filter out "Plan Updated:" notices
                            initialAiResponse.content.split('\n\n').filter(para => 
                              !para.trim().startsWith('📋 Plan Updated:') &&
                              !para.trim().startsWith('Plan Updated:')
                            ).join('\n\n')
                          } />
                        </div>
                      )}
                      
                      {/* User Questions & Answers inline - only show if questions exist */}
                      {userQuestions.length > 0 && userQuestions.map((userQ) => {
                        // Only show if there's actual content
                        if (!userQ.content || !userQ.content.trim()) {
                          return null;
                        }
                        
                        const aiAnswer = stepInteractions.find(
                          int => int.role === "assistant" && 
                                 int.createdAt > userQ.createdAt &&
                                 int.type !== "ai_response"
                        );
                        
                        return (
                          <div key={userQ.id} className="space-y-2">
                            {/* User Question */}
                            <div className="pl-3 border-l-2 border-[#8B5CF6]/50">
                              <p className="text-xs text-gray-500 mb-1">💬 Your Question</p>
                              <UserMessage content={userQ.content} />
                            </div>
                            
                            {/* AI Answer to question */}
                            {aiAnswer && aiAnswer.content && (
                              <div className="pl-3 border-l-2 border-green-500/30">
                                <p className="text-xs text-gray-500 mb-1">✨ Answer</p>
                                <AIMessage content={aiAnswer.content} />
                              </div>
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

          {/* REMAINING STEPS - Simple list (only show if workflow is active) */}
          {!isCompleted && currentStepIndex < totalSteps - 1 && stepList && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Remaining Steps</p>
              {stepList.slice(currentStepIndex + 1).map((step: WorkflowStep, index) => (
                <div key={index} className="flex items-start gap-3 opacity-50 pl-3">
                  <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-transparent"></div>
                  </div>
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
                    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
                    <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
                    <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Workflow Options (only if active) */}
          {isActive && (
            <WorkflowOptions
              phase="step_progression"
              onOptionSelect={onOptionSelect}
              isLastStep={currentStepIndex === totalSteps - 1}
            />
          )}
        </div>
      )}
    </div>
  );
}
