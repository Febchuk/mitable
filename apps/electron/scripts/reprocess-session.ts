/**
 * Retroactive Session Reprocessor
 *
 * Opens the local SQLite DB, finds sessions needing reprocessing, starts
 * the Phi-3.5 text server, runs classification + storytelling via the RLM
 * (Recursive Language Model) loop, and updates the results in SQLite.
 *
 * Uses the same RLM tool-loop pattern as the in-app pipeline:
 *   - Classifier RLM: get_batch_overview → get_frames → classify
 *   - Storyteller RLM: get_session_stats → get_classifications → summarize_chunk → build_story
 *
 * SAFETY:
 *   - Refuses to run if the Electron app appears to be running (WAL lock).
 *   - Checks for non-empty WAL file (indicates uncheckpointed data).
 *   - Uses sql.js (WASM) which cannot read WAL — requires the app to be closed.
 *
 * Usage:
 *   npx tsx scripts/reprocess-session.ts --all           # all broken sessions
 *   npx tsx scripts/reprocess-session.ts --session <id>  # specific session
 *   npx tsx scripts/reprocess-session.ts --all --dry-run # preview only
 */

import { join, dirname } from "path";
import { readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { spawn, ChildProcess, execSync } from "child_process";
import { createServer } from "net";
import { randomUUID } from "crypto";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";

// ── Config ──────────────────────────────────────────────────────────────────

const USER_DATA = process.env.APPDATA
  ? join(process.env.APPDATA, "@mitable", "electron")
  : join(process.env.HOME ?? "~", ".config", "@mitable", "electron");

const ON_DEVICE_DIR = join(USER_DATA, "on-device");
const DB_PATH = join(ON_DEVICE_DIR, "mitable-local.db");
const WAL_PATH = DB_PATH + "-wal";
const MANIFEST_PATH = join(ON_DEVICE_DIR, "manifest.json");

const BATCH_SIZE = 20;

// ── Args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const processAll = args.includes("--all");
const forceRun = args.includes("--force");
const sessionIdx = args.indexOf("--session");
const targetSessionId = sessionIdx >= 0 ? args[sessionIdx + 1] : null;

if (!targetSessionId && !processAll) {
  console.log("Usage:");
  console.log("  npx tsx scripts/reprocess-session.ts --all");
  console.log("  npx tsx scripts/reprocess-session.ts --session <session-id>");
  console.log("  npx tsx scripts/reprocess-session.ts --all --dry-run");
  console.log("  npx tsx scripts/reprocess-session.ts --all --force  # skip safety checks");
  process.exit(0);
}

// ── Safety Checks ───────────────────────────────────────────────────────────

function isElectronAppRunning(): boolean {
  try {
    if (process.platform === "win32") {
      const output = execSync('tasklist /FI "IMAGENAME eq Mitable.exe" /NH', {
        encoding: "utf-8",
        timeout: 5000,
      });
      return output.includes("Mitable.exe");
    }
    const output = execSync("pgrep -f Mitable || true", {
      encoding: "utf-8",
      timeout: 5000,
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

function checkWalSafety(): void {
  if (existsSync(WAL_PATH)) {
    try {
      const walSize = statSync(WAL_PATH).size;
      if (walSize > 0) {
        console.error(`\n⚠️  WAL file has ${walSize} bytes of uncheckpointed data.`);
        console.error("   Data in the WAL is invisible to this script (sql.js cannot read WAL).");
        console.error("   Close the Mitable app first so SQLite can checkpoint the WAL.\n");
        if (!forceRun) {
          console.error("   Use --force to skip this check (may miss recent data).");
          process.exit(1);
        }
        console.warn("   --force: proceeding despite WAL data. Recent data may be missing.\n");
      }
    } catch {
      // stat failed, proceed
    }
  }
}

function runSafetyChecks(): void {
  if (forceRun) {
    console.warn("--force: skipping running-app check\n");
  } else if (isElectronAppRunning()) {
    console.error("\n⚠️  The Mitable Electron app appears to be running.");
    console.error("   This script uses sql.js which cannot read WAL data.");
    console.error("   Close the app first, then re-run this script.\n");
    console.error("   Use --force to skip this check (may miss recent data or corrupt DB).");
    process.exit(1);
  }

  checkWalSafety();
}

// ── SQLite (sql.js — WASM, no native module) ────────────────────────────────

async function openDb(): Promise<SqlJsDatabase> {
  if (!existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`);
    process.exit(1);
  }
  const SQL = await initSqlJs();
  const fileBuffer = readFileSync(DB_PATH);
  return new SQL.Database(fileBuffer);
}

function saveDb(db: SqlJsDatabase): void {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

function queryAll<T>(db: SqlJsDatabase, sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

function queryOne<T>(db: SqlJsDatabase, sql: string, params: unknown[] = []): T | undefined {
  const rows = queryAll<T>(db, sql, params);
  return rows[0];
}

function run(db: SqlJsDatabase, sql: string, params: unknown[] = []): void {
  db.run(sql, params);
}

// ── Manifest ────────────────────────────────────────────────────────────────

interface ManifestAsset {
  id: string;
  filePath: string;
}

function readManifest(): { assets: ManifestAsset[] } {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(`Manifest not found at ${MANIFEST_PATH}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
}

function getAssetPath(manifest: { assets: ManifestAsset[] }, id: string): string {
  const asset = manifest.assets.find((a) => a.id === id);
  if (!asset?.filePath || !existsSync(asset.filePath)) {
    console.error(`Asset "${id}" not found or file missing. Run the download in the app first.`);
    process.exit(1);
  }
  return asset.filePath;
}

// ── Text Server ─────────────────────────────────────────────────────────────

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr) {
        const port = addr.port;
        server.close(() => resolve(port));
      } else reject(new Error("Could not find free port"));
    });
    server.on("error", reject);
  });
}

