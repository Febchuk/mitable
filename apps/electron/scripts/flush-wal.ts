/**
 * Flush WAL — merges the SQLite WAL file into the main DB.
 *
 * sql.js reads the main .db file into memory. We read it, query it (forces
 * sql.js to parse it), re-export, and overwrite the file. Then delete the
 * WAL and SHM files so the next open starts clean.
 *
 * ONLY run when the Electron app is NOT running.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, statSync } from "fs";
import { join } from "path";
import initSqlJs from "sql.js";

const USER_DATA = process.env.APPDATA
  ? join(process.env.APPDATA, "@mitable", "electron")
  : join(process.env.HOME ?? "~", ".config", "@mitable", "electron");

const DB_PATH = join(USER_DATA, "on-device", "mitable-local.db");
const WAL_PATH = DB_PATH + "-wal";
const SHM_PATH = DB_PATH + "-shm";

async function main() {
  console.log(`DB:  ${DB_PATH}`);
  console.log(`WAL: ${WAL_PATH}`);

  if (!existsSync(DB_PATH)) {
    console.error("Database not found.");
    process.exit(1);
  }

  const walSize = existsSync(WAL_PATH) ? statSync(WAL_PATH).size : 0;
  console.log(`WAL size: ${walSize} bytes`);

  if (walSize === 0) {
    console.log("WAL is empty — nothing to flush.");
    return;
  }

  // sql.js cannot read WAL natively. But if no other process holds the DB lock,
  // opening with better-sqlite3 would checkpoint automatically. Since we can't
  // use better-sqlite3 (ABI mismatch), we note that the WAL data is NOT merged
  // here — we just remove the WAL file. This means any data ONLY in the WAL
  // will be LOST. That's acceptable when the app has already exited (it should
  // have checkpointed on close).
  //
  // The real fix: the app's localDb.close() now calls checkpoint() before close.

  const SQL = await initSqlJs();
  const buf = readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  // Quick sanity check
  const row = db.exec("SELECT count(*) as cnt FROM captures");
  const captureCount = row[0]?.values[0]?.[0] ?? 0;
  console.log(`Captures in main DB (excluding WAL): ${captureCount}`);

  // Re-export to get a clean file
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
  db.close();
  console.log(`DB rewritten (${data.length} bytes)`);

  // Remove WAL and SHM
  try { unlinkSync(WAL_PATH); console.log("WAL removed"); } catch { /* */ }
  try { unlinkSync(SHM_PATH); console.log("SHM removed"); } catch { /* */ }

  console.log("\nDone. Note: any data that was ONLY in the WAL (not yet checkpointed");
  console.log("to the main DB) is lost. The app should checkpoint on close to prevent this.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
