const { execSync } = require("child_process");
const path = require("path");

try {
  const electronPkg = require(path.join(
    __dirname,
    "..",
    "node_modules",
    "electron",
    "package.json"
  ));
  const version = electronPkg.version;
  console.log(`Rebuilding better-sqlite3 for Electron ${version}...`);
  execSync(
    `npx @electron/rebuild --version ${version} --module-dir node_modules/better-sqlite3 --force`,
    { stdio: "inherit", cwd: path.join(__dirname, "..") }
  );
  console.log("Native module rebuild complete.");
} catch (err) {
  console.warn("Native module rebuild skipped:", err.message);
}
