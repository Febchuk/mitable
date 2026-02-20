import "dotenv/config";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { sql, desc, isNotNull, eq, count } from "drizzle-orm";

async function main() {
  // Check total capture count
  const [total] = await db.select({ cnt: count() }).from(schema.sessionCaptures);
  console.log(`Total captures in DB: ${total?.cnt ?? 0}`);

  // Check a few sessions with their capture counts (using join)
  const sessions = await db
    .select({
      id: schema.monitoringSessions.id,
      name: schema.monitoringSessions.name,
      startedAt: schema.monitoringSessions.startedAt,
    })
    .from(schema.monitoringSessions)
    .where(isNotNull(schema.monitoringSessions.endedAt))
    .orderBy(desc(schema.monitoringSessions.startedAt))
    .limit(10);

  for (const s of sessions) {
    const [capCount] = await db
      .select({ cnt: count() })
      .from(schema.sessionCaptures)
      .where(eq(schema.sessionCaptures.sessionId, s.id));

    const date = new Date(s.startedAt).toISOString().split("T")[0];
    console.log(`  ${date} "${s.name || "Unnamed"}" — ${capCount?.cnt ?? 0} captures`);
  }

  // Also test the subquery approach used in the backfill
  console.log("\n--- Subquery approach ---");
  const withSub = await db
    .select({
      id: schema.monitoringSessions.id,
      name: schema.monitoringSessions.name,
      captureCount: sql<number>`(
        SELECT count(*)::int FROM session_captures
        WHERE session_id = ${schema.monitoringSessions.id}
      )`,
    })
    .from(schema.monitoringSessions)
    .where(isNotNull(schema.monitoringSessions.endedAt))
    .orderBy(desc(schema.monitoringSessions.startedAt))
    .limit(5);

  for (const s of withSub) {
    console.log(`  "${s.name || "Unnamed"}" — captureCount from subquery: ${s.captureCount}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
