/**
 * Backfill script: Patch activity blocks where subscriberName is missing or
 * incorrectly attributed, but the block name or topicName mentions a known customer.
 *
 * Three passes:
 *   1. Blocks with null subscriberName where topicName matches a known customer
 *   2. Blocks with null subscriberName where block name matches a known customer
 *   3. Blocks where subscriberName is the org's own name but topic/name matches an external customer
 *
 * After patching, re-runs recalculateDailyStats for each affected day.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.production npx tsx -r dotenv/config src/scripts/backfill-subscriber-from-topic.ts
 *   ORG_ID=<uuid> DOTENV_CONFIG_PATH=.env.production npx tsx -r dotenv/config src/scripts/backfill-subscriber-from-topic.ts
 */
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import { getKnownCustomers, getOrgName } from "../services/known-customers.service.js";
import { recalculateDailyStats } from "../services/activity-materializer.service.js";

const ORG_ID = process.env.ORG_ID || "7dd3c9f5-6c0a-479a-aa7d-34aa278ccc49";

async function main() {
  console.log(`Backfilling subscriber attribution for org: ${ORG_ID}`);

  // 1. Fetch known customers and org name
  const [knownCustomers, orgName] = await Promise.all([
    getKnownCustomers(ORG_ID),
    getOrgName(ORG_ID),
  ]);
  console.log(`Org name: ${orgName}`);
  console.log(`Known customers (${knownCustomers.length}):`, knownCustomers);

  if (knownCustomers.length === 0) {
    console.log("No known customers — nothing to backfill.");
    process.exit(0);
  }

  // 2. Fetch all blocks for this org's users
  const orgUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.organizationId, ORG_ID));

  if (orgUsers.length === 0) {
    console.log("No users found for this org.");
    process.exit(0);
  }

  const userIds = orgUsers.map((u) => u.id);

  const allBlocks = await db
    .select({
      id: schema.activityBlocks.id,
      name: schema.activityBlocks.name,
      topicName: schema.activityBlocks.topicName,
      subscriberName: schema.activityBlocks.subscriberName,
      dailyActivityId: schema.activityBlocks.dailyActivityId,
      durationMinutes: schema.activityBlocks.durationMinutes,
    })
    .from(schema.activityBlocks)
    .where(
      sql`${schema.activityBlocks.userId} IN (${sql.join(
        userIds.map((id) => sql`${id}::uuid`),
        sql`, `
      )})`
    );

  console.log(`Total blocks: ${allBlocks.length}`);

  function findCustomerMatch(text: string): string | undefined {
    const lower = text.toLowerCase();
    return knownCustomers.find((c) => lower.includes(c.toLowerCase()));
  }

  let patchedCount = 0;
  const affectedDailyIds = new Set<string>();

  for (const block of allBlocks) {
    const topicMatch = block.topicName ? findCustomerMatch(block.topicName) : undefined;
    const nameMatch = findCustomerMatch(block.name);
    const bestMatch = topicMatch || nameMatch;

    if (!bestMatch) continue;

    const currentSub = block.subscriberName as string | null;
    const isOrgName = currentSub && orgName && currentSub.toLowerCase() === orgName.toLowerCase();
    const needsUpdate = !currentSub || isOrgName;

    if (needsUpdate) {
      console.log(
        `  PATCH: "${block.name}" — topic: ${block.topicName || "null"}, ` +
          `subscriber: ${currentSub || "null"} → ${bestMatch}`
      );

      await db
        .update(schema.activityBlocks)
        .set({ subscriberName: bestMatch })
        .where(eq(schema.activityBlocks.id, block.id));

      affectedDailyIds.add(block.dailyActivityId);
      patchedCount++;
    }
  }

  console.log(`\nPatched ${patchedCount} blocks`);
  console.log(`Affected daily activities: ${affectedDailyIds.size}`);

  // 4. Re-materialize stats for each affected daily activity
  let rematerialized = 0;
  for (const dailyId of affectedDailyIds) {
    try {
      await recalculateDailyStats(dailyId, db, knownCustomers);
      rematerialized++;
      console.log(`  Recalculated: ${dailyId}`);
    } catch (err) {
      console.error(`  Failed to recalculate ${dailyId}:`, err);
    }
  }

  console.log(`\nRe-materialized ${rematerialized}/${affectedDailyIds.size} daily activities`);
  console.log("Done!");
  process.exit(0);
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
