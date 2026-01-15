/**
 * Migration 0023: Add Google Docs export tracking to documents table
 *
 * Run with: npm run migrate:0023
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
    console.log("Starting migration 0023: Add Google Docs export tracking...");

    // Read the SQL migration file
    const migrationPath = path.join(__dirname, "../db/migrations/0023_add_google_docs_export.sql");
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

    // Execute the migration
    await db.execute(sql.raw(migrationSQL));

    console.log("✅ Migration 0023 completed successfully!");
    console.log("\nChanges:");
    console.log("  - Added google_docs_id column to documents");
    console.log("  - Added google_docs_folder_id column to documents");
    console.log("  - Added google_docs_sync_status column to documents");
    console.log("  - Added google_docs_synced_at column to documents");
    console.log("  - Added google_docs_sync_error column to documents");
    console.log("  - Added index on google_docs_id for faster lookups");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
