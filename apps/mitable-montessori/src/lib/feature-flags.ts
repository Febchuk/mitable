/**
 * Feature flag helpers. All flags must be read through these accessors so the
 * source of truth stays in one place and we can swap the backing store later
 * (env var → remote config / per-org toggle) without touching call sites.
 */

// function readPublicFlag(name: string): boolean {
//   const raw = process.env[name];
//   return raw === "1" || raw === "true";
// }

export const featureFlags = {};
