/**
 * Migration 0015: Add monitoring tables
 *
 * Run with: npm run migrate:0015
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log("Starting migration 0015: Add monitoring tables...");

    // Read the SQL migration file
    const migrationPath = path.join(__dirname, "../db/migrations/0015_add_monitoring_tables.sql");
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

    // Execute the migration
    await db.execute(sql.raw(migrationSQL));

    console.log("✅ Migration 0015 completed successfully!");
    console.log("\nTables created:");
    console.log("  - monitoring_sessions - Core session tracking");
    console.log("  - session_captures - Screenshot timeline");
    console.log("  - session_summaries - Versioned summaries");
    console.log("\nIndexes created:");
    console.log("  - idx_monitoring_sessions_user");
    console.log("  - idx_monitoring_sessions_org");
    console.log("  - idx_monitoring_sessions_status");
    console.log("  - idx_session_captures_session");
    console.log("  - idx_session_summaries_session");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
