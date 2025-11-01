import { db } from "../db/client";
import { workflowSessions, workflowInteractions } from "../db/schema/index";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * SolutionObject - Complete workflow structure
 */
export interface SolutionObject {
  solution: string;
  solutionExplanation: string;
  searchQuery: string;
  supportingData?: any[];
  supportingDataExplanation?: string;
  stepList: Array<{
    stepNumber: number;
    description: string; // ✅ Unified field name (was stepDescription)
    status: "pending" | "current" | "completed";
  }>;
  currentStepIndex: number;
  adjustmentHistory?: any[];
}

/**
 * Workflow Session - Database record
 */
export interface WorkflowSession {
  id: string;
  organizationId: string;
  conversationId: string;
  userId: string;
  solution: string;
  solutionExplanation: string;
  searchQuery: string;
  summary: string | null;
  status: "active" | "completed" | "cancelled";
  currentStepIndex: number;
  completedAt: Date | null;
  completionType: string | null;
  workflowData: SolutionObject;
  stepsModified: number;
  lastStepModifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Workflow Interaction - Individual interaction record
 */
export interface WorkflowInteraction {
  id: string;
  workflowSessionId: string;
  type:
    | "step_progress"
    | "user_question"
    | "ai_response"
    | "step_modified"
    | "workflow_complete"
    | "workflow_cancelled";
  role: "user" | "assistant" | "system";
  content: string | null;
  relatedStepIndex: number | null;
  metadata: any;
  createdAt: Date;
}

/**
 * Workflow Service
 *
 * Manages UI guidance workflows completely isolated from regular chat.
 * Stores workflows in separate tables with full conversation history.
 * Supports:
 * - Creating workflow sessions
 * - Tracking step progression
 * - Logging in-workflow Q&A
 * - Modifying steps dynamically
 * - Completing/cancelling workflows
 * - Cross-chat recall for AI
 */
class WorkflowService {
  /**
   * Validate configuration on initialization
   */
  constructor() {
    if (!db) {
      throw new Error(
        "Database client is not initialized. Please check your database configuration."
      );
    }
  }
  /**
   * Create a new workflow session
   * Called when user confirms they want to start the workflow
   *
   * @param organizationId - Organization ID
   * @param conversationId - Conversation ID
   * @param userId - User ID
   * @param solutionObject - Complete workflow data
   * @returns Created workflow session
   */
  async createWorkflowSession(
    organizationId: string,
    conversationId: string,
    userId: string,
    solutionObject: SolutionObject
  ): Promise<WorkflowSession> {
    try {
      const [session] = await db
        .insert(workflowSessions)
        .values({
          organizationId,
          conversationId,
          userId,
          solution: solutionObject.solution,
          solutionExplanation: solutionObject.solutionExplanation,
          searchQuery: solutionObject.searchQuery,
          status: "active",
          currentStepIndex: 0,
          workflowData: solutionObject,
        })
        .returning();

      console.log("[WorkflowService] Workflow session created:", {
        sessionId: session.id,
        conversationId,
        solution: solutionObject.solution,
      });

      return session as WorkflowSession;
    } catch (error) {
      throw new Error("Failed to create workflow session", { cause: error });
    }
  }

  /**
   * Add interaction to workflow
   * Logs user questions, AI responses, step progress, etc.
   *
   * @param workflowSessionId - Workflow session ID
   * @param type - Interaction type
   * @param role - Who initiated (user/assistant/system)
   * @param content - Message content
   * @param relatedStepIndex - Optional step index
   * @param metadata - Additional data
   * @returns Created interaction
   */
  async addInteraction(
    workflowSessionId: string,
    type: WorkflowInteraction["type"],
    role: WorkflowInteraction["role"],
    content?: string,
    relatedStepIndex?: number,
    metadata?: any
  ): Promise<WorkflowInteraction> {
    try {
      const [interaction] = await db
        .insert(workflowInteractions)
        .values({
          workflowSessionId,
          type,
          role,
          content: content || null,
          relatedStepIndex: relatedStepIndex ?? null,
          metadata: metadata || {},
        })
        .returning();

      return interaction as WorkflowInteraction;
    } catch (error) {
      throw new Error("Failed to add workflow interaction", { cause: error });
    }
  }

  /**
   * Progress to next step
   * Updates current step index and step statuses
   *
   * @param sessionId - Workflow session ID
   * @param newStepIndex - New step index
   * @returns Updated session
   */
  async progressStep(sessionId: string, newStepIndex: number): Promise<WorkflowSession> {
    try {
      const [session] = await db
        .update(workflowSessions)
        .set({
          currentStepIndex: newStepIndex,
          updatedAt: new Date(),
        })
        .where(eq(workflowSessions.id, sessionId))
        .returning();

      // Log interaction
      await this.addInteraction(sessionId, "step_progress", "user", undefined, newStepIndex);

      return session as WorkflowSession;
    } catch (error) {
      throw new Error("Failed to progress workflow step", { cause: error });
    }
  }

