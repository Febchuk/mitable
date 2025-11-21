import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";
import { embeddingService } from "./embedding.service.js";
import { vectorService } from "./vector.service.js";

type GithubRepoRow = typeof schema.githubRepos.$inferSelect;

export type GithubIngestionResult = {
  codeChunksEmbedded: number;
  commitSummariesEmbedded: number;
  prSummariesEmbedded: number;
  issueSummariesEmbedded: number;
  errors: string[];
};

/**
 * Classify code area/component based on file path
 * Simple path-based classification following common monorepo patterns
 */
function classifyArea(filePath: string): string | null {
  const pathLower = filePath.toLowerCase();
  
  // Monorepo app-level classification
  if (pathLower.includes("apps/electron")) return "electron";
  if (pathLower.includes("apps/backend")) return "backend-api";
  if (pathLower.includes("apps/integration-sync")) return "integration-sync";
  if (pathLower.includes("apps/web")) return "web-app";
  
  // Feature-level classification
  if (pathLower.includes("/main/") || pathLower.includes("electron/src/main")) return "electron-main";
  if (pathLower.includes("/renderer/") || pathLower.includes("electron/src/renderer")) return "electron-renderer";
  if (pathLower.includes("/console/")) return "console-ui";
  if (pathLower.includes("/services/")) return "services";
  if (pathLower.includes("/routes/")) return "api-routes";
  if (pathLower.includes("/agent/") || pathLower.includes("/agents/")) return "agent-orchestrator";
  if (pathLower.includes("/capture")) return "capture-service";
  if (pathLower.includes("/tray")) return "system-tray";
  if (pathLower.includes("/integrations")) return "integrations";
  if (pathLower.includes("/db/") || pathLower.includes("/database/")) return "database";
  if (pathLower.includes("/auth")) return "authentication";
  
  // Docs
  if (pathLower.includes("/docs/") || pathLower.endsWith(".md")) return "documentation";
  
  return null;
}

/**
 * Detect programming language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript-react",
    js: "javascript",
    jsx: "javascript-react",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    cpp: "cpp",
    c: "c",
    rb: "ruby",
    php: "php",
    sql: "sql",
    sh: "shell",
    yml: "yaml",
    yaml: "yaml",
    json: "json",
    md: "markdown",
    mdx: "markdown-react",
  };
  return languageMap[ext || ""] || "text";
}

/**
 * Chunk code by logical blocks (functions, classes, etc.)
 * For V1, we use line-based chunking with overlap
 * Target: 40-120 lines per chunk with 10-line overlap
 */
function chunkCodeByLines(code: string): Array<{ text: string; startLine: number; endLine: number; chunkIndex: number; totalChunks: number }> {
  const lines = code.split("\n");
  const CHUNK_SIZE = 80; // target lines per chunk
  const OVERLAP = 10; // overlap lines
  
  if (lines.length <= CHUNK_SIZE) {
    return [{
      text: code,
      startLine: 1,
      endLine: lines.length,
      chunkIndex: 0,
      totalChunks: 1,
    }];
  }
  
  const chunks: Array<{ text: string; startLine: number; endLine: number; chunkIndex: number; totalChunks: number }> = [];
  let startLine = 0;
  
  while (startLine < lines.length) {
    const endLine = Math.min(startLine + CHUNK_SIZE, lines.length);
    const chunkLines = lines.slice(startLine, endLine);
    const chunkText = chunkLines.join("\n");
    
    chunks.push({
      text: chunkText,
      startLine: startLine + 1, // 1-indexed
      endLine,
      chunkIndex: chunks.length,
      totalChunks: 0, // will set after
    });
    
    startLine += (CHUNK_SIZE - OVERLAP);
  }
  
  // Update totalChunks
  return chunks.map((chunk) => ({ ...chunk, totalChunks: chunks.length }));
}

