#!/usr/bin/env tsx
/**
 * GitHub Sync Script
 *
 * Orchestrates complete GitHub sync: commits, PRs, issues, and code ingestion.
 * Handles incremental sync (first vs. subsequent) with 50-commit limit on first sync.
 *
 * Usage:
 *   npm run sync-github
 *
 * Features:
 * - Fetches commits, PRs, issues from GitHub API
 * - Incremental sync using lastSyncedAt timestamps
 * - First sync: Last 50 commits only (configurable)
 * - Calls github-ingestion.service for code chunking & embedding
 * - Deduplication via upsert (onConflictDoUpdate)
 */

import type { Octokit } from "@octokit/core";
import { githubService } from "../services/github.service.js";
import { githubIngestionService } from "../services/github-ingestion.service.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";
import { validateConfig } from "../config.js";
import { vectorService } from "../domains/shared-infra/services/vector.service.js";

type IntegrationRow = typeof schema.integrations.$inferSelect;
type GithubRepoRow = typeof schema.githubRepos.$inferSelect;

type GithubIntegrationMetadata = {
  installationId?: number;
  selectedRepoIds?: number[];
  [key: string]: unknown;
};

interface GithubSyncResult {
  reposProcessed: number;
  reposSkipped: number;
  commitsProcessed: number;
  prsProcessed: number;
  issuesProcessed: number;
  filesProcessed: number;
  chunksCreated: number;
}

