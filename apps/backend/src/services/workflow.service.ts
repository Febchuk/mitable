import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq } from "drizzle-orm";

/**
 * Workflow step information
 */
export interface WorkflowStep {
  stepNumber: number;
  instruction: string;
  targetElement?: {
    label: string;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  completed: boolean;
  timestamp: Date;
}

/**
 * Workflow state stored in conversation metadata
 */
export interface WorkflowState {
  active: boolean;
  title: string;
  currentStepNumber: number;
  steps: WorkflowStep[];
  lastScreenshotHash?: string; // To detect screen changes
  startedAt: Date;
  lastUpdatedAt: Date;
}

/**
 * Workflow Service
 *
 * Manages workflow state throughout a conversation's lifecycle.
 * Tracks step progression, detects continuations, and coordinates
 * the iterative just-in-time guidance model.
 */
class WorkflowService {
  /**
   * Start a new workflow in a conversation
   *
   * @param conversationId - The conversation ID
   * @param title - Workflow title (e.g., "How to submit a PR")
   * @param firstStep - The initial step
   * @returns Updated workflow state
   */
  async startWorkflow(
    conversationId: string,
    title: string,
    firstStep: Omit<WorkflowStep, "completed" | "timestamp">
  ): Promise<WorkflowState> {
    console.log(
      `[WorkflowService] Starting workflow: "${title}" in conversation ${conversationId}`
    );

    const workflowState: WorkflowState = {
      active: true,
      title,
      currentStepNumber: 1,
      steps: [
        {
          ...firstStep,
          completed: false,
          timestamp: new Date(),
        },
      ],
      startedAt: new Date(),
      lastUpdatedAt: new Date(),
    };

    // Update conversation contextType to 'workflow'
    await db
      .update(schema.conversations)
      .set({
        contextType: "workflow",
        // Store workflow state in a metadata column (would need to add this to schema)
      })
      .where(eq(schema.conversations.id, conversationId));

    console.log("[WorkflowService] Workflow started:", {
      conversationId,
      title,
      stepNumber: 1,
    });

    return workflowState;
  }

  /**
   * Add a new step to an active workflow
   *
   * @param conversationId - The conversation ID
   * @param currentState - Current workflow state
   * @param nextStep - The next step to add
   * @returns Updated workflow state
   */
  async addStep(
    conversationId: string,
    currentState: WorkflowState,
    nextStep: Omit<WorkflowStep, "completed" | "timestamp">
  ): Promise<WorkflowState> {
    if (!currentState.active) {
      throw new Error("Cannot add step to inactive workflow");
    }

    // Mark previous step as completed
    const updatedSteps = currentState.steps.map((step) =>
      step.stepNumber === currentState.currentStepNumber ? { ...step, completed: true } : step
    );

    // Add new step
    const newStepNumber = currentState.currentStepNumber + 1;
    updatedSteps.push({
      ...nextStep,
      stepNumber: newStepNumber,
      completed: false,
      timestamp: new Date(),
    });

    const updatedState: WorkflowState = {
      ...currentState,
      currentStepNumber: newStepNumber,
      steps: updatedSteps,
      lastUpdatedAt: new Date(),
    };

    console.log("[WorkflowService] Step added:", {
      conversationId,
      stepNumber: newStepNumber,
      totalSteps: updatedSteps.length,
    });

    return updatedState;
  }

  /**
   * Complete the workflow
   *
   * @param conversationId - The conversation ID
   * @param currentState - Current workflow state
   * @returns Updated workflow state
   */
  async completeWorkflow(
    conversationId: string,
    currentState: WorkflowState
  ): Promise<WorkflowState> {
    console.log(`[WorkflowService] Completing workflow in conversation ${conversationId}`);

    // Mark all steps as completed
    const completedSteps = currentState.steps.map((step) => ({ ...step, completed: true }));

    const updatedState: WorkflowState = {
      ...currentState,
      active: false,
      steps: completedSteps,
      lastUpdatedAt: new Date(),
    };

    // Update conversation contextType back to 'general'
    await db
      .update(schema.conversations)
      .set({
        contextType: "general",
      })
      .where(eq(schema.conversations.id, conversationId));

    console.log("[WorkflowService] Workflow completed:", {
      conversationId,
      totalSteps: completedSteps.length,
      duration: new Date().getTime() - currentState.startedAt.getTime(),
    });

    return updatedState;
  }

  /**
   * Get workflow state from conversation
   *
   * @param conversationId - The conversation ID
   * @returns Workflow state or null if no active workflow
   */
  async getWorkflowState(conversationId: string): Promise<WorkflowState | null> {
    // In a real implementation, this would fetch from a metadata column
    // For now, we'll return null to indicate no stored state
    // The state will be managed in-memory during the conversation

    const [conversation] = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId))
      .limit(1);

    if (!conversation || conversation.contextType !== "workflow") {
      return null;
    }

    // TODO: Retrieve from metadata column when schema is updated
    return null;
  }

  /**
   * Detect if a conversation should enter workflow mode
   *
   * @param userMessage - The user's message
   * @param conversationHistory - Recent conversation history
   * @returns True if should enter workflow mode
   */
  shouldEnterWorkflowMode(
    userMessage: string,
    _conversationHistory: { role: string; content: string }[]
  ): boolean {
    const messageLower = userMessage.toLowerCase();

    // Explicit workflow triggers
    const workflowTriggers = [
      "how do i",
      "how to",
      "show me how",
      "guide me",
      "walk me through",
      "help me",
      "teach me how",
      "can you show me",
    ];

    const hasWorkflowTrigger = workflowTriggers.some((trigger) => messageLower.includes(trigger));

    // Check if this is a procedural/task-based question
    const taskKeywords = [
      "submit",
      "create",
      "setup",
      "configure",
      "install",
      "deploy",
      "request",
      "approve",
      "send",
      "upload",
      "download",
      "share",
      "invite",
    ];

    const hasTaskKeyword = taskKeywords.some((keyword) => messageLower.includes(keyword));

    // Enter workflow mode if:
    // 1. Has explicit workflow trigger
    // 2. Has task keyword AND asks a question
    const isQuestion = messageLower.includes("?") || messageLower.startsWith("how");

    return hasWorkflowTrigger || (hasTaskKeyword && isQuestion);
  }
}

// Export singleton instance
export const workflowService = new WorkflowService();
