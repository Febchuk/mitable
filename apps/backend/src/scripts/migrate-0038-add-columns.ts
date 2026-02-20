/**
 * Migration: Add new columns to existing 0038 tables
 *
 * Adds:
 *   - user_daily_activities.processed_session_ids (JSONB)
 *   - activity_blocks.session_id (UUID FK → monitoring_sessions)
 */

import pkg from "pg";
const { Pool } = pkg;
import "dotenv/config";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log("Adding processed_session_ids to user_daily_activities...");
    await pool.query(`
      ALTER TABLE user_daily_activities 
      ADD COLUMN IF NOT EXISTS processed_session_ids JSONB NOT NULL DEFAULT '[]'
    `);

    console.log("Adding session_id to activity_blocks...");
    await pool.query(`
      ALTER TABLE activity_blocks 
      ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES monitoring_sessions(id) ON DELETE SET NULL
    `);

    console.log("✅ Columns added successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
