/**
 * Migration Script 0026: Add Workstreams Tables
 *
 * This script adds the session_workstreams and workstream_analysis_log tables,
 * and adds workstream columns to session_captures for RLM-based workstream detection.
 *
 * Run with: npm run migrate:0026 --workspace=@mitable/backend
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
    console.log("🚀 Starting Migration 0026: Add Workstreams Tables\n");

    // Read migration SQL file
    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0026_add_workstreams_tables.sql"),
      "utf-8"
    );

    // Execute migration
    console.log("📝 Creating workstreams tables and columns...");
    await pool.query(migrationSQL);

    console.log("✅ Migration 0026 complete!\n");
    console.log("Created tables:");
    console.log("  - session_workstreams (RLM-detected workstreams)");
    console.log("  - workstream_analysis_log (analysis run history)");
    console.log("\nModified tables:");
    console.log("  - session_captures: added workstream_id, workstream_provisional columns");
    console.log("\nAdded indexes:");
    console.log("  - idx_session_workstreams_session");
    console.log("  - idx_session_workstreams_merged");
    console.log("  - idx_workstream_analysis_session");
    console.log("  - idx_workstream_analysis_created");
    console.log("  - idx_captures_workstream");
    console.log("\n🎉 Database is now ready for RLM workstream detection!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
