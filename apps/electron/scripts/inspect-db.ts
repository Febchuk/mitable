import { join } from "path";
import { readFileSync } from "fs";
import initSqlJs from "sql.js";

const DB_PATH = join(
  process.env.APPDATA!,
  "@mitable",
  "electron",
  "on-device",
  "mitable-local.db"
);

async function main() {
  const SQL = await initSqlJs();
  const buf = readFileSync(DB_PATH);
  const db = new SQL.Database(buf);

  console.log("=== ALL SESSIONS IN SQLITE ===\n");
  console.log("DB:", DB_PATH, "\n");

  const tables = ["captures", "classifications", "stories", "transcriptions"];
  const allSessions = new Map<string, Record<string, number>>();

  for (const table of tables) {
    const stmt = db.prepare(
      `SELECT session_id, COUNT(*) as cnt FROM ${table} GROUP BY session_id`
    );
    while (stmt.step()) {
      const row = stmt.getAsObject() as { session_id: string; cnt: number };
      if (!allSessions.has(row.session_id))
        allSessions.set(row.session_id, {});
      allSessions.get(row.session_id)![table] = row.cnt;
    }
    stmt.free();
  }

  if (allSessions.size === 0) {
    console.log("(empty database — no sessions found)");
    db.close();
    return;
  }

  for (const [sid, counts] of allSessions) {
    console.log(`Session: ${sid}`);
    console.log(`  captures:         ${counts.captures || 0}`);
    console.log(`  classifications:  ${counts.classifications || 0}`);
    console.log(`  stories:          ${counts.stories || 0}`);
    console.log(`  transcriptions:   ${counts.transcriptions || 0}`);

    if (counts.stories) {
      const s2 = db.prepare(
        "SELECT narrative, tasks, model_used FROM stories WHERE session_id = ?"
      );
      s2.bind([sid]);
      if (s2.step()) {
        const story = s2.getAsObject() as {
          narrative: string;
          tasks: string;
          model_used: string;
        };
        let taskCount = 0;
        try {
          taskCount = JSON.parse(story.tasks).length;
        } catch {}
        console.log(`  story tasks:      ${taskCount}`);
        console.log(`  story model:      ${story.model_used}`);
        console.log(
          `  narrative:        ${String(story.narrative).slice(0, 120)}...`
        );
      }
      s2.free();
    }

    if (counts.classifications) {
      const s3 = db.prepare(
        "SELECT activity_description FROM classifications WHERE session_id = ? LIMIT 2"
      );
      s3.bind([sid]);
      const samples: string[] = [];
      while (s3.step())
        samples.push(
          String(
            (s3.getAsObject() as { activity_description: string })
              .activity_description
          )
        );
      s3.free();
      const hasBroken = samples.some((d) => d.includes("<think>"));
      console.log(
        `  class quality:    ${hasBroken ? "BROKEN (<think>)" : "OK"}`
      );
      console.log(`  sample:           ${samples[0]?.slice(0, 100)}`);
    }

    if (counts.captures) {
      const s4 = db.prepare(
        "SELECT MIN(captured_at) as earliest, MAX(captured_at) as latest FROM captures WHERE session_id = ?"
      );
      s4.bind([sid]);
      if (s4.step()) {
        const range = s4.getAsObject() as {
          earliest: number;
          latest: number;
        };
        console.log(
          `  time range:       ${new Date(range.earliest).toLocaleString()} — ${new Date(range.latest).toLocaleString()}`
        );
        console.log(
          `  duration:         ${Math.round((range.latest - range.earliest) / 60000)} min`
        );
      }
      s4.free();
    }

    console.log("");
  }

  db.close();
}

main();