  /**
   * Modify workflow steps
   * Called when AI updates steps based on user feedback
   *
   * @param sessionId - Workflow session ID
   * @param updatedWorkflowData - New workflow data
   * @param modificationReason - Why steps were changed
   * @param stepIndex - Which step was modified
   * @returns Updated session
   */
  async modifySteps(
    sessionId: string,
    updatedWorkflowData: SolutionObject,
    modificationReason: string,
    stepIndex?: number
  ): Promise<WorkflowSession> {
    try {
      const [session] = await db
        .update(workflowSessions)
        .set({
          workflowData: updatedWorkflowData,
          stepsModified: sql`${workflowSessions.stepsModified} + 1`,
          lastStepModifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(workflowSessions.id, sessionId))
        .returning();

      // Log modification
      await this.addInteraction(
        sessionId,
        "step_modified",
        "system",
        modificationReason,
        stepIndex,
        { reason: modificationReason }
      );

      return session as WorkflowSession;
    } catch (error) {
      throw new Error("Failed to modify workflow steps", { cause: error });
    }
  }

  /**
   * Complete workflow successfully
   *
   * @param sessionId - Workflow session ID
   * @returns Updated session
   */
  async completeWorkflow(sessionId: string): Promise<WorkflowSession> {
    try {
      const [session] = await db
        .update(workflowSessions)
        .set({
          status: "completed",
          completionType: "success",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(workflowSessions.id, sessionId))
        .returning();

      // Log completion
      await this.addInteraction(sessionId, "workflow_complete", "system");

      console.log("[WorkflowService] Workflow completed:", { sessionId });
      return session as WorkflowSession;
    } catch (error) {
      throw new Error("Failed to complete workflow", { cause: error });
    }
  }

  /**
   * Cancel workflow
   *
   * @param sessionId - Workflow session ID
   * @returns Updated session
   */
  async cancelWorkflow(sessionId: string): Promise<WorkflowSession> {
    try {
      const [session] = await db
        .update(workflowSessions)
        .set({
          status: "cancelled",
          completionType: "user_cancelled",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(workflowSessions.id, sessionId))
        .returning();

      // Log cancellation
      await this.addInteraction(sessionId, "workflow_cancelled", "system");

      console.log("[WorkflowService] Workflow cancelled:", { sessionId });
      return session as WorkflowSession;
    } catch (error) {
      throw new Error("Failed to cancel workflow", { cause: error });
    }
  }

  /**
   * Get active workflow for a conversation
   * Now also returns completed/cancelled workflows to show history
   *
   * @param conversationId - Conversation ID
   * @returns Most recent workflow session or null
   */
  async getActiveWorkflow(conversationId: string): Promise<WorkflowSession | null> {
    try {
      // Get the most recent workflow (active, completed, or cancelled)
      // to preserve history in the UI
      const [session] = await db
        .select()
        .from(workflowSessions)
        .where(eq(workflowSessions.conversationId, conversationId))
        .orderBy(desc(workflowSessions.createdAt))
        .limit(1);

      return session ? (session as WorkflowSession) : null;
    } catch (error) {
      throw new Error("Failed to get active workflow", { cause: error });
    }
  }

  /**
   * Get workflow interactions
   *
   * @param sessionId - Workflow session ID
   * @returns List of interactions
   */
  async getInteractions(sessionId: string): Promise<WorkflowInteraction[]> {
    try {
      const interactions = await db
        .select()
        .from(workflowInteractions)
        .where(eq(workflowInteractions.workflowSessionId, sessionId))
        .orderBy(workflowInteractions.createdAt);

      return interactions as WorkflowInteraction[];
    } catch (error) {
      throw new Error("Failed to get workflow interactions", { cause: error });
    }
  }

  /**
   * Get user's workflow history (for AI recall)
   *
   * @param userId - User ID
   * @param organizationId - Organization ID
   * @param limit - Max number of workflows
   * @returns List of workflow sessions
   */
  async getUserWorkflowHistory(
    userId: string,
    organizationId: string,
    limit: number = 10
  ): Promise<WorkflowSession[]> {
    try {
      const sessions = await db
        .select()
        .from(workflowSessions)
        .where(
          and(
            eq(workflowSessions.userId, userId),
            eq(workflowSessions.organizationId, organizationId)
          )
        )
        .orderBy(desc(workflowSessions.createdAt))
        .limit(limit);

      return sessions as WorkflowSession[];
    } catch (error) {
      throw new Error("Failed to get user workflow history", { cause: error });
    }
  }
}

// Export singleton instance
export const workflowService = new WorkflowService();
