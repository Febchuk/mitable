/**
 * Teardown: removes every montessori_* table from the dev database.
 *
 * The Montessori app is a prototype; if the team decides not to ship
 * it we want a single, reversible undo for the schema. This script
 * drops the ten tables added by 0052_montessori_initial.sql with
 * CASCADE to clear foreign keys, leaving every other Mitable table
 * untouched.
 *
 * Run with:
 *   npm run teardown:montessori --workspace=apps/backend
 *
 * Safety:
 *   - Refuses to run if NODE_ENV === "production". You can still
 *     bypass with FORCE=1 if you really mean it.
 *   - Logs each dropped table.
 *   - Uses IF EXISTS so re-runs are no-ops.
 */

import { Pool } from "pg";
import "dotenv/config";

const TABLES = [
    // Order doesn't matter with CASCADE, but listing leaves first
    // makes the log read top-down for humans skimming the output.
    "montessori_reports",
    "montessori_report_templates",
    "montessori_attendance",
    "montessori_observations",
    "montessori_agent_messages",
    "montessori_agent_threads",
    "montessori_topics",
    "montessori_domains",
    "montessori_students",
    "montessori_classrooms",
];

async function main() {
    if (process.env.NODE_ENV === "production" && process.env.FORCE !== "1") {
        // eslint-disable-next-line no-console
        console.error(
            "Refusing to run teardown in production. Set FORCE=1 if you genuinely want this."
        );
        process.exit(1);
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        // eslint-disable-next-line no-console
        console.error("DATABASE_URL is not set.");
        process.exit(1);
    }

    const pool = new Pool({ connectionString: databaseUrl });
    try {
        for (const table of TABLES) {
            await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
            // eslint-disable-next-line no-console
            console.log(`dropped ${table}`);
        }
        // eslint-disable-next-line no-console
        console.log("Done — all montessori_* tables removed.");
    } finally {
        await pool.end();
    }
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Teardown failed:", err);
    process.exit(1);
});
