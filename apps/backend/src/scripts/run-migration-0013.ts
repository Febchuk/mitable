/**
 * Migration Script 0013: GitHub Tree API Strategy (Dual-Domain)
 *
 * This script implements the dual-domain strategy for GitHub ingestion:
 * - Code domain: Tree API snapshot (current state only)
 * - Work domain: Commit/PR/issue metadata only (no file contents)
 *
 * Changes:
 * 1. Add last_indexed_commit_sha to github_repos
 * 2. Remove content column from github_commit_files
 *
 * Run with: npm run migrate:0013 --workspace=@mitable/backend
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
    console.log("🚀 Starting Migration 0013: GitHub Tree API Strategy\n");

    // Read migration SQL file
    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0013_github_tree_api_strategy.sql"),
      "utf-8"
    );

    // Execute migration
    console.log("📝 Applying dual-domain strategy changes...");
    await pool.query(migrationSQL);

    console.log("✅ Migration 0013 complete!\n");
    console.log("Changes applied:");
    console.log("  ✅ Added last_indexed_commit_sha to github_repos");
    console.log("  ✅ Removed content column from github_commit_files");
    console.log("\n📚 Dual-Domain Strategy:");
    console.log("  - Code domain: Tree API snapshot (current state only)");
    console.log("  - Work domain: Commit/PR/issue metadata (paths + stats only)");
    console.log("\n🎉 GitHub ingestion is now optimized!");
    console.log("   No more storing historical file versions ✨");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
