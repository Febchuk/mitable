const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 60 * 24;
const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7;
const MINUTES_PER_MONTH = MINUTES_PER_DAY * 30;
const MINUTES_PER_YEAR = MINUTES_PER_DAY * 365;

export function formatTopLevelDuration(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));

  if (safeMinutes < MINUTES_PER_HOUR) {
    return `${safeMinutes}m`;
  }

  if (safeMinutes < MINUTES_PER_DAY) {
    const hours = Math.floor(safeMinutes / MINUTES_PER_HOUR);
    const minutes = safeMinutes % MINUTES_PER_HOUR;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }

  if (safeMinutes < MINUTES_PER_WEEK * 2) {
    return `${Math.round(safeMinutes / MINUTES_PER_DAY)}d`;
  }

  if (safeMinutes < MINUTES_PER_MONTH * 2) {
    return `${Math.round(safeMinutes / MINUTES_PER_WEEK)}w`;
  }

  if (safeMinutes < MINUTES_PER_YEAR) {
    return `${Math.round(safeMinutes / MINUTES_PER_MONTH)}mo`;
  }

  return `${Math.round(safeMinutes / MINUTES_PER_YEAR)}y`;
}

export function topLevelDurationLabel(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));

  if (safeMinutes < MINUTES_PER_HOUR) {
    return "Minutes recorded";
  }

  if (safeMinutes < MINUTES_PER_DAY) {
    return "Hours recorded";
  }

  if (safeMinutes < MINUTES_PER_WEEK * 2) {
    return "Days recorded";
  }

  if (safeMinutes < MINUTES_PER_MONTH * 2) {
    return "Weeks recorded";
  }

  if (safeMinutes < MINUTES_PER_YEAR) {
    return "Months recorded";
  }

  return "Years recorded";
}
