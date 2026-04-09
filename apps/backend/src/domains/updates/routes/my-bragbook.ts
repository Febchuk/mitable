/**
 * My Bragbook API Routes
 *
 * Accomplishments are populated by cron (auto-generated) or user edits.
 * GET reads only from bragbook_entries — no runtime aggregation.
 *
 *   - GET    /my-bragbook?view=weekly|monthly|quarterly&count=52
 *   - POST   /my-bragbook/generate  (on-demand generation for a period)
 *   - PUT    /my-bragbook/:periodType/:periodStart
 *   - DELETE /my-bragbook/:periodType/:periodStart
 */

import { Router, Request, Response } from "express";
import { db } from "../../../db/client.js";
import * as schema from "../../../db/schema/index.js";
import { eq, and, gte, lte } from "drizzle-orm";
import { requireAuth } from "../../../middleware/auth.js";
import { createLogger } from "../../shared-infra/lib/logger.js";
import { generateBragbookEntry } from "../services/bragbook-generator.service.js";

const logger = createLogger({ context: "my-bragbook-routes" });
const router = Router();

// ============================================================================
// Period boundary helpers
// ============================================================================

type PeriodType = "weekly" | "monthly" | "quarterly";

function getWeekStart(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getQuarterStart(d: Date): Date {
  const quarter = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), quarter * 3, 1);
}

function getPeriodStart(d: Date, periodType: PeriodType): Date {
  switch (periodType) {
    case "weekly":
      return getWeekStart(d);
    case "monthly":
      return getMonthStart(d);
    case "quarterly":
      return getQuarterStart(d);
  }
}

function getPeriodEnd(periodStart: Date, periodType: PeriodType): Date {
  const end = new Date(periodStart);
  switch (periodType) {
    case "weekly":
      end.setDate(end.getDate() + 6);
      break;
    case "monthly":
      end.setMonth(end.getMonth() + 1);
      end.setDate(end.getDate() - 1);
      break;
    case "quarterly":
      end.setMonth(end.getMonth() + 3);
      end.setDate(end.getDate() - 1);
      break;
  }
  return end;
}

function prevPeriodStart(periodStart: Date, periodType: PeriodType): Date {
  const prev = new Date(periodStart);
  switch (periodType) {
    case "weekly":
      prev.setDate(prev.getDate() - 7);
      break;
    case "monthly":
      prev.setMonth(prev.getMonth() - 1);
      break;
    case "quarterly":
      prev.setMonth(prev.getMonth() - 3);
      break;
  }
  return prev;
}

function formatDateStr(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

function formatPeriodLabel(periodStart: Date, periodEnd: Date, periodType: PeriodType): string {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthsShort = [
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

  switch (periodType) {
    case "weekly": {
      const sameMonth = periodStart.getMonth() === periodEnd.getMonth();
      const startStr = `${monthsShort[periodStart.getMonth()]} ${periodStart.getDate()}`;
      const endStr = sameMonth
        ? `${periodEnd.getDate()}`
        : `${monthsShort[periodEnd.getMonth()]} ${periodEnd.getDate()}`;
      return `${startStr} - ${endStr}, ${periodEnd.getFullYear()}`;
    }
    case "monthly":
      return `${months[periodStart.getMonth()]} ${periodStart.getFullYear()}`;
    case "quarterly": {
      const q = Math.floor(periodStart.getMonth() / 3) + 1;
      return `Q${q} ${periodStart.getFullYear()}`;
    }
  }
}

const VALID_PERIOD_TYPES = new Set<string>(["weekly", "monthly", "quarterly"]);

// ============================================================================
// GET /my-bragbook — reads only from bragbook_entries
// ============================================================================

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const view = (req.query.view as string) || "weekly";
    if (!VALID_PERIOD_TYPES.has(view)) {
      return res.status(400).json({ error: "view must be weekly, monthly, or quarterly" });
    }
    const periodType = view as PeriodType;

    // Build list of periods from Jan 1, 2026 to current period (most recent first)
    const now = new Date();
    const currentPeriodStart = getPeriodStart(now, periodType);
    const epoch = getPeriodStart(new Date(2026, 0, 1), periodType);
    const periods: Array<{ start: Date; end: Date }> = [];

    let cursor = new Date(currentPeriodStart);
    while (cursor >= epoch) {
      const end = getPeriodEnd(cursor, periodType);
      periods.push({ start: new Date(cursor), end });
      cursor = prevPeriodStart(cursor, periodType);
    }

    // Compute overall date range
    const earliestStart = formatDateStr(periods[periods.length - 1]!.start);
    const latestEnd = formatDateStr(periods[0]!.end);

    // Fetch bragbook entries in range
    const entries = await db
      .select({
        periodStart: schema.bragbookEntries.periodStart,
        accomplishments: schema.bragbookEntries.accomplishments,
        source: schema.bragbookEntries.source,
      })
      .from(schema.bragbookEntries)
      .where(
        and(
          eq(schema.bragbookEntries.userId, userId),
          eq(schema.bragbookEntries.periodType, periodType),
          gte(schema.bragbookEntries.periodStart, earliestStart),
          lte(schema.bragbookEntries.periodStart, latestEnd)
        )
      );

    // Index entries by periodStart
    const entryMap = new Map<string, { accomplishments: string[]; source: string }>();
    for (const entry of entries) {
      entryMap.set(entry.periodStart, {
        accomplishments: entry.accomplishments as string[],
        source: entry.source,
      });
    }

    // Build response — empty accomplishments for periods without entries
    const result = periods.map(({ start, end }) => {
      const key = formatDateStr(start);
      const entry = entryMap.get(key);

      return {
        periodStart: key,
        periodEnd: formatDateStr(end),
        periodLabel: formatPeriodLabel(start, end, periodType),
        accomplishments: entry?.accomplishments ?? [],
        isEdited: entry?.source === "user-edited",
        hasEntry: !!entry,
      };
    });

    return res.json({ periods: result });
  } catch (error) {
    logger.error({ error }, "Failed to fetch bragbook");
    return res.status(500).json({ error: "Failed to fetch bragbook" });
  }
});

