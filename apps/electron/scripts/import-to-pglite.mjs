#!/usr/bin/env node
/**
 * Direct import from migration-data.json into PGlite
 * No Electron needed - runs standalone with Node.js
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const MIGRATION_PATH = join(
  homedir(),
  "AppData/Roaming/@mitable/electron/on-device/migration-data.json"
);

const PGLITE_PATH = join(
  homedir(),
  "AppData/Roaming/@mitable/electron/on-device/mitable-pg"
);

console.log("Loading migration data from:", MIGRATION_PATH);
console.log("Writing to PGlite at:", PGLITE_PATH);

if (!existsSync(MIGRATION_PATH)) {
  console.error("No migration-data.json found!");
  process.exit(1);
}

const data = JSON.parse(readFileSync(MIGRATION_PATH, "utf-8"));
console.log("\nData to import:");
console.log(`  Organizations: ${data.organizations.length}`);
console.log(`  Users: ${data.users.length}`);
console.log(`  Sessions: ${data.sessions.length}`);
console.log(`  Captures: ${data.captures.length}`);
console.log(`  Stories: ${data.stories.length}`);
console.log(`  Local accounts: ${data.localAccounts.length}`);

const db = new PGlite(`file://${PGLITE_PATH}`);

// Wait for ready
await db.waitReady;
console.log("\nPGlite ready, importing data...\n");

let imported = { orgs: 0, users: 0, sessions: 0, captures: 0, stories: 0, accounts: 0 };

// 1. Import organizations
for (const org of data.organizations) {
  try {
    await db.query(`
      INSERT INTO organizations (id, name, domain, settings, is_internal, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `, [org.id, org.name || "Org", org.domain, org.settings || "{}", org.is_internal || false, org.created_at, org.updated_at]);
    imported.orgs++;
  } catch (e) { console.log(`  Org ${org.id}: ${e.message}`); }
}
console.log(`Imported ${imported.orgs} organizations`);

// 2. Import users
for (const user of data.users) {
  try {
    await db.query(`
      INSERT INTO users (id, organization_id, email, first_name, last_name, role, avatar_url, current_week, start_date, status, job_title, regular_tasks, regular_apps, additional_context, manager_id, team_id, department, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (id) DO NOTHING
    `, [user.id, user.organization_id, user.email, user.first_name, user.last_name, user.role || "member", user.avatar_url, user.current_week || 1, user.start_date, user.status || "active", user.job_title, user.regular_tasks || "[]", user.regular_apps || "[]", user.additional_context, user.manager_id, user.team_id, user.department, user.created_at, user.updated_at]);
    imported.users++;
  } catch (e) { console.log(`  User ${user.id}: ${e.message}`); }
}
console.log(`Imported ${imported.users} users`);

// 3. Import sessions
for (const s of data.sessions) {
  try {
    await db.query(`
      INSERT INTO monitoring_sessions (id, organization_id, user_id, name, session_goal, session_type, status, capture_interval_ms, selected_windows, started_at, ended_at, total_paused_ms, final_summary)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO NOTHING
    `, [s.id, s.organization_id, s.user_id, s.name, s.session_goal, s.session_type || "focused", s.status, s.capture_interval_ms || 30000, s.selected_windows || "[]", s.started_at, s.ended_at, s.total_paused_ms || 0, s.final_summary]);
    imported.sessions++;
  } catch (e) { console.log(`  Session ${s.id}: ${e.message}`); }
}
console.log(`Imported ${imported.sessions} sessions`);

// 4. Import captures
for (const c of data.captures) {
  try {
    await db.query(`
      INSERT INTO captures (id, session_id, frame_id, sequence_number, captured_at, window_id, app_name, window_title, sensor_output, delta_changed, change_type, user_action)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO NOTHING
    `, [c.id, c.session_id, c.frame_id, c.sequence_number, c.captured_at, c.window_id, c.app_name, c.window_title, c.sensor_output, c.delta_changed || false, c.change_type, c.user_action]);
    imported.captures++;
  } catch (e) { console.log(`  Capture ${c.id}: ${e.message}`); }
}
console.log(`Imported ${imported.captures} captures`);

// 5. Import stories
for (const st of data.stories) {
  try {
    await db.query(`
      INSERT INTO stories (id, session_id, narrative, tasks, time_breakdown, model_used, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `, [st.id, st.session_id, st.narrative, st.tasks || "[]", st.time_breakdown || "{}", st.model_used, st.created_at || Date.now()]);
    imported.stories++;
  } catch (e) { console.log(`  Story ${st.id}: ${e.message}`); }
}
console.log(`Imported ${imported.stories} stories`);

// 6. Import local accounts
for (const acc of data.localAccounts) {
  try {
    await db.query(`
      INSERT INTO local_accounts (id, email, password_hash, first_name, last_name, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING
    `, [acc.id, acc.email, acc.password_hash, acc.first_name, acc.last_name, acc.created_at, acc.updated_at]);
    imported.accounts++;
  } catch (e) { console.log(`  Account ${acc.email}: ${e.message}`); }
}
console.log(`Imported ${imported.accounts} local accounts`);

// 7. Mark migration complete
await db.query(`
  INSERT INTO user_preferences (user_id, key, value)
  VALUES ('system', 'sqlite_migration_complete', 'true')
  ON CONFLICT (user_id, key) DO UPDATE SET value = 'true'
`);

await db.close();

console.log("\n✓ Import complete!");
console.log("You can now run the Mitable app and log in.");
