/**
 * Migration 0011: Add Slack structure-aware metadata columns
 *
 * Run with: npm run migrate:0011
 */

import { db } from "../db/client";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log("Starting migration 0011: Add Slack structure-aware metadata...");

    // Read the SQL migration file
    const migrationPath = path.join(
      __dirname,
      "../db/migrations/0011_add_slack_structure_metadata.sql"
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

    // Execute the migration
    await db.execute(sql.raw(migrationSQL));

    console.log("✅ Migration 0011 completed successfully!");
    console.log("\nNew columns added to search_content:");
    console.log("  - chunk_type (message_window, code, log, etc.)");
    console.log("  - authors (array of usernames)");
    console.log("  - mentioned_users (array of user IDs)");
    console.log("  - has_code (boolean)");
    console.log("  - code_language (sql, typescript, python, etc.)");
    console.log("  - has_links (boolean)");
    console.log("  - has_attachments (boolean)");
    console.log("  - has_reactions (boolean)");
    console.log("  - reaction_summary (JSONB)");
    console.log("  - thread_id (Slack thread_ts)");
    console.log("  - is_thread_root (boolean)");
    console.log("  - message_ids (array of timestamps)");
    console.log("\nIndexes created for:");
    console.log("  - chunk_type, has_code, code_language");
    console.log("  - thread_id, authors (GIN index)");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
