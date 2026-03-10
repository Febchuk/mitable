/**
 * Migration: Add topic & subscriber columns
 *
 * Adds:
 *   - activity_blocks.topic_name (varchar 200, nullable)
 *   - activity_blocks.subscriber_name (varchar 200, nullable)
 *   - user_daily_activities.topic_breakdown (jsonb, default '[]')
 *   - user_daily_activities.subscriber_breakdown (jsonb, default '[]')
 *
 * Safe to run on a live database — nullable columns, no locks.
 */

import { pool } from "../db/client.js";

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log("Running migration: add topic & subscriber columns...");

    await client.query(`
      ALTER TABLE activity_blocks
        ADD COLUMN IF NOT EXISTS topic_name VARCHAR(200),
        ADD COLUMN IF NOT EXISTS subscriber_name VARCHAR(200);
    `);
    console.log("Added topic_name, subscriber_name to activity_blocks");

    await client.query(`
      ALTER TABLE user_daily_activities
        ADD COLUMN IF NOT EXISTS topic_breakdown JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS subscriber_breakdown JSONB DEFAULT '[]';
    `);
    console.log("Added topic_breakdown, subscriber_breakdown to user_daily_activities");

    console.log("Migration complete.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error("Unhandled migration error:", err);
  process.exit(1);
});
