/**
 * Migration Script 0033: Add 'transcript' chunk type to session_chunks
 *
 * Updates the CHECK constraint to allow 'transcript' as a valid chunk_type.
 *
 * Run with: npm run migrate:0033 --workspace=@mitable/backend
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
    console.log("🚀 Starting Migration 0033: Add transcript chunk type\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0033_add_transcript_chunk_type.sql"),
      "utf-8"
    );

    console.log("📝 Updating session_chunks_chunk_type_check constraint...");
    await pool.query(migrationSQL);

    console.log("✅ Migration 0033 complete!");
    console.log("  - Added 'transcript' to chunk_type CHECK constraint");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
