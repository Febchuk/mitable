import { pgTable, uuid, integer, varchar, boolean, timestamp, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { githubRepos } from "./github-repos.schema";

export const githubPullRequests = pgTable("github_pull_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => githubRepos.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  body: text("body"),
  authorLogin: varchar("author_login", { length: 255 }).notNull(),
  state: varchar("state", { length: 50 }).notNull(), // open | closed
  isMerged: boolean("is_merged").default(false).notNull(),
  mergedAt: timestamp("merged_at"),
  baseBranch: varchar("base_branch", { length: 255 }).notNull(),
  headBranch: varchar("head_branch", { length: 255 }).notNull(),
  headSha: varchar("head_sha", { length: 100 }).notNull(),
  createdAtGithub: timestamp("created_at_github").notNull(),
  updatedAtGithub: timestamp("updated_at_github").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const githubPullRequestRelations = relations(githubPullRequests, ({ one, many }) => ({
  repo: one(githubRepos, {
    fields: [githubPullRequests.repoId],
    references: [githubRepos.id],
  }),
  files: many(githubPullRequestFiles),
  comments: many(githubPullRequestComments),
}));

export const githubPullRequestFiles = pgTable("github_pull_request_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  pullRequestId: uuid("pull_request_id")
    .notNull()
    .references(() => githubPullRequests.id, { onDelete: "cascade" }),
  path: varchar("path", { length: 2000 }).notNull(),
});

export const githubPullRequestComments = pgTable("github_pull_request_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  pullRequestId: uuid("pull_request_id")
    .notNull()
    .references(() => githubPullRequests.id, { onDelete: "cascade" }),
  authorLogin: varchar("author_login", { length: 255 }).notNull(),
  body: text("body").notNull(),
  commentType: varchar("comment_type", { length: 50 }).default("review"),
  createdAtGithub: timestamp("created_at_github").notNull(),
  updatedAtGithub: timestamp("updated_at_github"),
});

export type GithubPullRequest = typeof githubPullRequests.$inferSelect;
export type NewGithubPullRequest = typeof githubPullRequests.$inferInsert;
export type GithubPullRequestFile = typeof githubPullRequestFiles.$inferSelect;
export type NewGithubPullRequestFile = typeof githubPullRequestFiles.$inferInsert;
export type GithubPullRequestComment = typeof githubPullRequestComments.$inferSelect;
export type NewGithubPullRequestComment = typeof githubPullRequestComments.$inferInsert;