class GithubIngestionService {
  /**
   * Ingest GitHub data: code chunks, commit summaries, PR summaries, issue summaries
   */
  async ingestRepoData(
    organizationId: string,
    repoId: string,
    options: {
      ingestCode?: boolean;
      ingestCommits?: boolean;
      ingestPRs?: boolean;
      ingestIssues?: boolean;
    } = {}
  ): Promise<GithubIngestionResult> {
    const {
      ingestCode = true,
      ingestCommits = true,
      ingestPRs = true,
      ingestIssues = true,
    } = options;

    const result: GithubIngestionResult = {
      codeChunksEmbedded: 0,
      commitSummariesEmbedded: 0,
      prSummariesEmbedded: 0,
      issueSummariesEmbedded: 0,
      errors: [],
    };

    try {
      // Get repo info
      const [repo] = await db
        .select()
        .from(schema.githubRepos)
        .where(eq(schema.githubRepos.id, repoId))
        .limit(1);

      if (!repo) {
        throw new Error(`Repo not found: ${repoId}`);
      }

      // Use same namespace as Slack/Notion, filter by source metadata
      const namespace = `org-${organizationId}`;

      console.log(`[GITHUB INGESTION] Starting ingestion for ${repo.fullName}`);

      // 1. Ingest code chunks from commit files
      if (ingestCode) {
        const codeCount = await this.ingestCodeChunks(organizationId, repo, namespace);
        result.codeChunksEmbedded = codeCount;
      }

      // 2. Ingest commit summaries
      if (ingestCommits) {
        const commitCount = await this.ingestCommitSummaries(organizationId, repo, namespace);
        result.commitSummariesEmbedded = commitCount;
      }

      // 3. Ingest PR summaries
      if (ingestPRs) {
        const prCount = await this.ingestPRSummaries(organizationId, repo, namespace);
        result.prSummariesEmbedded = prCount;
      }

      // 4. Ingest issue summaries
      if (ingestIssues) {
        const issueCount = await this.ingestIssueSummaries(organizationId, repo, namespace);
        result.issueSummariesEmbedded = issueCount;
      }

      console.log(
        `[GITHUB INGESTION] ✅ Complete for ${repo.fullName} | ` +
        `Code: ${result.codeChunksEmbedded}, Commits: ${result.commitSummariesEmbedded}, ` +
        `PRs: ${result.prSummariesEmbedded}, Issues: ${result.issueSummariesEmbedded}`
      );

      return result;
    } catch (error) {
      console.error("[GITHUB INGESTION] Error:", error);
      result.errors.push(error instanceof Error ? error.message : "Unknown error");
      return result;
    }
  }

