/**
 * Migration Script 0039: Create ask threads tables for admin Ask feature
 *
 * Creates two tables:
 *   - ask_threads: Conversation threads (org-scoped)
 *   - ask_messages: Messages within threads (with optional report data)
 *
 * Run with: npx tsx src/scripts/run-migration-0039.ts
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
    console.log("🚀 Starting Migration 0039: Create ask threads tables\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0039_create_ask_threads.sql"),
      "utf-8"
    );

    console.log("📝 Creating tables...");
    await pool.query(migrationSQL);

    console.log("✅ Migration 0039 complete!");
    console.log("  - Created ask_threads table");
    console.log("  - Created ask_messages table");
    console.log("  - Added indexes for user_id, organization_id, and thread_id");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
