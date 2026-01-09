/**
 * Debug script to analyze a session's AI-generated content
 *
 * Run with: npx tsx scripts/analyze-session.ts <sessionId>
 */

import { db } from "../src/db/client";
import { sessionCaptures, sessionSummaries, monitoringSessions } from "../src/db/schema";
import { eq, asc, desc } from "drizzle-orm";

async function analyzeSession(sessionId: string) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`ANALYZING SESSION: ${sessionId}`);
  console.log(`${"=".repeat(80)}\n`);

  // 1. Get session info
  const session = await db.query.monitoringSessions.findFirst({
    where: eq(monitoringSessions.id, sessionId),
  });

  if (!session) {
    console.error("Session not found!");
    process.exit(1);
  }

  console.log("SESSION INFO:");
  console.log(`  Name: ${session.name}`);
  console.log(`  Goal: ${session.sessionGoal || "(none)"}`);
  console.log(`  Status: ${session.status}`);
  console.log(`  Started: ${session.startedAt}`);
  console.log(`  Ended: ${session.endedAt}`);
  console.log(`  Final Summary: ${session.finalSummary?.substring(0, 200)}...`);

  // 2. Get all captures with their analysis
  const captures = await db.query.sessionCaptures.findMany({
    where: eq(sessionCaptures.sessionId, sessionId),
    orderBy: asc(sessionCaptures.sequenceNumber),
  });

  console.log(`\n${"=".repeat(80)}`);
  console.log(`FRAME-BY-FRAME ANALYSIS (${captures.length} captures)`);
  console.log(`${"=".repeat(80)}\n`);

  for (const capture of captures) {
    console.log(`\n--- Frame #${capture.sequenceNumber} ---`);
    console.log(`  Window: ${capture.appName}`);
    console.log(`  Delta Type: ${capture.deltaChangeType || "(none)"}`);
    console.log(`  Delta Desc: ${capture.deltaChangeDescription?.substring(0, 100) || "(none)"}`);
    console.log(
      `  Importance: ${capture.importanceScore} - ${capture.importanceReason?.substring(0, 80) || "(none)"}`
    );
  }

  // 3. Get only latest master_story (skip others to reduce output)
  const latestStory = await db.query.sessionSummaries.findFirst({
    where: eq(sessionSummaries.sessionId, sessionId),
    orderBy: [desc(sessionSummaries.version)],
  });

  console.log(`\n${"=".repeat(80)}`);
  console.log(`LATEST SUMMARY`);
  console.log(`${"=".repeat(80)}\n`);

  if (latestStory) {
    console.log(`Type: ${latestStory.summaryType} v${latestStory.version}`);
    console.log(`Model: ${latestStory.modelUsed}`);
    console.log(
      `\nNarrative (first 500 chars):\n${latestStory.narrativeSummary?.substring(0, 500)}...`
    );
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("ANALYSIS COMPLETE");
  console.log(`${"=".repeat(80)}\n`);

  process.exit(0);
}

// Get session ID from command line
const sessionId = process.argv[2];

if (!sessionId) {
  console.log("Usage: npx tsx scripts/analyze-session.ts <sessionId>");
  console.log("\nTo find session IDs, check the database or console URL.");
  process.exit(1);
}

analyzeSession(sessionId).catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
