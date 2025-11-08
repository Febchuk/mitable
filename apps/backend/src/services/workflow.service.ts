import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * Workflow Service
 *
 * Manages workflow sessions and interactions using database persistence.
 * This service provides CRUD operations ONLY for workflow_sessions and workflow_interactions tables.
 * Business logic for workflow progression stays in the individual tools.
 */
class WorkflowService {
  /**
   * Create a new workflow session in the database
   * Called by start-ui-guidance-workflow.tool.ts when initiating a workflow
   */
  async createWorkflowSession(
    organizationId: string,
    conversationId: string,
    userId: string,
    solutionObject: any
  ) {
    const workflowSession = await db
      .insert(schema.workflowSessions)
      .values({
        organizationId,
        conversationId,
        userId,
        solution: solutionObject.solution || "",
        solutionExplanation: solutionObject.explanation || "",
        searchQuery: solutionObject.searchQuery || "",
        summary: solutionObject.summary || null,
        status: "active",
        currentStepIndex: -1, // Start at -1 for pre-flight state
        workflowData: solutionObject,
        stepsModified: 0,
      })
      .returning();

    return workflowSession[0];
  }

  /**
   * Get the active workflow for a conversation
   * Returns null if no active workflow exists
   */
  async getActiveWorkflow(conversationId: string) {
    const workflows = await db
      .select()
      .from(schema.workflowSessions)
      .where(
        and(
          eq(schema.workflowSessions.conversationId, conversationId),
          eq(schema.workflowSessions.status, "active")
        )
      )
      .limit(1);

    return workflows.length > 0 ? workflows[0] : null;
  }

  /**
   * Add an interaction to the workflow_interactions table
   * Called from streaming handler ONLY (dual-write pattern)
   */
  async addWorkflowInteraction(
    workflowSessionId: string,
    type:
      | "step_progress"
      | "user_question"
      | "ai_response"
      | "step_modified"
      | "workflow_complete"
      | "workflow_cancelled",
    role: "user" | "assistant" | "system",
    content: string | null,
    relatedStepIndex?: number | null,
    metadata?: any
  ) {
    const interaction = await db
      .insert(schema.workflowInteractions)
      .values({
        workflowSessionId,
        type,
        role,
        content,
        relatedStepIndex,
        metadata: metadata || {},
      })
      .returning();

    return interaction[0];
  }

  /**
   * Pause a workflow (user clicked exit)
   * Sets status to 'paused' so it can be resumed later
   */
  async pauseWorkflow(workflowId: string) {
    // Update workflow session status to paused
    const result = await db
      .update(schema.workflowSessions)
      .set({
        status: "paused",
        updatedAt: new Date(),
      })
      .where(eq(schema.workflowSessions.id, workflowId))
      .returning();

    // Update all messages with this workflowSessionId to have status: "paused" in cardData
    // This ensures retrieveLatestSolutionObject returns correct paused state
    await db
      .update(schema.messages)
      .set({
        cardData: sql`jsonb_set(card_data, '{status}', '"paused"')`,
      })
      .where(eq(schema.messages.workflowSessionId, workflowId));

    return result[0];
  }

  /**
   * Resume a paused workflow
   * Sets status back to 'active'
   */
  async resumeWorkflow(workflowId: string) {
    const result = await db
      .update(schema.workflowSessions)
      .set({
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(schema.workflowSessions.id, workflowId))
      .returning();

    return result[0];
  }

  /**
   * Complete a workflow when it reaches final step
   */
  async completeWorkflow(workflowId: string) {
    const result = await db
      .update(schema.workflowSessions)
      .set({
        status: "completed",
        completionType: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.workflowSessions.id, workflowId))
      .returning();

    return result[0];
  }

  /**
   * Get a specific workflow session by ID
   * Returns null if workflow doesn't exist
   */
  async getWorkflowById(workflowId: string) {
    const workflows = await db
      .select()
      .from(schema.workflowSessions)
      .where(eq(schema.workflowSessions.id, workflowId))
      .limit(1);

    return workflows.length > 0 ? workflows[0] : null;
  }

  /**
   * Get all interactions for a workflow session
   * Returns interactions in chronological order (oldest first)
   */
  async getWorkflowInteractions(workflowSessionId: string) {
    const interactions = await db
      .select()
      .from(schema.workflowInteractions)
      .where(eq(schema.workflowInteractions.workflowSessionId, workflowSessionId))
      .orderBy(schema.workflowInteractions.createdAt);

    return interactions;
  }

  /**
   * Get workflow history for a user (for AI recall across conversations)
   * Returns workflows ordered by most recent first
   * @param userId - User ID to fetch workflows for
   * @param limit - Maximum number of workflows to return (default: 10)
   */
  async getUserWorkflows(userId: string, limit: number = 10) {
    const workflows = await db
      .select()
      .from(schema.workflowSessions)
      .where(eq(schema.workflowSessions.userId, userId))
      .orderBy(desc(schema.workflowSessions.createdAt))
      .limit(limit);

    return workflows;
  }
}

// Export singleton instance
export const workflowService = new WorkflowService();
