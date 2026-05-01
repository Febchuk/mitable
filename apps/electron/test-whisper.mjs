/**
 * test-whisper.mjs — v2 with format diagnostics
 *
 * Usage: node apps/electron/test-whisper.mjs [seconds]
 */

import { createRequire } from "module";
import { execFileSync } from "child_process";
import { writeFileSync, existsSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const DURATION_SEC = parseInt(process.argv[2] || "15", 10);
const SAMPLE_RATE = 16_000;
const CLI_EXE = join(__dirname, "bin", "whisper-cpp", "Release", "whisper-cli.exe");
const MODEL = join(__dirname, "bin", "whisper-cpp", "models", "ggml-medium.en.bin");
const OUTPUT_PATH = join(process.env.USERPROFILE, "Desktop", "whisper-test-output.txt");

if (!existsSync(CLI_EXE)) { console.error("ERROR: whisper-cli.exe not found"); process.exit(1); }
if (!existsSync(MODEL)) { console.error("ERROR: model not found"); process.exit(1); }

let nativeAudio;
try {
  nativeAudio = require("native-audio-node");
} catch (e) {
  console.error("ERROR: native-audio-node not found:", e.message);
  process.exit(1);
}

const micChunks = [];
const sysChunks = [];
let micRecorder = null;
let sysRecorder = null;
let firstMicChunk = null;
let firstSysChunk = null;

try {
  micRecorder = new nativeAudio.MicrophoneRecorder({
    sampleRate: SAMPLE_RATE,
    chunkDurationMs: 200,
    stereo: false,
    gain: 1.0,
  });
  micRecorder.on("data", (chunk) => {
    const buf = Buffer.from(chunk.data);
    if (!firstMicChunk) firstMicChunk = buf;
    micChunks.push(buf);
  });
  micRecorder.start();
  console.log("Mic started.");
} catch (e) {
  console.warn("Mic failed:", e.message);
}

try {
  sysRecorder = new nativeAudio.SystemAudioRecorder({
    sampleRate: SAMPLE_RATE,
    chunkDurationMs: 200,
    stereo: false,
    emitSilence: false,
  });
  sysRecorder.on("data", (chunk) => {
    const buf = Buffer.from(chunk.data);
    if (!firstSysChunk) firstSysChunk = buf;
    sysChunks.push(buf);
  });
  sysRecorder.start();
  console.log("System audio started.");
} catch (e) {
  console.warn("System audio failed:", e.message);
}

console.log(`\nRecording ${DURATION_SEC}s — speak + play video!\n`);

setTimeout(() => {
  try { micRecorder?.stop(); } catch {}
  try { sysRecorder?.stop(); } catch {}

  const micPcm = Buffer.concat(micChunks);
  const sysPcm = Buffer.concat(sysChunks);

  console.log("=== FORMAT DIAGNOSTICS ===\n");

  for (const [label, pcm, firstChunk] of [["MIC", micPcm, firstMicChunk], ["SYSTEM", sysPcm, firstSysChunk]]) {
    console.log(`--- ${label} ---`);
    console.log(`  Total: ${pcm.length} bytes, ${micChunks.length} chunks`);

    if (!firstChunk || firstChunk.length === 0) {
      console.log("  (no data)\n");
      continue;
    }

    console.log(`  First chunk: ${firstChunk.length} bytes`);

    // Check if it looks like int16 or float32
    // int16: values between -32768 and 32767, 2 bytes per sample
    // float32: values between -1.0 and 1.0, 4 bytes per sample

    // Read as int16
    const int16View = new Int16Array(firstChunk.buffer, firstChunk.byteOffset, Math.min(20, firstChunk.byteLength / 2));
    console.log(`  As int16 (first 20): [${Array.from(int16View).join(", ")}]`);

    // Read as float32
    const float32View = new Float32Array(firstChunk.buffer, firstChunk.byteOffset, Math.min(10, firstChunk.byteLength / 4));
    console.log(`  As float32 (first 10): [${Array.from(float32View).map(v => v.toFixed(6)).join(", ")}]`);

    // Heuristic: if float32 values are all between -1.5 and 1.5, it's probably float32
    const allFloat = Array.from(float32View).every(v => v >= -1.5 && v <= 1.5);
    const maxInt16 = Math.max(...Array.from(int16View).map(Math.abs));

    console.log(`  Max |int16|: ${maxInt16}`);
    console.log(`  Float32 all in [-1.5, 1.5]: ${allFloat}`);

    if (allFloat && maxInt16 > 10000) {
      console.log(`  >>> LIKELY FLOAT32 FORMAT <<<`);
    } else {
      console.log(`  >>> LIKELY INT16 FORMAT <<<`);
    }
    console.log("");
  }

  // Detect format and convert if needed
  const results = [];

  for (const [label, pcm] of [["MIC", micPcm], ["SYSTEM", sysPcm]]) {
    if (pcm.length < SAMPLE_RATE) {
      console.log(`[${label}] Too short, skipping.`);
      results.push({ label, transcript: "(no audio)", elapsed: 0 });
      continue;
    }

    // Check if float32 by sampling
    const testFloat = new Float32Array(pcm.buffer, pcm.byteOffset, Math.min(100, pcm.byteLength / 4));
    const isFloat32 = Array.from(testFloat).every(v => v >= -1.5 && v <= 1.5);

    let wavPcm;
    if (isFloat32) {
      console.log(`[${label}] Detected FLOAT32 — converting to int16...`);
      const floatSamples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
      const int16Buf = Buffer.alloc(floatSamples.length * 2);
      for (let i = 0; i < floatSamples.length; i++) {
        const clamped = Math.max(-1, Math.min(1, floatSamples[i]));
        int16Buf.writeInt16LE(Math.round(clamped * 32767), i * 2);
      }
      wavPcm = int16Buf;
      console.log(`[${label}] Converted: ${pcm.length} bytes float32 → ${wavPcm.length} bytes int16`);
    } else {
      console.log(`[${label}] Detected INT16 — using raw.`);
      wavPcm = pcm;
    }

    const effectiveSampleRate = isFloat32 ? SAMPLE_RATE : SAMPLE_RATE;
    const durationSec = wavPcm.length / (effectiveSampleRate * 2);
    console.log(`[${label}] Audio duration: ${durationSec.toFixed(1)}s`);

    const wav = pcmToWav(wavPcm, effectiveSampleRate);
    const wavPath = join(__dirname, `test-${label.toLowerCase()}.wav`);
    writeFileSync(wavPath, wav);
    console.log(`[${label}] WAV: ${(wav.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`[${label}] Running whisper-cli...`);

    const t0 = Date.now();
    try {
      const raw = execFileSync(CLI_EXE, [
        "-m", MODEL, "-f", wavPath,
        "--no-timestamps", "--no-prints",
        "-t", "4", "-l", "en",
      ], { maxBuffer: 10 * 1024 * 1024, timeout: 120_000, encoding: "utf-8" });

      const transcript = raw.split("\n").map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith("[")).join(" ").trim();
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

      console.log(`[${label}] Done in ${elapsed}s`);
      console.log(`[${label}] "${transcript.slice(0, 200)}"\n`);
      results.push({ label, transcript, elapsed, raw });
    } catch (e) {
      console.error(`[${label}] Failed:`, e.message);
      results.push({ label, transcript: `(error)`, elapsed: 0 });
    }

    // Keep WAV files for manual inspection
    console.log(`[${label}] WAV kept at: ${wavPath}`);
  }

  const lines = [`Whisper CLI Test — ${new Date().toISOString()}`, `Duration: ${DURATION_SEC}s | Model: ggml-medium.en`, ``];
  for (const r of results) {
    lines.push(`=== ${r.label} (${r.elapsed}s) ===`);
    lines.push(r.transcript);
    lines.push("");
    if (r.raw) { lines.push(`--- RAW ---`); lines.push(r.raw); lines.push(`--- END ---`); lines.push(""); }
  }
  writeFileSync(OUTPUT_PATH, lines.join("\n"), "utf-8");
  console.log(`\nSaved to: ${OUTPUT_PATH}`);
  process.exit(0);
}, DURATION_SEC * 1000);

function pcmToWav(pcm, sampleRate = 16000) {
  const channels = 1, bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