  /**
   * Ingest code chunks from github_commit_files
   */
  private async ingestCodeChunks(
    organizationId: string,
    repo: GithubRepoRow,
    namespace: string
  ): Promise<number> {
    // Get recent commit files (limit to latest commit per file to avoid duplication)
    const commitFiles = await db
      .select()
      .from(schema.githubCommitFiles)
      .innerJoin(
        schema.githubCommits,
        eq(schema.githubCommits.id, schema.githubCommitFiles.commitId)
      )
      .where(eq(schema.githubCommits.repoId, repo.id))
      .limit(1000); // Process recent files first

    if (commitFiles.length === 0) {
      console.log(`[GITHUB INGESTION] No commit files found for ${repo.fullName}`);
      return 0;
    }

    console.log(`[GITHUB INGESTION] Processing ${commitFiles.length} files for ${repo.fullName}`);

    // Get existing chunk IDs to avoid re-embedding unchanged files
    const existingChunks = await db
      .select({ id: schema.searchContent.id })
      .from(schema.searchContent)
      .where(
        and(
          eq(schema.searchContent.organizationId, organizationId),
          eq(schema.searchContent.source, "github")
        )
      );
    
    const existingIds = new Set(existingChunks.map(c => c.id));
    console.log(`[GITHUB INGESTION] Found ${existingIds.size} existing chunks - will skip duplicates`);

    const allChunks: Array<{
      id: string;
      text: string;
      metadata: any;
    }> = [];
    
    let skippedFiles = 0;
    let processedFiles = 0;

    for (const row of commitFiles) {
      const file = row.github_commit_files;
      const commit = row.github_commits;

      // Skip files without content
      if (!file.content || file.content.trim().length === 0) continue;

      const language = detectLanguage(file.path);
      const area = classifyArea(file.path);
      const fileName = file.path.split("/").pop() || file.path;

      // Check if first chunk of this file already exists (commit SHA + path = unique)
      const firstChunkId = `gh-code-${repo.id}-${file.path}-${commit.sha.substring(0, 7)}-chunk-0`;
      if (existingIds.has(firstChunkId)) {
        skippedFiles++;
        continue; // Skip this entire file - already embedded
      }

      processedFiles++;

      // Chunk the file content
      const codeChunks = chunkCodeByLines(file.content);

      for (const chunk of codeChunks) {
        // Create context header
        const contextHeader = `File: ${file.path}\nLanguage: ${language}\n${area ? `Area: ${area}\n` : ""}Commit: ${commit.message.split("\n")[0]}\n\n`;
        const fullText = contextHeader + chunk.text;

        allChunks.push({
          id: `gh-code-${repo.id}-${file.path}-${commit.sha.substring(0, 7)}-chunk-${chunk.chunkIndex}`,
          text: fullText,
          metadata: {
            org_id: organizationId,
            source: "github", // For filtering in shared namespace
            repo_id: repo.id,
            repo_full_name: repo.fullName,
            type: "code",

            // File context
            path: file.path,
            file_name: fileName,
            language,
            start_line: chunk.startLine,
            end_line: chunk.endLine,

            // Git context
            commit_sha: commit.sha,
            commit_message: commit.message.split("\n")[0], // first line only
            author: commit.authorName,
            committed_at: commit.committedAt.toISOString(),
            default_branch: repo.defaultBranch,

            // Chunking
            chunk_index: chunk.chunkIndex,
            total_chunks: chunk.totalChunks,
            is_chunked: chunk.totalChunks > 1,

            // Area classification
            ...(area && { area }),
          },
        });
      }
    }

    console.log(`[GITHUB INGESTION] 📊 Stats: ${processedFiles} new files, ${skippedFiles} skipped (unchanged)`);

    if (allChunks.length === 0) {
      console.log(`[GITHUB INGESTION] ✅ All files already embedded - nothing to do`);
      return 0;
    }

    // Process in batches to avoid token limits (OpenAI max: 300k tokens/request)
    const BATCH_SIZE = 100; // ~100 chunks per batch to stay under token limits
    let totalEmbedded = 0;

    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      const batch = allChunks.slice(i, i + BATCH_SIZE);
      
      // Generate embeddings for this batch
      const texts = batch.map((c) => c.text);
      const embeddings = await embeddingService.embedTexts(texts);

      // Upsert to Pinecone
      const vectors = batch.map((chunk, idx) => ({
        id: chunk.id,
        values: embeddings[idx],
        metadata: {
          ...chunk.metadata,
          text: chunk.text,
        },
      }));

      await vectorService.upsertVectors(vectors, namespace);

      // Dual-write to PostgreSQL search_content
      await this.dualWriteToPostgres(batch, organizationId, "github");

      totalEmbedded += batch.length;
      console.log(`[GITHUB INGESTION] ⏳ Embedded ${totalEmbedded}/${allChunks.length} code chunks...`);
    }

