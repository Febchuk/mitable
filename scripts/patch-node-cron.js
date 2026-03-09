/**
 * Patch node-cron v4 to skip the blocking "missed execution" while loop.
 *
 * node-cron's runner.js has a synchronous while loop that logs a warning
 * for every missed cron slot since the server was last running. With a
 * 15-minute schedule and hours of downtime, this blocks the event loop
 * and prevents the backend from starting.
 *
 * This script removes the logger.warn + onMissedExecution calls from the
 * loop, keeping only the fast-forward to the next valid execution time.
 *
 * Run automatically via "postinstall" in package.json.
 */

const fs = require("fs");
const path = require("path");

const files = [
  path.join(__dirname, "..", "node_modules", "node-cron", "dist", "esm", "scheduler", "runner.js"),
  path.join(__dirname, "..", "node_modules", "node-cron", "dist", "cjs", "scheduler", "runner.js"),
];

const search = `                    logger_1.default.warn(\`missed execution at \${expectedNextExecution}! Possible blocking IO or high CPU user at the same process used by node-cron.\`);
                    expectedNextExecution = this.timeMatcher.getNextMatch(expectedNextExecution);
                    runAsync(this.onMissedExecution, expectedNextExecution, defaultOnError);`;

const replace = `                    expectedNextExecution = this.timeMatcher.getNextMatch(expectedNextExecution);`;

let patched = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes("missed execution")) {
    patched++;
    continue; // Already patched
  }
  fs.writeFileSync(file, content.replace(search, replace), "utf8");
  patched++;
}

if (patched > 0) {
  console.log(
    `[patch-node-cron] Patched ${patched} runner.js file(s) — missed execution loop disabled`
  );
} else {
  console.log("[patch-node-cron] node-cron not found, skipping");
}
