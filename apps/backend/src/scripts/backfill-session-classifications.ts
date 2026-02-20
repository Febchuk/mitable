/**
 * Backfill Session Classifications
 *
 * Runs Groq classification against all historical sessions that don't
 * yet have activity classification in keyActivities.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-session-classifications.ts
 *   npx tsx src/scripts/backfill-session-classifications.ts --force   Reclassify all sessions
 *   npx tsx src/scripts/backfill-session-classifications.ts --dry-run  Show what would be processed
 */

import "dotenv/config";
import minimist from "minimist";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { desc, isNotNull, eq, count } from "drizzle-orm";
import { classifySession, isSessionClassified } from "../services/session-classification.service";

const argv = minimist(process.argv.slice(2));
const force = !!argv.force;
const dryRun = !!argv["dry-run"];

async function main() {
  console.log("\n🔬 Session Classification Backfill\n");

  // Find all ended sessions
  const allSessions = await db
    .select({
      id: schema.monitoringSessions.id,
      name: schema.monitoringSessions.name,
      userId: schema.monitoringSessions.userId,
      startedAt: schema.monitoringSessions.startedAt,
      status: schema.monitoringSessions.status,
    })
    .from(schema.monitoringSessions)
    .where(isNotNull(schema.monitoringSessions.endedAt))
    .orderBy(desc(schema.monitoringSessions.startedAt));

  console.log(`Found ${allSessions.length} ended sessions total`);

  // Get capture counts per session (separate query — subqueries don't work in Drizzle)
  const sessions: ((typeof allSessions)[number] & { captureCount: number })[] = [];
  for (const s of allSessions) {
    const [capCount] = await db
      .select({ cnt: count() })
      .from(schema.sessionCaptures)
      .where(eq(schema.sessionCaptures.sessionId, s.id));
    sessions.push({ ...s, captureCount: Number(capCount?.cnt ?? 0) });
  }

  const withCaptures = sessions.filter((s) => s.captureCount > 0);
  const withoutCaptures = sessions.length - withCaptures.length;
  console.log(`${withCaptures.length} have captures, ${withoutCaptures} have 0 captures`);

  // Filter to sessions that need classification
  let toProcess: typeof sessions = [];

  if (force) {
    toProcess = withCaptures;
    console.log(`--force: will reclassify all ${toProcess.length} sessions with captures\n`);
  } else {
    for (const s of withCaptures) {
      const classified = await isSessionClassified(s.id);
      if (!classified) toProcess.push(s);
    }
    console.log(
      `${toProcess.length} sessions need classification (${withCaptures.length - toProcess.length} already done)\n`
    );
  }

  if (toProcess.length === 0) {
    console.log("Nothing to do!");
    process.exit(0);
  }

  // Show what we'll process
  for (const s of toProcess) {
    const date = new Date(s.startedAt).toISOString().split("T")[0];
    const name = s.name || "Unnamed session";
    console.log(`  ${date} — ${name} (${s.captureCount} captures)`);
  }
  console.log("");

  if (dryRun) {
    console.log("--dry-run: skipping actual classification");
    process.exit(0);
  }

  // Process each session
  let success = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const s = toProcess[i];
    const date = new Date(s.startedAt).toISOString().split("T")[0];
    const name = s.name || "Unnamed";
    const progress = `[${i + 1}/${toProcess.length}]`;

    try {
      const activities = await classifySession(s.id);
      const categories = activities.map((a) => a.category).join(", ");
      console.log(
        `  ✅ ${progress} ${date} "${name}" → ${activities.length} activities (${categories})`
      );
      success++;
    } catch (error) {
      console.log(
        `  ❌ ${progress} ${date} "${name}" — ${error instanceof Error ? error.message : String(error)}`
      );
      failed++;
    }

    // Small delay to avoid Groq rate limits
    if (i < toProcess.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\n🎉 Done! ${success} classified, ${failed} failed\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error("\n❌ Backfill failed:", e);
  process.exit(1);
});
