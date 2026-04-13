import { pgTable, uuid, varchar, bigint, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { integrations } from "../integrations.schema";

export const githubRepos = pgTable(
  "github_repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    githubRepoId: bigint("github_repo_id", { mode: "number" }).notNull(),
    owner: varchar("owner", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 512 }).notNull(),
    defaultBranch: varchar("default_branch", { length: 255 }).notNull(),
    visibility: varchar("visibility", { length: 50 }).default("private"),
    isPrivate: boolean("is_private").default(true).notNull(),
    isSelected: boolean("is_selected").default(true).notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    lastIndexedCommitSha: varchar("last_indexed_commit_sha", { length: 100 }), // Tracks HEAD SHA for code snapshot
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueRepoPerIntegration: unique().on(table.integrationId, table.githubRepoId),
  })
);

export const githubBranches = pgTable("github_branches", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => githubRepos.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  headSha: varchar("head_sha", { length: 100 }).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const githubRepoRelations = relations(githubRepos, ({ many }) => ({
  branches: many(githubBranches),
}));

export const githubBranchRelations = relations(githubBranches, ({ one }) => ({
  repo: one(githubRepos, {
    fields: [githubBranches.repoId],
    references: [githubRepos.id],
  }),
}));

export type GithubRepo = typeof githubRepos.$inferSelect;
export type NewGithubRepo = typeof githubRepos.$inferInsert;
export type GithubBranch = typeof githubBranches.$inferSelect;
export type NewGithubBranch = typeof githubBranches.$inferInsert;
