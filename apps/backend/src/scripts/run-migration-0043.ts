/**
 * Migration Script 0043: Add Granola OAuth token columns to users table
 *
 * Adds columns for per-user Granola MCP OAuth tokens:
 *   - granola_access_token_encrypted
 *   - granola_refresh_token_encrypted
 *   - granola_token_expires_at
 *   - granola_user_email
 *   - granola_last_synced_at
 *
 * Run with: npx tsx src/scripts/run-migration-0043.ts
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
    console.log("Starting Migration 0043: Add Granola user tokens\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0043_add_granola_user_tokens.sql"),
      "utf-8"
    );

    console.log("Adding Granola columns to users table...");
    await pool.query(migrationSQL);

    console.log("Migration 0043 complete!");
    console.log("  - Added granola_access_token_encrypted");
    console.log("  - Added granola_refresh_token_encrypted");
    console.log("  - Added granola_token_expires_at");
    console.log("  - Added granola_user_email");
    console.log("  - Added granola_last_synced_at");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
