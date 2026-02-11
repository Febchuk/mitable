/**
 * Locale-aware date formatting utilities.
 *
 * Uses the browser's navigator.language to automatically format dates
 * in the user's local convention (e.g. "Nov 5" in the US, "5 Nov" in Nigeria/UK).
 */

export function getLocale(): string {
  return navigator.language || "en-US";
}

/**
 * Format a date string as a short date (e.g. "Nov 5" or "5 Nov").
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(getLocale(), {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a date string as a weekday + short date (e.g. "Mon, Nov 5" or "Mon, 5 Nov").
 */
export function formatDateWithWeekday(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(getLocale(), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a date string as time only (e.g. "2:30 PM" or "14:30").
 */
export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString(getLocale(), {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format a date string as a short date + time (e.g. "Nov 5 • 2:30 PM").
 */
export function formatDateTime(dateString: string): string {
  return `${formatDate(dateString)} • ${formatTime(dateString)}`;
}

/**
 * Format a date string as a full date (e.g. "November 5, 2026" or "5 November 2026").
 */
export function formatFullDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(getLocale(), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format a date string as a short numeric date (e.g. "11/5/2026" or "5/11/2026").
 */
export function formatShortDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(getLocale());
}

/**
 * Format a Date object or timestamp as time (e.g. "2:30 PM" or "14:30").
 */
export function formatTimeFromDate(date: Date): string {
  return date.toLocaleTimeString(getLocale(), {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format a Date object as a full date + time.
 */
export function formatFullDateTime(date: Date): string {
  return date.toLocaleString(getLocale(), {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
