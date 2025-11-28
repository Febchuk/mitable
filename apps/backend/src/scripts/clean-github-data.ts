#!/usr/bin/env tsx
/**
 * GitHub Data Cleanup Script
 *
 * DANGER: This script DELETES ALL GitHub data from:
 * - PostgreSQL: github_repos, github_commits, github_commit_files, github_pull_requests,
 *               github_issues, integrations (GitHub only), search_content (GitHub chunks)
 * - Pinecone: All vectors with source='github'
 *
 * Use this when you need to completely reset GitHub integration and re-sync from scratch.
 *
 * Usage:
 *   npm run clean-github
 */

import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { vectorService } from "../services/vector.service.js";
import { validateConfig } from "../config.js";

async function main() {
  console.log("\n⚠️  ============================================================");
  console.log("⚠️  WARNING: This will DELETE ALL GitHub data!");
  console.log("⚠️  ============================================================\n");
  console.log("This includes:");
  console.log("  - GitHub integration records");
  console.log("  - All repos, commits, files, PRs, issues");
  console.log("  - All GitHub chunks in search_content");
  console.log("  - All GitHub vectors in Pinecone");
  console.log("\n⏳ Starting cleanup in 3 seconds...\n");

  // Wait 3 seconds to allow user to cancel
  await new Promise((resolve) => setTimeout(resolve, 3000));

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
    // Step 1: Get all GitHub integrations
    console.log("🔍 Finding GitHub integrations...");
    const githubIntegrations = await db
      .select()
      .from(schema.integrations)
      .where(eq(schema.integrations.provider, "github"));

    console.log(`   Found ${githubIntegrations.length} GitHub integration(s)`);

    if (githubIntegrations.length === 0) {
      console.log("\n✅ No GitHub integrations found. Nothing to clean.");
      await db.$client.end();
      process.exit(0);
    }

    // Step 2: Delete GitHub chunks from search_content (we'll get IDs for Pinecone)
    console.log("\n🔍 Finding GitHub chunks to delete...");
    const githubChunks = await db
      .select({ id: schema.searchContent.id, organizationId: schema.searchContent.organizationId })
      .from(schema.searchContent)
      .where(eq(schema.searchContent.source, "github"));

    console.log(`   Found ${githubChunks.length} GitHub chunk(s)`);

    // Group chunks by organization for Pinecone deletion
    const chunksByOrg = new Map<string, string[]>();
    for (const chunk of githubChunks) {
      const ids = chunksByOrg.get(chunk.organizationId) || [];
      ids.push(chunk.id);
      chunksByOrg.set(chunk.organizationId, ids);
    }

    // Step 3: Delete from Pinecone (for each org)
    console.log("\n🗑️  Deleting GitHub vectors from Pinecone...");
    for (const [orgId, vectorIds] of chunksByOrg.entries()) {
      const namespace = `org-${orgId}`;
      console.log(`   Namespace: ${namespace} (${vectorIds.length} vectors)`);

      try {
        // Pinecone has a limit per delete request, so batch if needed
        const BATCH_SIZE = 1000;
        for (let i = 0; i < vectorIds.length; i += BATCH_SIZE) {
          const batch = vectorIds.slice(i, i + BATCH_SIZE);
          await vectorService.deleteVectors(batch, namespace);
          console.log(`   ✅ Deleted ${batch.length} vectors from ${namespace}`);
        }
      } catch (error) {
        console.error(`   ⚠️  Error deleting from Pinecone:`, error);
        // Continue anyway
      }
    }

    // Step 4: Delete GitHub chunks from search_content (PostgreSQL)
    console.log("\n🗑️  Deleting GitHub chunks from search_content...");
    const deletedSearchContent = await db
      .delete(schema.searchContent)
      .where(eq(schema.searchContent.source, "github"))
      .returning({ id: schema.searchContent.id });

    console.log(`   ✅ Deleted ${deletedSearchContent.length} GitHub chunks`);

    // Step 5: Delete GitHub-specific tables (cascade will handle related records)
    console.log("\n🗑️  Deleting GitHub repos and related data...");

    // Get all GitHub repos (for counting)
    const repos = await db.select().from(schema.githubRepos);

    console.log(`   Found ${repos.length} repo(s) to delete`);

    // Delete repos (cascades to commits, files, PRs, issues)
    for (const repo of repos) {
      await db.delete(schema.githubRepos).where(eq(schema.githubRepos.id, repo.id));
      console.log(`   ✅ Deleted repo: ${repo.fullName}`);
    }

    // Step 6: Delete GitHub integrations
    console.log("\n🗑️  Deleting GitHub integration records...");
    for (const integration of githubIntegrations) {
      await db.delete(schema.integrations).where(eq(schema.integrations.id, integration.id));
      console.log(`   ✅ Deleted integration for org: ${integration.organizationId}`);
    }

    // Step 7: Delete sync logs for GitHub
    console.log("\n🗑️  Deleting GitHub sync logs...");
    for (const integration of githubIntegrations) {
      const deletedLogs = await db
        .delete(schema.syncLogs)
        .where(eq(schema.syncLogs.integrationId, integration.id))
        .returning({ id: schema.syncLogs.id });
      console.log(`   ✅ Deleted ${deletedLogs.length} sync log(s)`);
    }

    console.log("\n============================================================");
    console.log("✅ GitHub data cleanup complete!");
    console.log("============================================================");
    console.log(`Integrations deleted: ${githubIntegrations.length}`);
    console.log(`Repos deleted: ${repos.length}`);
    console.log(`Search chunks deleted: ${deletedSearchContent.length}`);
    console.log("============================================================\n");
    console.log("💡 You can now re-sync GitHub from scratch.\n");

    // Close database connection
    await db.$client.end();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Cleanup failed:", error);
    console.error();

    if (error instanceof Error) {
      console.error("Error details:", error.message);
      if (error.stack) {
        console.error("Stack trace:", error.stack);
      }
    }

    await db.$client.end();
    process.exit(1);
  }
}

main();
