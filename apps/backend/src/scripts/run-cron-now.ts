/**
 * Manual Cron Trigger + Historical Backfill
 *
 * WARNING: The L1 (User Rollup / Day Analyzer) step is DEPRECATED.
 * It destructively replaces activity_blocks created by the Block Analyzer pipeline.
 * Set ALLOW_DAY_ANALYZER_BACKFILL=true to enable it. Without that env var,
 * runUserRollup() is a no-op and only L2 (Org Rollup) + L3 (Snapshots) will run.
 *
 * Usage:
 *   npx tsx src/scripts/run-cron-now.ts                Run all layers for today
 *   npx tsx src/scripts/run-cron-now.ts --backfill     Discover ALL historical dates and process each
 *   npx tsx src/scripts/run-cron-now.ts --backfill --latest 10   Only process the 10 most recent dates
 *   npx tsx src/scripts/run-cron-now.ts --force        Backfill even if already completed (reprocess)
 *   npx tsx src/scripts/run-cron-now.ts --date 2026-01-15   Run for a specific date
 */

import "dotenv/config";
import minimist from "minimist";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { sql, and, gte, lte, eq, count } from "drizzle-orm";
import { runUserRollup } from "../cron/jobs/user-rollup.job";
import { runOrgRollup } from "../cron/jobs/org-rollup.job";
import { runPeriodSnapshots } from "../cron/jobs/period-snapshot.job";

const argv = minimist(process.argv.slice(2));
const backfill = !!argv.backfill;
const force = !!argv.force;
const latest = argv.latest ? Number(argv.latest) : null;
const specificDate = argv.date as string | undefined;

// ── Discovery: show what we're about to process ──────────────

interface DateDiscovery {
  dateStr: string;
  users: { userId: string; userName: string; orgName: string; sessionCount: number }[];
  totalSessions: number;
  alreadyProcessed: number;
}

async function discoverDates(dateStrs: string[]): Promise<DateDiscovery[]> {
  const results: DateDiscovery[] = [];

  for (const dateStr of dateStrs) {
    const dayStart = new Date(dateStr + "T00:00:00");
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Get users + session counts for this date
    const userSessions = await db
      .select({
        userId: schema.monitoringSessions.userId,
        sessionCount: count(schema.monitoringSessions.id),
      })
      .from(schema.monitoringSessions)
      .where(
        and(
          gte(schema.monitoringSessions.startedAt, dayStart),
          lte(schema.monitoringSessions.startedAt, dayEnd)
        )
      )
      .groupBy(schema.monitoringSessions.userId);

    // Get user names + org names
    const users: DateDiscovery["users"] = [];
    for (const us of userSessions) {
      const [user] = await db
        .select({
          name: sql<string>`COALESCE(${schema.users.firstName} || ' ' || ${schema.users.lastName}, ${schema.users.email})`,
          orgName: sql<string>`COALESCE(${schema.organizations.name}, 'No Org')`,
        })
        .from(schema.users)
        .leftJoin(schema.organizations, eq(schema.users.organizationId, schema.organizations.id))
        .where(eq(schema.users.id, us.userId))
        .limit(1);

      users.push({
        userId: us.userId,
        userName: user?.name ?? "Unknown",
        orgName: user?.orgName ?? "No Org",
        sessionCount: Number(us.sessionCount),
      });
    }

    // Check how many are already processed
    const [processed] = await db
      .select({ cnt: count() })
      .from(schema.userDailyActivities)
      .where(
        and(
          eq(schema.userDailyActivities.activityDate, dateStr),
          eq(schema.userDailyActivities.periodType, "daily"),
          eq(schema.userDailyActivities.status, "completed")
        )
      );

    results.push({
      dateStr,
      users,
      totalSessions: users.reduce((s, u) => s + u.sessionCount, 0),
      alreadyProcessed: Number(processed?.cnt ?? 0),
    });
  }

  return results;
}

