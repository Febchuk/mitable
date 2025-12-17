/**
 * Migration 0016: Add image_data column to session_captures
 *
 * Run with: npm run migrate:0016
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
    console.log("Starting migration 0016: Add image_data column...");

    // Read the SQL migration file
    const migrationPath = path.join(__dirname, "../db/migrations/0016_add_capture_image_data.sql");
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

    // Execute the migration
    await db.execute(sql.raw(migrationSQL));

    console.log("✅ Migration 0016 completed successfully!");
    console.log("\nChanges:");
    console.log("  - Added image_data column to session_captures");
    console.log("  - Stores base64 encoded screenshots for AI analysis");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
