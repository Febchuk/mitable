import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.schema';
import { organizations } from './organizations.schema';

// Roadmaps
export const roadmaps = pgTable('roadmaps', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 255 }), // Job role (e.g., "Frontend Engineer")
  totalWeeks: integer('total_weeks').notNull().default(12),
  currentWeek: integer('current_week').default(1),
  status: varchar('status', { length: 50 }).default('active'), // 'active' | 'completed' | 'paused'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Roadmap Tasks
export const roadmapTasks = pgTable('roadmap_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  roadmapId: uuid('roadmap_id')
    .notNull()
    .references(() => roadmaps.id, { onDelete: 'cascade' }),
  weekNumber: integer('week_number').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  timeEstimate: varchar('time_estimate', { length: 50 }), // e.g., "2 hours", "1 day"
  completed: boolean('completed').default(false),
  completedAt: timestamp('completed_at'),
  orderIndex: integer('order_index').default(0), // For sorting within week
  dependencies: jsonb('dependencies').default('[]'), // Array of task IDs that must be done first
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Source Materials
export const sourceMaterials = pgTable('source_materials', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }), // 'document' | 'video' | 'tutorial' | 'code_sample' | 'link'
  url: varchar('url', { length: 500 }),
  description: text('description'),
  organizationId: uuid('organization_id').references(() => organizations.id), // NULL for global resources
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Task Sources (Many-to-Many)
export const taskSources = pgTable(
  'task_sources',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => roadmapTasks.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sourceMaterials.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.taskId, table.sourceId] }),
  })
);

// Relations
export const roadmapsRelations = relations(roadmaps, ({ one, many }) => ({
  user: one(users, {
    fields: [roadmaps.userId],
    references: [users.id],
  }),
  tasks: many(roadmapTasks),
}));

export const roadmapTasksRelations = relations(roadmapTasks, ({ one, many }) => ({
  roadmap: one(roadmaps, {
    fields: [roadmapTasks.roadmapId],
    references: [roadmaps.id],
  }),
  taskSources: many(taskSources),
}));

export const sourceMaterialsRelations = relations(sourceMaterials, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [sourceMaterials.organizationId],
    references: [organizations.id],
  }),
  taskSources: many(taskSources),
}));

export const taskSourcesRelations = relations(taskSources, ({ one }) => ({
  task: one(roadmapTasks, {
    fields: [taskSources.taskId],
    references: [roadmapTasks.id],
  }),
  source: one(sourceMaterials, {
    fields: [taskSources.sourceId],
    references: [sourceMaterials.id],
  }),
}));

// Export types
export type Roadmap = typeof roadmaps.$inferSelect;
export type NewRoadmap = typeof roadmaps.$inferInsert;
export type RoadmapTask = typeof roadmapTasks.$inferSelect;
export type NewRoadmapTask = typeof roadmapTasks.$inferInsert;
export type SourceMaterial = typeof sourceMaterials.$inferSelect;
export type NewSourceMaterial = typeof sourceMaterials.$inferInsert;
export type TaskSource = typeof taskSources.$inferSelect;
export type NewTaskSource = typeof taskSources.$inferInsert;