export async function syncIntegration(integration: IntegrationRow): Promise<GithubSyncResult> {
  const metadata = (integration.metadata || {}) as GithubIntegrationMetadata;

  if (!metadata.installationId) {
    throw new Error(
      `GitHub installation ID missing for org ${integration.organizationId}. Reconnect the integration.`
    );
  }

  const selectedRepos = await db
    .select()
    .from(schema.githubRepos)
    .where(
      and(
        eq(schema.githubRepos.integrationId, integration.id),
        eq(schema.githubRepos.isSelected, true)
      )
    );

  if (selectedRepos.length === 0) {
    await db
      .update(schema.integrations)
      .set({
        status: "pending",
        updatedAt: new Date(),
      })
      .where(eq(schema.integrations.id, integration.id));

    console.log(
      `[GITHUB SYNC] ⏭️  Org ${integration.organizationId} has no selected repositories. Skipping sync.`
    );

    return {
      reposProcessed: 0,
      reposSkipped: 1,
      commitsProcessed: 0,
      prsProcessed: 0,
      issuesProcessed: 0,
      filesProcessed: 0,
      chunksCreated: 0,
    };
  }

  const octokit = await githubService.getInstallationOctokit(metadata.installationId);

  let reposProcessed = 0;
  let commitsProcessed = 0;
  let prsProcessed = 0;
  let issuesProcessed = 0;

  for (const repo of selectedRepos) {
    try {
      const repoCommits = await syncRepository(octokit, repo);
      commitsProcessed += repoCommits;

      // Sync PRs
      const repoPRs = await syncPullRequests(octokit, repo);
      prsProcessed += repoPRs;

      // Sync Issues
      const repoIssues = await syncIssues(octokit, repo);
      issuesProcessed += repoIssues;

      reposProcessed += 1;
    } catch (error) {
      console.error(
        `[GITHUB SYNC] ❌ Failed to sync ${repo.fullName}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // After syncing all metadata (commits/PRs/issues), ingest code for RAG
  console.log(`\n[GITHUB SYNC] 🔄 Starting code ingestion for organization`);
  const ingestionResult = await githubIngestionService.syncCode(integration.organizationId);
  console.log(
    `[GITHUB SYNC] ✅ Code ingestion complete | ` +
      `Files: ${ingestionResult.filesProcessed}, ` +
      `Chunks: ${ingestionResult.chunksCreated}`
  );

  await db
    .update(schema.integrations)
    .set({
      status: integration.status === "connected" || reposProcessed > 0 ? "connected" : "pending",
      lastSyncedAt: reposProcessed > 0 ? new Date() : integration.lastSyncedAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.integrations.id, integration.id));

  return {
    reposProcessed,
    reposSkipped: 0,
    commitsProcessed,
    prsProcessed,
    issuesProcessed,
    filesProcessed: ingestionResult.filesProcessed,
    chunksCreated: ingestionResult.chunksCreated,
  };
}

async function syncRepository(octokit: Octokit, repo: GithubRepoRow): Promise<number> {
  const perPage = 100;
  const INITIAL_SYNC_LIMIT = 50; // Only sync last 50 commits on first sync
  let page = 1;
  let commitsProcessed = 0;
  let newestCommitDate: Date | null = null;
  const sinceIso = repo.lastSyncedAt ? new Date(repo.lastSyncedAt).toISOString() : undefined;
  const isFirstSync = !sinceIso;

  console.log(
    `[GITHUB SYNC] ▶️  Repo ${repo.fullName} | Branch ${repo.defaultBranch} | Mode: ${sinceIso ? "incremental" : `first (limit: ${INITIAL_SYNC_LIMIT} commits)`}`
  );

  console.log(`[GITHUB SYNC] 📡 Fetching commits from GitHub API...`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    console.log(`[GITHUB SYNC] 📄 Page ${page}...`);

    const { data } = await octokit.request("GET /repos/{owner}/{repo}/commits", {
      owner: repo.owner,
      repo: repo.name,
      sha: repo.defaultBranch,
      per_page: perPage,
      page,
      ...(sinceIso ? { since: sinceIso } : {}),
    });

    console.log(`[GITHUB SYNC] ✅ Received ${data.length} commits from page ${page}`);

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const summary of data) {
      // Stop early on first sync if we hit the limit
      if (isFirstSync && commitsProcessed >= INITIAL_SYNC_LIMIT) {
        console.log(
          `[GITHUB SYNC] ⚠️  Reached first sync limit (${INITIAL_SYNC_LIMIT} commits), stopping`
        );
        break;
      }

      console.log(`[GITHUB SYNC] 🔄 Processing commit ${summary.sha.substring(0, 7)}...`);
      commitsProcessed += await upsertCommit(octokit, repo, summary.sha);
      console.log(`[GITHUB SYNC] ✅ Commit ${summary.sha.substring(0, 7)} saved`);

      if (summary.commit?.author?.date) {
        const commitDate = new Date(summary.commit.author.date);
        if (!newestCommitDate || commitDate > newestCommitDate) {
          newestCommitDate = commitDate;
        }
      }
    }

    // Break out of pagination loop if we hit first sync limit
    if (isFirstSync && commitsProcessed >= INITIAL_SYNC_LIMIT) {
      break;
    }

    if (data.length < perPage) {
      break;
    }

    page += 1;
  }

  if (newestCommitDate) {
    await db
      .update(schema.githubRepos)
      .set({
        lastSyncedAt: newestCommitDate,
        updatedAt: new Date(),
      })
      .where(eq(schema.githubRepos.id, repo.id));
  }

  console.log(
    `[GITHUB SYNC] ✅ Repo ${repo.fullName} complete | Commits processed: ${commitsProcessed}`
  );

  return commitsProcessed;
}

async function upsertCommit(octokit: Octokit, repo: GithubRepoRow, sha: string): Promise<number> {
  console.log(`[GITHUB SYNC]   📡 Fetching commit details for ${sha.substring(0, 7)}...`);
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", {
    owner: repo.owner,
    repo: repo.name,
    ref: sha,
  });
  console.log(`[GITHUB SYNC]   📝 Commit has ${data.files?.length || 0} files`);

  const committedAtIso =
    data.commit.author?.date ?? data.commit.committer?.date ?? new Date().toISOString();
  const committedAt = new Date(committedAtIso);
  const authorName = data.commit.author?.name ?? data.commit.committer?.name ?? "Unknown";
  const authorEmail =
    data.commit.author?.email ?? data.commit.committer?.email ?? "unknown@example.com";
  const message = data.commit.message?.slice(0, 4000) ?? "";
  const parentSha = data.parents?.[0]?.sha;

  const [commitRecord] = await db
    .insert(schema.githubCommits)
    .values({
      repoId: repo.id,
      sha: data.sha,
      authorName,
      authorEmail,
      committedAt,
      message,
      parentSha,
    })
    .onConflictDoUpdate({
      target: [schema.githubCommits.repoId, schema.githubCommits.sha],
      set: {
        authorName: sql`excluded.author_name`,
        authorEmail: sql`excluded.author_email`,
        committedAt: sql`excluded.committed_at`,
        message: sql`excluded.message`,
        parentSha: sql`excluded.parent_sha`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning();

  const files = data.files ?? [];
  if (files.length > 0) {
    // Work domain: only store file metadata (path, status, stats)
    // Code domain uses Tree API snapshot (see github-code-snapshot.service.ts)
    const fileData = files.map((file) => ({
      commitId: commitRecord.id,
      repoId: repo.id,
      path: file.filename?.slice(0, 2000) ?? "unknown",
      status: file.status ?? "modified",
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
    }));

    await db
      .insert(schema.githubCommitFiles)
      .values(fileData)
      .onConflictDoUpdate({
        target: [schema.githubCommitFiles.commitId, schema.githubCommitFiles.path],
        set: {
          status: sql`excluded.status`,
          additions: sql`excluded.additions`,
          deletions: sql`excluded.deletions`,
        },
      });
  }

  return 1;
}

async function syncPullRequests(octokit: Octokit, repo: GithubRepoRow): Promise<number> {
  console.log(`[GITHUB SYNC] 📝 Syncing PRs for ${repo.fullName}...`);

  let prsProcessed = 0;

  // Fetch all PRs (open and closed) using pagination
  const prs: any[] = [];
  let page = 1;
  const perPage = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
      owner: repo.owner,
      repo: repo.name,
      state: "all",
      per_page: perPage,
      page,
    });

    if (!Array.isArray(data) || data.length === 0) break;
    prs.push(...data);
    if (data.length < perPage) break;
    page += 1;
  }

  for (const pr of prs) {
    try {
      // Insert or update PR
      const [prRecord] = await db
        .insert(schema.githubPullRequests)
        .values({
          repoId: repo.id,
          number: pr.number,
          title: pr.title?.slice(0, 500) ?? "",
          body: pr.body ?? null,
          authorLogin: pr.user?.login ?? "unknown",
          state: pr.state,
          isMerged: pr.merged_at !== null,
          mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
          baseBranch: pr.base.ref,
          headBranch: pr.head.ref,
          headSha: pr.head.sha,
          createdAtGithub: new Date(pr.created_at),
          updatedAtGithub: new Date(pr.updated_at),
        })
        .onConflictDoUpdate({
          target: [schema.githubPullRequests.repoId, schema.githubPullRequests.number],
          set: {
            title: sql`excluded.title`,
            body: sql`excluded.body`,
            state: sql`excluded.state`,
            isMerged: sql`excluded.is_merged`,
            mergedAt: sql`excluded.merged_at`,
            updatedAtGithub: sql`excluded.updated_at_github`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .returning();

      // Fetch PR files
      const files: any[] = [];
      let filePage = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: fileData } = await octokit.request(
          "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
          {
            owner: repo.owner,
            repo: repo.name,
            pull_number: pr.number,
            per_page: 100,
            page: filePage,
          }
        );
        if (!Array.isArray(fileData) || fileData.length === 0) break;
        files.push(...fileData);
        if (fileData.length < 100) break;
        filePage += 1;
      }

      if (files.length > 0) {
        await db
          .insert(schema.githubPullRequestFiles)
          .values(
            files.map((file: any) => ({
              pullRequestId: prRecord.id,
              path: file.filename?.slice(0, 2000) ?? "unknown",
            }))
          )
          .onConflictDoNothing();
      }

      // Fetch PR comments (issue comments on PRs)
      const comments: any[] = [];
      let commentPage = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: commentData } = await octokit.request(
          "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
          {
            owner: repo.owner,
            repo: repo.name,
            issue_number: pr.number,
            per_page: 100,
            page: commentPage,
          }
        );
        if (!Array.isArray(commentData) || commentData.length === 0) break;
        comments.push(...commentData);
        if (commentData.length < 100) break;
        commentPage += 1;
      }

      if (comments.length > 0) {
        await db
          .insert(schema.githubPullRequestComments)
          .values(
            comments.map((comment: any) => ({
              pullRequestId: prRecord.id,
              authorLogin: comment.user?.login ?? "unknown",
              body: comment.body ?? "",
              commentType: "issue_comment",
              createdAtGithub: new Date(comment.created_at),
              updatedAtGithub: comment.updated_at ? new Date(comment.updated_at) : null,
            }))
          )
          .onConflictDoNothing();
      }

      prsProcessed++;
    } catch (error) {
      console.error(
        `[GITHUB SYNC] ⚠️  Failed to sync PR #${pr.number}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`[GITHUB SYNC] ✅ Synced ${prsProcessed} PRs for ${repo.fullName}`);
  return prsProcessed;
}

async function syncIssues(octokit: Octokit, repo: GithubRepoRow): Promise<number> {
  console.log(`[GITHUB SYNC] 🐛 Syncing Issues for ${repo.fullName}...`);

  let issuesProcessed = 0;

  // Fetch all issues (GitHub API returns both issues and PRs, we filter PRs out)
  const issues: any[] = [];
  let page = 1;
  const perPage = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/issues", {
      owner: repo.owner,
      repo: repo.name,
      state: "all",
      per_page: perPage,
      page,
    });

    if (!Array.isArray(data) || data.length === 0) break;
    issues.push(...data);
    if (data.length < perPage) break;
    page += 1;
  }

  // Filter out PRs (issues with pull_request field)
  const realIssues = issues.filter((issue: any) => !issue.pull_request);

  for (const issue of realIssues) {
    try {
      // Insert or update issue
      const [issueRecord] = await db
        .insert(schema.githubIssues)
        .values({
          repoId: repo.id,
          number: issue.number,
          title: issue.title?.slice(0, 500) ?? "",
          body: issue.body ?? null,
          authorLogin: issue.user?.login ?? "unknown",
          assigneeLogin: issue.assignee?.login ?? null,
          state: issue.state,
          labels: JSON.stringify(issue.labels?.map((l: any) => l.name) ?? []),
          isPullRequest: false,
          createdAtGithub: new Date(issue.created_at),
          updatedAtGithub: new Date(issue.updated_at),
          closedAtGithub: issue.closed_at ? new Date(issue.closed_at) : null,
        })
        .onConflictDoUpdate({
          target: [schema.githubIssues.repoId, schema.githubIssues.number],
          set: {
            title: sql`excluded.title`,
            body: sql`excluded.body`,
            state: sql`excluded.state`,
            labels: sql`excluded.labels`,
            assigneeLogin: sql`excluded.assignee_login`,
            updatedAtGithub: sql`excluded.updated_at_github`,
            closedAtGithub: sql`excluded.closed_at_github`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .returning();

      // Fetch issue comments
      const comments: any[] = [];
      let commentPage = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: commentData } = await octokit.request(
          "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
          {
            owner: repo.owner,
            repo: repo.name,
            issue_number: issue.number,
            per_page: 100,
            page: commentPage,
          }
        );
        if (!Array.isArray(commentData) || commentData.length === 0) break;
        comments.push(...commentData);
        if (commentData.length < 100) break;
        commentPage += 1;
      }

      if (comments.length > 0) {
        await db
          .insert(schema.githubIssueComments)
          .values(
            comments.map((comment: any) => ({
              issueId: issueRecord.id,
              authorLogin: comment.user?.login ?? "unknown",
              body: comment.body ?? "",
              createdAtGithub: new Date(comment.created_at),
              updatedAtGithub: comment.updated_at ? new Date(comment.updated_at) : null,
            }))
          )
          .onConflictDoNothing();
      }

      issuesProcessed++;
    } catch (error) {
      console.error(
        `[GITHUB SYNC] ⚠️  Failed to sync Issue #${issue.number}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`[GITHUB SYNC] ✅ Synced ${issuesProcessed} Issues for ${repo.fullName}`);
  return issuesProcessed;
}

async function main() {
  console.log("\n🚀 Starting GitHub sync\n");

  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    console.error("❌ Configuration error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Initialize vector service
  vectorService.initialize();

  try {
    // Fetch all GitHub integrations
    const githubIntegrations = await db
      .select()
      .from(schema.integrations)
      .where(eq(schema.integrations.provider, "github"));

    if (githubIntegrations.length === 0) {
      console.log("📭 No GitHub integrations found");
      process.exit(0);
    }

    console.log(`📋 Found ${githubIntegrations.length} GitHub integration(s)\n`);

    // Sync each integration
    for (const integration of githubIntegrations) {
      const orgId = integration.organizationId;

      // Check for data reconciliation needs
      const [pgCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.searchContent)
        .where(
          and(
            eq(schema.searchContent.organizationId, orgId),
            eq(schema.searchContent.source, "github")
          )
        );

      const postgresCount = pgCount?.count || 0;

      // Check Pinecone for existing vectors
      const namespace = `org-${orgId}`;
      let pineconeCount = 0;

      try {
        const stats = await vectorService.getStats();
        pineconeCount = stats.namespaces?.[namespace]?.vectorCount || 0;
      } catch (error) {
        console.log(`⚠️  Could not check Pinecone stats`);
      }

      const needsReconciliation = postgresCount > 0 && pineconeCount < postgresCount * 0.9;
      const lastSyncedAt = integration.lastSyncedAt ? new Date(integration.lastSyncedAt) : null;

      const syncMode = lastSyncedAt && !needsReconciliation ? "incremental" : "full";

      console.log(`\n${"=".repeat(60)}`);
      console.log(`📦 Organization: ${orgId}`);
      console.log(
        `📊 Data status - PostgreSQL: ${postgresCount} chunks, Pinecone: ${pineconeCount} vectors`
      );
      console.log(`🔄 Sync Mode: ${syncMode}`);
      if (needsReconciliation) {
        console.log(`⚠️  Reconciliation needed - Pinecone missing data`);
        console.log(`   Clearing lastIndexedCommitSha for all repos to force re-ingestion...`);

        // Clear lastIndexedCommitSha to force full re-ingestion of code
        await db
          .update(schema.githubRepos)
          .set({ lastIndexedCommitSha: null })
          .where(eq(schema.githubRepos.integrationId, integration.id));

        console.log(`   Full re-sync to backfill Pinecone will begin...`);
      } else if (lastSyncedAt) {
        console.log(`📅 Last synced: ${lastSyncedAt.toLocaleString()}`);
      } else {
        console.log(`📥 First sync - syncing latest commits...`);
      }
      console.log(`${"=".repeat(60)}\n`);

      try {
        const result = await syncIntegration(integration);

        // Display results
        console.log(`\n✅ Sync completed successfully`);
        console.log(`   Repos processed: ${result.reposProcessed}`);
        console.log(`   Commits: ${result.commitsProcessed}`);
        console.log(`   PRs: ${result.prsProcessed}`);
        console.log(`   Issues: ${result.issuesProcessed}`);
        console.log(`   Files: ${result.filesProcessed}`);
        console.log(`   Chunks: ${result.chunksCreated}`);
      } catch (error) {
        console.error(
          `\n❌ Failed to sync organization ${orgId}:`,
          error instanceof Error ? error.message : error
        );
        // Continue to next integration instead of exiting
      }
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log("🎉 All GitHub syncs complete!");
    console.log(`${"=".repeat(60)}\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  }
}

main();
