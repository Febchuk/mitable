import { pgTable, uuid, integer, varchar, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { githubRepos } from "./github-repos.schema";

export const githubIssues = pgTable("github_issues", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => githubRepos.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  body: text("body"),
  authorLogin: varchar("author_login", { length: 255 }).notNull(),
  assigneeLogin: varchar("assignee_login", { length: 255 }),
  state: varchar("state", { length: 50 }).notNull(), // open | closed
  labels: text("labels"), // JSON string or comma-separated for now
  isPullRequest: boolean("is_pull_request").default(false).notNull(),
  createdAtGithub: timestamp("created_at_github").notNull(),
  updatedAtGithub: timestamp("updated_at_github").notNull(),
  closedAtGithub: timestamp("closed_at_github"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const githubIssueRelations = relations(githubIssues, ({ one, many }) => ({
  repo: one(githubRepos, {
    fields: [githubIssues.repoId],
    references: [githubRepos.id],
  }),
  comments: many(githubIssueComments),
}));

export const githubIssueComments = pgTable("github_issue_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  issueId: uuid("issue_id")
    .notNull()
    .references(() => githubIssues.id, { onDelete: "cascade" }),
  authorLogin: varchar("author_login", { length: 255 }).notNull(),
  body: text("body").notNull(),
  createdAtGithub: timestamp("created_at_github").notNull(),
  updatedAtGithub: timestamp("updated_at_github"),
});

export type GithubIssue = typeof githubIssues.$inferSelect;
export type NewGithubIssue = typeof githubIssues.$inferInsert;
export type GithubIssueComment = typeof githubIssueComments.$inferSelect;
export type NewGithubIssueComment = typeof githubIssueComments.$inferInsert;
