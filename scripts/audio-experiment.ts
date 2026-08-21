/**
 * Audio Source Experiment
 *
 * Interactive CLI that captures three 30-second scenarios and transcribes each
 * with Whisper to compare how well the system separates audio sources.
 *
 * Scenario A — System audio only  (native-audio-node WASAPI loopback, same as app)
 * Scenario B — Mic only           (ffmpeg DirectShow, same as app)
 * Scenario C — Both streams       (both captured simultaneously, same as app)
 *
 * Usage:
 *   npm run audio-experiment [-- --prod]
 */

import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

// ── Config ────────────────────────────────────────────────────────────────────

const DURATION_SEC = 30;
const SAMPLE_RATE = 16000;
const isProd = process.argv.includes("--prod");
const bleedOnly = process.argv.includes("--bleed");
const appDir = isProd ? "@mitable" : "@mitable-dev";

const WHISPER_CLI = join(
  process.cwd(),
  "apps/electron/resources/whisper/win/Release/whisper-cli.exe"
);
const WHISPER_MODEL = join(
  process.env.APPDATA ?? "",
  appDir,
  "electron/on-device/models/ggml-medium.en.bin"
);

const OUT_DIR = join(tmpdir(), `mitable-audio-exp-${randomUUID().slice(0, 8)}`);

// ── Helpers ───────────────────────────────────────────────────────────────────

function waitForEnter(prompt: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function findFfmpeg(): string {
  try {
    return execSync("where ffmpeg", { encoding: "utf-8", shell: "cmd.exe" })
      .trim()
      .split("\n")[0]
      .trim();
  } catch {
    throw new Error("ffmpeg not found in PATH. Install it and try again.");
  }
}

function discoverDefaultMic(ffmpegPath: string): string {
  let raw = "";
  try {
    raw = execSync(`"${ffmpegPath}" -list_devices true -f dshow -i dummy 2>&1`, {
      encoding: "utf-8",
      shell: "cmd.exe",
      timeout: 6000,
    });
  } catch (err: any) {
    raw = (err.stdout ?? "") + (err.stderr ?? "");
  }
  const lines = raw.split("\n").filter((l) => l.includes("(audio)"));
  for (const line of lines) {
    const m = line.match(/"([^"]+)"/);
    if (m) return m[1];
  }
  throw new Error("No audio input device found via ffmpeg -list_devices.");
}

/**
 * Auto-detect float32 PCM (from native-audio-node SystemAudioRecorder) and
 * convert to int16. ffmpeg mic output is already int16 — pass through unchanged.
 */
function ensureInt16(pcm: Buffer): Buffer {
  if (pcm.length < 400) return pcm;
  const probe = new Float32Array(
    pcm.buffer,
    pcm.byteOffset,
    Math.min(100, Math.floor(pcm.byteLength / 4))
  );
  const isFloat32 = Array.from(probe).every((v) => v >= -1.5 && v <= 1.5);
  if (!isFloat32) return pcm;

  const floats = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
  const int16 = Buffer.alloc(floats.length * 2);
  for (let i = 0; i < floats.length; i++) {
    const clamped = Math.max(-1, Math.min(1, floats[i]));
    int16.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  return int16;
}

function buildPcmToWav(pcm: Buffer, isSystemAudio = false): Buffer {
  const int16 = isSystemAudio ? ensureInt16(pcm) : pcm;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = int16.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, int16]);
}

/**
 * Capture system audio via native-audio-node SystemAudioRecorder (WASAPI loopback).
 * This is the exact same mechanism the Mitable app uses in production.
 */
async function captureSystemAudio(durationSec: number, label: string): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nativeAudio = require("native-audio-node");

  const chunks: Buffer[] = [];
  let errorMsg: string | null = null;

  const recorder = new nativeAudio.SystemAudioRecorder({
    sampleRate: SAMPLE_RATE,
    chunkDurationMs: 200,
    stereo: false,
    emitSilence: false,
  });

  recorder.on("data", (chunk: { data: Buffer }) => {
    if (chunk.data?.length) chunks.push(chunk.data);
  });

  recorder.on("error", (err: Error) => {
    errorMsg = err.message;
    console.error(`\n  ⚠ System recorder error: ${err.message}`);
  });

  process.stdout.write(`  Capturing ${label}`);
  const dots = setInterval(() => process.stdout.write("."), 1000);

  await recorder.start();
  await sleep(durationSec * 1000);
  await recorder.stop();

  clearInterval(dots);
  const total = chunks.reduce((a, c) => a + c.length, 0);
  process.stdout.write(` done (${(total / 1024).toFixed(0)} KB)\n`);

  if (total === 0 && errorMsg) {
    console.error(`  ✗ SystemAudioRecorder captured 0 bytes. Error: ${errorMsg}`);
  } else if (total === 0) {
    console.error(
      `  ✗ SystemAudioRecorder captured 0 bytes — no audio playing or WASAPI unavailable`
    );
  }

  return Buffer.concat(chunks);
}

