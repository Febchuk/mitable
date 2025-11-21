#!/usr/bin/env tsx
/**
 * Railway Cron Service - Integration Sync
 * 
 * Standalone service that syncs ALL active integrations (Slack + Notion + GitHub).
 * Designed to run as a separate Railway service every 6 hours.
 * 
 * Schedule: 0 *\/6 * * * (every 6 hours)
 * 
 * Features:
 * - Incremental syncs for both Slack and Notion
 * - Graceful error handling (logs failures, continues execution)
 * - Structured logging with timestamps
 * - Clean exit after completion (required for Railway cron)
 */

import { db } from "../../backend/src/db/client.js";
import { integrations } from "../../backend/src/db/schema/integrations.schema.js";
import { eq } from "drizzle-orm";
import { ingestionService } from "../../backend/src/services/ingestion.service.js";
import { vectorService } from "../../backend/src/services/vector.service.js";
import { validateConfig } from "../../backend/src/config.js";
import { githubSyncService } from "../../backend/src/services/github-sync.service.js";

interface SyncStats {
  slack: {
    integrations: number;
    success: number;
    failed: number;
    messagesProcessed: number;
  };
  notion: {
    integrations: number;
    success: number;
    failed: number;
    pagesProcessed: number;
  };
  github: {
    integrations: number;
    success: number;
    failed: number;
    reposProcessed: number;
    commitsProcessed: number;
  };
  startTime: number;
  endTime?: number;
}

/**
 * Sync all GitHub integrations
 */
