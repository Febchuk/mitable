/**
 * GitHubIngestionService - GitHub-specific ingestion logic
 *
 * Responsibilities:
 * - Orchestrate code snapshot ingestion via Tree API
 * - Use GitHubCodeSnapshotService for code domain (current repo state)
 * - Work domain (commits/PRs/issues) handled by sync-github.ts script
 * - Update sync logs
 *
 * Pattern: Dual-domain strategy
 * - Code domain: Tree API snapshot (latest version of each file)
 * - Work domain: Commit/PR/issue metadata only (no historical file contents)
 */

import { githubCodeSnapshotService } from "./github-code-snapshot.service.js";
import { githubService } from "./github.service.js";
import { db } from "../../../db/client.js";
import * as schema from "../../../db/schema/index.js";
import { eq, and } from "drizzle-orm";

export interface IngestionResult {
  success: boolean;
  reposProcessed: number;
  filesProcessed: number;
  chunksCreated: number;
  errors: string[];
  duration: number;
}

class GitHubIngestionService {
  /**
   * Sync GitHub code files for an organization
   * Uses Tree API snapshot strategy: current state only, no historical versions
   */
  async syncCode(organizationId: string): Promise<IngestionResult> {
    const startTime = Date.now();
    const result: IngestionResult = {
      success: false,
      reposProcessed: 0,
      filesProcessed: 0,
      chunksCreated: 0,
      errors: [],
      duration: 0,
    };

    let syncLogId: string | null = null;

    try {
      // Get GitHub integration
      const [integration] = await db
        .select()
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.organizationId, organizationId),
            eq(schema.integrations.provider, "github")
          )
        )
        .limit(1);

      if (!integration) {
        throw new Error("GitHub integration not found");
      }

      console.log(`\n🚀 Starting GitHub code sync for org: ${organizationId}`);

      // Create sync log
      const [syncLog] = await db
        .insert(schema.syncLogs)
        .values({
          integrationId: integration.id,
          status: "in_progress",
          itemsSynced: 0,
          startedAt: new Date(),
        })
        .returning();

      syncLogId = syncLog.id;

      // Get selected repos
      const repos = await db
        .select()
        .from(schema.githubRepos)
        .where(
          and(
            eq(schema.githubRepos.integrationId, integration.id),
            eq(schema.githubRepos.isSelected, true)
          )
        );

      if (repos.length === 0) {
        console.log(`⚠️  No repos selected for syncing`);
        result.success = true;
        result.duration = Date.now() - startTime;

        await db
          .update(schema.syncLogs)
          .set({
            status: "success",
            completedAt: new Date(),
          })
          .where(eq(schema.syncLogs.id, syncLogId));

        return result;
      }

      console.log(`📚 Processing ${repos.length} selected repos`);

      // Get GitHub App installation Octokit
      const metadata = integration.metadata as any;
      if (!metadata?.installationId) {
        throw new Error("GitHub installation ID not found");
      }

      const octokit = await githubService.getInstallationOctokit(metadata.installationId);

      // Process each repo
      for (const repo of repos) {
        try {
          // Determine if this is initial sync or incremental update
          const isInitialSync = !repo.lastIndexedCommitSha;

          let snapshotResult;
          if (isInitialSync) {
            console.log(`📸 Initial snapshot for ${repo.fullName}`);
            snapshotResult = await githubCodeSnapshotService.ingestRepositorySnapshot(
              octokit,
              repo,
              organizationId
            );
          } else {
            console.log(`🔄 Incremental update for ${repo.fullName}`);
            snapshotResult = await githubCodeSnapshotService.incrementalUpdate(
              octokit,
              repo,
              organizationId
            );
          }

          result.filesProcessed += snapshotResult.filesProcessed;
          result.chunksCreated += snapshotResult.chunksCreated;
          result.errors.push(...snapshotResult.errors);
          result.reposProcessed++;
        } catch (error) {
          const errorMsg = `Failed to process repo ${repo.fullName}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          console.error(`❌ Repo error:`, errorMsg);
          result.errors.push(errorMsg);
        }
      }

      // Update sync log
      await db
        .update(schema.syncLogs)
        .set({
          status: "success",
          itemsSynced: result.chunksCreated,
          completedAt: new Date(),
        })
        .where(eq(schema.syncLogs.id, syncLogId));

      // Update integration lastSyncedAt
      await db
        .update(schema.integrations)
        .set({
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, integration.id));

      result.success = true;
      result.duration = Date.now() - startTime;

      console.log(`\n✅ GitHub sync complete:`, {
        repos: result.reposProcessed,
        files: result.filesProcessed,
        chunks: result.chunksCreated,
        duration: `${result.duration}ms`,
      });

      return result;
    } catch (error) {
      // Update sync log as failed
      if (syncLogId) {
        await db
          .update(schema.syncLogs)
          .set({
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Unknown error",
            completedAt: new Date(),
          })
          .where(eq(schema.syncLogs.id, syncLogId));
      }

      result.errors.push(error instanceof Error ? error.message : "Unknown error");
      result.duration = Date.now() - startTime;
      return result;
    }
  }
}

export const githubIngestionService = new GitHubIngestionService();
