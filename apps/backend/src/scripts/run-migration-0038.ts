/**
 * Migration Script 0038
 *
 * This repository has had multiple "0038" migrations over time (e.g., recaps table,
 * and admin dashboard daily activity tables). This script runs whichever 0038 SQL
 * migration file exists in your checkout.
 *
 * Run with: npx tsx src/scripts/run-migration-0038.ts
 */

import { readFileSync, existsSync } from "fs";
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
    const dailyActivityPath = join(
      __dirname,
      "../db/migrations/0038_create_daily_activity_tables.sql"
    );
    const recapsPath = join(__dirname, "../db/migrations/0038_create_recaps.sql");

    let migrationPath: string | null = null;
    if (existsSync(dailyActivityPath)) {
      migrationPath = dailyActivityPath;
      console.log("🚀 Starting Migration 0038: Create daily activity tables\n");
    } else if (existsSync(recapsPath)) {
      migrationPath = recapsPath;
      console.log("🚀 Starting Migration 0038: Create recaps table\n");
    }

    if (!migrationPath) {
      throw new Error(
        "No known 0038 migration SQL file found. Expected one of: " +
          "0038_create_daily_activity_tables.sql or 0038_create_recaps.sql"
      );
    }

    const migrationSQL = readFileSync(migrationPath, "utf-8");
    console.log(`📝 Running ${migrationPath.split("/").pop()}...`);
    await pool.query(migrationSQL);

    console.log("✅ Migration 0038 complete!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
