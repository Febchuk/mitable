/**
 * Migration Script 0048: Create agent chat persistence tables
 *
 * Creates agent_conversations and agent_messages tables for storing
 * Claude SDK agent chat history with tool call metadata.
 *
 * Run with: npx tsx src/scripts/run-migration-0048.ts
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
    console.log("Starting Migration 0048: Create agent chat tables\n");

    const migrationSQL = readFileSync(
      join(__dirname, "../db/migrations/0048_create_agent_chat_tables.sql"),
      "utf-8"
    );

    console.log("Creating agent_conversations and agent_messages tables...");
    await pool.query(migrationSQL);

    console.log("\nMigration 0048 complete!");
    console.log(
      "  - Created agent_conversations table (id, user_id, organization_id, title, session_id)"
    );
    console.log(
      "  - Created agent_messages table (id, conversation_id, role, content, tool_calls)"
    );
    console.log("  - Added indexes for user, org, conversation, and timestamp queries");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
