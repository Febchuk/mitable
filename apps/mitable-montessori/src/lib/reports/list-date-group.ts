/**
 * Granola-style list section headers for reports (and similar activity lists).
 */

export type ReportListDateInput = {
  updatedAt: string;
  reportDate?: string | null;
  createdAt: string;
};

function pickActivityIso(row: ReportListDateInput): string {
  if (row.updatedAt) return row.updatedAt;
  if (row.reportDate) return row.reportDate;
  return row.createdAt;
}

function startOfCalendarDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function calendarDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Monday-start week bucket for same-week grouping (locale-stable). */
function weekBucket(d: Date): string {
  const day = startOfCalendarDay(d);
  const dow = day.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(day);
  monday.setDate(day.getDate() + mondayOffset);
  return calendarDayKey(monday);
}

/**
 * Section header for a report row's last-activity timestamp.
 * Today → Yesterday → day name (same week) → localized date (earlier weeks).
 */
export function getReportListDateGroupLabel(
  iso: string,
  now: Date = new Date(),
  locale = "en-US"
): string {
  const activity = new Date(iso);
  if (Number.isNaN(activity.getTime())) return "";

  const today = startOfCalendarDay(now);
  const activityDay = startOfCalendarDay(activity);
  const dayDiff = Math.round((today.getTime() - activityDay.getTime()) / 86_400_000);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";

  if (weekBucket(activity) === weekBucket(now)) {
    return activity.toLocaleDateString(locale, { weekday: "long" });
  }

  return activity.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}

export type DateGroupedSection<T extends ReportListDateInput> = {
  label: string;
  items: T[];
};

/** Newest activity first; section order follows first item in each group. */
export function groupReportsByDateLabel<T extends ReportListDateInput>(
  rows: T[],
  opts?: { now?: Date; locale?: string }
): DateGroupedSection<T>[] {
  const now = opts?.now ?? new Date();
  const locale = opts?.locale ?? "en-US";

  const sorted = [...rows].sort(
    (a, b) => new Date(pickActivityIso(b)).getTime() - new Date(pickActivityIso(a)).getTime()
  );

  const sections: DateGroupedSection<T>[] = [];
  const indexByLabel = new Map<string, number>();

  for (const row of sorted) {
    const label = getReportListDateGroupLabel(pickActivityIso(row), now, locale);
    const existing = indexByLabel.get(label);
    if (existing !== undefined) {
      sections[existing].items.push(row);
    } else {
      indexByLabel.set(label, sections.length);
      sections.push({ label, items: [row] });
    }
  }

  return sections;
}
