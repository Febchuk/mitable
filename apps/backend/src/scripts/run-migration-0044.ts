/**
 * Migration Script 0044: Add Fireflies AI columns to users table
 *
 * Adds columns for per-user Fireflies API key integration:
 *   - fireflies_api_key_encrypted
 *   - fireflies_last_synced_at
 *
 * Run with: npx tsx src/scripts/run-migration-0044.ts
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
    console.log("Starting Migration 0044: Add Fireflies user tokens\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0044_add_fireflies_user_tokens.sql"),
      "utf-8"
    );

    console.log("Adding Fireflies columns to users table...");
    await pool.query(migrationSQL);

    console.log("Migration 0044 complete!");
    console.log("  - Added fireflies_api_key_encrypted");
    console.log("  - Added fireflies_last_synced_at");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