async function startTextServer(
  serverBin: string,
  modelPath: string
): Promise<{
  proc: ChildProcess;
  completionUrl: string;
}> {
  const port = await findFreePort();
  console.log(`Starting Phi-3.5 text server on port ${port}...`);

  const proc = spawn(
    serverBin,
    [
      "--model",
      modelPath,
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
      "--ctx-size",
      "8192",
      "--n-gpu-layers",
      "-1",
      "--parallel",
      "1",
      "--flash-attn",
      "off",
      "--fit",
      "off",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      cwd: dirname(serverBin),
    }
  );

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error("Text server startup timed out after 90s"));
    }, 90_000);

    const onData = (data: Buffer) => {
      const line = data.toString();
      process.stdout.write(`  [server] ${line}`);
      if (line.includes("server is listening on")) {
        clearTimeout(timeout);
        resolve();
      }
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    proc.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited during startup with code ${code}`));
    });
  });

  console.log(`Text server ready on port ${port}`);
  return { proc, completionUrl: `http://127.0.0.1:${port}/v1/chat/completions` };
}

// ── Shared LLM call ─────────────────────────────────────────────────────────

async function chatCompletion(
  completionUrl: string,
  messages: Array<{ role: string; content: string }>,
  options: { temperature?: number; max_tokens?: number; grammar?: string } = {}
): Promise<string> {
  const body: Record<string, unknown> = {
    model: "local",
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens ?? 1024,
    stream: false,
  };
  if (options.grammar) body.grammar = options.grammar;

  const response = await fetch(completionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error ${response.status}: ${text}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content ?? "";
}

// ── RLM Engine (standalone — mirrors local-rlm-engine.ts) ───────────────────

const RLM_TOOL_CALL_GRAMMAR = `
root        ::= "{" ws members ws "}"
members     ::= pair ( ws "," ws pair )*
pair        ::= string ws ":" ws value
string      ::= "\\"" chars "\\""
chars       ::= char*
char        ::= [^"\\\\\\x00-\\x1f] | "\\\\" escape
escape      ::= ["\\\\/bfnrt] | "u" hex hex hex hex
hex         ::= [0-9a-fA-F]
value       ::= string | number | object | array | "true" | "false" | "null"
object      ::= "{" ws ( pair ( ws "," ws pair )* )? ws "}"
array       ::= "[" ws ( value ( ws "," ws value )* )? ws "]"
number      ::= "-"? digits ( "." digits )? ( [eE] [+-]? digits )?
digits      ::= [0-9]+
ws          ::= [ \\t\\n\\r]*
`.trim();

interface RLMToolParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}
interface RLMTool<TEnv> {
  name: string;
  description: string;
  parameters: RLMToolParam[];
  execute: (params: Record<string, unknown>, env: TEnv) => Promise<unknown> | unknown;
}

function buildToolCatalog<T>(tools: RLMTool<T>[]): string {
  return tools
    .map((t) => {
      const params = t.parameters
        .map(
          (p) =>
            `${p.name}: ${p.type}${p.required ? " (required)" : " (optional)"} — ${p.description}`
        )
        .join("\n    ");
      return `- ${t.name}(${params || "no parameters"}): ${t.description}`;
    })
    .join("\n");
}

function parseJsonResponse(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      /* */
    }
  }
  const bs = trimmed.indexOf("{");
  const be = trimmed.lastIndexOf("}");
  if (bs !== -1 && be > bs) {
    try {
      return JSON.parse(trimmed.slice(bs, be + 1));
    } catch {
      /* */
    }
  }
  throw new Error(`Could not parse LLM JSON: ${trimmed.slice(0, 200)}`);
}

