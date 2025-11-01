import { db } from "../db/client";
import { workflowSessions, workflowInteractions, messages } from "../db/schema/index";
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
    | "ai_context_message" // ✅ Phase 2C: AI messages not tied to specific steps
    | "step_modified"
    | "workflow_complete"
    | "workflow_cancelled";
  role: "user" | "assistant" | "system";
  content: string | null;
  relatedStepIndex: number | null; // NULL for context messages
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

      // Insert a message into the conversation to anchor the workflow
      await db.insert(messages).values({
        conversationId,
        role: "assistant",
        content: `Starting workflow: ${solutionObject.solution}`,
        messageType: "workflow",
        workflowId: session.id,
        cardData: {
          workflowId: session.id,
          solution: solutionObject.solution,
          stepCount: solutionObject.stepList?.length || 0,
        },
      });

      console.log("[WorkflowService] Workflow message inserted into conversation");

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
      // Get current session to check step count
      const [currentSession] = await db
        .select()
        .from(workflowSessions)
        .where(eq(workflowSessions.id, sessionId))
        .limit(1);

      if (!currentSession) {
        throw new Error("Workflow session not found");
      }

      const totalSteps = (currentSession.workflowData as any)?.stepList?.length || 0;

      // If progressing past the last step, complete the workflow instead
      if (newStepIndex >= totalSteps) {
        console.log(
          `[WorkflowService] Step ${newStepIndex} exceeds total ${totalSteps} - completing workflow`
        );
        return await this.completeWorkflow(sessionId);
      }

      // Normal step progression
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
   * Get workflow by ID
   *
   * @param workflowId - Workflow session ID
   * @returns Workflow session or null
   */
  async getWorkflowById(workflowId: string): Promise<WorkflowSession | null> {
    try {
      const [session] = await db
        .select()
        .from(workflowSessions)
        .where(eq(workflowSessions.id, workflowId))
        .limit(1);

      return session ? (session as WorkflowSession) : null;
    } catch (error) {
      throw new Error("Failed to get workflow by ID", { cause: error });
    }
  }

  /**
   * Get active workflow for a conversation
   * Only returns workflows with status="active"
   * Used by workflow creation logic to check if workflow already exists
   *
   * @param conversationId - Conversation ID
   * @returns Active workflow session or null
   */
  async getActiveWorkflow(conversationId: string): Promise<WorkflowSession | null> {
    try {
      // Get the most recent ACTIVE workflow only
      // Completed/cancelled workflows won't block new workflow creation
      const [session] = await db
        .select()
        .from(workflowSessions)
        .where(
          and(
            eq(workflowSessions.conversationId, conversationId),
            eq(workflowSessions.status, "active")
          )
        )
        .orderBy(desc(workflowSessions.createdAt))
        .limit(1);

      return session ? (session as WorkflowSession) : null;
    } catch (error) {
      throw new Error("Failed to get active workflow", { cause: error });
    }
  }

  /**
   * Get most recent workflow for display (any status)
   * Used for showing workflow history in the UI
   *
   * @param conversationId - Conversation ID
   * @returns Most recent workflow session (any status) or null
   */
  async getMostRecentWorkflow(conversationId: string): Promise<WorkflowSession | null> {
    try {
      // Get the most recent workflow regardless of status
      // For UI display purposes (show history)
      const [session] = await db
        .select()
        .from(workflowSessions)
        .where(eq(workflowSessions.conversationId, conversationId))
        .orderBy(desc(workflowSessions.createdAt))
        .limit(1);

      return session ? (session as WorkflowSession) : null;
    } catch (error) {
      throw new Error("Failed to get most recent workflow", { cause: error });
    }
  }

  /**
   * Get all workflows for a conversation (for chat history display)
   * Returns all workflows regardless of status, ordered by creation time
   *
   * @param conversationId - Conversation ID
   * @returns Array of all workflow sessions
   */
  async getAllWorkflowsForConversation(conversationId: string): Promise<WorkflowSession[]> {
    try {
      const sessions = await db
        .select()
        .from(workflowSessions)
        .where(eq(workflowSessions.conversationId, conversationId))
        .orderBy(workflowSessions.createdAt); // Oldest first for chronological display

      return sessions as WorkflowSession[];
    } catch (error) {
      throw new Error("Failed to get workflows for conversation", { cause: error });
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