/** Capture microphone via ffmpeg DirectShow (same as app). */
function captureMic(
  ffmpegPath: string,
  micName: string,
  durationSec: number,
  label: string
): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const stderrLines: string[] = [];

    const args = [
      "-f",
      "dshow",
      "-i",
      `audio=${micName}`,
      "-ar",
      String(SAMPLE_RATE),
      "-ac",
      "1",
      "-f",
      "s16le",
      "pipe:1",
    ];

    const proc = spawn(ffmpegPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });

    proc.stdout!.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr!.on("data", (c: Buffer) => {
      const lines = c.toString().split("\n");
      for (const l of lines) {
        if (l.trim()) stderrLines.push(l.trim());
        if (stderrLines.length > 20) stderrLines.shift();
      }
    });

    process.stdout.write(`  Capturing ${label}`);
    const dots = setInterval(() => process.stdout.write("."), 1000);

    const stopTimer = setTimeout(() => {
      try {
        proc.stdin?.write("q\n");
        proc.stdin?.end();
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 2000);
    }, durationSec * 1000);

    proc.on("close", (code) => {
      clearInterval(dots);
      clearTimeout(stopTimer);
      const total = chunks.reduce((a, c) => a + c.length, 0);
      process.stdout.write(` done (${(total / 1024).toFixed(0)} KB)\n`);
      if (total === 0) {
        console.error(`  ✗ ffmpeg mic captured 0 bytes (exit ${code})`);
        console.error(`    ${stderrLines.slice(-5).join("\n    ")}`);
      }
      resolve(Buffer.concat(chunks));
    });

    proc.on("error", (err) => {
      clearInterval(dots);
      clearTimeout(stopTimer);
      console.error(`  ✗ ffmpeg error: ${err.message}`);
      resolve(Buffer.alloc(0));
    });
  });
}

