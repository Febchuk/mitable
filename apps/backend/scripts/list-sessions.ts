/**
 * List recent sessions to find session IDs
 *
 * Run with: npx tsx scripts/list-sessions.ts
 */

import { db } from "../src/db/client";
import { monitoringSessions } from "../src/db/schema";
import { desc } from "drizzle-orm";

async function listSessions() {
  const sessions = await db.query.monitoringSessions.findMany({
    orderBy: desc(monitoringSessions.startedAt),
    limit: 10,
  });

  console.log("\nRecent Sessions:\n");
  console.log("ID | Name | Status | Started | Captures");
  console.log("-".repeat(100));

  for (const session of sessions) {
    console.log(
      `${session.id} | ${session.name || "(unnamed)"} | ${session.status} | ${session.startedAt}`
    );
  }

  process.exit(0);
}

listSessions().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
