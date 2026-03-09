/**
 * Temporal Query Parser
 *
 * Extracts temporal expressions from natural language queries and converts them to date ranges.
 *
 * Hybrid strategy:
 * 1. chrono-node for explicit date ranges (e.g. "March 3 to March 7")
 * 2. Keyword matching for relative phrases (chrono returns single dates for these)
 * 3. chrono-node single-date fallback for specific days/months
 *
 * Examples:
 * - "this week" → Monday to today
 * - "today" → start of day to end of day
 * - "last month" → first day of previous month to last day
 * - "last 7 days" → 7 days ago to now
 * - "March 3 to March 7" → explicit range
 * - "from Feb 24 to March 2" → explicit range
 * - "in February" → entire month
 */

import * as chrono from "chrono-node";

export interface TemporalRange {
  dateFrom?: Date;
  dateTo?: Date;
  expression?: string; // The matched expression (for logging)
}

export class TemporalQueryParser {
  /**
   * Parse a query for temporal expressions and return date range
   */
  parse(query: string): TemporalRange | null {
    const now = new Date();
    const lowerQuery = query.toLowerCase();

    // --- Priority 1: chrono-node for explicit date ranges ---
    const chronoResults = chrono.parse(query, now);

    // Range detected (start + end in single expression)
    if (chronoResults.length === 1 && chronoResults[0].end) {
      const dateFrom = new Date(chronoResults[0].start.date());
      dateFrom.setHours(0, 0, 0, 0);
      const dateTo = new Date(chronoResults[0].end.date());
      dateTo.setHours(23, 59, 59, 999);
      return { dateFrom, dateTo, expression: chronoResults[0].text };
    }

    // Two separate date expressions → treat as range
    if (chronoResults.length >= 2) {
      const first = chronoResults[0].start.date();
      const last = chronoResults[chronoResults.length - 1].start.date();
      const dateFrom = new Date(first < last ? first : last);
      dateFrom.setHours(0, 0, 0, 0);
      const dateTo = new Date(first < last ? last : first);
      dateTo.setHours(23, 59, 59, 999);
      return {
        dateFrom,
        dateTo,
        expression: chronoResults.map((r) => r.text).join(" to "),
      };
    }

    // --- Priority 2: Keyword matching for relative phrases ---

    // "last N days" / "past N days"
    const nDaysMatch = lowerQuery.match(/(?:last|past)\s+(\d+)\s+days?/);
    if (nDaysMatch) {
      const days = parseInt(nDaysMatch[1]);
      const dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - days);
      dateFrom.setHours(0, 0, 0, 0);
      return { dateFrom, dateTo: now, expression: `last ${days} days` };
    }

    // "last N weeks" / "past N weeks"
    const nWeeksMatch = lowerQuery.match(/(?:last|past)\s+(\d+)\s+weeks?/);
    if (nWeeksMatch) {
      const weeks = parseInt(nWeeksMatch[1]);
      const dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - weeks * 7);
      dateFrom.setHours(0, 0, 0, 0);
      return { dateFrom, dateTo: now, expression: `last ${weeks} weeks` };
    }

    // "last N hours"
    const nHoursMatch = lowerQuery.match(/(?:last|past)\s+(\d+)\s+hours?/);
    if (nHoursMatch) {
      const hours = parseInt(nHoursMatch[1]);
      const dateFrom = new Date(now);
      dateFrom.setHours(dateFrom.getHours() - hours);
      return { dateFrom, dateTo: now, expression: `last ${hours} hours` };
    }

    // "this week"
    if (lowerQuery.includes("this week")) {
      return { ...this.getWeekRange(now, 0), expression: "this week" };
    }

    // "last week"
    if (lowerQuery.includes("last week")) {
      return { ...this.getWeekRange(now, -1), expression: "last week" };
    }

    // "today"
    if (lowerQuery.includes("today")) {
      const dateFrom = new Date(now);
      dateFrom.setHours(0, 0, 0, 0);
      return { dateFrom, dateTo: now, expression: "today" };
    }

    // "yesterday"
    if (lowerQuery.includes("yesterday")) {
      const dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 1);
      dateFrom.setHours(0, 0, 0, 0);
      const dateTo = new Date(dateFrom);
      dateTo.setHours(23, 59, 59, 999);
      return { dateFrom, dateTo, expression: "yesterday" };
    }

    // "this month"
    if (lowerQuery.includes("this month")) {
      const dateFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { dateFrom, dateTo: now, expression: "this month" };
    }

    // "last month"
    if (lowerQuery.includes("last month")) {
      const dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const dateTo = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { dateFrom, dateTo, expression: "last month" };
    }

    // --- Priority 3: chrono single-date fallback ---
    if (chronoResults.length === 1) {
      const parsed = chronoResults[0];
      const parsedDate = parsed.start.date();
      const hasDay = parsed.start.isCertain("day");
      const hasMonth = parsed.start.isCertain("month");

      if (hasDay) {
        const dateFrom = new Date(parsedDate);
        dateFrom.setHours(0, 0, 0, 0);
        const dateTo = new Date(parsedDate);
        dateTo.setHours(23, 59, 59, 999);
        return { dateFrom, dateTo, expression: parsed.text };
      }

      if (hasMonth && !hasDay) {
        const year = parsed.start.get("year") || now.getFullYear();
        const month = parsed.start.get("month")! - 1;
        const dateFrom = new Date(year, month, 1, 0, 0, 0, 0);
        const dateTo = new Date(year, month + 1, 0, 23, 59, 59, 999);
        return { dateFrom, dateTo, expression: parsed.text };
      }

      const dateFrom = new Date(parsedDate);
      dateFrom.setHours(0, 0, 0, 0);
      return { dateFrom, dateTo: now, expression: parsed.text };
    }

    return null;
  }

  /**
   * Get Monday-Sunday range for current week (offset=0) or previous weeks (offset=-1, etc.)
   */
  private getWeekRange(now: Date, weekOffset: number): { dateFrom: Date; dateTo: Date } {
    const dayOfWeek = now.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const monday = new Date(now);
    monday.setDate(now.getDate() - daysFromMonday + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);

    if (weekOffset === 0) {
      // Current week: Monday to now
      return { dateFrom: monday, dateTo: now };
    }

    // Past weeks: Monday to Sunday
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { dateFrom: monday, dateTo: sunday };
  }
}

export const temporalQueryParser = new TemporalQueryParser();
