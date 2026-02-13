/**
 * Migration Script 0036: Create user_memories table
 *
 * Stores AI-generated user preferences/memories for personalized summaries, docs, etc.
 *
 * Run with: npx tsx src/scripts/run-migration-0036.ts
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
    console.log("🚀 Starting Migration 0036: Create user_memories table\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0036_create_user_memories.sql"),
      "utf-8"
    );

    console.log("📝 Creating user_memories table...");
    await pool.query(migrationSQL);

    console.log("✅ Migration 0036 complete!");
    console.log("  - Created user_memories table");
    console.log("  - Added indexes: user_id+category, org_id");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
