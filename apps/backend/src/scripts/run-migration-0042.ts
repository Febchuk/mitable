/**
 * Migration Script 0042: Create graph sync control tables
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { pool } from "../db/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log("🚀 Starting Migration 0042: Create graph sync tables\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0042_create_graph_sync_tables.sql"),
      "utf-8"
    );

    console.log("📝 Creating graph sync tables...");
    await client.query(migrationSQL);

    console.log("✅ Migration 0042 completed successfully");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error("❌ Unhandled migration error:", err);
  process.exit(1);
});
