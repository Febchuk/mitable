import { pgTable, uuid, varchar, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users.schema";
import { roadmapTemplates } from "./roadmap-templates.schema";

// User Template Assignments (tracks which templates assigned to which users)
export const userTemplateAssignments = pgTable("user_template_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  templateId: uuid("template_id")
    .notNull()
    .references(() => roadmapTemplates.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  status: varchar("status", { length: 50 }).default("active"), // 'active' | 'completed' | 'archived'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User Roadmap Tasks (user's actual tasks - copied from templates + custom)
export const userRoadmapTasks = pgTable("user_roadmap_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => roadmapTemplates.id), // NULL if custom task
  templateTaskId: uuid("template_task_id"), // Reference to original template task (no FK to avoid cascades)
  weekNumber: integer("week_number").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  timeEstimate: varchar("time_estimate", { length: 50 }),
  orderIndex: integer("order_index").default(0),
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
  isCustom: boolean("is_custom").default(false), // TRUE if manually added by admin
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const userTemplateAssignmentsRelations = relations(userTemplateAssignments, ({ one }) => ({
  user: one(users, {
    fields: [userTemplateAssignments.userId],
    references: [users.id],
  }),
  template: one(roadmapTemplates, {
    fields: [userTemplateAssignments.templateId],
    references: [roadmapTemplates.id],
  }),
}));

export const userRoadmapTasksRelations = relations(userRoadmapTasks, ({ one }) => ({
  user: one(users, {
    fields: [userRoadmapTasks.userId],
    references: [users.id],
  }),
  template: one(roadmapTemplates, {
    fields: [userRoadmapTasks.templateId],
    references: [roadmapTemplates.id],
  }),
}));

// Export types
export type UserTemplateAssignment = typeof userTemplateAssignments.$inferSelect;
export type NewUserTemplateAssignment = typeof userTemplateAssignments.$inferInsert;
export type UserRoadmapTask = typeof userRoadmapTasks.$inferSelect;
export type NewUserRoadmapTask = typeof userRoadmapTasks.$inferInsert;
