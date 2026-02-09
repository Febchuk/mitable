#!/usr/bin/env tsx
/**
 * Show actual transcript data from database
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";

async function showTranscripts() {
  console.log("\n📝 SESSION SUMMARY & TRANSCRIPT\n");
  console.log("=".repeat(80));

  try {
    // Query the most recent session summary
    const sessionId = "4d8e1dc8-efab-4619-9037-41d6ee39c1f0";

    const summary = await db.execute(sql`
      SELECT *
      FROM session_summaries
      WHERE session_id::text = ${sessionId}
      ORDER BY created_at DESC
      LIMIT 1;
    `);

    if (summary.rows.length > 0) {
      const s = summary.rows[0] as any;
      console.log("\n📖 STORYTELLER OUTPUT:");
      console.log("-".repeat(80));
      console.log(`Session: ${s.session_id}`);
      console.log(`Style: ${s.style} | Format: ${s.format}`);
      console.log(`\nSummary:\n${s.summary}\n`);
      console.log("=".repeat(80));
    }

    // Query all transcripts for this session
    const result = await db.execute(sql`
      SELECT 
        id::text,
        session_id::text,
        speaker_id,
        transcript,
        start_time,
        end_time,
        confidence,
        created_at
      FROM session_transcripts
      WHERE session_id::text = ${sessionId}
      ORDER BY created_at DESC;
    `);

    console.log(`\nTotal transcripts found: ${result.rows.length}\n`);

    if (result.rows.length === 0) {
      console.log("No transcripts found in database.\n");
    } else {
      result.rows.forEach((t: any, idx: number) => {
        console.log("-".repeat(80));
        console.log(`Transcript #${idx + 1}`);
        console.log("-".repeat(80));
        console.log(`Session ID:  ${t.session_id}`);
        console.log(`Speaker:     Speaker ${t.speaker_id}`);
        console.log(`Confidence:  ${(t.confidence * 100).toFixed(1)}%`);
        console.log(`Start Time:  ${t.start_time}`);
        console.log(`End Time:    ${t.end_time}`);
        console.log(`Created At:  ${t.created_at}`);
        console.log(`\nFull Transcript:\n${t.transcript}\n`);
      });
    }

    console.log("=".repeat(80));
    console.log("\n✅ Query complete\n");
  } catch (error) {
    console.error("❌ Error querying database:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

showTranscripts();