/** Run whisper-cli on a WAV file, returns transcript text */
function transcribe(wavPath: string): Promise<string> {
  return new Promise((resolve) => {
    const args = [
      "-m",
      WHISPER_MODEL,
      "-f",
      wavPath,
      "--no-timestamps",
      "--language",
      "en",
      "-np",
      "-nt",
    ];

    let out = "";
    const proc = spawn(WHISPER_CLI, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    proc.stdout!.on("data", (c: Buffer) => (out += c.toString()));
    proc.stderr!.on("data", () => {});
    proc.on("close", () => resolve(out.trim()));
    proc.on("error", (err) => resolve(`[whisper error: ${err.message}]`));
  });
}

function box(title: string, content: string): void {
  const width = 70;
  const line = "─".repeat(width);
  console.log(`\n┌${line}┐`);
  console.log(`│  ${title.padEnd(width - 2)}│`);
  console.log(`├${line}┤`);
  for (const l of content.split("\n")) {
    const chunks = l.match(/.{1,66}/g) ?? [""];
    for (const chunk of chunks) {
      console.log(`│  ${chunk.padEnd(width - 2)}│`);
    }
  }
  console.log(`└${line}┘`);
}

// ── Scenario C (extractable) ──────────────────────────────────────────────────

async function runScenarioC(
  ffmpeg: string,
  micName: string,
  results: { label: string; scenario: string; transcript: string }[]
): Promise<void> {
  await waitForEnter(
    "─── SCENARIO C: Both streams ───────────────────────────────────────\n" +
      "  Play the YouTube video loudly so it bleeds into the mic.\n" +
      "  Speak clearly at different distances from the mic.\n" +
      "  Both streams captured simultaneously (replicates real session).\n" +
      "> Press Enter to start 30s capture: "
  );

  console.log(`\n  [C] Capturing both streams simultaneously for ${DURATION_SEC}s...`);

  const systemChunksC: Buffer[] = [];
  let systemErrorC: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nativeAudio = require("native-audio-node");
  const recorderC = new nativeAudio.SystemAudioRecorder({
    sampleRate: SAMPLE_RATE,
    chunkDurationMs: 200,
    stereo: false,
    emitSilence: false,
  });
  recorderC.on("data", (chunk: { data: Buffer }) => {
    if (chunk.data?.length) systemChunksC.push(chunk.data);
  });
  recorderC.on("error", (err: Error) => {
    systemErrorC = err.message;
  });

  await recorderC.start();
  const micPcmC = await captureMic(ffmpeg, micName, DURATION_SEC, "mic (C)");
  await recorderC.stop();

  const systemPcmC = Buffer.concat(systemChunksC);
  console.log(
    `  System loopback (C): ${(systemPcmC.length / 1024).toFixed(0)} KB${systemErrorC ? ` — error: ${systemErrorC}` : ""}`
  );

  const bothSystemWav = join(OUT_DIR, "scenario_c_system.wav");
  const bothMicWav = join(OUT_DIR, "scenario_c_mic.wav");
  writeFileSync(bothSystemWav, buildPcmToWav(systemPcmC, true));
  writeFileSync(bothMicWav, buildPcmToWav(micPcmC));

  console.log("  [C] Transcribing system stream...");
  const transcriptC_system = await transcribe(bothSystemWav);
  console.log("  [C] Transcribing mic stream...");
  const transcriptC_mic = await transcribe(bothMicWav);

  results.push({
    label: "C-system",
    scenario: "Both — loopback channel",
    transcript: transcriptC_system || "(no speech detected)",
  });
  results.push({
    label: "C-mic",
    scenario: "Both — mic channel",
    transcript: transcriptC_mic || "(no speech detected)",
  });
  console.log("  [C] Done.\n");
}

function printResults(
  results: { label: string; scenario: string; transcript: string }[],
  flags: { systemOnlyHasContent?: boolean; micOnlyHasContent?: boolean } = {}
): void {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  RESULTS");
  console.log("════════════════════════════════════════════════════════════════════");

  for (const r of results) {
    box(`[${r.label}] ${r.scenario}`, r.transcript);
  }

  const cSystem = results.find((r) => r.label === "C-system")?.transcript ?? "";
  const cMic = results.find((r) => r.label === "C-mic")?.transcript ?? "";
  const loopbackBleedIntoMic =
    cSystem.length > 20 &&
    cMic.length > 20 &&
    cMic.split(" ").some((w) => w.length > 4 && cSystem.includes(w));

  console.log("\n────────────────────────────────────────────────────────────────────");
  console.log("  DIAGNOSIS");
  console.log("────────────────────────────────────────────────────────────────────");

  if (flags.systemOnlyHasContent !== undefined)
    console.log(
      `\n  System audio loopback working : ${flags.systemOnlyHasContent ? "✓ YES" : "✗ NO"}`
    );
  if (flags.micOnlyHasContent !== undefined)
    console.log(
      `  Mic capture working           : ${flags.micOnlyHasContent ? "✓ YES" : "✗ NO — check mic permissions"}`
    );
  console.log(
    `  Bleed detected in Scenario C  : ${loopbackBleedIntoMic ? "⚠ YES — mic is picking up speaker audio" : "✓ Streams appear clean"}`
  );

  if (loopbackBleedIntoMic) {
    console.log("\n  ⚠  Scenario C mic stream contains loopback words — energy gating");
    console.log("     threshold or bleed rejection ratio may need tuning.");
  }

  console.log(`\n  WAV files in: ${OUT_DIR}`);
  console.log("════════════════════════════════════════════════════════════════════\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  Mitable Audio Source Experiment");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log(`  Duration per scenario : ${DURATION_SEC}s`);
  console.log(`  System audio          : native-audio-node (WASAPI loopback)`);
  console.log(`  Mic audio             : ffmpeg DirectShow`);
  console.log(`  Whisper CLI           : ${WHISPER_CLI}`);
  console.log(`  Whisper model         : ${WHISPER_MODEL}`);
  console.log("════════════════════════════════════════════════════════════════════\n");

  if (!existsSync(WHISPER_CLI)) {
    console.error(`✗ whisper-cli.exe not found at:\n  ${WHISPER_CLI}`);
    process.exit(1);
  }
  if (!existsSync(WHISPER_MODEL)) {
    console.error(`✗ Whisper model not found at:\n  ${WHISPER_MODEL}`);
    console.error(`  Run the app once to download it, or use --prod flag.`);
    process.exit(1);
  }

  // Check native-audio-node is loadable
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nativeAudio = require("native-audio-node");
    if (typeof nativeAudio.SystemAudioRecorder !== "function") {
      throw new Error("SystemAudioRecorder not found in native-audio-node exports");
    }
    console.log("✓ native-audio-node loaded (SystemAudioRecorder available)");
  } catch (err: any) {
    console.error(`✗ native-audio-node failed to load: ${err.message}`);
    console.error(`  This is the same module the app uses for system audio.`);
    console.error(
      `  If the ABI mismatch error appears, the built .exe also won't capture system audio.`
    );
    process.exit(1);
  }

  const ffmpeg = findFfmpeg();
  console.log(`✓ ffmpeg: ${ffmpeg}`);

  const micName = discoverDefaultMic(ffmpeg);
  console.log(`✓ Default mic: "${micName}"\n`);

  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`  Output dir: ${OUT_DIR}\n`);

  const results: { label: string; scenario: string; transcript: string }[] = [];

  if (bleedOnly) {
    await runScenarioC(ffmpeg, micName, results);
    printResults(results);
    return;
  }

  // ── Scenario A: System audio only ─────────────────────────────────────────
  await waitForEnter(
    "─── SCENARIO A: System audio only ─────────────────────────────────\n" +
      "  Start a YouTube video at a comfortable volume, then press Enter.\n" +
      "  Mic is NOT used — only WASAPI loopback (same as app's remote stream).\n" +
      "> Press Enter to start 30s capture: "
  );

  console.log(`\n  [A] Capturing system audio (WASAPI loopback) for ${DURATION_SEC}s...`);
  const systemPcm = await captureSystemAudio(DURATION_SEC, "system audio");
  const systemWav = join(OUT_DIR, "scenario_a_system.wav");
  writeFileSync(systemWav, buildPcmToWav(systemPcm, true));

  console.log("  [A] Transcribing...");
  const transcriptA = await transcribe(systemWav);
  results.push({
    label: "A",
    scenario: "System audio only (WASAPI loopback)",
    transcript: transcriptA || "(no speech detected)",
  });
  console.log("  [A] Done.\n");

  // ── Scenario B: Mic only ──────────────────────────────────────────────────
  await waitForEnter(
    "─── SCENARIO B: Mic only ───────────────────────────────────────────\n" +
      "  Stop or mute the YouTube video. Speak normally for 30 seconds.\n" +
      "  Only mic captured via ffmpeg DirectShow (same as app's user stream).\n" +
      "> Press Enter to start 30s capture: "
  );

  console.log(`\n  [B] Capturing mic only (ffmpeg DirectShow) for ${DURATION_SEC}s...`);
  const micPcm = await captureMic(ffmpeg, micName, DURATION_SEC, "mic");
  const micWav = join(OUT_DIR, "scenario_b_mic.wav");
  writeFileSync(micWav, buildPcmToWav(micPcm));

  console.log("  [B] Transcribing...");
  const transcriptB = await transcribe(micWav);
  results.push({
    label: "B",
    scenario: "Mic only (ffmpeg DirectShow)",
    transcript: transcriptB || "(no speech detected)",
  });
  console.log("  [B] Done.\n");

  // ── Scenario C: Both ──────────────────────────────────────────────────────
  await runScenarioC(ffmpeg, micName, results);

  // ── Results ───────────────────────────────────────────────────────────────
  const systemOnlyHasContent = transcriptA.length > 20;
  const micOnlyHasContent = transcriptB.length > 20;
  printResults(results, { systemOnlyHasContent, micOnlyHasContent });

  const reportPath = join(OUT_DIR, "report.txt");
  writeFileSync(
    reportPath,
    [
      `Mitable Audio Experiment — ${new Date().toISOString()}`,
      `ffmpeg: ${ffmpeg}`,
      `Mic device: ${micName}`,
      `Whisper model: ${WHISPER_MODEL}`,
      "",
      ...results.map((r) => `[${r.label}] ${r.scenario}\n${r.transcript}\n`),
    ].join("\n")
  );

  console.log(`\n  Full report saved to:\n  ${reportPath}`);
  console.log("\n  WAV files kept in:\n  " + OUT_DIR);
  console.log("\n════════════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n✗ Fatal error:", err.message);
  process.exit(1);
});
