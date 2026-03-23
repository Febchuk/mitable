type TimeFilter = "yesterday" | "week" | "month" | "ytd" | "all";

const MINUTES_PER_HOUR = 60;

// ── Compact format (used by PersonDetail and other compact contexts) ──

export function formatTopLevelDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < MINUTES_PER_HOUR) return `${m}m`;
  const hours = Math.floor(m / MINUTES_PER_HOUR);
  const mins = m % MINUTES_PER_HOUR;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

// ── Human-readable "X hours Y minutes" ──

function formatHoursMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < MINUTES_PER_HOUR) return `${m}`;
  const hours = Math.floor(m / MINUTES_PER_HOUR);
  const mins = m % MINUTES_PER_HOUR;
  if (mins === 0) return `${hours}`;
  return `${hours}h ${mins}m`;
}

// ── Weeks covered by each filter ──

function weeksForFilter(filter: TimeFilter): number {
  switch (filter) {
    case "month":
      return 4;
    case "ytd": {
      const now = new Date();
      const jan1 = new Date(now.getFullYear(), 0, 1);
      const days = Math.max(1, Math.floor((now.getTime() - jan1.getTime()) / 86_400_000));
      return Math.max(1, days / 7);
    }
    case "all":
      return 52;
    default:
      return 1;
  }
}

// ── Filter-aware display value ──
// totalMinutes is the TEAM total (sum of all users).
// For per-week filters we show the per-person weekly average.

export function formatDashboardDuration(
  totalMinutes: number,
  filter: TimeFilter,
  userCount = 1
): string {
  const isPerWeek = filter === "month" || filter === "ytd" || filter === "all";
  const people = Math.max(1, userCount);

  if (isPerWeek) {
    const perPersonPerWeek = totalMinutes / people / weeksForFilter(filter);
    return formatHoursMinutes(perPersonPerWeek);
  }

  const perPerson = totalMinutes / people;
  return formatHoursMinutes(perPerson);
}

// ── Filter-aware label ──

export function dashboardDurationLabel(
  totalMinutes: number,
  filter: TimeFilter,
  userCount = 1
): string {
  const isPerWeek = filter === "month" || filter === "ytd" || filter === "all";
  const people = Math.max(1, userCount);

  if (isPerWeek) {
    const perPersonPerWeek = totalMinutes / people / weeksForFilter(filter);
    return perPersonPerWeek < MINUTES_PER_HOUR ? "Minutes per week" : "Hours per week";
  }

  const perPerson = totalMinutes / people;
  return perPerson < MINUTES_PER_HOUR ? "Minutes recorded" : "Hours recorded";
}
