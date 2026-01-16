/**
 * Migration 0024: Add Gmail selected folders to users table
 *
 * Run with: npm run migrate:0024
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
    console.log("Starting migration 0024: Add Gmail selected folders...");

    // Read the SQL migration file
    const migrationPath = path.join(
      __dirname,
      "../db/migrations/0024_add_gmail_selected_folders.sql"
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

    // Execute the migration
    await db.execute(sql.raw(migrationSQL));

    console.log("✅ Migration 0024 completed successfully!");
    console.log("\nChanges:");
    console.log("  - Added gmail_selected_folders column to users");
    console.log("  - Column stores array of Google Drive folder IDs for export filtering");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