type CompletionFn = (
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; max_tokens?: number; grammar?: string }
) => Promise<string>;

async function runRLMLoop<TEnv>(opts: {
  systemPrompt: string;
  userPrompt: string;
  tools: RLMTool<TEnv>[];
  env: TEnv;
  maxIterations: number;
  doneResultField: string;
  completionFn: CompletionFn;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ success: boolean; result: unknown; iterations: number }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: opts.systemPrompt },
    { role: "user", content: opts.userPrompt },
  ];
  const toolHistory: Array<{ tool: string; result: unknown }> = [];
  let iterations = 0;

  while (iterations < opts.maxIterations) {
    iterations++;
    let llmResp: Record<string, unknown>;
    try {
      const raw = await opts.completionFn(messages, {
        temperature: opts.temperature ?? 0.1,
        max_tokens: opts.maxTokens ?? 1024,
        grammar: RLM_TOOL_CALL_GRAMMAR,
      });
      llmResp = parseJsonResponse(raw);
    } catch (err) {
      console.error(`  [RLM] Iteration ${iterations} LLM call failed:`, String(err));
      break;
    }

    messages.push({ role: "assistant", content: JSON.stringify(llmResp) });

    if (llmResp.done) {
      const result = llmResp[opts.doneResultField];
      if (result !== undefined) {
        console.log(`  [RLM] Completed in ${iterations} iterations`);
        return { success: true, result, iterations };
      }
      console.warn(`  [RLM] done=true but missing "${opts.doneResultField}"`);
      break;
    }

    if (llmResp.tool && llmResp.parameters !== undefined) {
      const tool = opts.tools.find((t) => t.name === llmResp.tool);
      if (!tool) {
        messages.push({
          role: "user",
          content: `Error: Unknown tool "${llmResp.tool}". Available: ${opts.tools.map((t) => t.name).join(", ")}. Try again.`,
        });
        continue;
      }
      try {
        const toolResult = await tool.execute(
          llmResp.parameters as Record<string, unknown>,
          opts.env
        );
        toolHistory.push({ tool: tool.name, result: toolResult });
        messages.push({
          role: "user",
          content: `Tool "${tool.name}" returned:\n${JSON.stringify(toolResult, null, 2)}\n\nContinue with the next step.`,
        });
      } catch (err) {
        messages.push({
          role: "user",
          content: `Tool "${tool.name}" failed: ${String(err)}. Try a different approach or finish.`,
        });
      }
    } else {
      break;
    }
  }

  // Fallback: check if classify or build_story was called
  const fallback = toolHistory.find((h) => h.tool === "classify" || h.tool === "build_story");
  if (fallback?.result) {
    return { success: true, result: fallback.result, iterations };
  }
  return { success: false, result: null, iterations };
}

// ── Classifier RLM (standalone) ─────────────────────────────────────────────

interface CaptureRow {
  id: string;
  session_id: string;
  frame_id: string;
  sequence_number: number;
  captured_at: number;
  app_name: string;
  window_title: string;
  sensor_output: string;
  delta_changed: number;
  change_type: string | null;
  user_action: string | null;
}

interface ClassifierEnv {
  frames: Array<{
    index: number;
    time: string;
    appName: string;
    windowTitle: string;
    sensorOutput: string;
    userAction: string | null;
  }>;
  batchIndex: number;
  timeRange: { start: string; end: string };
  classification: Record<string, unknown> | null;
}

function makeClassifierEnv(batch: CaptureRow[], batchIdx: number): ClassifierEnv {
  const frames = batch.map((c, i) => ({
    index: i,
    time: new Date(c.captured_at).toLocaleTimeString(),
    appName: c.app_name,
    windowTitle: c.window_title,
    sensorOutput: c.sensor_output,
    userAction: c.user_action,
  }));
  return {
    frames,
    batchIndex: batchIdx,
    timeRange: { start: frames[0]?.time ?? "?", end: frames[frames.length - 1]?.time ?? "?" },
    classification: null,
  };
}

