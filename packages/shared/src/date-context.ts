/**
 * Date Context Utilities
 *
 * Provides timezone-aware date calculations for agent prompts and tools.
 * Ensures LLMs never have to do date math — all relative expressions
 * are resolved to concrete YYYY-MM-DD ranges deterministically.
 */

interface DateRange {
  start: string;
  end: string;
}

interface DateContext {
  timezone: string;
  today: string;
  dayOfWeek: string;
  yesterday: string;
  thisWeek: DateRange;
  lastWeek: DateRange;
  thisMonth: DateRange;
  lastMonth: DateRange;
  last7Days: DateRange;
  last14Days: DateRange;
  last30Days: DateRange;
  last90Days: DateRange;
}

function toYMD(date: Date, tz: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: tz });
}

function getDayOfWeek(date: Date, tz: string): string {
  return date.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
}

function getLocalDate(tz: string): Date {
  const localStr = new Date().toLocaleString("en-US", { timeZone: tz });
  return new Date(localStr);
}

/**
 * Build a full date context object for a given timezone.
 * All dates are in the user's local timezone.
 */
export function buildDateContext(timezone: string): DateContext {
  const now = getLocalDate(timezone);
  const today = toYMD(new Date(), timezone);
  const dayOfWeek = getDayOfWeek(new Date(), timezone);

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);

  // This week: Monday through Sunday containing today
  const dayIdx = now.getDay(); // 0=Sun, 1=Mon...
  const mondayOffset = dayIdx === 0 ? -6 : 1 - dayIdx;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + mondayOffset);
  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);

  // Last week
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);

  // This month
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Last month
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  // Rolling windows
  const days7 = new Date(now);
  days7.setDate(now.getDate() - 6);
  const days14 = new Date(now);
  days14.setDate(now.getDate() - 13);
  const days30 = new Date(now);
  days30.setDate(now.getDate() - 29);
  const days90 = new Date(now);
  days90.setDate(now.getDate() - 89);

  return {
    timezone,
    today,
    dayOfWeek,
    yesterday: toYMD(yesterdayDate, timezone),
    thisWeek: { start: toYMD(thisMonday, timezone), end: toYMD(thisSunday, timezone) },
    lastWeek: { start: toYMD(lastMonday, timezone), end: toYMD(lastSunday, timezone) },
    thisMonth: { start: toYMD(thisMonthStart, timezone), end: toYMD(thisMonthEnd, timezone) },
    lastMonth: { start: toYMD(lastMonthStart, timezone), end: toYMD(lastMonthEnd, timezone) },
    last7Days: { start: toYMD(days7, timezone), end: today },
    last14Days: { start: toYMD(days14, timezone), end: today },
    last30Days: { start: toYMD(days30, timezone), end: today },
    last90Days: { start: toYMD(days90, timezone), end: today },
  };
}

/**
 * Format a DateContext into a prompt-friendly string block.
 */
export function formatDateContextForPrompt(ctx: DateContext): string {
  return `<date_reference timezone="${ctx.timezone}">
Today: ${ctx.today} (${ctx.dayOfWeek})
Yesterday: ${ctx.yesterday}
This week (Mon–Sun): ${ctx.thisWeek.start} to ${ctx.thisWeek.end}
Last week (Mon–Sun): ${ctx.lastWeek.start} to ${ctx.lastWeek.end}
This month: ${ctx.thisMonth.start} to ${ctx.thisMonth.end}
Last month: ${ctx.lastMonth.start} to ${ctx.lastMonth.end}
Last 7 days: ${ctx.last7Days.start} to ${ctx.last7Days.end}
Last 14 days: ${ctx.last14Days.start} to ${ctx.last14Days.end}
Last 30 days: ${ctx.last30Days.start} to ${ctx.last30Days.end}
Last 90 days: ${ctx.last90Days.start} to ${ctx.last90Days.end}
</date_reference>`;
}
