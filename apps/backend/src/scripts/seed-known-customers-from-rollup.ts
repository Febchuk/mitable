/**
 * Quick script to seed known customers from existing subscriberBreakdown
 * and activity_blocks data (already computed by previous rollups).
 */
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, isNotNull, sql } from "drizzle-orm";
import { normalizeName } from "../domains/auth/services/normalize-name.js";

const ORG_ID = process.env.ORG_ID || "7dd3c9f5-6c0a-479a-aa7d-34aa278ccc49";

async function main() {
  const names = new Set<string>();

  // Get from subscriberBreakdown JSONB in user_daily_activities
  const rows = await db
    .select({ subscriberBreakdown: schema.userDailyActivities.subscriberBreakdown })
    .from(schema.userDailyActivities)
    .where(eq(schema.userDailyActivities.organizationId, ORG_ID));

  for (const r of rows) {
    const subs = r.subscriberBreakdown as Array<{ subscriberName?: string }>;
    if (Array.isArray(subs)) {
      for (const s of subs) {
        if (s.subscriberName && typeof s.subscriberName === "string") {
          names.add(s.subscriberName);
        }
      }
    }
  }

  // Get from activity_blocks
  const orgUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.organizationId, ORG_ID));

  if (orgUsers.length > 0) {
    const userIds = orgUsers.map((u) => u.id);
    const blocks = await db
      .selectDistinct({ subscriberName: schema.activityBlocks.subscriberName })
      .from(schema.activityBlocks)
      .where(
        sql`${schema.activityBlocks.userId} IN (${sql.join(
          userIds.map((id) => sql`${id}::uuid`),
          sql`, `
        )}) AND ${isNotNull(schema.activityBlocks.subscriberName)}`
      );

    for (const b of blocks) {
      if (b.subscriberName) names.add(b.subscriberName);
    }
  }

  console.log("All subscriber names found:", [...names].sort());

  // Deduplicate and merge with existing
  const [org] = await db
    .select({ settings: schema.organizations.settings })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, ORG_ID))
    .limit(1);

  const settings = (org?.settings as Record<string, unknown>) || {};
  const existing = Array.isArray(settings.knownCustomers)
    ? (settings.knownCustomers as string[])
    : [];
  const existingNormalized = new Set(existing.map((n) => normalizeName(n)));

  const toAdd = [...names].filter((n) => !existingNormalized.has(normalizeName(n)));
  const merged = [...existing, ...toAdd];

  console.log(`Existing: ${existing.length}, Adding: ${toAdd.length}, Total: ${merged.length}`);
  console.log("New customers:", toAdd);

  if (toAdd.length > 0) {
    await db
      .update(schema.organizations)
      .set({ settings: { ...settings, knownCustomers: merged }, updatedAt: new Date() })
      .where(eq(schema.organizations.id, ORG_ID));
    console.log("Updated known customers:", merged);
  } else {
    console.log("No new customers to add.");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
