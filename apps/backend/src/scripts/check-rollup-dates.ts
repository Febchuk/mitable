import "dotenv/config";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { sql, desc, eq } from "drizzle-orm";

async function check() {
  // 1. What dates have user_daily_activities rows?
  const dates = await db
    .select({
      date: schema.userDailyActivities.activityDate,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.userDailyActivities)
    .where(eq(schema.userDailyActivities.periodType, "daily"))
    .groupBy(schema.userDailyActivities.activityDate)
    .orderBy(desc(schema.userDailyActivities.activityDate));

  console.log("=== user_daily_activities dates ===");
  for (const d of dates) console.log(`  ${d.date} — ${d.count} users`);
  console.log(`Total: ${dates.length} dates\n`);

  // 2. What dates have monitoring_sessions?
  const sessionDates = await db
    .select({
      date: sql<string>`DATE(started_at)::text`.as("date"),
      count: sql<number>`count(*)::int`,
    })
    .from(schema.monitoringSessions)
    .groupBy(sql`DATE(started_at)`)
    .orderBy(sql`DATE(started_at) DESC`);

  console.log("=== monitoring_sessions dates ===");
  for (const d of sessionDates) console.log(`  ${d.date} — ${d.count} sessions`);
  console.log(`Total: ${sessionDates.length} dates\n`);

  // 3. Gap analysis: session dates missing from user_daily_activities
  const activityDateSet = new Set(dates.map((d) => d.date));
  const sessionDateSet = new Set(sessionDates.map((d) => d.date));
  const missing = [...sessionDateSet].filter((d) => !activityDateSet.has(d)).sort();

  if (missing.length > 0) {
    console.log("=== MISSING: session dates with NO user_daily_activities ===");
    for (const d of missing) {
      const sessions = sessionDates.find((s) => s.date === d);
      console.log(`  ${d} — ${sessions?.count ?? 0} sessions (not rolled up)`);
    }
    console.log(`Total missing: ${missing.length} dates\n`);
  } else {
    console.log("=== No missing dates — all session dates have rollup data ===\n");
  }

  // 4. org_daily_metrics dates
  const orgDates = await db
    .select({
      date: schema.orgDailyMetrics.metricsDate,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.orgDailyMetrics)
    .where(eq(schema.orgDailyMetrics.periodType, "daily"))
    .groupBy(schema.orgDailyMetrics.metricsDate)
    .orderBy(desc(schema.orgDailyMetrics.metricsDate));

  console.log("=== org_daily_metrics dates ===");
  for (const d of orgDates) console.log(`  ${d.date} — ${d.count} orgs`);
  console.log(`Total: ${orgDates.length} dates`);

  process.exit(0);
}

check().catch((e) => {
  console.error(e);
  process.exit(1);
});