function getClassifierTools(): RLMTool<ClassifierEnv>[] {
  return [
    {
      name: "get_batch_overview",
      description: "Returns frame count, time range, and unique app names.",
      parameters: [],
      execute: (_p, env) => {
        const apps = new Set(env.frames.map((f) => f.appName).filter(Boolean));
        return {
          frameCount: env.frames.length,
          timeRange: env.timeRange,
          uniqueApps: [...apps],
          batchIndex: env.batchIndex,
        };
      },
    },
    {
      name: "get_frames",
      description: "Returns sensor outputs for a slice of frames (peek at 5-10).",
      parameters: [
        { name: "start", type: "number", required: true, description: "Start index (0-based)" },
        { name: "end", type: "number", required: true, description: "End index (exclusive)" },
      ],
      execute: (p, env) => {
        const s = Math.max(0, Number(p.start) || 0);
        const e = Math.min(env.frames.length, Number(p.end) || env.frames.length);
        return env.frames.slice(s, e).map((f) => ({
          index: f.index,
          time: f.time,
          app: f.appName,
          action: f.userAction,
          description: f.sensorOutput,
        }));
      },
    },
    {
      name: "classify",
      description: "Commit the final classification for this batch.",
      parameters: [
        {
          name: "description",
          type: "string",
          required: true,
          description: "2-3 sentence summary",
        },
        {
          name: "activityType",
          type: "string",
          required: true,
          description: "coding|browsing|writing|communicating|designing|meeting|reading|other",
        },
        {
          name: "onTask",
          type: "boolean",
          required: true,
          description: "Whether user was on-task",
        },
        {
          name: "taskRelevance",
          type: "string",
          required: false,
          description: "Productivity relevance",
        },
        { name: "importanceScore", type: "number", required: true, description: "0.0 to 1.0" },
      ],
      execute: (p, env) => {
        const result = {
          description: String(p.description || "Activity recorded"),
          activityType: String(p.activityType || "other"),
          onTask: Boolean(p.onTask),
          taskRelevance: p.taskRelevance ? String(p.taskRelevance) : null,
          importanceScore: Math.max(0, Math.min(1, Number(p.importanceScore) || 0.5)),
        };
        env.classification = result;
        return { stored: true, ...result };
      },
    },
  ];
}

function getClassifierSystemPrompt(tools: RLMTool<ClassifierEnv>[]): string {
  return `You are a work activity classifier. You analyze batches of screen observations and produce a concise classification.

<available_tools>
${buildToolCatalog(tools)}
</available_tools>

<strategy>
1. Call get_batch_overview to understand the scope (frame count, apps, time range)
2. Call get_frames to peek at frames in groups of 5-10
3. When you understand the activity pattern, call classify with your assessment
</strategy>

<rules>
- Peek at enough frames to understand the activity before classifying
- For small batches (<=5 frames), one get_frames call is enough
- For larger batches, sample from start, middle, and end
- Focus on what the user was DOING, not just what app was open
- The description should be 2-3 sentences covering the main activities
- activityType must be one of: coding, browsing, writing, communicating, designing, meeting, reading, other
- importanceScore: 0.0 (idle/distraction) to 1.0 (critical focused work)
</rules>

<output_format>
On each turn, respond with a single JSON object. Either a tool call:
{"tool": "tool_name", "parameters": {...}, "reasoning": "why"}

Or when done (after calling classify):
{"done": true, "classification": {"description": "...", "activityType": "...", "onTask": true, "importanceScore": 0.8}}
</output_format>

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.`;
}

async function classifyBatchRLM(
  completionFn: CompletionFn,
  batch: CaptureRow[],
  batchIdx: number
): Promise<{
  description: string;
  activityType: string | null;
  onTask: boolean;
  taskRelevance: string | null;
  importanceScore: number;
  rawOutput: string;
}> {
  const env = makeClassifierEnv(batch, batchIdx);
  const tools = getClassifierTools();

  const result = await runRLMLoop({
    systemPrompt: getClassifierSystemPrompt(tools),
    userPrompt: `Classify batch ${batchIdx} containing ${batch.length} screen observations. Start by calling get_batch_overview.`,
    tools,
    env,
    maxIterations: 5,
    doneResultField: "classification",
    completionFn,
    temperature: 0.1,
  });

  const cls = env.classification ?? (result.result as Record<string, unknown> | null);
  if (cls) {
    return {
      description: String(cls.description || "Activity recorded"),
      activityType: cls.activityType ? String(cls.activityType) : null,
      onTask: Boolean(cls.onTask),
      taskRelevance: cls.taskRelevance ? String(cls.taskRelevance) : null,
      importanceScore: Number(cls.importanceScore) || 0.5,
      rawOutput: JSON.stringify(result),
    };
  }

  const fallback = batch
    .map((c) => c.sensor_output)
    .join(". ")
    .slice(0, 500);
  return {
    description: fallback || "Activity recorded",
    activityType: null,
    onTask: true,
    taskRelevance: null,
    importanceScore: 0.5,
    rawOutput: JSON.stringify(result),
  };
}

// ── Storyteller RLM (standalone) ────────────────────────────────────────────

interface ClassificationRow {
  batch_index: number;
  activity_description: string;
  activity_type: string | null;
  on_task: number;
  importance_score: number;
  created_at: number;
}
interface TranscriptionRow {
  transcript: string;
  start_time_ms: number;
  end_time_ms: number;
}

interface StoryTask {
  description: string;
  minutes: number;
}

