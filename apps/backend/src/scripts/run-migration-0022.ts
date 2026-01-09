/**
 * Migration 0022: Add artifacts table
 *
 * Creates the artifacts table for storing user-uploaded files or pasted text
 * to be used as context for document generation.
 *
 * Run with: npm run migrate:0022
 */

import { db } from "../db/client.js";
import { sql } from "drizzle-orm";

async function runMigration() {
  try {
    console.log("Starting migration 0022: Add artifacts table...\n");

    // 1. Create artifacts table
    console.log("1. Creating artifacts table...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS artifacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        
        -- Artifact metadata
        title VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        
        -- File specific
        url VARCHAR(1000),
        file_type VARCHAR(100),
        size BIGINT,
        
        -- Text specific
        content TEXT,
        
        -- Status
        status VARCHAR(50) DEFAULT 'active',
        
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    // 2. Add indexes
    console.log("2. Adding indexes...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS artifacts_organization_id_idx ON artifacts(organization_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS artifacts_user_id_idx ON artifacts(user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS artifacts_type_idx ON artifacts(type)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS artifacts_status_idx ON artifacts(status)
    `);

    // 3. Add comments
    console.log("3. Adding table and column comments...");
    await db.execute(sql`
      COMMENT ON TABLE artifacts IS 'User-uploaded knowledge sources (files or text) for document generation context'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN artifacts.type IS 'Type of artifact: file (uploaded via UploadThing) or text (pasted content)'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN artifacts.url IS 'UploadThing URL for file artifacts'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN artifacts.content IS 'Raw text content for text artifacts'
    `);
    await db.execute(sql`
      COMMENT ON COLUMN artifacts.status IS 'Status: active (available) or archived (hidden)'
    `);

    console.log("\n✅ Migration 0022 completed successfully!");
    console.log("\nCreated artifacts table with columns:");
    console.log("  • id (UUID, PRIMARY KEY)");
    console.log("  • organization_id (UUID, FOREIGN KEY)");
    console.log("  • user_id (UUID, FOREIGN KEY)");
    console.log("  • title (VARCHAR 255)");
    console.log("  • type (VARCHAR 50) - 'file' | 'text'");
    console.log("  • url (VARCHAR 1000) - for files");
    console.log("  • file_type (VARCHAR 100)");
    console.log("  • size (BIGINT)");
    console.log("  • content (TEXT) - for pasted text");
    console.log("  • status (VARCHAR 50) - 'active' | 'archived'");
    console.log("  • created_at (TIMESTAMP)");
    console.log("  • updated_at (TIMESTAMP)");
    console.log("\nIndexes created:");
    console.log("  • artifacts_organization_id_idx");
    console.log("  • artifacts_user_id_idx");
    console.log("  • artifacts_type_idx");
    console.log("  • artifacts_status_idx");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

runMigration();

