import {
  pgTable,
  uuid,
  text,
  decimal,
  interval,
  integer,
  timestamp,
  varchar,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.schema';

// Expert Profiles
export const expertProfiles = pgTable('expert_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  expertiseSummary: text('expertise_summary'), // Auto-generated summary
  responseRate: decimal('response_rate', { precision: 5, scale: 2 }).default('0.00'), // Percentage 0-100
  avgResponseTime: interval('avg_response_time'), // Average time to first response
  avgResolutionTime: interval('avg_resolution_time'), // Average time to resolve
  helpfulnessScore: decimal('helpfulness_score', { precision: 3, scale: 2 }).default('0.00'), // 0.0 to 5.0
  totalInteractions: integer('total_interactions').default(0),
  lastActiveAt: timestamp('last_active_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Expert Topics
export const expertTopics = pgTable('expert_topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => expertProfiles.userId, { onDelete: 'cascade' }),
  topic: varchar('topic', { length: 255 }).notNull(), // e.g., "React", "Database Design"
  confidenceScore: decimal('confidence_score', { precision: 3, scale: 2 }).default('0.00'), // 0.0 to 1.0
  evidenceCount: integer('evidence_count').default(0), // How many times helped with this
  lastEvidenceAt: timestamp('last_evidence_at'),
  source: varchar('source', { length: 50 }), // 'inferred' | 'manual' | 'interaction'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Expert Interactions
export const expertInteractions = pgTable('expert_interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  expertId: uuid('expert_id')
    .notNull()
    .references(() => users.id),
  requesterId: uuid('requester_id')
    .notNull()
    .references(() => users.id),
  topic: varchar('topic', { length: 255 }),
  channel: varchar('channel', { length: 50 }), // 'in_app' | 'slack' | 'email'
  questionSummary: text('question_summary'),
  status: varchar('status', { length: 50 }).notNull(), // 'waiting' | 'responded' | 'resolved' | 'declined'
  responseTime: interval('response_time'), // Time to first response
  resolutionTime: interval('resolution_time'), // Time to mark resolved
  helpfulnessRating: integer('helpfulness_rating'), // 1-5
  createdAt: timestamp('created_at').defaultNow().notNull(),
  respondedAt: timestamp('responded_at'),
  resolvedAt: timestamp('resolved_at'),
});

// Nudges
export const nudges = pgTable('nudges', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }), // Recipient
  expertId: uuid('expert_id')
    .notNull()
    .references(() => users.id), // Recommended expert
  context: text('context'), // What the user was doing
  question: text('question'), // User's question/need
  matchScore: decimal('match_score', { precision: 3, scale: 2 }), // 0.0 to 1.0
  matchReasons: jsonb('match_reasons').default('[]'), // Why this expert was chosen
  status: varchar('status', { length: 50 }).default('waiting'), // 'waiting' | 'accepted' | 'declined' | 'resolved'
  deliveryChannel: varchar('delivery_channel', { length: 50 }), // 'in_app' | 'slack' | 'email'
  deliveredAt: timestamp('delivered_at'),
  acceptedAt: timestamp('accepted_at'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const expertProfilesRelations = relations(expertProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [expertProfiles.userId],
    references: [users.id],
  }),
  topics: many(expertTopics),
}));

export const expertTopicsRelations = relations(expertTopics, ({ one }) => ({
  expertProfile: one(expertProfiles, {
    fields: [expertTopics.userId],
    references: [expertProfiles.userId],
  }),
}));

export const expertInteractionsRelations = relations(expertInteractions, ({ one }) => ({
  expert: one(users, {
    fields: [expertInteractions.expertId],
    references: [users.id],
  }),
  requester: one(users, {
    fields: [expertInteractions.requesterId],
    references: [users.id],
  }),
}));

export const nudgesRelations = relations(nudges, ({ one }) => ({
  user: one(users, {
    fields: [nudges.userId],
    references: [users.id],
  }),
  expert: one(users, {
    fields: [nudges.expertId],
    references: [users.id],
  }),
}));

// Export types
export type ExpertProfile = typeof expertProfiles.$inferSelect;
export type NewExpertProfile = typeof expertProfiles.$inferInsert;
export type ExpertTopic = typeof expertTopics.$inferSelect;
export type NewExpertTopic = typeof expertTopics.$inferInsert;
export type ExpertInteraction = typeof expertInteractions.$inferSelect;
export type NewExpertInteraction = typeof expertInteractions.$inferInsert;
export type Nudge = typeof nudges.$inferSelect;
export type NewNudge = typeof nudges.$inferInsert;
