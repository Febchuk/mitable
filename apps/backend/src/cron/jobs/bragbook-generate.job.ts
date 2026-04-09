/**
 * Bragbook Generation Job
 *
 * Generates AI-polished bragbook entries for all users with sessions
 * in the just-completed period. Runs on cron schedule:
 *   Weekly:    Mondays at 03:00 UTC
 *   Monthly:   1st of month at 03:00 UTC
 *   Quarterly: 1st of Jan/Apr/Jul/Oct at 03:00 UTC
 */

import { generateForAllUsers } from "../../services/bragbook-generator.service.js";
import { createLogger } from "../../domains/shared-infra/lib/logger.js";

const logger = createLogger({ context: "bragbook-generate-job" });

type PeriodType = "weekly" | "monthly" | "quarterly";

function formatDateStr(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

/**
 * Compute the just-completed period's start and end dates.
 * Called on schedule, so "just completed" means the period ending yesterday/last week.
 */
function getLastCompletedPeriod(periodType: PeriodType): { start: string; end: string } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  switch (periodType) {
    case "weekly": {
      // Last week: Monday to Sunday
      const dayOfWeek = now.getDay();
      const lastSunday = new Date(now);
      lastSunday.setDate(now.getDate() - (dayOfWeek === 0 ? 7 : dayOfWeek));
      const lastMonday = new Date(lastSunday);
      lastMonday.setDate(lastSunday.getDate() - 6);
      return { start: formatDateStr(lastMonday), end: formatDateStr(lastSunday) };
    }
    case "monthly": {
      // Last month
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
      return { start: formatDateStr(lastMonthStart), end: formatDateStr(lastMonthEnd) };
    }
    case "quarterly": {
      // Last quarter
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const lastQuarterStart = new Date(
        currentQuarter === 0 ? now.getFullYear() - 1 : now.getFullYear(),
        currentQuarter === 0 ? 9 : (currentQuarter - 1) * 3,
        1
      );
      const lastQuarterEnd = new Date(
        lastQuarterStart.getFullYear(),
        lastQuarterStart.getMonth() + 3,
        0
      );
      return { start: formatDateStr(lastQuarterStart), end: formatDateStr(lastQuarterEnd) };
    }
  }
}

export async function runBragbookGenerateJob(periodTypes: PeriodType[]): Promise<{
  usersProcessed: number;
  usersSkipped: number;
  usersFailed: number;
  totalTimeMs: number;
}> {
  const startTime = Date.now();
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const periodType of periodTypes) {
    const { start, end } = getLastCompletedPeriod(periodType);

    logger.info({ periodType, start, end }, "Starting bragbook generation");

    try {
      const result = await generateForAllUsers(periodType, start, end);
      totalProcessed += result.usersProcessed;
      totalSkipped += result.usersSkipped;
      totalFailed += result.usersFailed;

      logger.info({ periodType, ...result }, "Bragbook generation completed for period");
    } catch (error) {
      logger.error({ error: String(error), periodType }, "Bragbook generation failed for period");
      totalFailed++;
    }
  }

  return {
    usersProcessed: totalProcessed,
    usersSkipped: totalSkipped,
    usersFailed: totalFailed,
    totalTimeMs: Date.now() - startTime,
  };
}
