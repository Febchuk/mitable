/**
 * Migration 0017: Add Linear OAuth token columns to users table
 *
 * Run with: npm run migrate:0017
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
    console.log("Starting migration 0017: Add Linear OAuth token columns...");

    // Read the SQL migration file
    const migrationPath = path.join(__dirname, "../db/migrations/0017_add_linear_user_tokens.sql");
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

    // Execute the migration
    await db.execute(sql.raw(migrationSQL));

    console.log("✅ Migration 0017 completed successfully!");
    console.log("\nChanges:");
    console.log("  - Added linear_access_token_encrypted column to users");
    console.log("  - Added linear_refresh_token_encrypted column to users");
    console.log("  - Added linear_token_expires_at column to users");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
