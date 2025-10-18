#!/usr/bin/env tsx
/**
 * Manual Slack Sync Script
 *
 * Triggers a manual sync of Slack messages for an organization.
 *
 * Usage:
 *   npm run sync-slack <organizationId>
 *
 * Example:
 *   npm run sync-slack 7c12a697-6f3f-4dc9-a108-f81046cde063
 */

import { ingestionService } from "../services/ingestion.service.js";
import { vectorService } from "../services/vector.service.js";
import { validateConfig } from "../config.js";

async function main() {
  // Validate configuration
  try {
    validateConfig();
  } catch (error) {
    console.error("❌ Configuration error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Initialize vector service
  vectorService.initialize();

  // Get organizationId from command line args
  const organizationId = process.argv[2];

  if (!organizationId) {
    console.error("❌ Usage: npm run sync-slack <organizationId>");
    console.error("Example: npm run sync-slack 7c12a697-6f3f-4dc9-a108-f81046cde063");
    process.exit(1);
  }

  console.log(`\n🚀 Starting Slack sync for organization: ${organizationId}\n`);

  try {
    // Run sync with progress reporting
    const result = await ingestionService.syncSlackMessages(organizationId, (progress) => {
      console.log(
        `📊 Progress: ${progress.channelsProcessed}/${progress.totalChannels} channels | ` +
          `${progress.messagesEmbedded} messages embedded | ` +
          `Current: ${progress.currentChannel || "N/A"}`
      );
    });

    // Display results
    console.log("\n" + "=".repeat(60));
    console.log("✅ Sync Complete!");
    console.log("=".repeat(60));
    console.log(`Channels processed: ${result.channelsProcessed}`);
    console.log(`Total messages: ${result.totalMessages}`);
    console.log(`Messages embedded: ${result.messagesEmbedded}`);
    console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s`);

    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${result.errors.length}`);
      result.errors.forEach((error, idx) => {
        console.log(`  ${idx + 1}. ${error}`);
      });
    }

    console.log("=".repeat(60) + "\n");

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error("\n❌ Sync failed:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.cause) {
      console.error("Caused by:", error.cause);
    }
    process.exit(1);
  }
}

// Run the script
main();
