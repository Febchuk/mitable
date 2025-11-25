#!/usr/bin/env tsx
/**
 * Run Migration 0010: Add Notion Structure Metadata
 * 
 * This migration adds support for structure-aware Notion chunking:
 * - Section hierarchy (section_path, section_title, section_id, heading_level)
 * - Chunk classification (chunk_type, has_code, has_table, has_list)
 * - Code metadata (code_language)
 * 
 * Usage: npm run migrate:0010
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log("🚀 Running migration 0010: Add Notion Structure Metadata\n");

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, "../db/migrations/0010_add_notion_structure_metadata.sql");
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

    // Execute the migration
    console.log("📝 Executing migration...");
    await db.execute(sql.raw(migrationSQL));

    console.log("\n✅ Migration completed successfully!");
    console.log("\nAdded columns:");
    console.log("  - section_path (TEXT)");
    console.log("  - section_title (TEXT)");
    console.log("  - section_id (TEXT)");
    console.log("  - heading_level (INTEGER)");
    console.log("  - chunk_type (TEXT)");
    console.log("  - has_code (BOOLEAN)");
    console.log("  - has_table (BOOLEAN)");
    console.log("  - has_list (BOOLEAN)");
    console.log("  - code_language (TEXT)");
    console.log("\nCreated indexes:");
    console.log("  - search_content_section_idx");
    console.log("  - search_content_chunk_type_idx");
    console.log("  - search_content_has_code_idx");
    console.log("  - search_content_org_chunk_type_idx");
    console.log("  - search_content_page_chunk_type_idx");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