    console.log(`[GITHUB INGESTION] ✅ Embedded ${allChunks.length} code chunks`);
    return allChunks.length;
  }

  /**
   * Ingest commit summaries
   */
  private async ingestCommitSummaries(
    organizationId: string,
    repo: GithubRepoRow,
    namespace: string
  ): Promise<number> {
    const commits = await db
      .select()
      .from(schema.githubCommits)
      .where(eq(schema.githubCommits.repoId, repo.id))
      .limit(100); // Recent commits

    if (commits.length === 0) return 0;

    const summaries: Array<{ id: string; text: string; metadata: any }> = [];

    for (const commit of commits) {
      // Get files changed in this commit
      const files = await db
        .select()
        .from(schema.githubCommitFiles)
        .where(eq(schema.githubCommitFiles.commitId, commit.id));

      const paths = files.map((f) => f.path);
      const areas = [...new Set(paths.map(classifyArea).filter(Boolean))];

      // Include repo name, branch, and more context for better keyword matching
      const summaryText = `Repository: ${repo.fullName}\nCommit: ${commit.message}\n\nAuthor: ${commit.authorName}\nDate: ${commit.committedAt.toISOString()}\nBranch: main\nAffects: ${paths.slice(0, 10).join(", ")}${paths.length > 10 ? "..." : ""}`;

      summaries.push({
        id: `gh-commit-${commit.sha}`,
        text: summaryText,
        metadata: {
          org_id: organizationId,
          source: "github", // For filtering in shared namespace
          repo_id: repo.id,
          repo_full_name: repo.fullName,
          type: "commit",

          commit_sha: commit.sha,
          author: commit.authorName,
          committed_at: commit.committedAt.toISOString(),
          message: commit.message,

          paths,
          main_areas: areas,
        },
      });
    }

    if (summaries.length === 0) return 0;

    const texts = summaries.map((s) => s.text);
    const embeddings = await embeddingService.embedTexts(texts);

    const vectors = summaries.map((summary, idx) => ({
      id: summary.id,
      values: embeddings[idx],
      metadata: {
        ...summary.metadata,
        text: summary.text,
      },
    }));

    console.log(`[GITHUB INGESTION] Upserting ${vectors.length} commits to namespace: ${namespace}`);
    console.log(`[GITHUB INGESTION] Sample commit ID: ${vectors[0]?.id}, metadata type: ${vectors[0]?.metadata?.type}`);
    
    try {
      await vectorService.upsertVectors(vectors, namespace);
      console.log(`[GITHUB INGESTION] ✅ Pinecone upsert successful`);
    } catch (error) {
      console.error(`[GITHUB INGESTION] ❌ Pinecone upsert failed:`, error);
      throw error;
    }
    
    await this.dualWriteToPostgres(summaries, organizationId, "github");

    console.log(`[GITHUB INGESTION] ✅ Embedded ${summaries.length} commit summaries`);
    return summaries.length;
  }

  /**
   * Ingest PR summaries (with comments/discussions)
   */
  private async ingestPRSummaries(
    organizationId: string,
    repo: GithubRepoRow,
    namespace: string
  ): Promise<number> {
    const prs = await db
      .select()
      .from(schema.githubPullRequests)
      .where(eq(schema.githubPullRequests.repoId, repo.id))
      .limit(50); // Recent PRs

    if (prs.length === 0) return 0;

    const summaries: Array<{ id: string; text: string; metadata: any }> = [];

    for (const pr of prs) {
      // Get PR comments
      const comments = await db
        .select()
        .from(schema.githubPullRequestComments)
        .where(eq(schema.githubPullRequestComments.pullRequestId, pr.id));

      // Get touched files
      const files = await db
        .select()
        .from(schema.githubPullRequestFiles)
        .where(eq(schema.githubPullRequestFiles.pullRequestId, pr.id));

      const paths = files.map((f) => f.path);
      const areas = [...new Set(paths.map(classifyArea).filter(Boolean))];

      // Build summary with discussion
      let summaryText = `PR #${pr.number}: ${pr.title}\n\n`;
      summaryText += `Author: ${pr.authorLogin}\n`;
      summaryText += `State: ${pr.state}${pr.isMerged ? " (merged)" : ""}\n`;
      summaryText += `Branch: ${pr.headBranch} → ${pr.baseBranch}\n\n`;
      
      if (pr.body) {
        summaryText += `Description:\n${pr.body}\n\n`;
      }

      if (comments.length > 0) {
        summaryText += `Discussion (${comments.length} comments):\n`;
        for (const comment of comments.slice(0, 5)) {
          summaryText += `- ${comment.authorLogin}: ${comment.body.substring(0, 200)}${comment.body.length > 200 ? "..." : ""}\n`;
        }
      }

      summaryText += `\nAffects: ${paths.slice(0, 10).join(", ")}${paths.length > 10 ? "..." : ""}`;

      summaries.push({
        id: `gh-pr-${repo.id}-${pr.number}`,
        text: summaryText,
        metadata: {
          org_id: organizationId,
          source: "github", // For filtering in shared namespace
          repo_id: repo.id,
          repo_full_name: repo.fullName,
          type: "pr",

          pr_number: pr.number,
          pr_title: pr.title,
          author: pr.authorLogin,
          state: pr.state,
          is_merged: pr.isMerged,
          merged_at: pr.mergedAt?.toISOString(),
          created_at: pr.createdAtGithub.toISOString(),

          touched_paths: paths,
          main_areas: areas,
        },
      });
    }

    if (summaries.length === 0) return 0;

    const texts = summaries.map((s) => s.text);
    const embeddings = await embeddingService.embedTexts(texts);

    const vectors = summaries.map((summary, idx) => ({
      id: summary.id,
      values: embeddings[idx],
      metadata: {
        ...summary.metadata,
        text: summary.text,
      },
    }));

    await vectorService.upsertVectors(vectors, namespace);
    await this.dualWriteToPostgres(summaries, organizationId, "github");

    console.log(`[GITHUB INGESTION] ✅ Embedded ${summaries.length} PR summaries`);
    return summaries.length;
  }

  /**
   * Ingest issue summaries (with comments/discussions)
   */
  private async ingestIssueSummaries(
    organizationId: string,
    repo: GithubRepoRow,
    namespace: string
  ): Promise<number> {
    const issues = await db
      .select()
      .from(schema.githubIssues)
      .where(
        and(
          eq(schema.githubIssues.repoId, repo.id),
          eq(schema.githubIssues.isPullRequest, false) // Issues only, not PRs
        )
      )
      .limit(50);

    if (issues.length === 0) return 0;

    const summaries: Array<{ id: string; text: string; metadata: any }> = [];

    for (const issue of issues) {
      const comments = await db
        .select()
        .from(schema.githubIssueComments)
        .where(eq(schema.githubIssueComments.issueId, issue.id));

      const labels = issue.labels ? JSON.parse(issue.labels) : [];

      let summaryText = `Issue #${issue.number}: ${issue.title}\n\n`;
      summaryText += `Author: ${issue.authorLogin}\n`;
      summaryText += `State: ${issue.state}\n`;
      if (labels.length > 0) {
        summaryText += `Labels: ${labels.join(", ")}\n`;
      }
      if (issue.assigneeLogin) {
        summaryText += `Assignee: ${issue.assigneeLogin}\n`;
      }
      summaryText += "\n";

      if (issue.body) {
        summaryText += `Description:\n${issue.body}\n\n`;
      }

      if (comments.length > 0) {
        summaryText += `Discussion (${comments.length} comments):\n`;
        for (const comment of comments.slice(0, 5)) {
          summaryText += `- ${comment.authorLogin}: ${comment.body.substring(0, 200)}${comment.body.length > 200 ? "..." : ""}\n`;
        }
      }

      summaries.push({
        id: `gh-issue-${repo.id}-${issue.number}`,
        text: summaryText,
        metadata: {
          org_id: organizationId,
          source: "github", // For filtering in shared namespace
          repo_id: repo.id,
          repo_full_name: repo.fullName,
          type: "issue",

          issue_number: issue.number,
          issue_title: issue.title,
          author: issue.authorLogin,
          assignee: issue.assigneeLogin,
          state: issue.state,
          labels,
          created_at: issue.createdAtGithub.toISOString(),
          closed_at: issue.closedAtGithub?.toISOString(),
        },
      });
    }

    if (summaries.length === 0) return 0;

    const texts = summaries.map((s) => s.text);
    const embeddings = await embeddingService.embedTexts(texts);

    const vectors = summaries.map((summary, idx) => ({
      id: summary.id,
      values: embeddings[idx],
      metadata: {
        ...summary.metadata,
        text: summary.text,
      },
    }));

    await vectorService.upsertVectors(vectors, namespace);
    await this.dualWriteToPostgres(summaries, organizationId, "github");

    console.log(`[GITHUB INGESTION] ✅ Embedded ${summaries.length} issue summaries`);
    return summaries.length;
  }

  /**
   * Dual-write to PostgreSQL search_content for hybrid search
   */
  private async dualWriteToPostgres(
    chunks: Array<{ id: string; text: string; metadata: any }>,
    organizationId: string,
    source: string
  ): Promise<void> {
    console.log(`[GITHUB INGESTION] Writing ${chunks.length} items to PostgreSQL...`);
    try {
      for (const chunk of chunks) {
        await db
          .insert(schema.searchContent)
          .values({
            id: chunk.id,
            organizationId,
            source,
            sourceType: chunk.metadata.type,
            text: chunk.text,
            textVector: sql`to_tsvector('english', ${chunk.text})`,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [schema.searchContent.id],
            set: {
              text: chunk.text,
              textVector: sql`to_tsvector('english', ${chunk.text})`,
              updatedAt: new Date(),
            },
          });
      }
      console.log(`[GITHUB INGESTION] ✅ PostgreSQL write successful`);
    } catch (error) {
      console.error("[GITHUB INGESTION] ❌ Failed to dual-write to Postgres:", error);
      throw error; // Re-throw so we know it failed
    }
  }
}

export const githubIngestionService = new GithubIngestionService();
