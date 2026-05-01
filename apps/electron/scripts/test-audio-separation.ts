/**
 * Audio Energy + Whisper Transcription Test
 *
 * Records mic for a set duration, splits into 5s windows, computes RMS,
 * applies an energy gate, and transcribes ALL windows with whisper-cli
 * so you can compare bleed vs speech output side by side.
 *
 * Usage:
 *   npx tsx apps/electron/scripts/test-audio-separation.ts [durationSecs]
 */

import { spawn, execFileSync, execSync } from "child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DURATION = parseInt(process.argv[2] || "60", 10);
const WINDOW_SECS = 5;
const SAMPLE_RATE = 16_000;
const BYTES_PER_SAMPLE = 2;
const BYTES_PER_WINDOW = WINDOW_SECS * SAMPLE_RATE * BYTES_PER_SAMPLE;
const GATE_THRESHOLD = 500;

const WHISPER_CLI = join(__dirname, "../bin/whisper-cpp/Release/whisper-cli.exe");
const WHISPER_MODEL = join(__dirname, "../bin/whisper-cpp/models/ggml-medium.en.bin");
const TMP_DIR = join(__dirname, "../tmp-test");

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function computeRMS(pcm: Buffer): number {
  const samples = pcm.length / BYTES_PER_SAMPLE;
  if (samples === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < pcm.length; i += BYTES_PER_SAMPLE) {
    const sample = pcm.readInt16LE(i);
    sumSq += sample * sample;
  }
  return Math.sqrt(sumSq / samples);
}

function rmsBar(rms: number, maxWidth = 40): string {
  const normalized = Math.min(rms / 3000, 1);
  const filled = Math.round(normalized * maxWidth);
  return "█".repeat(filled) + "░".repeat(maxWidth - filled);
}

