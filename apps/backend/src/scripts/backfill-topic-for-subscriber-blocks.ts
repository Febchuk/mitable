/**
 * Backfill topicName on blocks that have a subscriber but null topicName.
 * Assigns topics based on block name patterns.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.production npx tsx -r dotenv/config src/scripts/backfill-topic-for-subscriber-blocks.ts
 */
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import { getKnownCustomers } from "../domains/auth/services/known-customers.service.js";
import { recalculateDailyStats } from "../domains/sessions/services/activity-materializer.service.js";

const ORG_ID = process.env.ORG_ID || "7dd3c9f5-6c0a-479a-aa7d-34aa278ccc49";

// Map block name patterns to topic names
const TOPIC_RULES: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /flex voice/i, topic: "Flex Voice POC" },
  { pattern: /flex.*a\/b|nlw.*flex/i, topic: "Flex Voice POC" },
  { pattern: /flex.*architecture/i, topic: "Flex Voice POC" },
  { pattern: /flex.*ticket|ticket.*flex/i, topic: "Flex Ticket Feedback" },
  { pattern: /ext-ticket-feedback-flex/i, topic: "Flex Ticket Feedback" },
  { pattern: /founderscard|founders.?card/i, topic: "FoundersCard Support" },
];

function inferTopic(blockName: string): string | null {
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(blockName)) return rule.topic;
  }
  return null;
}

async function main() {
  console.log(`Backfilling topicName for subscriber blocks in org: ${ORG_ID}`);

  const knownCustomers = await getKnownCustomers(ORG_ID);

  const orgUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.organizationId, ORG_ID));

  const userIds = orgUsers.map((u) => u.id);

  // Find blocks with subscriber set but no topic
  const blocks = await db
    .select({
      id: schema.activityBlocks.id,
      name: schema.activityBlocks.name,
      subscriberName: schema.activityBlocks.subscriberName,
      dailyActivityId: schema.activityBlocks.dailyActivityId,
    })
    .from(schema.activityBlocks)
    .where(
      sql`${schema.activityBlocks.userId} IN (${sql.join(
        userIds.map((id) => sql`${id}::uuid`),
        sql`, `
      )})
      AND ${schema.activityBlocks.subscriberName} IS NOT NULL
      AND ${schema.activityBlocks.topicName} IS NULL`
    );

  console.log(`Found ${blocks.length} blocks with subscriber but no topic`);

  let patchedCount = 0;
  const affectedDailyIds = new Set<string>();

  for (const block of blocks) {
    const topic = inferTopic(block.name);
    if (topic) {
      console.log(`  PATCH: "${block.name}" → topic: "${topic}"`);
      await db
        .update(schema.activityBlocks)
        .set({ topicName: topic })
        .where(eq(schema.activityBlocks.id, block.id));
      affectedDailyIds.add(block.dailyActivityId);
      patchedCount++;
    } else {
      console.log(`  SKIP (no rule): "${block.name}"`);
    }
  }

  console.log(`\nPatched ${patchedCount} blocks`);

  // Recalculate affected daily activities
  for (const dailyId of affectedDailyIds) {
    await recalculateDailyStats(dailyId, db, knownCustomers);
    console.log(`  Recalculated: ${dailyId}`);
  }

  console.log("Done!");
  process.exit(0);
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
