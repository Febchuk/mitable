#!/usr/bin/env tsx
/**
 * Slack Sync Script - Uses SlackChunkingService for thread-aware chunking
 *
 * This script syncs Slack messages using the new ingestion pipeline:
 * 1. Fetches messages from Slack API
 * 2. Uses SlackChunkingService for intelligent thread-aware chunking
 * 3. Generates embeddings and stores in Pinecone + PostgreSQL
 *
 * Usage:
 *   npm run sync-slack
 */

import { db } from "../db/client.js";
import { integrations } from "../db/schema/integrations.schema.js";
import { eq } from "drizzle-orm";
import { slackIngestionService } from "../services/slack-ingestion.service.js";
import { vectorService } from "../domains/shared-infra/services/vector.service.js";
import { validateConfig } from "../config.js";

async function main() {
  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    console.error("❌ Configuration error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Initialize vector service (required for ingestion)
  vectorService.initialize();

  console.log("\n🚀 Starting Slack sync with thread-aware chunking\n");

  try {
    // Get Slack integration
    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.provider, "slack"))
      .limit(1);

    if (!integration) {
      console.error("❌ No Slack integration found");
      process.exit(1);
    }

    const orgId = integration.organizationId;

    console.log(`📦 Organization: ${orgId}`);
    console.log();

    // Use slackIngestionService which calls SlackChunkingService
    const result = await slackIngestionService.syncMessages(orgId, (progress) => {
      // Progress callback
      if (progress.currentChannel) {
        console.log(
          `📱 [${progress.channelsProcessed + 1}/${progress.totalChannels}] ${progress.currentChannel}`
        );
      }
    });

    console.log();
    console.log("============================================================");
    console.log("✅ Sync Complete!");
    console.log("============================================================");
    console.log(`Channels processed: ${result.channelsProcessed}`);
    console.log(`Messages embedded: ${result.messagesEmbedded}`);
    console.log(`Total messages: ${result.totalMessages}`);
    console.log(`Duration: ${(result.duration / 1000).toFixed(1)}s`);
    console.log("============================================================");
    console.log();
    console.log("💡 Tip: Messages are now searchable with thread context!");
    console.log();

    // Close database connection
    await db.$client.end();
    process.exit(0);
  } catch (error) {
    console.error();
    console.error("❌ Sync failed:", error);
    console.error();

    if (error instanceof Error) {
      console.error("Error details:", error.message);
      if (error.stack) {
        console.error("Stack trace:", error.stack);
      }
    }

    process.exit(1);
  }
}

main();
