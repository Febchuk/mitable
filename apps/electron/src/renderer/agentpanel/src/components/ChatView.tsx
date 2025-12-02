import { useEffect, useRef, type MutableRefObject } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Response } from "@/components/ui/ai-response";
import MessageBubble from "./MessageBubble";
import { WorkflowAccordion } from "./WorkflowAccordion";
import LoadingMessage from "./LoadingMessage";
import type { Message } from "../App";
import type { SolutionObject } from "@mitable/shared";

interface WorkflowOption {
  id: number;
  label: string;
  action: string;
}

interface ChatViewProps {
  messages: Message[];
  isStreaming: boolean;
  streamingMessageIdRef: MutableRefObject<string | null>;
  onWorkflowOptionSelect?: (option: WorkflowOption) => void;
  workflowLoadingMessage?: string | null;
  loadingMessage?: string | null;
  awaitingCustomQuestion?: boolean;
}

// Helper to get the latest workflow state from messages
function getLatestWorkflowState(workflowMessages: Message[]) {
  // Find the most recent message with cardData (contains latest workflow state)
  const messagesWithCardData = workflowMessages.filter((m) => m.cardData);
  if (messagesWithCardData.length === 0) return null;

  const latestMessage = messagesWithCardData[messagesWithCardData.length - 1];
  const cardData = latestMessage.cardData as SolutionObject & {
    workflowSessionId?: string;
    status?: "active" | "paused" | "completed";
  };

  return {
    ...cardData,
    workflowSessionId: cardData.workflowSessionId || latestMessage.workflowSessionId || "",
    status: cardData.status || "active",
  };
}

function ChatView({
  messages,
  // isStreaming is kept in props interface for API compatibility, but we use streamingMessageIdRef.current internally
  isStreaming: _isStreaming,
  streamingMessageIdRef,
  onWorkflowOptionSelect,
  workflowLoadingMessage = null,
  loadingMessage = null,
  awaitingCustomQuestion = false,
}: ChatViewProps) {
  // Suppress unused variable warning (keeping for potential future use)
  void _isStreaming;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track which workflow sessions we've already rendered in THIS render cycle
  // Fresh Set on each render - no persistence needed (fixes deduplication timing bug)
  const renderedWorkflowSessions = new Set<string>();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loadingMessage, workflowLoadingMessage]);

  return (
    <ScrollArea className="h-full" ref={scrollRef}>
      <div className="flex flex-col gap-4 p-4">
        {messages.map((message) => {
          // Check if this is a workflow message
          const isWorkflowMessage = message.messageType === "workflow" && message.cardData;

          if (isWorkflowMessage) {
            const cardData = message.cardData as SolutionObject & {
              workflowSessionId?: string;
              status?: "active" | "paused" | "completed";
            };
            const workflowSessionId =
              cardData.workflowSessionId || message.workflowSessionId || "";

            // Skip if we've already rendered this workflow session
            if (workflowSessionId && renderedWorkflowSessions.has(workflowSessionId)) {
              return null;
            }

            // Mark this session as rendered
            if (workflowSessionId) {
              renderedWorkflowSessions.add(workflowSessionId);
            }

            // Get all messages for this workflow
            const workflowMessages = messages.filter(
              (m) =>
                m.workflowSessionId === workflowSessionId ||
                (m.messageType === "workflow" &&
                  (m.cardData as { workflowSessionId?: string })?.workflowSessionId ===
                    workflowSessionId)
            );

            // Get the latest workflow state
            const currentWorkflowState = getLatestWorkflowState(workflowMessages);

            if (!currentWorkflowState || !currentWorkflowState.stepList) {
              // Fallback to basic rendering if no valid workflow state
              return (
                <div key={message.id} className="mb-4 max-w-[85%]">
                  <div className="text-[15px] leading-[1.6] text-white">
                    <Response parseIncompleteMarkdown={message.isStreaming}>
                      {message.content}
                    </Response>
                  </div>
                </div>
              );
            }

            // Check if ANY message in this workflow is currently streaming
            const isCurrentlyStreaming = workflowMessages.some(
              (m) => streamingMessageIdRef.current === m.id
            );

            return (
              <WorkflowAccordion
                key={`workflow-${workflowSessionId || message.id}`}
                workflow={currentWorkflowState as any}
                messages={workflowMessages}
                onOptionSelect={onWorkflowOptionSelect || (() => {})}
                isStreaming={isCurrentlyStreaming}
                awaitingCustomQuestion={awaitingCustomQuestion}
                workflowLoadingMessage={workflowLoadingMessage}
              />
            );
          }

          // Skip user messages that belong to a workflow (they're shown inside the accordion)
          if (message.role === "user" && message.workflowSessionId) {
            const hasValidStepIndex =
              message.relatedStepIndex !== undefined &&
              message.relatedStepIndex !== null &&
              message.relatedStepIndex >= 0;
            if (hasValidStepIndex) {
              return null; // Rendered inside WorkflowAccordion
            }
          }

          // Regular message
          return <MessageBubble key={message.id} message={message} />;
        })}

        {/* Loading message - show when backend is processing (non-workflow) */}
        {loadingMessage && <LoadingMessage message={loadingMessage} />}
      </div>
    </ScrollArea>
  );
}

export default ChatView;
