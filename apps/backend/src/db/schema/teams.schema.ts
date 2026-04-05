import { pgTable, uuid, varchar, text, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations.schema";

// Note: teams.leaderId references users, but we use AnyPgColumn to avoid circular imports.
// The FK constraint is created at the DB level; Drizzle relations are defined separately.
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  leaderId: uuid("leader_id"), // FK to users.id — defined at DB level, not in Drizzle refs to avoid circular import
  parentTeamId: uuid("parent_team_id").references((): AnyPgColumn => teams.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [teams.organizationId],
    references: [organizations.id],
  }),
  parentTeam: one(teams, {
    fields: [teams.parentTeamId],
    references: [teams.id],
    relationName: "childTeams",
  }),
  childTeams: many(teams, {
    relationName: "childTeams",
  }),
}));

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
