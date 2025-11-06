import type { TextMessage, WorkflowMessage, ToolContext, WorkflowPhase } from "../base.tool";

/**
 * Smart wrapper that automatically detects workflow state and wraps text messages accordingly.
 *
 * This utility eliminates the need for duplicate workflow-specific tools by:
 * 1. Checking if workflow state exists in context (pre-loaded by orchestrator)
 * 2. If no workflow → returns TextMessage as-is
 * 3. If workflow exists → wraps as WorkflowMessage with cardData
 *
 * @param baseMessage - Must be TextMessage type (messageType: "text")
 * @param context - Tool context with optional workflowState
 * @param workflowPhase - Phase to set if wrapping (default: "custom_question")
 * @returns TextMessage (no workflow) or WorkflowMessage (has workflow)
 *
 * @example
 * // In a tool's execute method:
 * const baseMessage: TextMessage = {
 *   messageType: "text",
 *   content: "Here's the answer...",
 *   sources: [...],
 *   streamable: true
 * };
 *
 * // Smart wrapper decides if wrapping is needed
 * const result = wrapWithWorkflowState(baseMessage, context);
 * // Type: TextMessage | WorkflowMessage
 */
export function wrapWithWorkflowState(
  baseMessage: TextMessage,
  context: ToolContext,
  workflowPhase: WorkflowPhase = "custom_question"
): TextMessage | WorkflowMessage {
  // Check if workflow state exists (pre-loaded by orchestrator)
  const workflowState = context.workflowState;

  // No workflow OR workflow is paused → return as-is (don't wrap)
  if (!workflowState || workflowState.status !== "active") {
    return baseMessage;
  }

  // Wrap with workflow state
  const workflowMessage: WorkflowMessage = {
    ...baseMessage,
    messageType: "workflow",
    cardData: {
      ...workflowState,
      workflowActive: true,
      workflowPhase,
    },
  };

  return workflowMessage;
}
