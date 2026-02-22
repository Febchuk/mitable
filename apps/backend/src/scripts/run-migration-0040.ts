/**
 * Migration Script 0040: Add session_id to recaps table
 *
 * Links auto-created recaps to their source monitoring session.
 *
 * Run with: npx tsx src/scripts/run-migration-0040.ts
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
    console.log("Starting Migration 0040: Add session_id to recaps\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0040_add_session_id_to_recaps.sql"),
      "utf-8"
    );

    await pool.query(migrationSQL);

    console.log("Migration 0040 complete!");
    console.log("  - Added session_id column to recaps table");
    console.log("  - Created index idx_recaps_session_id");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
