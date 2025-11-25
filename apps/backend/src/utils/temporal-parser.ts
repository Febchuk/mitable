/**
 * Temporal Query Parser
 * 
 * Extracts temporal expressions from natural language queries and converts them to date ranges.
 * Examples:
 * - "this week" → Monday to today
 * - "today" → start of day to now
 * - "last month" → first day of previous month to last day of previous month
 * - "last 7 days" → 7 days ago to now
 */

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
    const lowerQuery = query.toLowerCase();
    const now = new Date();

    // Pattern: "this week"
    if (lowerQuery.includes("this week")) {
      return this.getThisWeek(now);
    }

    // Pattern: "today"
    if (lowerQuery.includes("today")) {
      return this.getToday(now);
    }

    // Pattern: "yesterday"
    if (lowerQuery.includes("yesterday")) {
      return this.getYesterday(now);
    }

    // Pattern: "this month"
    if (lowerQuery.includes("this month")) {
      return this.getThisMonth(now);
    }

    // Pattern: "last week"
    if (lowerQuery.includes("last week")) {
      return this.getLastWeek(now);
    }

    // Pattern: "last month"
    if (lowerQuery.includes("last month")) {
      return this.getLastMonth(now);
    }

    // Pattern: "last X days" (e.g., "last 7 days", "last 30 days")
    const lastDaysMatch = lowerQuery.match(/last (\d+) days?/);
    if (lastDaysMatch) {
      const days = parseInt(lastDaysMatch[1]);
      return this.getLastNDays(now, days);
    }

    // Pattern: "past X days"
    const pastDaysMatch = lowerQuery.match(/past (\d+) days?/);
    if (pastDaysMatch) {
      const days = parseInt(pastDaysMatch[1]);
      return this.getLastNDays(now, days);
    }

    // Pattern: "last X hours"
    const lastHoursMatch = lowerQuery.match(/last (\d+) hours?/);
    if (lastHoursMatch) {
      const hours = parseInt(lastHoursMatch[1]);
      return this.getLastNHours(now, hours);
    }

    // No temporal expression found
    return null;
  }

  /**
   * Get date range for "this week" (Monday to today)
   */
  private getThisWeek(now: Date): TemporalRange {
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Sunday

    const monday = new Date(now);
    monday.setDate(now.getDate() - daysFromMonday);
    monday.setHours(0, 0, 0, 0);

    return {
      dateFrom: monday,
      dateTo: now,
      expression: "this week",
    };
  }

  /**
   * Get date range for "today" (start of day to now)
   */
  private getToday(now: Date): TemporalRange {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    return {
      dateFrom: startOfDay,
      dateTo: now,
      expression: "today",
    };
  }

  /**
   * Get date range for "yesterday"
   */
  private getYesterday(now: Date): TemporalRange {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    return {
      dateFrom: yesterday,
      dateTo: endOfYesterday,
      expression: "yesterday",
    };
  }

  /**
   * Get date range for "this month" (first day of month to now)
   */
  private getThisMonth(now: Date): TemporalRange {
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    return {
      dateFrom: firstDayOfMonth,
      dateTo: now,
      expression: "this month",
    };
  }

  /**
   * Get date range for "last week" (previous Monday to Sunday)
   */
  private getLastWeek(now: Date): TemporalRange {
    const dayOfWeek = now.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // This week's Monday
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - daysFromMonday);
    thisMonday.setHours(0, 0, 0, 0);

    // Last week's Monday
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);

    // Last week's Sunday
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);

    return {
      dateFrom: lastMonday,
      dateTo: lastSunday,
      expression: "last week",
    };
  }

  /**
   * Get date range for "last month"
   */
  private getLastMonth(now: Date): TemporalRange {
    const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    firstDayOfLastMonth.setHours(0, 0, 0, 0);

    const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    lastDayOfLastMonth.setHours(23, 59, 59, 999);

    return {
      dateFrom: firstDayOfLastMonth,
      dateTo: lastDayOfLastMonth,
      expression: "last month",
    };
  }

  /**
   * Get date range for "last N days"
   */
  private getLastNDays(now: Date, days: number): TemporalRange {
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    return {
      dateFrom: startDate,
      dateTo: now,
      expression: `last ${days} days`,
    };
  }

  /**
   * Get date range for "last N hours"
   */
  private getLastNHours(now: Date, hours: number): TemporalRange {
    const startDate = new Date(now);
    startDate.setHours(now.getHours() - hours);

    return {
      dateFrom: startDate,
      dateTo: now,
      expression: `last ${hours} hours`,
    };
  }
}

export const temporalQueryParser = new TemporalQueryParser();
