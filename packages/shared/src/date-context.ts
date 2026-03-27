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

/**
 * Resolve a natural-language date expression into a concrete date range.
 * Used as a tool the LLM can call for complex expressions.
 */
export function resolveDateExpression(
  expression: string,
  timezone: string
): { start_date: string; end_date: string; interpretation: string } | { error: string } {
  const ctx = buildDateContext(timezone);
  const expr = expression.toLowerCase().trim();

  if (expr === "today") {
    return { start_date: ctx.today, end_date: ctx.today, interpretation: `Today (${ctx.today})` };
  }
  if (expr === "yesterday") {
    return {
      start_date: ctx.yesterday,
      end_date: ctx.yesterday,
      interpretation: `Yesterday (${ctx.yesterday})`,
    };
  }
  if (expr === "this week" || expr === "current week") {
    return {
      start_date: ctx.thisWeek.start,
      end_date: ctx.thisWeek.end,
      interpretation: `This week: ${ctx.thisWeek.start} to ${ctx.thisWeek.end}`,
    };
  }
  if (expr === "last week" || expr === "previous week") {
    return {
      start_date: ctx.lastWeek.start,
      end_date: ctx.lastWeek.end,
      interpretation: `Last week: ${ctx.lastWeek.start} to ${ctx.lastWeek.end}`,
    };
  }
  if (expr === "this month" || expr === "current month") {
    return {
      start_date: ctx.thisMonth.start,
      end_date: ctx.thisMonth.end,
      interpretation: `This month: ${ctx.thisMonth.start} to ${ctx.thisMonth.end}`,
    };
  }
  if (expr === "last month" || expr === "previous month") {
    return {
      start_date: ctx.lastMonth.start,
      end_date: ctx.lastMonth.end,
      interpretation: `Last month: ${ctx.lastMonth.start} to ${ctx.lastMonth.end}`,
    };
  }

  // "last N days/weeks/months"
  const lastNMatch = expr.match(/^last\s+(\d+)\s+(day|days|week|weeks|month|months)$/);
  if (lastNMatch) {
    const n = parseInt(lastNMatch[1]!, 10);
    const unit = lastNMatch[2]!;
    const now = new Date(ctx.today + "T12:00:00");

    if (unit.startsWith("day")) {
      const start = new Date(now);
      start.setDate(now.getDate() - (n - 1));
      return {
        start_date: toYMD(start, timezone),
        end_date: ctx.today,
        interpretation: `Last ${n} days: ${toYMD(start, timezone)} to ${ctx.today}`,
      };
    }
    if (unit.startsWith("week")) {
      const start = new Date(now);
      start.setDate(now.getDate() - n * 7);
      return {
        start_date: toYMD(start, timezone),
        end_date: ctx.today,
        interpretation: `Last ${n} weeks: ${toYMD(start, timezone)} to ${ctx.today}`,
      };
    }
    if (unit.startsWith("month")) {
      const start = new Date(now);
      start.setMonth(now.getMonth() - n);
      return {
        start_date: toYMD(start, timezone),
        end_date: ctx.today,
        interpretation: `Last ${n} months: ${toYMD(start, timezone)} to ${ctx.today}`,
      };
    }
  }

  // "N weeks/months ago"
  const agoMatch = expr.match(/^(\d+)\s+(week|weeks|month|months)\s+ago$/);
  if (agoMatch) {
    const n = parseInt(agoMatch[1]!, 10);
    const unit = agoMatch[2]!;
    const now = new Date(ctx.today + "T12:00:00");

    if (unit.startsWith("week")) {
      const weekStart = new Date(now);
      const dayIdx = weekStart.getDay();
      const mondayOffset = dayIdx === 0 ? -6 : 1 - dayIdx;
      weekStart.setDate(weekStart.getDate() + mondayOffset - n * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return {
        start_date: toYMD(weekStart, timezone),
        end_date: toYMD(weekEnd, timezone),
        interpretation: `${n} week(s) ago: ${toYMD(weekStart, timezone)} to ${toYMD(weekEnd, timezone)}`,
      };
    }
    if (unit.startsWith("month")) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - n, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - n + 1, 0);
      return {
        start_date: toYMD(monthStart, timezone),
        end_date: toYMD(monthEnd, timezone),
        interpretation: `${n} month(s) ago: ${toYMD(monthStart, timezone)} to ${toYMD(monthEnd, timezone)}`,
      };
    }
  }

  // "since YYYY-MM-DD" or "since Month Day"
  const sinceMatch = expr.match(/^since\s+(.+)$/);
  if (sinceMatch) {
    const parsed = new Date(sinceMatch[1]!);
    if (!isNaN(parsed.getTime())) {
      return {
        start_date: toYMD(parsed, timezone),
        end_date: ctx.today,
        interpretation: `Since ${toYMD(parsed, timezone)} to ${ctx.today}`,
      };
    }
  }

  // "YYYY-MM-DD to YYYY-MM-DD"
  const rangeMatch = expr.match(/^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/);
  if (rangeMatch) {
    return {
      start_date: rangeMatch[1]!,
      end_date: rangeMatch[2]!,
      interpretation: `${rangeMatch[1]} to ${rangeMatch[2]}`,
    };
  }

  // "week of YYYY-MM-DD" or "week of Month Day"
  const weekOfMatch = expr.match(/^(?:the\s+)?week\s+of\s+(.+)$/);
  if (weekOfMatch) {
    const parsed = new Date(weekOfMatch[1]!);
    if (!isNaN(parsed.getTime())) {
      const dayIdx = parsed.getDay();
      const mondayOffset = dayIdx === 0 ? -6 : 1 - dayIdx;
      const monday = new Date(parsed);
      monday.setDate(parsed.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        start_date: toYMD(monday, timezone),
        end_date: toYMD(sunday, timezone),
        interpretation: `Week of ${toYMD(parsed, timezone)}: ${toYMD(monday, timezone)} to ${toYMD(sunday, timezone)}`,
      };
    }
  }

  return {
    error: `Could not parse date expression: "${expression}". Try formats like: "last week", "last 3 months", "since 2026-01-15", "week of March 10", or "2026-03-01 to 2026-03-15".`,
  };
}