interface StorytellerEnv {
  classifications: ClassificationRow[];
  transcriptions: TranscriptionRow[];
  chunkCache: Map<string, string>;
  finalStory: { narrative: string; tasks: StoryTask[] } | null;
  totalMinutes: number;
  completionFn: CompletionFn;
}

function makeStorytellerEnv(
  cls: ClassificationRow[],
  trans: TranscriptionRow[],
  completionFn: CompletionFn
): StorytellerEnv {
  let totalMinutes = 1;
  if (cls.length >= 2) {
    const first = cls[0].created_at;
    const last = cls[cls.length - 1].created_at;
    totalMinutes = Math.max(1, Math.round((last - first) / 60_000));
  }
  return {
    classifications: cls,
    transcriptions: trans,
    chunkCache: new Map(),
    finalStory: null,
    totalMinutes,
    completionFn,
  };
}

function getStorytellerTools(): RLMTool<StorytellerEnv>[] {
  return [
    {
      name: "get_session_stats",
      description: "Returns classification count, transcription count, totalMinutes, duration.",
      parameters: [],
      execute: (_p, env) => {
        let dur = "unknown";
        if (env.classifications.length > 0) {
          const first = env.classifications[0].created_at;
          const last = env.classifications[env.classifications.length - 1].created_at;
          dur = `~${Math.round((last - first) / 60_000)} minutes`;
        }
        return {
          classificationCount: env.classifications.length,
          transcriptionCount: env.transcriptions.length,
          totalMinutes: env.totalMinutes,
          duration: dur,
          hasTranscriptions: env.transcriptions.length > 0,
        };
      },
    },
    {
      name: "get_classifications",
      description: "Returns a slice of classification descriptions by index.",
      parameters: [
        { name: "start", type: "number", required: true, description: "Start index" },
        { name: "end", type: "number", required: true, description: "End index (exclusive)" },
      ],
      execute: (p, env) => {
        const s = Math.max(0, Number(p.start) || 0);
        const e = Math.min(env.classifications.length, Number(p.end) || env.classifications.length);
        return env.classifications.slice(s, e).map((c) => ({
          batchIndex: c.batch_index,
          activityType: c.activity_type,
          description: c.activity_description,
          onTask: !!c.on_task,
          importance: c.importance_score,
        }));
      },
    },
    {
      name: "get_transcriptions",
      description: "Returns audio transcripts for a time window.",
      parameters: [
        { name: "startMs", type: "number", required: true, description: "Start time in ms" },
        { name: "endMs", type: "number", required: true, description: "End time in ms" },
      ],
      execute: (p, env) => {
        const startMs = Number(p.startMs) || 0;
        const endMs = Number(p.endMs) || Infinity;
        return env.transcriptions
          .filter(
            (t) =>
              Number.isFinite(t.start_time_ms) &&
              t.start_time_ms >= startMs &&
              t.end_time_ms <= endMs
          )
          .map((t) => ({
            transcript: t.transcript,
            startMs: t.start_time_ms,
            endMs: t.end_time_ms,
          }));
      },
    },
    {
      name: "summarize_chunk",
      description: "Sub-LLM call: summarize a slice of classifications. Cached.",
      parameters: [
        {
          name: "start",
          type: "number",
          required: true,
          description: "Start classification index",
        },
        {
          name: "end",
          type: "number",
          required: true,
          description: "End classification index (exclusive)",
        },
      ],
      execute: async (p, env) => {
        const s = Math.max(0, Number(p.start) || 0);
        const e = Math.min(env.classifications.length, Number(p.end) || env.classifications.length);
        const key = `chunk_${s}_${e}`;
        const cached = env.chunkCache.get(key);
        if (cached) return { summary: cached, fromCache: true };

        const chunk = env.classifications.slice(s, e);
        if (chunk.length === 0) return { summary: "No activity in this range.", fromCache: false };

        const text = chunk
          .map((c) => `[Batch ${c.batch_index}, ${c.activity_type}] ${c.activity_description}`)
          .join("\n");
        try {
          const summary = await env.completionFn(
            [
              {
                role: "system",
                content:
                  "Summarize the following activity block in 2-3 sentences. Write in third person past tense.",
              },
              { role: "user", content: `Activity:\n${text}` },
            ],
            { temperature: 0.2, max_tokens: 256 }
          );
          env.chunkCache.set(key, summary);
          return { summary, fromCache: false };
        } catch (err) {
          const fallback = chunk.map((c) => c.activity_description).join(". ");
          env.chunkCache.set(key, fallback);
          return { summary: fallback, fromCache: false, error: String(err) };
        }
      },
    },
    {
      name: "build_story",
      description:
        "Final merge: produce narrative + tasks with time. Each task needs description and minutes. Minutes must sum to totalMinutes. Call this last.",
      parameters: [
        {
          name: "narrative",
          type: "string",
          required: true,
          description: "Full session narrative",
        },
        {
          name: "tasks",
          type: "array",
          required: true,
          description: "Array of {description, minutes} objects. Minutes must sum to totalMinutes.",
        },
      ],
      execute: (p, env) => {
        const narrative = String(p.narrative || "Session completed.");
        const rawTasks = Array.isArray(p.tasks) ? p.tasks : [];
        const tasks: StoryTask[] = rawTasks.map((t: any) => ({
          description: String(t.description || t),
          minutes: Math.max(1, Number(t.minutes) || 1),
        }));
        // Normalize minutes to sum to totalMinutes
        const rawSum = tasks.reduce((s, t) => s + t.minutes, 0);
        if (rawSum > 0 && rawSum !== env.totalMinutes) {
          const scale = env.totalMinutes / rawSum;
          let remaining = env.totalMinutes;
          for (let i = 0; i < tasks.length; i++) {
            if (i === tasks.length - 1) {
              tasks[i].minutes = Math.max(1, remaining);
            } else {
              tasks[i].minutes = Math.max(1, Math.round(tasks[i].minutes * scale));
              remaining -= tasks[i].minutes;
            }
          }
        }
        env.finalStory = { narrative, tasks };
        return {
          stored: true,
          narrative: narrative.slice(0, 100) + "...",
          taskCount: tasks.length,
        };
      },
    },
  ];
}

