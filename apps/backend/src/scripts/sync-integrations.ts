#!/usr/bin/env tsx
// Combined Integration Sync Script for Railway Cron
//
// Syncs ALL active integrations (Slack + Notion + GitHub) in one run.
// Designed to be executed by Railway cron jobs every 6 hours.
//
// Usage: npm run sync-integrations
// Railway Cron Schedule: 0 */6 * * * (every 6 hours)
//
// Features:
// - Incremental syncs for Slack, Notion, and GitHub
// - Graceful error handling (logs failures, continues execution)
// - Structured logging with timestamps
// - Clean exit after completion

import { db } from "../db/client.js";
import { integrations } from "../db/schema/integrations.schema.js";
import { searchContent } from "../db/schema/search-content.schema.js";
import { eq, desc } from "drizzle-orm";
import { WebClient } from "@slack/web-api";
import { ingestionService } from "../services/ingestion.service.js";
import { vectorService } from "../services/vector.service.js";
import { validateConfig } from "../config.js";
import { encryptionService } from "../services/encryption.service.js";
import { githubSyncService } from "../services/github-sync.service.js";

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
    prsProcessed: number;
    issuesProcessed: number;
  };
  startTime: number;
  endTime?: number;
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
      const metadata = integration.metadata as any;
      const selectedChannels: string[] = metadata?.selected_channels || [];

      console.log(`\n${"─".repeat(60)}`);
      console.log(`📦 Organization: ${orgId}`);

      try {
        // Decrypt the access token
        if (!integration.accessTokenEncrypted) {
          throw new Error("No Slack access token found");
        }
        
        const token = encryptionService.decrypt(integration.accessTokenEncrypted);

        if (selectedChannels.length === 0) {
          console.log("⏭️  No channels selected - skipping");
          continue;
        }

        // Find latest message timestamp for incremental sync
        const [latestMessage] = await db
          .select({ timestamp: searchContent.timestamp })
          .from(searchContent)
          .where(eq(searchContent.source, "slack"))
          .orderBy(desc(searchContent.timestamp))
          .limit(1);

        let oldestTimestamp: number | undefined;
        let syncMode = "full";

        if (latestMessage && latestMessage.timestamp) {
          oldestTimestamp = Math.floor(latestMessage.timestamp / 1000);
          syncMode = "incremental";
          const lastSyncDate = new Date(latestMessage.timestamp);
          console.log(`🔄 Sync Mode: ${syncMode}`);
          console.log(`📅 Last sync: ${lastSyncDate.toLocaleString()}`);
        } else {
          console.log(`🔄 Sync Mode: ${syncMode} (first sync)`);
        }

        console.log(`📊 Channels: ${selectedChannels.length}`);
        console.log(`${"─".repeat(60)}`);

        const client = new WebClient(token);
        let totalMessages = 0;

        for (const channelId of selectedChannels) {
          try {
            console.log(`\n📥 Fetching messages from ${channelId}...`);

            let hasMore = true;
            let cursor: string | undefined;
            let channelMessages = 0;

            while (hasMore) {
              const result = await client.conversations.history({
                channel: channelId,
                cursor,
                limit: 100,
                oldest: oldestTimestamp?.toString(),
              });

              const messages = result.messages || [];
              channelMessages += messages.length;

              if (!result.has_more) {
                hasMore = false;
              } else {
                cursor = result.response_metadata?.next_cursor;
              }

              // Break if no new messages
              if (messages.length === 0) {
                hasMore = false;
              }
            }

            totalMessages += channelMessages;
            console.log(`   ✅ ${channelMessages} messages fetched`);
          } catch (error) {
            console.error(
              `   ❌ Failed to fetch ${channelId}:`,
              error instanceof Error ? error.message : error
            );
          }
        }

        stats.slack.messagesProcessed += totalMessages;
        stats.slack.success++;

        console.log(`\n✅ Slack sync complete for ${orgId}`);
        console.log(`   Total messages: ${totalMessages}`);
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
      const lastSyncedAt = integration.lastSyncedAt ? new Date(integration.lastSyncedAt) : null;
      const syncMode = lastSyncedAt ? "incremental" : "full";

      console.log(`\n${"─".repeat(60)}`);
      console.log(`📦 Organization: ${orgId}`);
      console.log(`🔄 Sync Mode: ${syncMode}`);

      if (lastSyncedAt) {
        console.log(`📅 Last synced: ${lastSyncedAt.toLocaleString()}`);
      } else {
        console.log(`📅 First sync - fetching all data`);
      }

      console.log(`${"─".repeat(60)}`);

      try {
        const result = await githubSyncService.syncIntegration(integration);

        stats.github.reposProcessed += result.reposProcessed;
        stats.github.commitsProcessed += result.commitsProcessed;
        stats.github.prsProcessed += result.prsProcessed;
        stats.github.issuesProcessed += result.issuesProcessed;
        stats.github.success++;

        console.log(`\n✅ GitHub sync complete for ${orgId}`);
        console.log(`   Repos: ${result.reposProcessed}`);
        console.log(`   Commits: ${result.commitsProcessed}`);
        console.log(`   PRs: ${result.prsProcessed}`);
        console.log(`   Issues: ${result.issuesProcessed}`);

        if (result.reposSkipped > 0) {
          console.log(`   ⏭️  Repos skipped: ${result.reposSkipped}`);
        }
      } catch (error) {
        stats.github.failed++;
        console.error(
          `\n❌ Failed to sync GitHub for ${orgId}:`,
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
    console.log(`   PRs: ${stats.github.prsProcessed}`);
    console.log(`   Issues: ${stats.github.issuesProcessed}`);
    console.log(`${"=".repeat(60)}\n`);
  } catch (error) {
    console.error("\n❌ Fatal error in GitHub sync:", error);
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
      prsProcessed: 0,
      issuesProcessed: 0,
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
  console.log(`   PRs: ${stats.github.prsProcessed}`);
  console.log(`   Issues: ${stats.github.issuesProcessed}`);
  console.log("=".repeat(70) + "\n");

  // Exit with appropriate code
  const totalFailed = stats.slack.failed + stats.notion.failed + stats.github.failed;
  process.exit(totalFailed > 0 ? 1 : 0);
}

main();
