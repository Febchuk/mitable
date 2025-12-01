/**
 * Migration 0014: Add conversation summary fields for memory management
 *
 * Run with: npm run migrate:0014
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
    console.log("Starting migration 0014: Add conversation summary fields...");

    // Read the SQL migration file
    const migrationPath = path.join(
      __dirname,
      "../db/migrations/0014_add_conversation_summary.sql"
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

    // Execute the migration
    await db.execute(sql.raw(migrationSQL));

    console.log("✅ Migration 0014 completed successfully!");
    console.log("\nNew columns added to conversations table:");
    console.log("  - conversation_summary (TEXT) - Incremental summary of older turns");
    console.log("  - summary_up_to_turn (INTEGER) - Tracks which turn was last summarized");
    console.log("\nIndex created:");
    console.log(
      "  - idx_conversations_summary on conversations(id) WHERE conversation_summary IS NOT NULL"
    );

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
