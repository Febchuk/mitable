/**
 * Inactivity Trigger
 *
 * DEPRECATED: The Day Analyzer RLM pipeline is no longer used.
 * The Block Analyzer (per-session) + Granola/Fireflies sync handle all
 * activity block creation. These stubs are kept for API compatibility
 * but do nothing.
 */

import { createLogger } from "../../lib/logger";

const logger = createLogger({ context: "inactivity-trigger" });

/** @deprecated No-op — Day Analyzer pipeline removed */
export function scheduleInactivityRollup(_userId: string): void {
  logger.debug("scheduleInactivityRollup is deprecated (Day Analyzer removed)");
}

/** @deprecated No-op — Day Analyzer pipeline removed */
export function cancelInactivityRollup(_userId: string): void {}

/** @deprecated Always returns 0 */
export function getPendingInactivityCount(): number {
  return 0;
}
