/**
 * GitHubCodeSnapshotService - Tree API-based code ingestion
 *
 * Responsibilities:
 * - Fetch current snapshot of default branch using Tree API
 * - Filter code files (skip dist/**, node_modules/**, binaries)
 * - Fetch blob contents for code files
 * - Smart chunking via GitHubChunkingService
 * - Dual-write to Pinecone + PostgreSQL
 *
 * Pattern: Code domain = latest snapshot only (NOT historical versions)
 */

import type { Octokit } from "@octokit/core";
import { githubChunkingService } from "./github-chunking.service.js";
import { embeddingService } from "./embedding.service.js";
import { vectorService } from "./vector.service.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import type { VectorRecord } from "./vector.service.js";
import type { NewSearchContent } from "../db/schema/search-content.schema.js";

const SYNC_CONFIG = {
  BATCH_SIZE: 25, // Reduced from 100 to avoid GitHub API timeouts
  MAX_FILE_SIZE: 1_000_000, // 1 MB in bytes
  RETRY_ATTEMPTS: 3, // Number of retry attempts for failed fetches
  RETRY_DELAY_MS: 1000, // Initial delay between retries (exponential backoff)
  BATCH_DELAY_MS: 2000, // Delay between batches to avoid rate limiting
} as const;

// Files/directories to skip during code ingestion
const SKIP_PATTERNS = [
  /^dist\//,
  /^build\//,
  /^\.next\//,
  /^node_modules\//,
  /^__pycache__\//,
  /^\.git\//,
  /^coverage\//,
  /^\.turbo\//,
  /\.min\.js$/,
  /\.min\.css$/,
  /\.map$/,
  /\.lock$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\/migrations\/meta\/.*\.json$/, // Skip Drizzle snapshot files (auto-generated, massive)
];

// Code file extensions to ingest
const CODE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cpp",
  ".c",
  ".h",
  ".rb",
  ".php",
  ".sql",
  ".sh",
  ".bash",
  ".yml",
  ".yaml",
  ".toml",
  ".md",
  ".mdx",
  ".txt",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".htm",
  ".vue",
  ".svelte",
];

// Important JSON files to include (everything else skipped)
const ALLOWED_JSON_FILES = [
  /package\.json$/,
  /tsconfig.*\.json$/, // tsconfig.json, tsconfig.base.json, etc.
  /\.eslintrc\.json$/,
  /\.prettierrc\.json$/,
];

interface TreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

interface FileSnapshot {
  path: string;
  content: string;
  sha: string;
  size: number;
}

interface SnapshotResult {
  filesProcessed: number;
  chunksCreated: number;
  skippedFiles: number;
  errors: string[];
}

