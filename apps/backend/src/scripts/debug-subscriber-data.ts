/**
 * Debug: list all orgs and their settings/block data
 */
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, sql } from "drizzle-orm";

const ORG_ID = process.env.ORG_ID || "";

async function main() {
  if (!ORG_ID) {
    const orgs = await db
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        settings: schema.organizations.settings,
      })
      .from(schema.organizations);
    console.log("All organizations:");
    for (const o of orgs) {
      const s = (o.settings as Record<string, unknown>) || {};
      const c = Array.isArray(s.knownCustomers) ? s.knownCustomers : [];
      console.log(
        `  ${o.id} — ${o.name || "(no name)"} — ${c.length} known customers: ${JSON.stringify(c)}`
      );
    }
    process.exit(0);
  }

  const [org] = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      settings: schema.organizations.settings,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, ORG_ID))
    .limit(1);

  console.log("Org:", org?.name, "Settings:", JSON.stringify(org?.settings));

  const orgUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.organizationId, ORG_ID));
  const userIds = orgUsers.map((u) => u.id);
  console.log(`Users: ${userIds.length}`);

  if (userIds.length > 0) {
    const blocks = await db
      .select({
        id: schema.activityBlocks.id,
        name: schema.activityBlocks.name,
        topicName: schema.activityBlocks.topicName,
        subscriberName: schema.activityBlocks.subscriberName,
        durationMinutes: schema.activityBlocks.durationMinutes,
      })
      .from(schema.activityBlocks)
      .where(
        sql`${schema.activityBlocks.userId} IN (${sql.join(
          userIds.map((id) => sql`${id}::uuid`),
          sql`, `
        )})`
      );
    console.log(`Blocks: ${blocks.length}`);
    for (const b of blocks) {
      console.log(
        `  ${b.name} (${b.durationMinutes}min) — topic: ${b.topicName || "null"}, sub: ${b.subscriberName || "null"}`
      );
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
