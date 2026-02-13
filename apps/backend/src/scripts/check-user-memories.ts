import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query(
    "SELECT id, user_id, category, content, created_at FROM user_memories WHERE category = 'summary_style' ORDER BY created_at DESC LIMIT 5"
  );
  console.log("User memories (summary_style):", r.rows.length, "found");
  console.log(JSON.stringify(r.rows, null, 2));
  await pool.end();
}

main();
