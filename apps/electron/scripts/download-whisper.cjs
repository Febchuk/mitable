/**
 * Build-time script: Download whisper-cli binary for the current platform.
 *
 * Run before electron-builder so the binary is bundled via extraResources.
 *   - Windows: downloads pre-built whisper-bin-x64.zip and extracts
 *   - macOS:   downloads source and builds with cmake + Metal GPU
 *
 * Usage:  node scripts/download-whisper.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const WHISPER_VERSION = "v1.8.4";

const WHISPER_WIN_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-bin-x64.zip`;
const WHISPER_SRC_URL = `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/${WHISPER_VERSION}.tar.gz`;

const RESOURCES_DIR = path.join(__dirname, "..", "resources", "whisper");

function follow(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    proto.get(url, { headers: { "User-Agent": "mitable-build" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return follow(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    }).on("error", reject);
  });
}

async function setupWindows() {
  const destDir = path.join(RESOURCES_DIR, "win");
  const releaseDir = path.join(destDir, "Release");

  if (fs.existsSync(path.join(releaseDir, "whisper-cli.exe"))) {
    console.log("[download-whisper] Windows binary already present, skipping.");
    return;
  }

  fs.mkdirSync(destDir, { recursive: true });
  const zipPath = path.join(destDir, "_whisper.zip");

  console.log(`[download-whisper] Downloading ${WHISPER_WIN_URL} ...`);
  await follow(WHISPER_WIN_URL, zipPath);

  console.log("[download-whisper] Extracting...");
  execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: "inherit" });

  try { fs.unlinkSync(zipPath); } catch { /* ok */ }
  console.log("[download-whisper] Windows whisper-cli ready at", releaseDir);
}

async function setupMacOS() {
  const destDir = path.join(RESOURCES_DIR, "mac");
  const binDir = path.join(destDir, "bin");

  if (fs.existsSync(path.join(binDir, "whisper-cli"))) {
    console.log("[download-whisper] macOS binary already present, skipping.");
    return;
  }

  fs.mkdirSync(destDir, { recursive: true });

  try {
    execSync("cmake --version", { stdio: "pipe" });
  } catch {
    throw new Error("cmake is required to build whisper on macOS. Install with: brew install cmake");
  }

  const buildDir = path.join(destDir, "_build");
  fs.mkdirSync(buildDir, { recursive: true });

  const tarPath = path.join(destDir, "_src.tar.gz");
  console.log(`[download-whisper] Downloading whisper.cpp source...`);
  await follow(WHISPER_SRC_URL, tarPath);

  console.log("[download-whisper] Extracting source...");
  execSync(`tar -xzf "${tarPath}" -C "${buildDir}"`, { stdio: "inherit" });
  try { fs.unlinkSync(tarPath); } catch { /* ok */ }

  const versionNum = WHISPER_VERSION.replace(/^v/, "");
  const sourceDir = path.join(buildDir, `whisper.cpp-${versionNum}`);

  console.log("[download-whisper] Building with Metal GPU...");
  execSync("cmake -B build -DGGML_METAL=ON", { cwd: sourceDir, stdio: "inherit", timeout: 120000 });
  execSync("cmake --build build -j --config Release", { cwd: sourceDir, stdio: "inherit", timeout: 600000 });

  fs.mkdirSync(binDir, { recursive: true });
  const builtBin = path.join(sourceDir, "build", "bin", "whisper-cli");
  fs.copyFileSync(builtBin, path.join(binDir, "whisper-cli"));
  fs.chmodSync(path.join(binDir, "whisper-cli"), 0o755);

  fs.rmSync(buildDir, { recursive: true, force: true });
  console.log("[download-whisper] macOS whisper-cli ready at", binDir);
}

async function main() {
  const platform = process.platform;
  console.log(`[download-whisper] Platform: ${platform}`);

  if (platform === "win32") {
    await setupWindows();
  } else if (platform === "darwin") {
    await setupMacOS();
  } else {
    console.log("[download-whisper] Unsupported platform, skipping whisper bundling.");
  }
}

main().catch((err) => {
  console.error("[download-whisper] FAILED:", err.message);
  process.exit(1);
});
