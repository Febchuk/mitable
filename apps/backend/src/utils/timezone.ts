/**
 * Timezone Utilities
 *
 * Computes timezone-aware date boundaries for date range parsing.
 * Uses Node.js built-in Intl API — no external dependencies.
 *
 * The core problem: when a user in UTC+1 says "today", the server (UTC)
 * needs to compute midnight-to-midnight in the USER's timezone, then
 * express those boundaries as UTC timestamps for DB queries.
 */

/**
 * Get the UTC offset (in minutes) for a given IANA timezone at a specific instant.
 * Positive = ahead of UTC (e.g., +60 for Africa/Lagos).
 *
 * Uses Intl.DateTimeFormat to handle DST correctly.
 */
export function getTimezoneOffsetMinutes(timezone: string, at: Date = new Date()): number {
  try {
    const utcStr = at.toLocaleString("en-US", { timeZone: "UTC" });
    const tzStr = at.toLocaleString("en-US", { timeZone: timezone });
    return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / (60 * 1000);
  } catch {
    // Invalid timezone string — fall back to UTC (offset 0)
    console.warn(`[Timezone] Invalid timezone "${timezone}", falling back to UTC`);
    return 0;
  }
}

/**
 * Get the current date/time components as seen by a user in the given timezone.
 * Returns { year, month (1-indexed), day, dayOfWeek (0=Sun), hour, minute }.
 */
export function getUserLocalComponents(
  timezone: string,
  at: Date = new Date()
): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    year: parseInt(get("year")),
    month: parseInt(get("month")),
    day: parseInt(get("day")),
    dayOfWeek: dayNames.indexOf(get("weekday")),
    hour: parseInt(get("hour")),
    minute: parseInt(get("minute")),
  };
}

/**
 * Convert a local date/time in a given timezone to a UTC Date object.
 *
 * Example: midnightInTimezone(2026, 3, 9, "Africa/Lagos")
 *   → 2026-03-08T23:00:00.000Z (midnight WAT = 11pm UTC)
 */
export function localToUTC(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timezone: string
): Date {
  // Create a rough UTC estimate, then compute the actual offset at that time
  const rough = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
  const offsetMs = getTimezoneOffsetMinutes(timezone, rough) * 60 * 1000;
  return new Date(rough.getTime() - offsetMs);
}

/**
 * Get start-of-day (00:00:00.000) in a timezone, returned as UTC Date.
 */
export function startOfDayInTimezone(
  year: number,
  month: number,
  day: number,
  timezone: string
): Date {
  return localToUTC(year, month, day, 0, 0, 0, 0, timezone);
}

/**
 * Get end-of-day (23:59:59.999) in a timezone, returned as UTC Date.
 */
export function endOfDayInTimezone(
  year: number,
  month: number,
  day: number,
  timezone: string
): Date {
  return localToUTC(year, month, day, 23, 59, 59, 999, timezone);
}
