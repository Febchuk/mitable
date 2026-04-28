/**
 * Migration 0052: Montessori — initial schema.
 *
 * Adds the full set of montessori_* tables: classrooms, students, domains,
 * topics, agent threads + messages, observations, attendance, report
 * templates, and reports. All organization-scoped, idempotent.
 *
 * Run with: npx tsx src/scripts/run-migration-0052.ts
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
        console.log("Starting Migration 0052: Montessori initial schema\n");

        const migrationSQL = readFileSync(
            join(__dirname, "../db/migrations/0052_montessori_initial.sql"),
            "utf-8"
        );

        console.log("Creating montessori_* tables…");
        await pool.query(migrationSQL);

        console.log("\nMigration 0052 complete.");
        console.log(
            "  - Created: classrooms, students, domains, topics, agent_threads,",
            "agent_messages, observations, attendance, report_templates, reports"
        );
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
