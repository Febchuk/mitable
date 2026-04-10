import { pgTable, uuid, varchar, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { conversations } from "../../domains/agent/schema/conversations.schema.js";
import { users } from "../../domains/auth/schema/users.schema";
import { organizations } from "../../domains/auth/schema/organizations.schema";

/**
 * Workflow Sessions
 *
 * Represents a single UI guidance workflow session.
 * Linked to organization, user, and conversation for proper isolation and recall.
 * Stored separately from regular messages for isolation.
 *
 * Data hierarchy: organization → user → conversation → workflow
 *
 * AI can reference these in future chats:
 * "You had a workflow on Oct 15th where I showed you how to update the Slack team roster"
 */
export const workflowSessions = pgTable("workflow_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Workflow metadata for AI recall
  solution: text("solution").notNull(), // High-level goal (e.g., "Update product roadmap")
  solutionExplanation: text("solution_explanation").notNull(),
  searchQuery: text("search_query").notNull(), // Original user query

  // Summary for RAG/search - AI can use this to recall past workflows
  summary: text("summary"), // Auto-generated: "Showed user how to update Slack team roster on Oct 15, 2024. Involved 5 steps..."

  // Workflow state management
  status: varchar("status", { length: 50 }).notNull().default("active"),
  // States:
  //   - 'active': Workflow in progress
  //   - 'completed': User finished all steps successfully
  //   - 'cancelled': User exited before completion

  currentStepIndex: integer("current_step_index").notNull().default(0),

  // Completion tracking
  completedAt: timestamp("completed_at"), // When workflow was finished (completed or cancelled)
  completionType: varchar("completion_type", { length: 50 }),
  // Types:
  //   - 'success': User completed all steps
  //   - 'user_cancelled': User clicked exit
  //   - 'timeout': Workflow abandoned (optional future use)

  // Complete workflow data (stepList, supportingData, etc.)
  workflowData: jsonb("workflow_data").notNull(), // Full SolutionObject

  // Track when steps were last modified (for AI adaptive workflows)
  stepsModified: integer("steps_modified").notNull().default(0), // Count of step modifications
  lastStepModifiedAt: timestamp("last_step_modified_at"), // When steps were last changed

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Workflow Interactions
 *
 * Individual interactions within a workflow session.
 * Captures the ENTIRE conversation that happens INSIDE the workflow accordion.
 *
 * This includes:
 * - User clicking "Continue" to progress steps
 * - User asking questions about the workflow
 * - AI responding to questions
 * - AI updating/modifying steps based on user questions
 * - Step completions, cancellations, etc.
 *
 * These are NOT stored in the main messages table - they're workflow-specific.
 */
export const workflowInteractions = pgTable("workflow_interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowSessionId: uuid("workflow_session_id")
    .notNull()
    .references(() => workflowSessions.id, { onDelete: "cascade" }),

  // Interaction metadata
  type: varchar("type", { length: 50 }).notNull(),
  // Types:
  //   - 'step_progress': User moved to next step
  //   - 'user_question': User asked a question during workflow
  //   - 'ai_response': AI answered user's question
  //   - 'step_modified': AI updated/changed a step based on user feedback
  //   - 'workflow_complete': Workflow finished successfully
  //   - 'workflow_cancelled': User exited workflow

  role: varchar("role", { length: 50 }).notNull(), // 'user' | 'assistant' | 'system'
  content: text("content"), // Message content (question, answer, etc.)

  // Step context - which step this interaction relates to
  relatedStepIndex: integer("related_step_index"), // null if not step-specific

  // Additional data
  metadata: jsonb("metadata").default("{}"),
  // metadata can include:
  //   - screenshot_url: If user sent screenshot
  //   - previous_step_text: Before modification (for step_modified type)
  //   - new_step_text: After modification (for step_modified type)
  //   - modification_reason: Why step was changed

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const workflowSessionsRelations = relations(workflowSessions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workflowSessions.organizationId],
    references: [organizations.id],
  }),
  conversation: one(conversations, {
    fields: [workflowSessions.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [workflowSessions.userId],
    references: [users.id],
  }),
  interactions: many(workflowInteractions),
}));

export const workflowInteractionsRelations = relations(workflowInteractions, ({ one }) => ({
  workflowSession: one(workflowSessions, {
    fields: [workflowInteractions.workflowSessionId],
    references: [workflowSessions.id],
  }),
}));

// Export types
export type WorkflowSession = typeof workflowSessions.$inferSelect;
export type NewWorkflowSession = typeof workflowSessions.$inferInsert;
export type WorkflowInteraction = typeof workflowInteractions.$inferSelect;
export type NewWorkflowInteraction = typeof workflowInteractions.$inferInsert;
