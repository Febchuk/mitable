/**
 * PII Redaction Test Script
 *
 * This script:
 * 1. Captures a screenshot of your primary monitor using Electron
 * 2. Sends it to the PII redaction API
 * 3. Saves both original and redacted images to ./redacted_images/
 *
 * Usage:
 * 1. Make sure backend is running: npm run dev --workspace=apps/backend
 * 2. Run this script: npm run test:pii
 */

import { app, desktopCapturer } from "electron";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:3000";
const OUTPUT_DIR = join(__dirname, "redacted_images");

async function captureScreen(): Promise<string> {
  console.log("📸 Capturing screenshot of primary monitor at FULL resolution...");

  // Capture at native screen resolution (no resize)
  // This preserves pixel-perfect coordinates for DLP
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: 3840, // Support up to 4K displays
      height: 2160,
    },
  });

  if (sources.length === 0) {
    throw new Error("No screen sources found");
  }

  // Use first screen (primary monitor)
  const primaryScreen = sources[0];
  const image = primaryScreen.thumbnail;
  const size = image.getSize();

  console.log(`✅ Captured: ${primaryScreen.name}`);
  console.log(`📐 Resolution: ${size.width}x${size.height}`);

  // Convert to base64 data URL (PNG format, lossless)
  const dataUrl = image.toDataURL();

  return dataUrl;
}

async function redactPII(screenshot: string): Promise<{
  success: boolean;
  redactedScreenshot: string;
  detectionTime: number;
  piiCount: number;
  cached: boolean;
  error?: string;
}> {
  console.log("🔒 Sending to PII redaction API...");

  const response = await fetch(`${API_BASE_URL}/api/pii/redact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Note: In production, you'd need an auth token
      // For testing, you may need to temporarily disable auth
    },
    body: JSON.stringify({ screenshot }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return (await response.json()) as {
    success: boolean;
    redactedScreenshot: string;
    detectionTime: number;
    piiCount: number;
    cached: boolean;
    error?: string;
  };
}

function base64ToBuffer(dataUrl: string): Buffer {
  // Remove data URL prefix
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64Data, "base64");
}

async function saveImages(original: string, redacted: string) {
  const timestamp = Date.now();

  // Create directory if it doesn't exist
  await mkdir(OUTPUT_DIR, { recursive: true });

  const originalPath = join(OUTPUT_DIR, `original_${timestamp}.png`);
  const redactedPath = join(OUTPUT_DIR, `redacted_${timestamp}.png`);

  console.log("💾 Saving images...");

  await writeFile(originalPath, base64ToBuffer(original));
  await writeFile(redactedPath, base64ToBuffer(redacted));

  console.log(`✅ Original saved: ${originalPath}`);
  console.log(`✅ Redacted saved: ${redactedPath}`);
}

async function main() {
  try {
    console.log("🚀 PII Redaction Test Starting...\n");

    // 1. Capture screenshot
    const screenshot = await captureScreen();
    console.log(`📊 Screenshot size: ${(screenshot.length / 1024).toFixed(2)} KB\n`);

    // 2. Redact PII
    const result = await redactPII(screenshot);

    if (!result.success) {
      throw new Error(result.error || "Redaction failed");
    }

    console.log("\n✅ PII Redaction Complete!");
    console.log(`⏱️  Detection Time: ${result.detectionTime}ms`);
    console.log(`🔍 PII Regions Found: ${result.piiCount}`);
    console.log(`💾 Cached: ${result.cached ? "Yes" : "No"}\n`);

    // 3. Save images
    await saveImages(screenshot, result.redactedScreenshot);

    console.log("\n🎉 Test Complete! Check ./scripts/redacted_images/ for results.");
    app.quit();
  } catch (error) {
    console.error("\n❌ Test Failed:");
    console.error(error);
    app.quit();
    process.exit(1);
  }
}

// Wait for Electron to be ready
app.whenReady().then(main);

// Prevent Electron from quitting when all windows are closed
app.on("window-all-closed", () => {
  // Do nothing - we'll quit manually
});
