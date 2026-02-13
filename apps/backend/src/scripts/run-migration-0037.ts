/**
 * Migration Script 0037: Create session_refinement_chats table
 *
 * Stores chat history between users and the refinement AI for each session.
 *
 * Run with: npx tsx src/scripts/run-migration-0037.ts
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
    console.log("🚀 Starting Migration 0037: Create session_refinement_chats table\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0037_create_session_refinement_chats.sql"),
      "utf-8"
    );

    console.log("📝 Creating session_refinement_chats table...");
    await pool.query(migrationSQL);

    console.log("✅ Migration 0037 complete!");
    console.log("  - Created session_refinement_chats table");
    console.log("  - Added unique index: session_id + user_id");
    console.log("  - Added index: session_id (for docs LLM queries)");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
