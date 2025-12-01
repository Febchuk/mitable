/**
 * Backfill conversation summaries for existing conversations
 *
 * Run with: npm run backfill-summaries
 *
 * Options:
 * - --dry-run: Only log what would be done without actually summarizing
 * - --min-messages=N: Only summarize conversations with at least N messages (default: 8)
 * - --batch-size=N: Process N conversations at a time (default: 10)
 */

import { memoryService } from "../services/memory.service.js";
import minimist from "minimist";

async function main() {
  const args = minimist(process.argv.slice(2));

  const options = {
    dryRun: args["dry-run"] || false,
    minMessages: args["min-messages"] ? parseInt(args["min-messages"], 10) : undefined,
    batchSize: args["batch-size"] ? parseInt(args["batch-size"], 10) : undefined,
  };

  console.log("\n🚀 Starting conversation summary backfill...\n");
  console.log("Options:", options);
  console.log("");

  try {
    const result = await memoryService.backfillSummaries(options);

    console.log("\n✅ Backfill complete!\n");
    console.log("Summary:");
    console.log(`  - Processed: ${result.processed}`);
    console.log(`  - Summarized: ${result.summarized}`);
    console.log(`  - Skipped (too short): ${result.skipped}`);
    console.log(`  - Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log("\nErrors:");
      result.errors.forEach((error, i) => console.log(`  ${i + 1}. ${error}`));
    }

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Backfill failed:", error);
    process.exit(1);
  }
}

main();
