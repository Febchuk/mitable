#!/usr/bin/env node
/**
 * Fix esbuild binary version mismatches in nested node_modules.
 *
 * Problem: npm hoists esbuild to root, but packages like electron-vite and tsx
 * have their own nested esbuild with different version requirements. The binaries
 * get shared/overwritten, causing "Host version X does not match binary version Y" errors.
 *
 * Solution: Install the correct platform-specific esbuild package for each nested esbuild.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const fixes = [
  {
    name: "electron-vite",
    esbuildPath: "node_modules/electron-vite/node_modules/esbuild",
    version: "0.21.5",
  },
  {
    name: "tsx",
    esbuildPath: "node_modules/tsx/node_modules/esbuild",
    version: "0.27.2",
  },
];

// Detect platform
const platform = process.platform;
const arch = process.arch;

let platformPackage;
if (platform === "darwin" && arch === "arm64") {
  platformPackage = "@esbuild/darwin-arm64";
} else if (platform === "darwin" && arch === "x64") {
  platformPackage = "@esbuild/darwin-x64";
} else if (platform === "linux" && arch === "x64") {
  platformPackage = "@esbuild/linux-x64";
} else if (platform === "linux" && arch === "arm64") {
  platformPackage = "@esbuild/linux-arm64";
} else if (platform === "win32" && arch === "x64") {
  platformPackage = "@esbuild/win32-x64";
} else if (platform === "win32" && arch === "arm64") {
  platformPackage = "@esbuild/win32-arm64";
} else {
  console.log(`[fix-esbuild] Unsupported platform: ${platform}-${arch}, skipping`);
  process.exit(0);
}

console.log(`[fix-esbuild] Platform: ${platform}-${arch}, package: ${platformPackage}`);

const rootDir = path.resolve(__dirname, "..");

for (const fix of fixes) {
  const esbuildDir = path.join(rootDir, fix.esbuildPath);

  if (!fs.existsSync(esbuildDir)) {
    console.log(`[fix-esbuild] ${fix.name}: esbuild not found at ${fix.esbuildPath}, skipping`);
    continue;
  }

  const pkg = `${platformPackage}@${fix.version}`;
  console.log(`[fix-esbuild] ${fix.name}: installing ${pkg}...`);

  try {
    execSync(`npm install ${pkg} --no-save`, {
      cwd: esbuildDir,
      stdio: "pipe",
    });
    console.log(`[fix-esbuild] ${fix.name}: ✓ fixed`);
  } catch (err) {
    console.error(`[fix-esbuild] ${fix.name}: ✗ failed - ${err.message}`);
  }
}

console.log("[fix-esbuild] Done");
