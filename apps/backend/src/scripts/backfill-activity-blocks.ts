/**
 * Backfill Activity Blocks
 *
 * One-time script to materialize all existing ended sessions into the
 * user_daily_activities + activity_blocks tables.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-activity-blocks.ts [--org <orgId>] [--dry-run]
 *
 * Flags:
 *   --org <orgId>   Only backfill sessions for a specific organization
 *   --dry-run       Count sessions that would be processed without writing
 */

import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, and, inArray, desc } from "drizzle-orm";
import { materializeSession } from "../domains/sessions/services/activity-materializer.service";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const orgIdx = args.indexOf("--org");
  const orgId = orgIdx !== -1 ? args[orgIdx + 1] : undefined;

  console.log("=== Backfill Activity Blocks ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (orgId) console.log(`Org filter: ${orgId}`);

  // Fetch all ended/ready/delivered sessions
  const conditions = [inArray(schema.monitoringSessions.status, ["ended", "ready", "delivered"])];
  if (orgId) {
    conditions.push(eq(schema.monitoringSessions.organizationId, orgId));
  }

  const sessions = await db
    .select({
      id: schema.monitoringSessions.id,
      userId: schema.monitoringSessions.userId,
      organizationId: schema.monitoringSessions.organizationId,
      startedAt: schema.monitoringSessions.startedAt,
      endedAt: schema.monitoringSessions.endedAt,
      name: schema.monitoringSessions.name,
    })
    .from(schema.monitoringSessions)
    .where(and(...conditions))
    .orderBy(desc(schema.monitoringSessions.startedAt));

  console.log(`Found ${sessions.length} ended sessions to process`);

  if (dryRun) {
    // Group by org for summary
    const byOrg = new Map<string, number>();
    for (const s of sessions) {
      byOrg.set(s.organizationId, (byOrg.get(s.organizationId) || 0) + 1);
    }
    console.log("\nSessions by org:");
    for (const [org, count] of byOrg) {
      console.log(`  ${org}: ${count} sessions`);
    }
    console.log("\nDry run complete. No data written.");
    process.exit(0);
  }

  let processed = 0;
  const skipped = 0;
  let failed = 0;

  for (const session of sessions) {
    try {
      await materializeSession(session.id);
      processed++;

      if (processed % 50 === 0) {
        console.log(
          `  Progress: ${processed}/${sessions.length} processed, ${skipped} skipped, ${failed} failed`
        );
      }
    } catch (error) {
      failed++;
      console.error(
        `  Failed to materialize session ${session.id}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log("\n=== Backfill Complete ===");
  console.log(`Processed: ${processed}`);
  console.log(`Skipped (already materialized): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${sessions.length}`);

  process.exit(0);
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
