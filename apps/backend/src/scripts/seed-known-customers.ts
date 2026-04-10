/**
 * Seed known customers for an organization from existing activity_blocks data.
 *
 * Scans all distinct subscriberName values in activity_blocks for the org,
 * deduplicates with normalizeName(), and writes to organizations.settings.knownCustomers.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.production npx tsx -r dotenv/config src/scripts/seed-known-customers.ts
 *
 * Optionally set ORG_ID env var (defaults to Lorikeet).
 */
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, sql, isNotNull } from "drizzle-orm";
import { normalizeName } from "../domains/auth/services/normalize-name.js";

const ORG_ID = process.env.ORG_ID || "7dd3c9f5-6c0a-479a-aa7d-34aa278ccc49"; // Lorikeet

async function main() {
  console.log(
    "DB:",
    process.env.DATABASE_URL?.includes("lbudgeprqnhellzakkvy") ? "PROD (lbud)" : "DEV"
  );
  console.log(`Seeding known customers for org: ${ORG_ID}\n`);

  // Find all users in this org
  const orgUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.organizationId, ORG_ID));

  const userIds = orgUsers.map((u) => u.id);
  console.log(`Found ${userIds.length} users in org`);

  if (userIds.length === 0) {
    console.log("No users found — nothing to seed.");
    process.exit(0);
  }

  // Get all distinct subscriber names from activity_blocks for these users
  const rows = await db
    .selectDistinct({ subscriberName: schema.activityBlocks.subscriberName })
    .from(schema.activityBlocks)
    .where(
      sql`${schema.activityBlocks.userId} IN (${sql.join(
        userIds.map((id) => sql`${id}::uuid`),
        sql`, `
      )}) AND ${isNotNull(schema.activityBlocks.subscriberName)}`
    );

  const rawNames = rows
    .map((r) => r.subscriberName)
    .filter((n): n is string => !!n && n.trim().length > 0);

  console.log(`Found ${rawNames.length} raw subscriber names from activity_blocks`);

  // Deduplicate using normalizeName — keep the longest display form per normalized key
  const normalizedMap = new Map<string, string>();
  for (const name of rawNames) {
    const key = normalizeName(name);
    const existing = normalizedMap.get(key);
    if (!existing || name.length > existing.length) {
      normalizedMap.set(key, name);
    }
  }

  const dedupedNames = [...normalizedMap.values()].sort();
  console.log(`Deduplicated to ${dedupedNames.length} unique customers:`);
  for (const name of dedupedNames) {
    console.log(`  - ${name}`);
  }

  // Fetch current org settings
  const [org] = await db
    .select({ settings: schema.organizations.settings })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, ORG_ID))
    .limit(1);

  if (!org) {
    console.error("Organization not found!");
    process.exit(1);
  }

  const settings = (org.settings as Record<string, unknown>) || {};
  const existingCustomers = Array.isArray(settings.knownCustomers) ? settings.knownCustomers : [];
  const existingNormalized = new Set((existingCustomers as string[]).map((n) => normalizeName(n)));

  const toAdd = dedupedNames.filter((n) => !existingNormalized.has(normalizeName(n)));
  const merged = [...(existingCustomers as string[]), ...toAdd];

  console.log(`\nExisting known customers: ${existingCustomers.length}`);
  console.log(`New customers to add: ${toAdd.length}`);
  console.log(`Total after merge: ${merged.length}`);

  if (toAdd.length === 0) {
    console.log("\nNo new customers to add — already up to date.");
    process.exit(0);
  }

  // Write back to org settings
  await db
    .update(schema.organizations)
    .set({
      settings: { ...settings, knownCustomers: merged },
      updatedAt: new Date(),
    })
    .where(eq(schema.organizations.id, ORG_ID));

  console.log(`\nSeeded ${merged.length} known customers for org ${ORG_ID}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
