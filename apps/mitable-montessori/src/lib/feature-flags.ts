/**
 * Feature flag helpers. All flags must be read through these accessors so the
 * source of truth stays in one place and we can swap the backing store later
 * (env var → remote config / per-org toggle) without touching call sites.
 */

function readPublicFlag(name: string): boolean {
  const raw = process.env[name];
  return raw === "1" || raw === "true";
}

export const featureFlags = {
  /** Reports v2 redesign — tri-tab list, AI score, layout A/C, send-for-review drawer. */
  reportsV2: () => readPublicFlag("NEXT_PUBLIC_FF_REPORTS_V2"),
};
