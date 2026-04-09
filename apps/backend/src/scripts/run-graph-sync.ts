/**
 * Manual Graph Sync Runner
 *
 * Usage:
 *   npm run graph:sync
 */
import { graphSyncService } from "../domains/integrations/graph/graph-sync.service";

async function run() {
  const startedAt = Date.now();

  try {
    console.log("🚀 Starting graph sync...\n");
    const result = await graphSyncService.runNightlySync();

    if (!result.success) {
      console.error("❌ Graph sync failed");
      console.error(result.error || "Unknown error");
      process.exitCode = 1;
      return;
    }

    console.log("✅ Graph sync completed");
    console.log(`  - Synced users: ${result.syncedUsers}`);
    console.log(`  - Synced workstreams: ${result.syncedWorkstreams}`);
    console.log(`  - Synced preferences: ${result.syncedPreferences}`);
    console.log(
      `  - Synced app behaviors: ${"syncedAppBehaviors" in result ? (result as any).syncedAppBehaviors : "n/a"}`
    );
    console.log(
      `  - Synced patterns: ${"syncedPatterns" in result ? (result as any).syncedPatterns : "n/a"}`
    );
    console.log(`  - Duration: ${result.durationMs}ms`);
    console.log(`  - Started: ${result.startedAt}`);
    console.log(`  - Finished: ${result.finishedAt}`);
    if ("pipelineStats" in result && (result as any).pipelineStats) {
      const stats = (result as any).pipelineStats;
      console.log(`  - Pipeline: ${stats.rawEventCount} raw → ${stats.afterDedupeCount} deduped`);
      console.log(`  - Stage timings:`, stats.stageTimingsMs);
    }
  } catch (error) {
    console.error("❌ Graph sync runner failed:", error);
    process.exitCode = 1;
  } finally {
    const totalMs = Date.now() - startedAt;
    console.log(`\nDone in ${totalMs}ms`);
  }
}

run().catch((error) => {
  console.error("❌ Unhandled graph sync runner error:", error);
  process.exit(1);
});
