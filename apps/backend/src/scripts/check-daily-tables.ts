import pkg from "pg";
const { Pool } = pkg;
import "dotenv/config";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const r1 = await pool.query("SELECT count(*) FROM user_daily_activities");
    console.log("user_daily_activities rows:", r1.rows[0].count);
    const r2 = await pool.query("SELECT count(*) FROM activity_blocks");
    console.log("activity_blocks rows:", r2.rows[0].count);
    const r3 = await pool.query("SELECT count(*) FROM org_daily_metrics");
    console.log("org_daily_metrics rows:", r3.rows[0].count);

    // Check if new columns exist
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'user_daily_activities' AND column_name = 'processed_session_ids'
    `);
    console.log("processed_session_ids column exists:", cols.rows.length > 0);

    const cols2 = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'activity_blocks' AND column_name = 'session_id'
    `);
    console.log("activity_blocks.session_id column exists:", cols2.rows.length > 0);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
