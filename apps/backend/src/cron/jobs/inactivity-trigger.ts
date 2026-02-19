/**
 * Inactivity Trigger
 *
 * Schedules a delayed full Day Analyzer RLM run for a user after their
 * last session ends. If the user starts a new session within the delay
 * window (30 min), the timer resets. This gives admins same-day access
 * to rich activity details in the Ask tab, rather than waiting until midnight.
 *
 * Usage: call `scheduleInactivityRollup(userId)` from the session-end handler.
 * The nightly 00:05 fallback still runs for all users as a safety net.
 */

import { db } from "../../db/client";
import * as schema from "../../db/schema/index";
import { eq, and, gte, lte } from "drizzle-orm";
import { processUserDay } from "./user-rollup.job";
import { createLogger } from "../../lib/logger";

const logger = createLogger({ context: "inactivity-trigger" });

const INACTIVITY_DELAY_MS = 30 * 60 * 1000; // 30 minutes

// In-memory map of userId → pending timer
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedule a delayed Day Analyzer RLM run for a user.
 * If a timer already exists for this user, it's reset (debounced).
 * When the timer fires, it checks for active sessions before proceeding.
 */
export function scheduleInactivityRollup(userId: string): void {
  // Cancel any existing timer for this user (debounce)
  const existing = pendingTimers.get(userId);
  if (existing) {
    clearTimeout(existing);
    logger.debug({ userId }, "Reset inactivity timer (new session ended)");
  }

  const timer = setTimeout(async () => {
    pendingTimers.delete(userId);

    try {
      // Check if the user has any active sessions right now
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const activeSessions = await db
        .select({ id: schema.monitoringSessions.id })
        .from(schema.monitoringSessions)
        .where(
          and(
            eq(schema.monitoringSessions.userId, userId),
            eq(schema.monitoringSessions.status, "active"),
            gte(schema.monitoringSessions.startedAt, today),
            lte(schema.monitoringSessions.startedAt, tomorrow)
          )
        )
        .limit(1);

      if (activeSessions.length > 0) {
        logger.debug({ userId }, "User has active sessions — skipping inactivity rollup");
        return;
      }

      // No active sessions — run the full Day Analyzer RLM for this user
      const todayStr = today.toISOString().split("T")[0]!;
      logger.info({ userId, date: todayStr }, "Running inactivity-triggered Day Analyzer RLM");

      const result = await processUserDay(userId, today, todayStr);
      logger.info({ userId, result }, "Inactivity-triggered rollup completed");
    } catch (error) {
      logger.error({ userId, error: String(error) }, "Inactivity-triggered rollup failed");
    }
  }, INACTIVITY_DELAY_MS);

  pendingTimers.set(userId, timer);
  logger.debug({ userId, delayMs: INACTIVITY_DELAY_MS }, "Scheduled inactivity rollup");
}

/**
 * Cancel a pending inactivity timer for a user.
 * Call this when a user starts a new session to prevent premature rollup.
 */
export function cancelInactivityRollup(userId: string): void {
  const existing = pendingTimers.get(userId);
  if (existing) {
    clearTimeout(existing);
    pendingTimers.delete(userId);
    logger.debug({ userId }, "Cancelled inactivity timer (new session started)");
  }
}

/**
 * Get the number of pending inactivity timers (for observability).
 */
export function getPendingInactivityCount(): number {
  return pendingTimers.size;
}
