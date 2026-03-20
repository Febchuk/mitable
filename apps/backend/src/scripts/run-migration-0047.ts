/**
 * Migration Script 0047: Add granola_oauth_client_id to users table
 *
 * Persists the OAuth client_id used during Granola authorization so that
 * token refresh works correctly after server restarts (dynamic client
 * registration creates a new client_id each time, breaking refresh tokens
 * bound to the old one).
 *
 * Run with: npx tsx src/scripts/run-migration-0047.ts
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
    console.log("Starting Migration 0047: Add granola_oauth_client_id to users\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0047_add_granola_oauth_client_id.sql"),
      "utf-8"
    );

    console.log("Adding granola_oauth_client_id column...");
    await pool.query(migrationSQL);

    console.log("Migration 0047 complete!");
    console.log("  - Added granola_oauth_client_id VARCHAR(255) column to users");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