function getStorytellerSystemPrompt(tools: RLMTool<StorytellerEnv>[]): string {
  return `You write work session summaries. You have tools to read activity data. You MUST call tools to gather data, then call build_story with a narrative AND a tasks array.

TOOLS:
${buildToolCatalog(tools)}

STEPS:
1. Call get_session_stats — note the totalMinutes
2. Call get_classifications(0, count) to read activity data
3. If transcriptions exist, call get_transcriptions
4. Call build_story with narrative and tasks (each task needs description + minutes)

WHAT IS A TASK:
A task is one specific thing the user did. Extract 2-6 tasks from the activities.
Good tasks: "Debugged JWT authentication in VS Code", "Replied to Sarah's email about Q3 budget", "Reviewed pull request #142 on GitHub"
Bad tasks: "Worked on things", "Did computer stuff", "Various activities"

Each task should name WHAT was done and WHERE (the app or system).

TIME ATTRIBUTION:
- get_session_stats returns totalMinutes (total session duration)
- Each task needs a "minutes" field estimating how long that task took
- Estimate minutes based on how many classifications relate to each task
- All task minutes MUST sum to totalMinutes

RULES:
- Narrative: third person past tense, 2-4 sentences
- Tasks: 2-6 specific items, each with description and minutes
- ALWAYS include at least 2 tasks — extract them from the activity descriptions
- Use only facts from the activity data. Do not invent details.

RESPONSE FORMAT:
Respond with exactly ONE JSON object per turn. No markdown, no code fences.

Tool call:
{"tool": "get_session_stats", "parameters": {}, "reasoning": "check scope"}

When finished (AFTER calling build_story):
{"done": true, "summary": {"narrative": "...", "tasks": [{"description": "...", "minutes": 5}]}}

EXAMPLE SEQUENCE:

Turn 1 → you respond:
{"tool": "get_session_stats", "parameters": {}, "reasoning": "check session size"}

Turn 2 (stats: 4 classifications, totalMinutes: 20) → you respond:
{"tool": "get_classifications", "parameters": {"start": 0, "end": 4}, "reasoning": "read all activities"}

Turn 3 (classifications: email in Outlook covering 2 batches, code review in GitHub 1 batch, Slack messaging 1 batch) → you respond:
{"tool": "build_story", "parameters": {"narrative": "The user spent the first half of the session drafting an email in Outlook regarding the project deadline. They then switched to GitHub to review a pull request for the authentication module. After leaving review comments, they wrapped up by messaging the team on Slack with a status update.", "tasks": [{"description": "Drafted project deadline email in Outlook", "minutes": 10}, {"description": "Reviewed authentication pull request on GitHub", "minutes": 5}, {"description": "Sent team status update on Slack", "minutes": 5}]}, "reasoning": "email covered 2 of 4 batches so gets 10 of 20 minutes"}

Turn 4 → you respond:
{"done": true, "summary": {"narrative": "The user spent the first half of the session drafting an email in Outlook regarding the project deadline. They then switched to GitHub to review a pull request for the authentication module. After leaving review comments, they wrapped up by messaging the team on Slack with a status update.", "tasks": [{"description": "Drafted project deadline email in Outlook", "minutes": 10}, {"description": "Reviewed authentication pull request on GitHub", "minutes": 5}, {"description": "Sent team status update on Slack", "minutes": 5}]}}`;
}

