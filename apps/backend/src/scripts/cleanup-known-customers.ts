/**
 * Remove org's own name and product name from known customers.
 */
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { normalizeName } from "../services/normalize-name.js";

const ORG_ID = process.env.ORG_ID || "7dd3c9f5-6c0a-479a-aa7d-34aa278ccc49";
const REMOVE = ["lorikeet", "mitable", "internal", "unattributed", "internal/unattributed"];

async function main() {
  const [org] = await db
    .select({ settings: schema.organizations.settings, name: schema.organizations.name })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, ORG_ID))
    .limit(1);

  const settings = (org?.settings as Record<string, unknown>) || {};
  const existing = (settings.knownCustomers as string[]) || [];
  console.log("Org name:", org?.name);
  console.log("Before:", existing);

  const removeSet = new Set(REMOVE.map((r) => normalizeName(r)));
  const filtered = existing.filter((c) => !removeSet.has(normalizeName(c)));
  console.log("After:", filtered);
  console.log(
    "Removed:",
    existing.filter((c) => removeSet.has(normalizeName(c)))
  );

  await db
    .update(schema.organizations)
    .set({ settings: { ...settings, knownCustomers: filtered }, updatedAt: new Date() })
    .where(eq(schema.organizations.id, ORG_ID));

  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