class GitHubCodeSnapshotService {
  /**
   * Get current HEAD SHA for default branch
   */
  private async getDefaultBranchHead(
    octokit: Octokit,
    owner: string,
    repo: string,
    branch: string
  ): Promise<{ commitSha: string; treeSha: string }> {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/git/refs/heads/{ref}", {
      owner,
      repo,
      ref: branch,
    });

    const commitSha = data.object.sha;

    // Get commit to extract tree SHA
    const { data: commitData } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
      {
        owner,
        repo,
        commit_sha: commitSha,
      }
    );

    return {
      commitSha,
      treeSha: commitData.tree.sha,
    };
  }

  /**
   * Fetch entire repository tree using Tree API (recursive)
   */
  private async getRepositoryTree(
    octokit: Octokit,
    owner: string,
    repo: string,
    treeSha: string
  ): Promise<TreeEntry[]> {
    console.log(`      📡 Fetching tree from GitHub API (recursive)...`);

    const { data } = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
      owner,
      repo,
      tree_sha: treeSha,
      recursive: "1", // Get entire tree in one call
    });

    if (data.truncated) {
      console.warn(`      ⚠️  Tree was truncated (>100k entries). Some files may be missing.`);
    }

    console.log(`      ✅ Received ${data.tree.length} tree entries`);
    return data.tree as TreeEntry[];
  }

  /**
   * Filter tree entries to only code files we want to ingest
   */
  private filterCodeFiles(tree: TreeEntry[]): TreeEntry[] {
    return tree.filter((entry) => {
      // Only blobs (files, not directories)
      if (entry.type !== "blob") return false;

      // Skip patterns (dist, node_modules, etc.)
      if (SKIP_PATTERNS.some((pattern) => pattern.test(entry.path))) {
        return false;
      }

      // Special handling for JSON files - only allow specific important ones
      if (entry.path.endsWith(".json")) {
        const isAllowed = ALLOWED_JSON_FILES.some((pattern) => pattern.test(entry.path));
        if (!isAllowed) return false; // Skip all other JSON files
      } else {
        // Non-JSON files must have a code extension
        const hasCodeExt = CODE_EXTENSIONS.some((ext) => entry.path.endsWith(ext));
        if (!hasCodeExt) return false;
      }

      // Skip files that are too large (>1MB)
      if (entry.size && entry.size > SYNC_CONFIG.MAX_FILE_SIZE) {
        console.log(`         ⏭️  Skipping large file: ${entry.path} (${entry.size} bytes)`);
        return false;
      }

      return true;
    });
  }

  /**
   * Retry helper with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number = SYNC_CONFIG.RETRY_ATTEMPTS,
    delayMs: number = SYNC_CONFIG.RETRY_DELAY_MS
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries === 0) throw error;

      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return this.retryWithBackoff(fn, retries - 1, delayMs * 2); // Exponential backoff
    }
  }

  /**
   * Fetch blob content for a file with retry logic
   */
  private async fetchBlobContent(
    octokit: Octokit,
    owner: string,
    repo: string,
    entry: TreeEntry
  ): Promise<FileSnapshot | null> {
    try {
      const { data } = await this.retryWithBackoff(async () => {
        return await octokit.request("GET /repos/{owner}/{repo}/git/blobs/{file_sha}", {
          owner,
          repo,
          file_sha: entry.sha,
          mediaType: { format: "raw" },
        });
      });

      // GitHub returns raw content as string
      const content = typeof data === "string" ? data : String(data);

      return {
        path: entry.path,
        content,
        sha: entry.sha,
        size: entry.size || content.length,
      };
    } catch (error) {
      console.warn(
        `         ⚠️  Failed to fetch blob ${entry.path}:`,
        error instanceof Error ? error.message : error
      );
      return null;
    }
  }

  /**
   * Transform GitHub vector metadata to PostgreSQL searchContent format
   */
  private transformVectorToSearchContent(
    vector: VectorRecord,
    organizationId: string
  ): NewSearchContent {
    const { id, metadata } = vector;

    const timestamp = metadata.timestamp
      ? metadata.timestamp < 10000000000
        ? metadata.timestamp * 1000
        : metadata.timestamp
      : Date.now();

    return {
      id,
      organizationId,
      source: metadata.source || "github",
      sourceType: metadata.source_type,
      text: metadata.text || "",
      textVector: "", // Auto-populated by PostgreSQL trigger

      // GitHub-specific fields
      repoId: metadata.repo_id,
      repoFullName: metadata.repo_full_name,
      filePath: metadata.path,
      fileName: metadata.file_name,
      language: metadata.language,
      fileRole: metadata.file_role,
      area: metadata.area,
      commitSha: metadata.commit_sha,
      gitAuthor: metadata.git_author,
      committedAt: metadata.committed_at ? new Date(metadata.committed_at) : null,
      startLine: metadata.start_line,
      endLine: metadata.end_line,
      functionName: metadata.function_name,
      className: metadata.class_name,
      exports: metadata.exports,
      isExported: metadata.is_exported || false,
      isTestFile: metadata.is_test_file || false,
      isGenerated: metadata.is_generated || false,

      // Chunk metadata
      chunkIndex: metadata.chunk_index || 0,
      totalChunks: metadata.total_chunks || 1,
      isChunked: metadata.is_chunked || false,

      // Temporal metadata
      timestamp,
      date: metadata.date || new Date(timestamp).toISOString().split("T")[0],
    };
  }

  /**
   * Process a batch of files: chunk, embed, and dual-write
   */
  private async processFileBatch(
    files: FileSnapshot[],
    organizationId: string,
    repo: any,
    commitSha: string,
    commitAuthor: string,
    committedAt: string
  ): Promise<number> {
    if (files.length === 0) return 0;

    console.log(`      📄 Processing ${files.length} files...`);

    let totalChunks = 0;
    const chunkTypeCount: Record<string, number> = {};

    for (const file of files) {
      console.log(`\n      📝 File: ${file.path}`);

      // Use smart chunking service (handles all splitting internally)
      const chunks = githubChunkingService.chunkFile(
        {
          repoId: repo.id,
          repoFullName: repo.fullName,
          path: file.path,
          fileName: file.path.split("/").pop() || file.path,
          content: file.content,
          commitSha,
          author: commitAuthor,
          committedAt,
          defaultBranch: repo.defaultBranch,
        },
        organizationId
      );

      if (chunks.length === 0) {
        console.log(`         ⏭️  Skipped (no chunks generated)`);
        continue;
      }

      // Track chunk types
      chunks.forEach((c: any) => {
        chunkTypeCount[c.chunk_type] = (chunkTypeCount[c.chunk_type] || 0) + 1;
      });

      console.log(`         ✅ Generated ${chunks.length} chunks`);
      console.log(`         📊 Types: ${chunks.map((c: any) => c.chunk_type).join(", ")}`);

      // Use _embeddingText (full code) for embedding generation
      // Fall back to text for non-code chunks (file_overview, config, etc.)
      const texts = chunks.map((c: any) => c._embeddingText || c.text);
      const embeddings = await embeddingService.embedTexts(texts);

      // Build vectors with rich metadata
      const vectors = chunks.map((chunk: any, idx: number) => {
        const committedDate = new Date(chunk.committed_at);

        return {
          id: `github-${chunk.repo_id}-${chunk.commit_sha.slice(0, 7)}-${chunk.path}-chunk-${chunk.chunk_index}`,
          values: embeddings[idx],
          metadata: {
            text: chunk.text, // ← Only metadata (no raw code)
            source: "github",
            source_type: chunk.chunk_type,

            // Repo context
            repo_id: chunk.repo_id,
            repo_full_name: chunk.repo_full_name,
            org_id: chunk.org_id,

            // File context
            path: chunk.path,
            file_name: chunk.file_name,
            language: chunk.language,
            file_role: chunk.file_role,
            area: chunk.area,

            // Git context
            commit_sha: chunk.commit_sha,
            git_author: chunk.author,
            committed_at: chunk.committed_at,
            default_branch: chunk.default_branch,

            // Symbol metadata
            start_line: chunk.start_line,
            end_line: chunk.end_line,
            function_name: chunk.function_name,
            class_name: chunk.class_name,
            exports: chunk.exports,
            is_exported: chunk.is_exported,
            is_test_file: chunk.is_test_file,
            is_generated: chunk.is_generated,

            // Chunk metadata
            chunk_index: chunk.chunk_index,
            total_chunks: chunk.total_chunks,
            is_chunked: chunk.total_chunks > 1,
            token_count: chunk.token_count,

            // Timestamps
            timestamp: Math.floor(committedDate.getTime() / 1000),
            date: committedDate.toISOString().split("T")[0],
            year: committedDate.getFullYear(),
            month: committedDate.getMonth() + 1,

            // Organization context
            organization_id: organizationId,
          },
        };
      });

      const namespace = `org-${organizationId}`;

      // DUAL-WRITE: Store in both Pinecone (semantic) and PostgreSQL (keyword)
      await vectorService.upsertVectors(vectors, namespace);

      // Transform vectors to PostgreSQL format and upsert
      const searchContentRecords = vectors.map((v: any) =>
        this.transformVectorToSearchContent(v, organizationId)
      );

      await db
        .insert(schema.searchContent)
        .values(searchContentRecords)
        .onConflictDoUpdate({
          target: schema.searchContent.id,
          set: {
            text: sql`EXCLUDED.text`,
            timestamp: sql`EXCLUDED.timestamp`,
            date: sql`EXCLUDED.date`,
            updatedAt: new Date(),
          },
        });

      totalChunks += chunks.length;
    }

    // Log chunk type summary for this batch
    if (totalChunks > 0) {
      console.log(`\n      📊 Batch Summary:`);
      console.log(`         Total chunks: ${totalChunks}`);
      console.log(`         Chunk type breakdown:`);
      Object.entries(chunkTypeCount)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          console.log(`           - ${type}: ${count}`);
        });
    }

    return totalChunks;
  }

  /**
   * Ingest current snapshot of repository using Tree API
   *
   * Flow:
   * 1. Get HEAD SHA of default branch
   * 2. Fetch entire tree recursively (one API call)
   * 3. Filter to code files only
   * 4. Fetch blob contents in batches
   * 5. Chunk, embed, and dual-write
   * 6. Update lastIndexedCommitSha
   */
  async ingestRepositorySnapshot(
    octokit: Octokit,
    repo: any,
    organizationId: string
  ): Promise<SnapshotResult> {
    const result: SnapshotResult = {
      filesProcessed: 0,
      chunksCreated: 0,
      skippedFiles: 0,
      errors: [],
    };

    try {
      console.log(`\n   📂 Repo: ${repo.fullName}`);

      // Step 1: Get HEAD commit and tree SHA
      const { commitSha, treeSha } = await this.getDefaultBranchHead(
        octokit,
        repo.owner,
        repo.name,
        repo.defaultBranch
      );

      console.log(`      🔖 HEAD: ${commitSha.substring(0, 7)}`);

      // Check if we've already indexed this commit
      if (repo.lastIndexedCommitSha === commitSha) {
        console.log(`      ✅ Already indexed this commit, skipping`);
        return result;
      }

      // Step 2: Fetch entire tree recursively
      const tree = await this.getRepositoryTree(octokit, repo.owner, repo.name, treeSha);

      // Step 3: Filter to code files
      const codeFiles = this.filterCodeFiles(tree);
      console.log(
        `      🔍 Filtered to ${codeFiles.length} code files (from ${tree.length} total)`
      );

      if (codeFiles.length === 0) {
        console.log(`      ⏭️  No code files to process`);
        return result;
      }

      // Step 4: Fetch blob contents in batches
      console.log(`\n      📥 Fetching file contents...`);
      for (let i = 0; i < codeFiles.length; i += SYNC_CONFIG.BATCH_SIZE) {
        const batch = codeFiles.slice(i, i + SYNC_CONFIG.BATCH_SIZE);
        console.log(
          `\n      🔄 Batch ${Math.floor(i / SYNC_CONFIG.BATCH_SIZE) + 1}: Fetching ${batch.length} files...`
        );

        const snapshots = await Promise.all(
          batch.map((entry) => this.fetchBlobContent(octokit, repo.owner, repo.name, entry))
        );

        const validSnapshots = snapshots.filter((s): s is FileSnapshot => s !== null);
        const failedCount = batch.length - validSnapshots.length;
        result.skippedFiles += failedCount;

        if (failedCount > 0) {
          console.warn(`      ⚠️  ${failedCount} files failed to fetch in this batch`);
        }

        // Get commit metadata for chunks
        const [latestCommit] = await db
          .select()
          .from(schema.githubCommits)
          .where(eq(schema.githubCommits.sha, commitSha))
          .limit(1);

        const commitAuthor = latestCommit?.authorName || "Unknown";
        const committedAt = latestCommit?.committedAt?.toISOString() || new Date().toISOString();

        // Step 5: Process batch (chunk, embed, dual-write)
        const chunksCreated = await this.processFileBatch(
          validSnapshots,
          organizationId,
          repo,
          commitSha,
          commitAuthor,
          committedAt
        );

        result.chunksCreated += chunksCreated;
        result.filesProcessed += validSnapshots.length;

        console.log(
          `      ✅ Batch complete: +${chunksCreated} chunks (${i + batch.length}/${codeFiles.length} files processed)`
        );

        // Add delay between batches to avoid rate limiting (except for last batch)
        const isLastBatch = i + batch.length >= codeFiles.length;
        if (!isLastBatch) {
          await new Promise((resolve) => setTimeout(resolve, SYNC_CONFIG.BATCH_DELAY_MS));
        }
      }

      // Step 6: Update lastIndexedCommitSha only if all files succeeded
      const expectedFileCount = codeFiles.length;
      const actualFileCount = result.filesProcessed;
      const hasFailures = result.skippedFiles > 0 || actualFileCount < expectedFileCount;

      if (hasFailures) {
        console.warn(
          `\n   ⚠️  Partial snapshot: ${result.skippedFiles} files failed to fetch. NOT updating lastIndexedCommitSha.`
        );
        console.warn(`      Expected: ${expectedFileCount}, Got: ${actualFileCount}`);
        console.warn(`      Re-run sync to retry failed files.`);
      } else {
        // All files successfully fetched - safe to update
        await db
          .update(schema.githubRepos)
          .set({
            lastIndexedCommitSha: commitSha,
            updatedAt: new Date(),
          })
          .where(eq(schema.githubRepos.id, repo.id));

        console.log(
          `\n   ✅ Repository snapshot complete: ${result.filesProcessed} files, ${result.chunksCreated} chunks`
        );
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`   ❌ Snapshot failed:`, errorMsg);
      result.errors.push(errorMsg);
      return result;
    }
  }

  /**
   * Incremental update: only process files changed since last indexed commit
   *
   * Flow:
   * 1. Get new HEAD SHA
   * 2. If same as lastIndexedCommitSha, skip
   * 3. Get list of changed files between lastIndexedCommitSha and HEAD
   * 4. For modified/added files: fetch current version from tree, re-chunk
   * 5. For deleted files: remove chunks from search_content + Pinecone
   * 6. Update lastIndexedCommitSha
   */
  async incrementalUpdate(
    octokit: Octokit,
    repo: any,
    organizationId: string
  ): Promise<SnapshotResult> {
    const result: SnapshotResult = {
      filesProcessed: 0,
      chunksCreated: 0,
      skippedFiles: 0,
      errors: [],
    };

    try {
      console.log(`\n   🔄 Incremental update: ${repo.fullName}`);

      // Get current HEAD
      const { commitSha, treeSha } = await this.getDefaultBranchHead(
        octokit,
        repo.owner,
        repo.name,
        repo.defaultBranch
      );

      console.log(`      🔖 New HEAD: ${commitSha.substring(0, 7)}`);
      console.log(`      🔖 Last indexed: ${repo.lastIndexedCommitSha?.substring(0, 7) || "none"}`);

      // Check if already indexed
      if (repo.lastIndexedCommitSha === commitSha) {
        console.log(`      ✅ Already up to date`);
        return result;
      }

      // Get commits since last indexed
      const commits = await db
        .select()
        .from(schema.githubCommits)
        .where(eq(schema.githubCommits.repoId, repo.id))
        .orderBy(schema.githubCommits.committedAt);

      if (commits.length === 0) {
        console.log(`      ⚠️  No commits found, falling back to full snapshot`);
        return this.ingestRepositorySnapshot(octokit, repo, organizationId);
      }

      // Get unique changed file paths from recent commits
      const changedFiles = await db
        .selectDistinctOn([schema.githubCommitFiles.path])
        .from(schema.githubCommitFiles)
        .where(eq(schema.githubCommitFiles.repoId, repo.id))
        .orderBy(schema.githubCommitFiles.path);

      console.log(`      📝 Found ${changedFiles.length} unique changed files`);

      // Get current tree to fetch latest versions
      const tree = await this.getRepositoryTree(octokit, repo.owner, repo.name, treeSha);
      const treeMap = new Map(tree.map((entry) => [entry.path, entry]));

      // Separate into modified/added vs deleted
      const toUpdate: TreeEntry[] = [];
      const toDelete: string[] = [];

      for (const file of changedFiles) {
        const treeEntry = treeMap.get(file.path);
        if (treeEntry && treeEntry.type === "blob") {
          // File exists in current tree → modified/added
          if (CODE_EXTENSIONS.some((ext) => file.path.endsWith(ext))) {
            toUpdate.push(treeEntry);
          }
        } else {
          // File not in current tree → deleted
          toDelete.push(file.path);
        }
      }

      console.log(`      📝 To update: ${toUpdate.length} files`);
      console.log(`      🗑️  To delete: ${toDelete.length} files`);

      // Delete removed files from search index
      if (toDelete.length > 0) {
        await db.delete(schema.searchContent).where(
          sql`${schema.searchContent.organizationId} = ${organizationId} 
                AND ${schema.searchContent.source} = 'github' 
                AND ${schema.searchContent.repoId} = ${repo.id}
                AND ${schema.searchContent.filePath} IN ${toDelete}`
        );

        // TODO: Delete from Pinecone as well
        console.log(`      ✅ Deleted ${toDelete.length} files from search index`);
      }

      // Update modified/added files
      if (toUpdate.length > 0) {
        const codeFiles = this.filterCodeFiles(toUpdate);
        console.log(`      🔍 Filtered to ${codeFiles.length} code files`);

        for (let i = 0; i < codeFiles.length; i += SYNC_CONFIG.BATCH_SIZE) {
          const batch = codeFiles.slice(i, i + SYNC_CONFIG.BATCH_SIZE);

          const snapshots = await Promise.all(
            batch.map((entry) => this.fetchBlobContent(octokit, repo.owner, repo.name, entry))
          );

          const validSnapshots = snapshots.filter((s): s is FileSnapshot => s !== null);
          const failedCount = batch.length - validSnapshots.length;

          if (failedCount > 0) {
            result.skippedFiles += failedCount;
            console.warn(`      ⚠️  ${failedCount} files failed to fetch in this batch`);
          }

          const [latestCommit] = await db
            .select()
            .from(schema.githubCommits)
            .where(eq(schema.githubCommits.sha, commitSha))
            .limit(1);

          const commitAuthor = latestCommit?.authorName || "Unknown";
          const committedAt = latestCommit?.committedAt?.toISOString() || new Date().toISOString();

          const chunksCreated = await this.processFileBatch(
            validSnapshots,
            organizationId,
            repo,
            commitSha,
            commitAuthor,
            committedAt
          );

          result.chunksCreated += chunksCreated;
          result.filesProcessed += validSnapshots.length;

          // Add delay between batches to avoid rate limiting (except for last batch)
          const isLastBatch = i + batch.length >= codeFiles.length;
          if (!isLastBatch) {
            await new Promise((resolve) => setTimeout(resolve, SYNC_CONFIG.BATCH_DELAY_MS));
          }
        }
      }

      // Only update lastIndexedCommitSha if ALL files were successfully fetched
      const expectedFileCount = toUpdate.length;
      const actualFileCount = result.filesProcessed;
      const hasFailures = result.skippedFiles > 0 || actualFileCount < expectedFileCount;

      if (hasFailures) {
        console.warn(
          `\n   ⚠️  Partial sync: ${result.skippedFiles} files failed to fetch. NOT updating lastIndexedCommitSha.`
        );
        console.warn(`      Expected: ${expectedFileCount}, Got: ${actualFileCount}`);
        console.warn(`      Re-run sync to retry failed files.`);
      } else {
        // All files successfully fetched - safe to update
        await db
          .update(schema.githubRepos)
          .set({
            lastIndexedCommitSha: commitSha,
            updatedAt: new Date(),
          })
          .where(eq(schema.githubRepos.id, repo.id));

        console.log(
          `\n   ✅ Incremental update complete: ${result.filesProcessed} files updated, ${toDelete.length} deleted`
        );
      }

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`   ❌ Incremental update failed:`, errorMsg);
      result.errors.push(errorMsg);
      return result;
    }
  }
}

export const githubCodeSnapshotService = new GitHubCodeSnapshotService();
