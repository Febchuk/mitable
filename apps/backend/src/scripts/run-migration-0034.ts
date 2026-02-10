/**
 * Migration Script 0034: Add summarization_progress column to monitoring_sessions
 *
 * Tracks step-based progress during session summarization for UI display.
 *
 * Run with: npx tsx src/scripts/run-migration-0034.ts
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
    console.log("🚀 Starting Migration 0034: Add summarization_progress column\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0034_add_summarization_progress.sql"),
      "utf-8"
    );

    console.log("📝 Adding summarization_progress column to monitoring_sessions...");
    await pool.query(migrationSQL);

    console.log("✅ Migration 0034 complete!");
    console.log("  - Added summarization_progress VARCHAR(50) column");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
