import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Response } from "@/components/ui/ai-response";
import MessageBubble from "./MessageBubble";
import StepList from "@/components/domain/workflow/StepList";
import WorkflowOptions, { type WorkflowPhase } from "@/components/domain/workflow/WorkflowOptions";
import type { Message } from "../App";

interface WorkflowOption {
  id: number;
  label: string;
  action: string;
}

interface ChatViewProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  onWorkflowOptionSelect?: (option: WorkflowOption) => void;
}

function ChatView({
  messages,
  isStreaming,
  streamingContent,
  onWorkflowOptionSelect,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  return (
    <ScrollArea className="h-full" ref={scrollRef}>
      <div className="flex flex-col gap-4 p-4">
        {messages.map((message, index) => {
          // Check if this is a workflow message
          if (message.messageType === "workflow" && message.cardData) {
            const cardData = message.cardData as {
              workflowActive?: boolean;
              workflowPhase?: WorkflowPhase;
              stepList?: Array<{
                stepNumber: number;
                description: string;
                status: "pending" | "current" | "completed";
              }>;
              currentStepIndex?: number;
            };

            const workflowPhase = cardData.workflowPhase;
            const shouldShowStepList =
              cardData.workflowActive &&
              workflowPhase &&
              workflowPhase !== "custom_question" &&
              cardData.stepList;
            const shouldShowCheckboxes = workflowPhase === "step_progression";
            const isLastMessage = index === messages.length - 1;
            const shouldShowOptions =
              isLastMessage && cardData.workflowActive && workflowPhase && !isStreaming;

            return (
              <div key={message.id} className="space-y-3">
                {/* Step list accordion */}
                {shouldShowStepList && cardData.stepList && (
                  <StepList
                    steps={cardData.stepList}
                    currentStepIndex={cardData.currentStepIndex || 0}
                    showCheckboxes={shouldShowCheckboxes}
                  />
                )}

                {/* AI text response */}
                {message.content && (
                  <div className="mb-4 max-w-[85%]">
                    <div className="text-[15px] leading-[1.6] text-white">
                      <Response parseIncompleteMarkdown={message.isStreaming}>
                        {message.content}
                      </Response>
                    </div>
                  </div>
                )}

                {/* Workflow option buttons - only show on last message when not streaming */}
                {shouldShowOptions && onWorkflowOptionSelect && (
                  <WorkflowOptions
                    phase={workflowPhase}
                    onOptionSelect={onWorkflowOptionSelect}
                    disabled={isStreaming}
                  />
                )}
              </div>
            );
          }

          // Regular message
          return <MessageBubble key={message.id} message={message} />;
        })}

        {/* Streaming indicator - matches AI message style (no bubble) */}
        {isStreaming && (
          <div className="mb-4 max-w-[85%]">
            <div className="text-[15px] leading-[1.6] text-white">
              {streamingContent ? (
                <Response parseIncompleteMarkdown={true}>{streamingContent}</Response>
              ) : (
                <span className="flex gap-1">
                  <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" />
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

export default ChatView;
