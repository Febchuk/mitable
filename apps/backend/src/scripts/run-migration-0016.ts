/**
 * Migration 0016: Add documentation tables
 *
 * Run with: npm run migrate:0016
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log("Starting migration 0016: Add documentation tables...");

    // Read the SQL migration file
    const migrationPath = path.join(
      __dirname,
      "../db/migrations/0016_add_documentation_tables.sql"
    );
    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");

    // Execute the migration
    await db.execute(sql.raw(migrationSQL));

    console.log("✅ Migration 0016 completed successfully!");
    console.log("\nTables created:");
    console.log("  - documents - Knowledge base documents");
    console.log("  - document_versions - Version history");
    console.log("  - session_document_contributions - Session links");
    console.log("\nIndexes created:");
    console.log("  - idx_documents_org");
    console.log("  - idx_documents_type");
    console.log("  - idx_documents_status");
    console.log("  - idx_documents_org_type");
    console.log("  - idx_documents_created_by");
    console.log("  - idx_document_versions_doc");
    console.log("  - idx_session_doc_contributions_session");
    console.log("  - idx_session_doc_contributions_doc");
    console.log("  - idx_documents_fts (full-text search)");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();