async function syncGithub(stats: SyncStats): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log("🐙 GITHUB SYNC");
  console.log("=".repeat(70) + "\n");

  try {
    const githubIntegrations = await db
      .select()
      .from(integrations)
      .where(eq(integrations.provider, "github"));

    stats.github.integrations = githubIntegrations.length;

    if (githubIntegrations.length === 0) {
      console.log("📭 No GitHub integrations found\n");
      return;
    }

    console.log(`📋 Found ${githubIntegrations.length} GitHub integration(s)\n`);

    for (const integration of githubIntegrations) {
      const orgId = integration.organizationId;
      console.log(`\n${"─".repeat(60)}`);
      console.log(`📦 Organization: ${orgId}`);

      try {
        const result = await githubSyncService.syncIntegration(integration);
        stats.github.reposProcessed += result.reposProcessed;
        stats.github.commitsProcessed += result.commitsProcessed;
        stats.github.success++;
        console.log(
          `✅ GitHub sync complete for ${orgId} | Repos: ${result.reposProcessed} | Commits: ${result.commitsProcessed}`
        );
      } catch (error) {
        stats.github.failed++;
        console.error(
          `❌ Failed to sync GitHub for ${orgId}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 GitHub Summary:`);
    console.log(`   Integrations: ${stats.github.integrations}`);
    console.log(`   ✅ Success: ${stats.github.success}`);
    console.log(`   ❌ Failed: ${stats.github.failed}`);
    console.log(`   Repos: ${stats.github.reposProcessed}`);
    console.log(`   Commits: ${stats.github.commitsProcessed}`);
    console.log(`${"=".repeat(60)}\n`);
  } catch (error) {
    console.error("\n❌ Fatal error in GitHub sync:", error);
  }
}

/**
 * Sync all Slack integrations
 */
async function syncSlack(stats: SyncStats): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log("📢 SLACK SYNC");
  console.log("=".repeat(70) + "\n");

  try {
    const slackIntegrations = await db
      .select()
      .from(integrations)
      .where(eq(integrations.provider, "slack"));

    stats.slack.integrations = slackIntegrations.length;

    if (slackIntegrations.length === 0) {
      console.log("📭 No Slack integrations found\n");
      return;
    }

    console.log(`📋 Found ${slackIntegrations.length} Slack integration(s)\n`);

    for (const integration of slackIntegrations) {
      const orgId = integration.organizationId;

      console.log(`\n${"─".repeat(60)}`);
      console.log(`📦 Organization: ${orgId}`);

      try {
        // Use the built-in sync method (handles fetch + ingestion properly)
        const result = await ingestionService.syncSlackMessages(orgId, (progress) => {
          if (progress.currentChannel) {
            console.log(
              `� [${progress.channelsProcessed + 1}/${progress.totalChannels}] ${progress.currentChannel} (${progress.messagesProcessed} messages)`
            );
          }
        });

        stats.slack.messagesProcessed += result.messagesEmbedded;
        stats.slack.success++;

        console.log(`\n✅ Slack sync complete for ${orgId}`);
        console.log(`   Total messages: ${result.messagesEmbedded}`);
        console.log(`   Duration: ${Math.round(result.duration / 1000)}s`);
        
        if (result.errors.length > 0) {
          console.log(`   ⚠️  Errors: ${result.errors.length}`);
        }
      } catch (error) {
        stats.slack.failed++;
        console.error(
          `\n❌ Failed to sync Slack for ${orgId}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 Slack Summary:`);
    console.log(`   Integrations: ${stats.slack.integrations}`);
    console.log(`   ✅ Success: ${stats.slack.success}`);
    console.log(`   ❌ Failed: ${stats.slack.failed}`);
    console.log(`   Messages: ${stats.slack.messagesProcessed}`);
    console.log(`${"=".repeat(60)}\n`);
  } catch (error) {
    console.error("\n❌ Fatal error in Slack sync:", error);
  }
}

/**
 * Sync all Notion integrations
 */
async function syncNotion(stats: SyncStats): Promise<void> {
  console.log("\n" + "=".repeat(70));
  console.log("📝 NOTION SYNC");
  console.log("=".repeat(70) + "\n");

  try {
    const notionIntegrations = await db
      .select()
      .from(integrations)
      .where(eq(integrations.provider, "notion"));

    stats.notion.integrations = notionIntegrations.length;

    if (notionIntegrations.length === 0) {
      console.log("📭 No Notion integrations found\n");
      return;
    }

    console.log(`📋 Found ${notionIntegrations.length} Notion integration(s)\n`);

    for (const integration of notionIntegrations) {
      const orgId = integration.organizationId;
      const lastSyncedAt = integration.lastSyncedAt ? new Date(integration.lastSyncedAt) : null;
      const syncMode = lastSyncedAt ? "incremental" : "full";

      console.log(`\n${"─".repeat(60)}`);
      console.log(`📦 Organization: ${orgId}`);
      console.log(`🔄 Sync Mode: ${syncMode}`);

      if (lastSyncedAt) {
        console.log(`📅 Last synced: ${lastSyncedAt.toLocaleString()}`);
      } else {
        console.log(`📅 First sync - fetching all pages`);
      }

      console.log(`${"─".repeat(60)}`);

      try {
        const result = await ingestionService.syncNotionPages(orgId, (progress) => {
          if (progress.currentChannel) {
            console.log(
              `📄 [${progress.channelsProcessed + 1}/${progress.totalChannels}] ${progress.currentChannel}`
            );
          }
        });

        stats.notion.pagesProcessed += result.channelsProcessed;
        stats.notion.success++;

        console.log(`\n✅ Notion sync complete for ${orgId}`);
        console.log(`   Pages: ${result.channelsProcessed}`);
        console.log(`   Blocks: ${result.messagesEmbedded}`);
        console.log(`   Duration: ${Math.round(result.duration / 1000)}s`);

        if (result.errors.length > 0) {
          console.log(`   ⚠️  Errors: ${result.errors.length}`);
        }
      } catch (error) {
        stats.notion.failed++;
        console.error(
          `\n❌ Failed to sync Notion for ${orgId}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 Notion Summary:`);
    console.log(`   Integrations: ${stats.notion.integrations}`);
    console.log(`   ✅ Success: ${stats.notion.success}`);
    console.log(`   ❌ Failed: ${stats.notion.failed}`);
    console.log(`   Pages: ${stats.notion.pagesProcessed}`);
    console.log(`${"=".repeat(60)}\n`);
  } catch (error) {
    console.error("\n❌ Fatal error in Notion sync:", error);
  }
}

/**
 * Main entry point
 */
async function main() {
  const stats: SyncStats = {
    slack: {
      integrations: 0,
      success: 0,
      failed: 0,
      messagesProcessed: 0,
    },
    notion: {
      integrations: 0,
      success: 0,
      failed: 0,
      pagesProcessed: 0,
    },
    github: {
      integrations: 0,
      success: 0,
      failed: 0,
      reposProcessed: 0,
      commitsProcessed: 0,
    },
    startTime: Date.now(),
  };

  console.log("\n" + "=".repeat(70));
  console.log("🚀 RAILWAY CRON - INTEGRATION SYNC");
  console.log("=".repeat(70));
  console.log(`⏰ Started at: ${new Date().toLocaleString()}`);
  console.log("=".repeat(70));

  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    console.error("\n❌ Configuration error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Initialize vector service
  vectorService.initialize();

  // Sync Slack integrations (don't exit on failure)
  await syncSlack(stats);

  // Sync Notion integrations (don't exit on failure)
  await syncNotion(stats);

  // Sync GitHub integrations (don't exit on failure)
  await syncGithub(stats);

  // Final summary
  stats.endTime = Date.now();
  const durationSeconds = Math.round((stats.endTime - stats.startTime) / 1000);

  console.log("\n" + "=".repeat(70));
  console.log("🎉 SYNC COMPLETE");
  console.log("=".repeat(70));
  console.log(`⏰ Finished at: ${new Date().toLocaleString()}`);
  console.log(`⏱️  Duration: ${durationSeconds}s`);
  console.log("");
  console.log(`📢 Slack:`);
  console.log(`   Integrations: ${stats.slack.integrations}`);
  console.log(`   ✅ Success: ${stats.slack.success}`);
  console.log(`   ❌ Failed: ${stats.slack.failed}`);
  console.log(`   Messages: ${stats.slack.messagesProcessed}`);
  console.log("");
  console.log(`📝 Notion:`);
  console.log(`   Integrations: ${stats.notion.integrations}`);
  console.log(`   ✅ Success: ${stats.notion.success}`);
  console.log(`   ❌ Failed: ${stats.notion.failed}`);
  console.log(`   Pages: ${stats.notion.pagesProcessed}`);
  console.log("");
  console.log(`🐙 GitHub:`);
  console.log(`   Integrations: ${stats.github.integrations}`);
  console.log(`   ✅ Success: ${stats.github.success}`);
  console.log(`   ❌ Failed: ${stats.github.failed}`);
  console.log(`   Repos: ${stats.github.reposProcessed}`);
  console.log(`   Commits: ${stats.github.commitsProcessed}`);
  console.log("=".repeat(70) + "\n");

  // Exit with appropriate code (required for Railway cron)
  const totalFailed = stats.slack.failed + stats.notion.failed + stats.github.failed;
  process.exit(totalFailed > 0 ? 1 : 0);
}

main();
