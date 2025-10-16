import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations.schema";
import { sourceMaterials } from "./source-materials.schema";

// Roadmap Templates (admin-created reusable templates)
export const roadmapTemplates = pgTable("roadmap_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 100 }), // Lucide icon name or emoji
  color: varchar("color", { length: 7 }), // Hex color code for template card (e.g., #3b82f6)
  roleTags: jsonb("role_tags").default("[]"), // Array of role strings
  totalWeeks: integer("total_weeks").notNull().default(4),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Roadmap Template Tasks
export const roadmapTemplateTasks = pgTable("roadmap_template_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => roadmapTemplates.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  timeEstimate: varchar("time_estimate", { length: 50 }), // e.g., "2 hours", "1 day"
  orderIndex: integer("order_index").default(0), // For sorting within week
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Template Task Sources (Many-to-Many)
export const roadmapTemplateSources = pgTable(
  "roadmap_template_sources",
  {
    templateTaskId: uuid("template_task_id")
      .notNull()
      .references(() => roadmapTemplateTasks.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sourceMaterials.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.templateTaskId, table.sourceId] }),
  })
);

// Relations
export const roadmapTemplatesRelations = relations(roadmapTemplates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [roadmapTemplates.organizationId],
    references: [organizations.id],
  }),
  tasks: many(roadmapTemplateTasks),
}));

export const roadmapTemplateTasksRelations = relations(
  roadmapTemplateTasks,
  ({ one, many }) => ({
    template: one(roadmapTemplates, {
      fields: [roadmapTemplateTasks.templateId],
      references: [roadmapTemplates.id],
    }),
    sources: many(roadmapTemplateSources),
  })
);

export const roadmapTemplateSourcesRelations = relations(
  roadmapTemplateSources,
  ({ one }) => ({
    templateTask: one(roadmapTemplateTasks, {
      fields: [roadmapTemplateSources.templateTaskId],
      references: [roadmapTemplateTasks.id],
    }),
    source: one(sourceMaterials, {
      fields: [roadmapTemplateSources.sourceId],
      references: [sourceMaterials.id],
    }),
  })
);

// Export types
export type RoadmapTemplate = typeof roadmapTemplates.$inferSelect;
export type NewRoadmapTemplate = typeof roadmapTemplates.$inferInsert;
export type RoadmapTemplateTask = typeof roadmapTemplateTasks.$inferSelect;
export type NewRoadmapTemplateTask = typeof roadmapTemplateTasks.$inferInsert;
export type RoadmapTemplateSource = typeof roadmapTemplateSources.$inferSelect;
export type NewRoadmapTemplateSource = typeof roadmapTemplateSources.$inferInsert;
