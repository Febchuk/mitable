/**
 * Migration Script 0049: Add total_session_minutes to user_daily_activities
 *
 * Adds a column to store actual monitoring session durations (ground-truth
 * "time spent in Mitable") computed from monitoring_sessions.endedAt - startedAt.
 *
 * Run with: npx tsx src/scripts/run-migration-0049.ts
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
    console.log("Starting Migration 0049: Add total_session_minutes\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0049_add_total_session_minutes.sql"),
      "utf-8"
    );

    console.log("Adding total_session_minutes column to user_daily_activities...");
    await pool.query(migrationSQL);

    console.log("\nMigration 0049 complete!");
    console.log("  - Added total_session_minutes column (integer, default 0)");
    console.log("  - Existing rows default to 0; will be populated on next block analyzer run");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
