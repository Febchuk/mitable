#!/usr/bin/env tsx
/**
 * GitHub Data Inspector Script
 *
 * Read-only script to inspect what GitHub data exists in:
 * - PostgreSQL: integrations, search_content, github tables
 * - Pinecone: vectors with source='github'
 *
 * Safe to run - does NOT modify or delete anything
 *
 * Usage:
 *   npm run inspect-github
 */

import { db } from "../db/client.js";
import { integrations, searchContent } from "../db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import { validateConfig } from "../config.js";

async function main() {
  console.log("\n📊 GitHub Data Inspector");
  console.log("============================================================\n");

  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    console.error("❌ Configuration error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  try {
    // Step 1: Check GitHub integrations
    console.log("🔍 Checking GitHub integrations...\n");
    const githubIntegrations = await db
      .select({
        id: integrations.id,
        organizationId: integrations.organizationId,
        provider: integrations.provider,
        createdAt: integrations.createdAt,
        lastSyncedAt: integrations.lastSyncedAt,
      })
      .from(integrations)
      .where(eq(integrations.provider, "github"));

    if (githubIntegrations.length === 0) {
      console.log("   ❌ No GitHub integrations found\n");
    } else {
      console.log(`   ✅ Found ${githubIntegrations.length} GitHub integration(s):\n`);
      for (const integration of githubIntegrations) {
        console.log(`   Integration ID: ${integration.id}`);
        console.log(`   Organization ID: ${integration.organizationId}`);
        console.log(`   Created: ${integration.createdAt}`);
        console.log(`   Last Synced: ${integration.lastSyncedAt || "Never"}`);
        console.log();
      }
    }

    // Step 2: Check GitHub repos
    console.log("📚 Checking GitHub repos...\n");
    try {
      const repoCount = await db.execute(sql`
        SELECT COUNT(*) as count FROM github_repos
      `);
      const count = Number(repoCount.rows[0]?.count || 0);
      console.log(`   Found ${count} repo(s)\n`);

      if (count > 0) {
        const repos = await db.execute(sql`
          SELECT id, full_name, default_branch, is_selected, last_synced_at
          FROM github_repos
          LIMIT 10
        `);
        console.log("   Sample repos:");
        for (const repo of repos.rows) {
          console.log(`   - ${repo.full_name} (${repo.is_selected ? "selected" : "not selected"})`);
        }
        console.log();
      }
    } catch (error) {
      console.log("   ⚠️  Table 'github_repos' doesn't exist or error:", (error as Error).message);
      console.log();
    }

    // Step 3: Check GitHub commits
    console.log("📝 Checking GitHub commits...\n");
    try {
      const commitCount = await db.execute(sql`
        SELECT COUNT(*) as count FROM github_commits
      `);
      const count = Number(commitCount.rows[0]?.count || 0);
      console.log(`   Found ${count} commit(s)\n`);
    } catch (error) {
      console.log(
        "   ⚠️  Table 'github_commits' doesn't exist or error:",
        (error as Error).message
      );
      console.log();
    }

    // Step 4: Check GitHub commit files
    console.log("📄 Checking GitHub commit files...\n");
    try {
      const fileCount = await db.execute(sql`
        SELECT COUNT(*) as count FROM github_commit_files
      `);
      const count = Number(fileCount.rows[0]?.count || 0);
      console.log(`   Found ${count} file(s)\n`);
    } catch (error) {
      console.log(
        "   ⚠️  Table 'github_commit_files' doesn't exist or error:",
        (error as Error).message
      );
      console.log();
    }

    // Step 5: Check GitHub PRs
    console.log("🔀 Checking GitHub pull requests...\n");
    try {
      const prCount = await db.execute(sql`
        SELECT COUNT(*) as count FROM github_pull_requests
      `);
      const count = Number(prCount.rows[0]?.count || 0);
      console.log(`   Found ${count} PR(s)\n`);
    } catch (error) {
      console.log(
        "   ⚠️  Table 'github_pull_requests' doesn't exist or error:",
        (error as Error).message
      );
      console.log();
    }

    // Step 6: Check GitHub issues
    console.log("🐛 Checking GitHub issues...\n");
    try {
      const issueCount = await db.execute(sql`
        SELECT COUNT(*) as count FROM github_issues
      `);
      const count = Number(issueCount.rows[0]?.count || 0);
      console.log(`   Found ${count} issue(s)\n`);
    } catch (error) {
      console.log("   ⚠️  Table 'github_issues' doesn't exist or error:", (error as Error).message);
      console.log();
    }

    // Step 7: Check GitHub chunks in search_content
    console.log("🔍 Checking GitHub chunks in search_content...\n");
    const githubChunks = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(searchContent)
      .where(eq(searchContent.source, "github"));

    const chunkCount = Number(githubChunks[0]?.count || 0);
    console.log(`   Found ${chunkCount} GitHub chunk(s) in search_content\n`);

    if (chunkCount > 0) {
      // Get chunk type breakdown
      const chunkTypes = await db.execute(sql`
        SELECT source_type, COUNT(*) as count
        FROM search_content
        WHERE source = 'github'
        GROUP BY source_type
        ORDER BY count DESC
      `);

      console.log("   Chunk types:");
      for (const type of chunkTypes.rows) {
        console.log(`   - ${type.source_type}: ${type.count}`);
      }
      console.log();

      // Get sample chunks
      const sampleChunks = await db.execute(sql`
        SELECT id, source_type, file_path, function_name, class_name
        FROM search_content
        WHERE source = 'github'
        LIMIT 5
      `);

      console.log("   Sample chunks:");
      for (const chunk of sampleChunks.rows) {
        console.log(`   - ID: ${chunk.id}`);
        console.log(`     Type: ${chunk.source_type}`);
        console.log(`     File: ${chunk.file_path || "N/A"}`);
        if (chunk.function_name) console.log(`     Function: ${chunk.function_name}`);
        if (chunk.class_name) console.log(`     Class: ${chunk.class_name}`);
        console.log();
      }
    }

    // Step 8: Estimate Pinecone vectors
    console.log("🎯 Pinecone vector estimate...\n");
    if (chunkCount > 0) {
      console.log(`   Estimated ${chunkCount} GitHub vector(s) across org namespaces`);
      console.log("   (Each chunk in search_content has a corresponding Pinecone vector)\n");
    } else {
      console.log("   No GitHub vectors expected (no chunks in search_content)\n");
    }

    console.log("============================================================");
    console.log("✅ Inspection complete!");
    console.log("============================================================\n");

    // Close database connection
    await db.$client.end();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Inspection failed:", error);
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