function printDiscovery(dates: DateDiscovery[], skipCompleted: boolean) {
  const totalDates = dates.length;
  const totalUsers = dates.reduce((s, d) => s + d.users.length, 0);
  const totalSessions = dates.reduce((s, d) => s + d.totalSessions, 0);
  const totalAlready = dates.reduce((s, d) => s + d.alreadyProcessed, 0);

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  DISCOVERY SUMMARY`);
  console.log(`  Dates:    ${totalDates}`);
  console.log(`  Users:    ${totalUsers} (across all dates)`);
  console.log(`  Sessions: ${totalSessions} total`);
  if (totalAlready > 0) {
    console.log(
      `  Already:  ${totalAlready} user-days already processed${skipCompleted ? " (will skip)" : " (will reprocess)"}`
    );
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Group by org for display
  for (const d of dates) {
    const orgGroups = new Map<string, typeof d.users>();
    for (const u of d.users) {
      const existing = orgGroups.get(u.orgName) || [];
      existing.push(u);
      orgGroups.set(u.orgName, existing);
    }

    const doneTag = d.alreadyProcessed > 0 ? ` [${d.alreadyProcessed}/${d.users.length} done]` : "";
    console.log(`📅 ${d.dateStr} — ${d.totalSessions} sessions, ${d.users.length} users${doneTag}`);

    for (const [orgName, orgUsers] of orgGroups) {
      console.log(`   🏢 ${orgName}`);
      for (const u of orgUsers) {
        console.log(
          `      👤 ${u.userName} — ${u.sessionCount} session${u.sessionCount !== 1 ? "s" : ""}`
        );
      }
    }
  }
  console.log("");
}

// ── Execution ────────────────────────────────────────────────

async function runForDate(date: Date, dateStr: string, skipCompleted: boolean) {
  console.log(`\n⚡ Processing ${dateStr}...`);

  const t0 = Date.now();
  const r1 = await runUserRollup(date, { skipCompleted });
  console.log(
    `   L1 User Rollup: ${r1.usersProcessed} processed, ${r1.usersSkipped} skipped, ${r1.usersFailed} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`
  );

  const t1 = Date.now();
  const r2 = await runOrgRollup(date);
  console.log(`   L2 Org Rollup:  ${r2.orgsProcessed} orgs (${Date.now() - t1}ms)`);
}

async function main() {
  console.log("\n🚀 Mitable Cron — Manual Trigger\n");
  const skipCompleted = !force;

  try {
    // Determine which dates to process
    let dateStrs: string[];

    if (specificDate) {
      dateStrs = [specificDate];
    } else if (backfill) {
      if (latest && latest > 0) {
        // --latest N: get dates that contain the N most recent sessions
        const recentSessions = await db
          .select({
            dateStr: sql<string>`DATE(${schema.monitoringSessions.startedAt})::text`.as("date_str"),
          })
          .from(schema.monitoringSessions)
          .orderBy(sql`${schema.monitoringSessions.startedAt} DESC`)
          .limit(latest);

        // Unique dates, re-sorted chronologically
        const uniqueDates = [...new Set(recentSessions.map((r) => r.dateStr))].sort();
        dateStrs = uniqueDates;
      } else {
        const rows = await db
          .select({
            dateStr: sql<string>`DATE(${schema.monitoringSessions.startedAt})::text`.as("date_str"),
          })
          .from(schema.monitoringSessions)
          .groupBy(sql`DATE(${schema.monitoringSessions.startedAt})`)
          .orderBy(sql`DATE(${schema.monitoringSessions.startedAt}) ASC`);

        dateStrs = rows.map((r) => r.dateStr);
      }
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dateStrs = [today.toISOString().split("T")[0]!];
    }

    // Discovery phase
    const dates = await discoverDates(dateStrs);
    printDiscovery(dates, skipCompleted);

    // Process each date
    for (const d of dates) {
      const date = new Date(d.dateStr + "T00:00:00");
      await runForDate(date, d.dateStr, skipCompleted);
    }

    // Layer 3: Period snapshots after all days
    console.log("\n━━━ Layer 3: Period Snapshots ━━━");
    const t0 = Date.now();
    const r3 = await runPeriodSnapshots();
    console.log(
      `   L3: ${r3.weeklySnapshots} weekly, ${r3.monthlySnapshots} monthly (${Date.now() - t0}ms)`
    );

    console.log("\n🎉 All done!");
  } catch (error) {
    console.error("\n❌ Cron failed:", error);
    process.exit(1);
  }

  process.exit(0);
}

main();
