import type { ToolResult, TextMessage, WorkflowMessage, ExpertsMessage } from "../base.tool";

/**
 * Type guard functions for discriminated union pattern.
 *
 * These functions enable TypeScript to narrow the ToolResult type and provide
 * compile-time safety when accessing message-specific properties.
 *
 * @example
 * const result: ToolResult = await someTool.execute(args, context);
 *
 * if (isWorkflowMessage(result)) {
 *   // TypeScript knows: result.cardData.stepList exists
 *   console.log(`Workflow has ${result.cardData.stepList.length} steps`);
 * } else if (isTextMessage(result)) {
 *   // TypeScript knows: result.cardData is undefined
 *   console.log("Regular text response");
 * } else if (isExpertsMessage(result)) {
 *   // TypeScript knows: result.cardData.experts exists
 *   console.log(`Found ${result.cardData.experts.length} experts`);
 * }
 */

/**
 * Check if result is a text-only message
 */
export function isTextMessage(msg: ToolResult): msg is TextMessage {
  return msg.messageType === "text";
}

/**
 * Check if result is a workflow message with step-by-step guidance
 */
export function isWorkflowMessage(msg: ToolResult): msg is WorkflowMessage {
  return msg.messageType === "workflow" && msg.cardData?.workflowActive === true;
}

/**
 * Check if result is an experts message with colleague recommendations
 */
export function isExpertsMessage(msg: ToolResult): msg is ExpertsMessage {
  return msg.messageType === "experts";
}
