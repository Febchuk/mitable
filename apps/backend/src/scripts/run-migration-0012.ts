/**
 * Migration Script 0012: Add GitHub Code Domain metadata
 *
 * This script adds GitHub-specific columns to the search_content table
 * to support storing and searching code chunks from GitHub repositories.
 *
 * Run with: npm run migrate:0012 --workspace=@mitable/backend
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
    console.log("🚀 Starting Migration 0012: Add GitHub Code Domain metadata\n");

    // Read migration SQL file
    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0012_add_github_code_metadata.sql"),
      "utf-8"
    );

    // Execute migration
    console.log("📝 Adding GitHub columns to search_content table...");
    await pool.query(migrationSQL);

    console.log("✅ Migration 0012 complete!\n");
    console.log("Added columns:");
    console.log("  - repo_id, repo_full_name");
    console.log("  - file_path, file_name");
    console.log("  - language, file_role, area");
    console.log("  - commit_sha, git_author, committed_at");
    console.log("  - start_line, end_line");
    console.log("  - function_name, class_name, exports");
    console.log("  - is_exported, is_test_file, is_generated");
    console.log("\nAdded indexes:");
    console.log("  - search_content_repo_idx");
    console.log("  - search_content_file_role_idx");
    console.log("  - search_content_area_idx");
    console.log("  - search_content_language_idx");
    console.log("  - search_content_repo_file_idx");
    console.log("\n🎉 search_content table is now ready for GitHub code chunks!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