// ============================================================================
// POST /my-bragbook/generate — on-demand generation for a period
// ============================================================================

router.post("/generate", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { periodType, periodStart } = req.body;

    if (!periodType || !VALID_PERIOD_TYPES.has(periodType)) {
      return res.status(400).json({ error: "periodType must be weekly, monthly, or quarterly" });
    }
    if (!periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
      return res.status(400).json({ error: "periodStart must be YYYY-MM-DD" });
    }

    // Get user's organizationId
    const user = await db
      .select({ organizationId: schema.users.organizationId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user[0]?.organizationId) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if user-edited entry exists — don't overwrite
    const existing = await db
      .select({ source: schema.bragbookEntries.source })
      .from(schema.bragbookEntries)
      .where(
        and(
          eq(schema.bragbookEntries.userId, userId),
          eq(schema.bragbookEntries.periodType, periodType),
          eq(schema.bragbookEntries.periodStart, periodStart)
        )
      )
      .limit(1);

    if (existing[0]?.source === "user-edited") {
      return res.status(409).json({
        error: "Cannot overwrite user-edited entry. Delete it first to regenerate.",
      });
    }

    // Compute period end
    const startDate = new Date(periodStart + "T00:00:00");
    const endDate = getPeriodEnd(startDate, periodType as PeriodType);
    const periodEnd = formatDateStr(endDate);

    const result = await generateBragbookEntry(
      userId,
      user[0].organizationId,
      periodType,
      periodStart,
      periodEnd
    );

    return res.json({
      accomplishments: result.accomplishments,
      sessionsUsed: result.sessionsUsed,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ err: errMsg, userId: req.userId }, "Failed to generate bragbook entry");
    return res.status(500).json({ error: "Failed to generate bragbook entry" });
  }
});

// ============================================================================
// PUT /my-bragbook/:periodType/:periodStart — user edit (source: "user-edited")
// ============================================================================

router.put("/:periodType/:periodStart", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { periodType, periodStart } = req.params;

    if (!VALID_PERIOD_TYPES.has(periodType!)) {
      return res.status(400).json({ error: "periodType must be weekly, monthly, or quarterly" });
    }
    if (!periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
      return res.status(400).json({ error: "periodStart must be YYYY-MM-DD" });
    }

    const { accomplishments } = req.body;
    if (
      !Array.isArray(accomplishments) ||
      !accomplishments.every((a: unknown) => typeof a === "string")
    ) {
      return res.status(400).json({ error: "accomplishments must be a string array" });
    }

    // Get user's organizationId
    const user = await db
      .select({ organizationId: schema.users.organizationId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user[0]?.organizationId) {
      return res.status(404).json({ error: "User not found" });
    }

    // Upsert with source: "user-edited"
    const existing = await db
      .select({ id: schema.bragbookEntries.id })
      .from(schema.bragbookEntries)
      .where(
        and(
          eq(schema.bragbookEntries.userId, userId),
          eq(schema.bragbookEntries.periodType, periodType!),
          eq(schema.bragbookEntries.periodStart, periodStart)
        )
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(schema.bragbookEntries)
        .set({ accomplishments, source: "user-edited", updatedAt: new Date() })
        .where(eq(schema.bragbookEntries.id, existing[0].id));
    } else {
      await db.insert(schema.bragbookEntries).values({
        userId,
        organizationId: user[0].organizationId,
        periodType: periodType!,
        periodStart,
        accomplishments,
        source: "user-edited",
      });
    }

    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Failed to save bragbook entry");
    return res.status(500).json({ error: "Failed to save bragbook entry" });
  }
});

// ============================================================================
// DELETE /my-bragbook/:periodType/:periodStart
// ============================================================================

router.delete("/:periodType/:periodStart", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { periodType, periodStart } = req.params;

    if (!VALID_PERIOD_TYPES.has(periodType!)) {
      return res.status(400).json({ error: "periodType must be weekly, monthly, or quarterly" });
    }
    if (!periodStart || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart)) {
      return res.status(400).json({ error: "periodStart must be YYYY-MM-DD" });
    }

    await db
      .delete(schema.bragbookEntries)
      .where(
        and(
          eq(schema.bragbookEntries.userId, userId),
          eq(schema.bragbookEntries.periodType, periodType!),
          eq(schema.bragbookEntries.periodStart, periodStart)
        )
      );

    return res.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Failed to delete bragbook entry");
    return res.status(500).json({ error: "Failed to delete bragbook entry" });
  }
});

export default router;
