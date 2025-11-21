import { pgTable, uuid, varchar, timestamp, integer, unique, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { githubRepos } from "./github-repos.schema";

export const githubCommits = pgTable(
  "github_commits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => githubRepos.id, { onDelete: "cascade" }),
    sha: varchar("sha", { length: 100 }).notNull(),
    authorName: varchar("author_name", { length: 255 }).notNull(),
    authorEmail: varchar("author_email", { length: 255 }).notNull(),
    committedAt: timestamp("committed_at").notNull(),
    message: varchar("message", { length: 4000 }).notNull(),
    parentSha: varchar("parent_sha", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueRepoSha: unique().on(table.repoId, table.sha),
  })
);

export const githubCommitRelations = relations(githubCommits, ({ one, many }) => ({
  repo: one(githubRepos, {
    fields: [githubCommits.repoId],
    references: [githubRepos.id],
  }),
  files: many(githubCommitFiles),
}));

export const githubCommitFiles = pgTable(
  "github_commit_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commitId: uuid("commit_id")
      .notNull()
      .references(() => githubCommits.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => githubRepos.id, { onDelete: "cascade" }),
    path: varchar("path", { length: 2000 }).notNull(),
    status: varchar("status", { length: 50 }).notNull(), // added | modified | removed
    additions: integer("additions").default(0),
    deletions: integer("deletions").default(0),
    content: text("content"), // Raw file content fetched from GitHub API
  },
  (table) => ({
    uniqueCommitPath: unique().on(table.commitId, table.path),
  })
);

export const githubCommitFileRelations = relations(githubCommitFiles, ({ one }) => ({
  commit: one(githubCommits, {
    fields: [githubCommitFiles.commitId],
    references: [githubCommits.id],
  }),
  repo: one(githubRepos, {
    fields: [githubCommitFiles.repoId],
    references: [githubRepos.id],
  }),
}));

export type GithubCommit = typeof githubCommits.$inferSelect;
export type NewGithubCommit = typeof githubCommits.$inferInsert;
export type GithubCommitFile = typeof githubCommitFiles.$inferSelect;
export type NewGithubCommitFile = typeof githubCommitFiles.$inferInsert;
