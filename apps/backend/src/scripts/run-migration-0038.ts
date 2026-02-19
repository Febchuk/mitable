/**
 * Migration Script 0038: Create recaps table
 *
 * Stores user-created recap documents that summarize work across sessions/blocks.
 *
 * Run with: npx tsx src/scripts/run-migration-0038.ts
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
    console.log("🚀 Starting Migration 0038: Create recaps table\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0038_create_recaps.sql"),
      "utf-8"
    );

    console.log("📝 Creating recaps table...");
    await pool.query(migrationSQL);

    console.log("✅ Migration 0038 complete!");
    console.log("  - Created recaps table");
    console.log("  - Added index: user_id");
    console.log("  - Added index: user_id + created_at DESC");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
