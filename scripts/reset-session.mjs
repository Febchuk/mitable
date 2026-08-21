import { PGlite } from "@electric-sql/pglite";

const SESSION_ID = "162a1601-4e03-48c2-94b1-6d79f1576dd2";
const DB_PATH = "C:/Users/aurel/AppData/Roaming/@mitable/electron/on-device/mitable-pg";

console.log("Opening PGlite at:", DB_PATH);
const db = new PGlite(DB_PATH);

console.log("Setting session status to 'ready'...");
await db.exec(`UPDATE monitoring_sessions SET status = 'ready', updated_at = ${Date.now()} WHERE id = '${SESSION_ID}'`);

const check = await db.query(`SELECT id, status, started_at, ended_at FROM monitoring_sessions WHERE id = '${SESSION_ID}'`);
console.log("Session row:", check.rows[0]);

await db.close();
console.log("Done — reopen Mitable, the block should show Ready.");
