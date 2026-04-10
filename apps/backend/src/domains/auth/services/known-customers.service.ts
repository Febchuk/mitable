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

import { db } from "../../../db/client.js";
import * as schema from "../../../db/schema/index.js";
import { eq } from "drizzle-orm";
import { normalizeName } from "./normalize-name.js";
import { createLogger } from "../../shared-infra/lib/logger.js";

const logger = createLogger({ context: "known-customers" });

/** Names that should never appear as external customers */
const EXCLUDED_SUBSCRIBER_NAMES = new Set([
  "internal",
  "unattributed",
  "internal/unattributed",
  "internal / unattributed",
  "n/a",
  "none",
  "unknown",
  "self",
]);

function isExcludedName(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  if (EXCLUDED_SUBSCRIBER_NAMES.has(normalized)) return true;
  const collapsed = normalized.replace(/\s+/g, "");
  return EXCLUDED_SUBSCRIBER_NAMES.has(collapsed);
}

/**
 * Fetch the known customers list for an organization.
 * Automatically excludes the org's own name (not an external customer).
 */
export async function getKnownCustomers(organizationId: string): Promise<string[]> {
  const [org] = await db
    .select({ settings: schema.organizations.settings, name: schema.organizations.name })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  const settings = (org?.settings as Record<string, unknown>) || {};
  const customers = settings.knownCustomers;
  if (!Array.isArray(customers)) return [];

  const orgNameNormalized = org?.name ? normalizeName(org.name) : "";

  return customers.filter(
    (c): c is string =>
      typeof c === "string" &&
      !isExcludedName(c) &&
      (orgNameNormalized === "" || normalizeName(c) !== orgNameNormalized)
  );
}

/**
 * Fetch the org name for use in prompt context (so LLMs know what's internal).
 */
export async function getOrgName(organizationId: string): Promise<string | null> {
  const [org] = await db
    .select({ name: schema.organizations.name })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  return org?.name || null;
}

/**
 * Auto-discover and persist newly found customer names.
 * Deduplicates against existing names using normalizeName().
 * Filters out the org's own name and excluded names.
 */
export async function addDiscoveredCustomers(
  organizationId: string,
  newNames: string[]
): Promise<void> {
  if (newNames.length === 0) return;

  const [org] = await db
    .select({ settings: schema.organizations.settings, name: schema.organizations.name })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);

  const settings = (org?.settings as Record<string, unknown>) || {};
  const existing = Array.isArray(settings.knownCustomers)
    ? (settings.knownCustomers as string[]).filter((c) => typeof c === "string")
    : [];
  const existingNormalized = new Set(existing.map((n) => normalizeName(n)));
  const orgNameNormalized = org?.name ? normalizeName(org.name) : "";

  const toAdd = newNames.filter(
    (n) =>
      n &&
      !isExcludedName(n) &&
      !existingNormalized.has(normalizeName(n)) &&
      (orgNameNormalized === "" || normalizeName(n) !== orgNameNormalized)
  );
  if (toAdd.length === 0) return;

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
