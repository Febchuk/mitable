/**
 * Known Customers Service
 *
 * Manages a per-org list of known customer/subscriber names stored in
 * organizations.settings.knownCustomers (JSONB). All classification stages
 * (classifySession, capture-rollup Groq, Day Analyzer RLM) query this
 * list to bias subscriber identification toward known names.
 *
 * New customers discovered by any stage are auto-appended, creating a
 * flywheel: more sessions → more customers discovered → better identification.
 */

import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { normalizeName } from "./normalize-name.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ context: "known-customers" });

/**
 * Fetch the known customers list for an organization.
 */
export async function getKnownCustomers(organizationId: string): Promise<string[]> {
  const [org] = await db
    .select({ settings: schema.organizations.settings })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  const settings = (org?.settings as Record<string, unknown>) || {};
  const customers = settings.knownCustomers;
  return Array.isArray(customers)
    ? customers.filter((c): c is string => typeof c === "string")
    : [];
}

/**
 * Auto-discover and persist newly found customer names.
 * Deduplicates against existing names using normalizeName().
 */
export async function addDiscoveredCustomers(
  organizationId: string,
  newNames: string[]
): Promise<void> {
  if (newNames.length === 0) return;

  const existing = await getKnownCustomers(organizationId);
  const existingNormalized = new Set(existing.map((n) => normalizeName(n)));

  const toAdd = newNames.filter((n) => n && !existingNormalized.has(normalizeName(n)));
  if (toAdd.length === 0) return;

  const [org] = await db
    .select({ settings: schema.organizations.settings })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  const settings = (org?.settings as Record<string, unknown>) || {};
  const updatedCustomers = [...existing, ...toAdd];

  await db
    .update(schema.organizations)
    .set({ settings: { ...settings, knownCustomers: updatedCustomers }, updatedAt: new Date() })
    .where(eq(schema.organizations.id, organizationId));

  logger.info(
    { organizationId, added: toAdd, total: updatedCustomers.length },
    "Auto-discovered new customers"
  );
}
