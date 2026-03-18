/**
 * Migration Script 0045: Add raw_transcript column to activity_blocks
 *
 * Stores the full speaker-by-speaker transcript from Fireflies meetings.
 * Used by the agent for conversational Q&A about meeting details.
 *
 * Run with: npx tsx src/scripts/run-migration-0045.ts
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pkg from "pg";
const { Pool } = pkg;
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log("Starting Migration 0045: Add raw_transcript to activity_blocks\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0045_add_raw_transcript_to_activity_blocks.sql"),
      "utf-8"
    );

    console.log("Adding raw_transcript column...");
    await pool.query(migrationSQL);

    console.log("Migration 0045 complete!");
    console.log("  - Added raw_transcript TEXT column to activity_blocks");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
