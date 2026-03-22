const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface DateGroup<T> {
  label: string;
  items: T[];
}

/**
 * Groups items by day with human-readable labels:
 *   Today, Yesterday, day names for rest of this week, then "Mar 10" style dates.
 *
 * Items must already be sorted newest-first.
 */
export function groupByDay<T>(items: T[], getDate: (item: T) => Date | string): DateGroup<T>[] {
  if (!items.length) return [];

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);

  const startOfWeek = new Date(today);
  const dayOfWeek = startOfWeek.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(startOfWeek.getDate() - mondayOffset);

  const groupMap = new Map<string, T[]>();
  const groupOrder: string[] = [];

  for (const item of items) {
    const raw = getDate(item);
    const d = typeof raw === "string" ? new Date(raw) : raw;
    const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const ts = itemDay.getTime();

    let label: string;

    if (ts >= today.getTime()) {
      label = "Today";
    } else if (ts >= yesterday.getTime()) {
      label = "Yesterday";
    } else if (ts >= startOfWeek.getTime()) {
      label = DAY_NAMES[itemDay.getDay()];
    } else {
      label = `${MONTH_NAMES[itemDay.getMonth()]} ${itemDay.getDate()}`;
    }

    const existing = groupMap.get(label);
    if (existing) {
      existing.push(item);
    } else {
      groupMap.set(label, [item]);
      groupOrder.push(label);
    }
  }

  return groupOrder.map((label) => ({
    label,
    items: groupMap.get(label)!,
  }));
}