async function generateStoryRLM(
  completionFn: CompletionFn,
  classifications: ClassificationRow[],
  transcriptions: TranscriptionRow[]
): Promise<{ narrative: string; tasks: StoryTask[] }> {
  if (classifications.length === 0 && transcriptions.length === 0) {
    return { narrative: "No activity was recorded during this session.", tasks: [] };
  }

  const env = makeStorytellerEnv(classifications, transcriptions, completionFn);
  const tools = getStorytellerTools();

  const result = await runRLMLoop({
    systemPrompt: getStorytellerSystemPrompt(tools),
    userPrompt: `Generate a session narrative and task list from ${classifications.length} activity classifications. Start by calling get_session_stats.`,
    tools,
    env,
    maxIterations: 15,
    doneResultField: "summary",
    completionFn,
    temperature: 0.3,
    maxTokens: 2048,
  });

  const story =
    env.finalStory ?? (result.result as { narrative: string; tasks: StoryTask[] } | null);
  const tasks: StoryTask[] = Array.isArray(story?.tasks)
    ? story!.tasks.map((t: any) => ({
        description: String(t.description || t),
        minutes: Number(t.minutes) || 1,
      }))
    : [];
  return {
    narrative: story?.narrative || "Session completed.",
    tasks,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function classificationsAreBroken(db: SqlJsDatabase, sessionId: string): boolean {
  const rows = queryAll<{ activity_description: string }>(
    db,
    `SELECT activity_description FROM classifications WHERE session_id = ? LIMIT 5`,
    [sessionId]
  );
  if (rows.length === 0) return false;
  const brokenCount = rows.filter(
    (r) =>
      r.activity_description.includes("<think>") ||
      r.activity_description.includes("<think") ||
      r.activity_description.trim().length === 0
  ).length;
  return brokenCount > rows.length / 2;
}

interface SessionInfo {
  session_id: string;
  capture_count: number;
  classification_count: number;
  has_story: boolean;
  task_count: number;
  bad_classifications: boolean;
  needs_reclassify: boolean;
  needs_story: boolean;
}

function discoverSessions(db: SqlJsDatabase, filterSessionId?: string): SessionInfo[] {
  const sessions = queryAll<{ session_id: string; capture_count: number }>(
    db,
    `SELECT session_id, COUNT(*) as capture_count
     FROM captures ${filterSessionId ? "WHERE session_id = ?" : ""}
     GROUP BY session_id ORDER BY MIN(captured_at) ASC`,
    filterSessionId ? [filterSessionId] : []
  );

  return sessions.map((s) => {
    const classCount =
      queryOne<{ cnt: number }>(
        db,
        `SELECT COUNT(*) as cnt FROM classifications WHERE session_id = ?`,
        [s.session_id]
      )?.cnt ?? 0;
    const storyRow = queryOne<{ tasks: string }>(
      db,
      `SELECT tasks FROM stories WHERE session_id = ?`,
      [s.session_id]
    );
    let taskCount = 0;
    if (storyRow?.tasks) {
      try {
        const arr = JSON.parse(storyRow.tasks);
        taskCount = Array.isArray(arr) ? arr.length : 0;
      } catch {
        /* */
      }
    }
    const badClassifications = classCount > 0 && classificationsAreBroken(db, s.session_id);
    // Detect tasks stored as plain strings (old format) — they lack per-task minutes
    let tasksLackMinutes = false;
    if (storyRow?.tasks) {
      try {
        const arr = JSON.parse(storyRow.tasks);
        if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "string") {
          tasksLackMinutes = true;
        }
      } catch {
        /* */
      }
    }
    return {
      session_id: s.session_id,
      capture_count: s.capture_count,
      classification_count: classCount,
      has_story: !!storyRow,
      task_count: taskCount,
      bad_classifications: badClassifications,
      needs_reclassify: classCount === 0 || badClassifications,
      needs_story: !storyRow || taskCount === 0 || tasksLackMinutes,
    };
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Mitable Session Reprocessor (RLM) ===\n");
  console.log(`DB: ${DB_PATH}`);
  console.log(`Manifest: ${MANIFEST_PATH}`);
  if (dryRun) console.log("(DRY RUN — no writes)\n");

  runSafetyChecks();

  const db = await openDb();
  const manifest = readManifest();
  const allSessions = discoverSessions(db, targetSessionId ?? undefined);

  if (targetSessionId && allSessions.length === 0) {
    console.error(`No captures found for session ${targetSessionId}`);
    db.close();
    process.exit(1);
  }

  const sessionsToProcess = targetSessionId
    ? allSessions
    : allSessions.filter((s) => s.needs_reclassify || s.needs_story);

  console.log(`\nAll sessions in DB: ${allSessions.length}`);
  for (const s of allSessions) {
    const status: string[] = [];
    if (s.bad_classifications) status.push("BAD CLASSIFICATIONS");
    if (s.needs_reclassify && !s.bad_classifications) status.push("needs classification");
    if (s.needs_story && s.has_story && s.task_count > 0)
      status.push("tasks lack time attribution");
    if (s.needs_story && s.has_story && s.task_count === 0) status.push("has story but 0 tasks");
    if (s.needs_story && !s.has_story) status.push("no story");
    if (!s.needs_reclassify && !s.needs_story) status.push("OK");
    console.log(
      `  ${s.session_id.slice(0, 8)}: ${s.capture_count} captures, ${s.classification_count} class, ${s.task_count} tasks — ${status.join(", ")}`
    );
  }

  if (sessionsToProcess.length === 0) {
    console.log("\nAll sessions look good. Nothing to reprocess.");
    db.close();
    return;
  }

  console.log(`\n${sessionsToProcess.length} session(s) need reprocessing.`);
  if (dryRun) {
    console.log("\nDry run complete. Exiting.");
    db.close();
    return;
  }

  const serverBin = getAssetPath(manifest, "llama-server");
  const textModel = getAssetPath(manifest, "text-model");
  const { proc, completionUrl } = await startTextServer(serverBin, textModel);

  const completionFn: CompletionFn = (msgs, opts) =>
    chatCompletion(completionUrl, msgs as any, opts);

  try {
    for (const session of sessionsToProcess) {
      const sid = session.session_id;
      console.log(`\n--- Processing ${sid.slice(0, 8)} (${session.capture_count} captures) ---`);

      // Step 1: Reclassify if needed
      if (session.needs_reclassify) {
        if (session.bad_classifications) {
          console.log(`  Deleting ${session.classification_count} broken classifications...`);
          run(db, `DELETE FROM classifications WHERE session_id = ?`, [sid]);
        }

        const captures = queryAll<CaptureRow>(
          db,
          `SELECT * FROM captures WHERE session_id = ? ORDER BY sequence_number ASC`,
          [sid]
        );
        console.log(`  Classifying ${captures.length} captures via RLM...`);

        for (let i = 0; i < captures.length; i += BATCH_SIZE) {
          const batch = captures.slice(i, i + BATCH_SIZE);
          const batchIdx = Math.floor(i / BATCH_SIZE);
          console.log(
            `  Batch ${batchIdx}: frames ${batch[0].sequence_number}-${batch[batch.length - 1].sequence_number}`
          );

          const result = await classifyBatchRLM(completionFn, batch, batchIdx);
          console.log(`    -> ${result.description.slice(0, 80)}...`);

          run(
            db,
            `INSERT OR REPLACE INTO classifications (id, session_id, batch_index, start_sequence, end_sequence, activity_description, activity_type, on_task, task_relevance, importance_score, raw_output) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              sid,
              batchIdx,
              batch[0].sequence_number,
              batch[batch.length - 1].sequence_number,
              result.description,
              result.activityType,
              result.onTask ? 1 : 0,
              result.taskRelevance,
              result.importanceScore,
              result.rawOutput,
            ]
          );
        }
        saveDb(db);
      } else {
        console.log(`  ${session.classification_count} good classifications exist, skipping`);
      }

      // Step 2: Generate story via RLM
      const classifications = queryAll<ClassificationRow>(
        db,
        `SELECT batch_index, activity_description, activity_type, on_task, importance_score, created_at FROM classifications WHERE session_id = ? ORDER BY batch_index ASC`,
        [sid]
      );
      const transcriptions = queryAll<TranscriptionRow>(
        db,
        `SELECT transcript, start_time_ms, end_time_ms FROM transcriptions WHERE session_id = ? ORDER BY start_time_ms ASC`,
        [sid]
      );

      console.log(
        `  Generating story via RLM from ${classifications.length} classifications, ${transcriptions.length} transcriptions...`
      );
      const story = await generateStoryRLM(completionFn, classifications, transcriptions);
      console.log(`  -> Narrative: ${story.narrative.slice(0, 120)}...`);
      console.log(`  -> Tasks (${story.tasks.length}):`);
      story.tasks.forEach((t, i) => console.log(`     ${i + 1}. ${t.description} (${t.minutes}m)`));

      run(db, `DELETE FROM stories WHERE session_id = ?`, [sid]);
      run(
        db,
        `INSERT INTO stories (id, session_id, narrative, tasks, time_breakdown, model_used) VALUES (?, ?, ?, ?, NULL, ?)`,
        [
          randomUUID(),
          sid,
          story.narrative,
          JSON.stringify(story.tasks),
          "local-rlm-phi3.5-reprocessed",
        ]
      );
      saveDb(db);
      console.log(`  Story saved.`);
    }
  } finally {
    console.log("\nStopping text server...");
    proc.kill();
    db.close();
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