function pcmToWav(pcm: Buffer): Buffer {
  const byteRate = SAMPLE_RATE * 1 * (16 / 8);
  const blockAlign = 1 * (16 / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function transcribeWav(wavPath: string): string {
  try {
    const stdout = execFileSync(
      WHISPER_CLI,
      ["-m", WHISPER_MODEL, "-f", wavPath, "--no-timestamps", "--no-prints", "-t", "4", "-l", "en"],
      { maxBuffer: 10 * 1024 * 1024, timeout: 60_000, encoding: "utf-8" }
    );

    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("["))
      .join(" ")
      .trim();
  } catch (e: any) {
    return `[ERROR: ${e.message?.slice(0, 80)}]`;
  }
}

function recordWithFfmpeg(outputFile: string, durationSecs: number): Promise<void> {
  let micName = "Microphone (TONOR TC310 USB Mic)";
  try {
    const out = execSync("ffmpeg -list_devices true -f dshow -i dummy 2>&1", {
      encoding: "utf-8",
      shell: "cmd.exe",
      timeout: 5000,
    });
    const match = out.match(/"([^"]+)"\s*\(audio\)/);
    if (match) micName = match[1];
  } catch (e: any) {
    const stderr = e.stdout || e.stderr || "";
    const match = stderr.match(/"([^"]+)"\s*\(audio\)/);
    if (match) micName = match[1];
  }

  console.log(`  Mic: ${micName}`);

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      [
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
        "-t",
        String(durationSecs),
        outputFile,
        "-y",
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const startTime = Date.now();
    const ticker = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      process.stdout.write(`\r  Recording... ${elapsed}s / ${durationSecs}s`);
    }, 500);

    proc.on("close", (code) => {
      clearInterval(ticker);
      process.stdout.write("\r" + " ".repeat(60) + "\r");
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`));
    });
    proc.on("error", reject);
  });
}

async function main() {
  if (!existsSync(WHISPER_CLI)) {
    console.error(`whisper-cli.exe not found at: ${WHISPER_CLI}`);
    process.exit(1);
  }
  if (!existsSync(WHISPER_MODEL)) {
    console.error(`Whisper model not found at: ${WHISPER_MODEL}`);
    process.exit(1);
  }

  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  console.log("=== Audio Energy + Whisper Test ===");
  console.log(`Duration: ${DURATION}s | Window: ${WINDOW_SECS}s | Gate: ${GATE_THRESHOLD} RMS\n`);
  console.log("Play a video on your speakers. Stay silent for some windows,");
  console.log("speak clearly during others.\n");

  await ask("Press ENTER to start recording...");

  console.log(`\n  Recording ${DURATION}s of mic audio via ffmpeg...`);
  const pcmFile = join(TMP_DIR, "test_energy.pcm");
  await recordWithFfmpeg(pcmFile, DURATION);
  console.log("  Done!\n");

  const pcm = readFileSync(pcmFile);
  const totalWindows = Math.ceil(pcm.length / BYTES_PER_WINDOW);

  console.log(
    `  Total: ${(pcm.length / SAMPLE_RATE / BYTES_PER_SAMPLE).toFixed(1)}s, ${totalWindows} windows\n`
  );

  // Phase 1: RMS analysis
  console.log("  ── Phase 1: Energy Analysis ──\n");
  console.log("  Window | Time       | RMS   | Bar");
  console.log("  -------+------------+-------+------------------------------------------");

  type WindowInfo = {
    idx: number;
    rms: number;
    startSec: number;
    endSec: number;
    pcm: Buffer;
    pass: boolean;
  };
  const windows: WindowInfo[] = [];

  for (let i = 0; i < totalWindows; i++) {
    const start = i * BYTES_PER_WINDOW;
    const end = Math.min(start + BYTES_PER_WINDOW, pcm.length);
    const chunk = pcm.subarray(start, end);
    const rms = computeRMS(chunk);
    const startSec = start / (SAMPLE_RATE * BYTES_PER_SAMPLE);
    const endSec = end / (SAMPLE_RATE * BYTES_PER_SAMPLE);
    const pass = rms >= GATE_THRESHOLD;

    windows.push({ idx: i, rms, startSec, endSec, pcm: Buffer.from(chunk), pass });

    const marker = pass ? "✅" : "  ";
    console.log(
      `  ${marker} ${String(i + 1).padStart(3)}  | ` +
        `${startSec.toFixed(0).padStart(3)}s-${endSec.toFixed(0).padStart(3)}s | ` +
        `${rms.toFixed(0).padStart(5)} | ` +
        `${rmsBar(rms)}`
    );
  }

  // Phase 2: Whisper transcription of ALL windows
  console.log("\n  ── Phase 2: Whisper Transcription (all windows) ──\n");

  for (const w of windows) {
    const wavPath = join(TMP_DIR, `window_${w.idx}.wav`);
    writeFileSync(wavPath, pcmToWav(w.pcm));

    process.stdout.write(`  Transcribing window ${w.idx + 1}/${totalWindows}...`);
    const text = transcribeWav(wavPath);
    process.stdout.write(" done\n");

    const gate = w.pass ? "✅ PASS" : "❌ SKIP";
    const label = w.pass ? "SPEECH" : "BLEED ";
    console.log(
      `\n  Window ${String(w.idx + 1).padStart(2)} | ${w.startSec.toFixed(0).padStart(3)}s-${w.endSec.toFixed(0).padStart(3)}s | ` +
        `RMS ${w.rms.toFixed(0).padStart(5)} | ${gate}`
    );
    console.log(`  ${label}: "${text}"\n`);

    try {
      unlinkSync(wavPath);
    } catch {
      /* cleanup */
    }
  }

  // Summary
  const passCount = windows.filter((w) => w.pass).length;
  const skipCount = windows.filter((w) => !w.pass).length;
  console.log("  ── Summary ──");
  console.log(`  Total windows: ${totalWindows}`);
  console.log(`  PASS (would transcribe): ${passCount}`);
  console.log(`  SKIP (would discard):    ${skipCount}`);
  console.log(`  Gate threshold:          ${GATE_THRESHOLD} RMS`);
  console.log("\n  Check: do PASS windows contain your actual words?");
  console.log("  Check: do SKIP windows contain bleed garbage or hallucinations?\n");

  try {
    unlinkSync(pcmFile);
  } catch {
    /* cleanup */
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
