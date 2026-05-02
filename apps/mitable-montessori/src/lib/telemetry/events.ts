"use client";

/**
 * Telemetry: structural failures + capture-mode A/B counters. No PII ever — the
 * server schema rejects unknown event names and any payload that contains
 * student / guardian / user-name-like keys.
 *
 * Per IMPLEMENTATION_PLAN.md §8.1, this ships always-on so we can analyze
 * behavior retroactively. Events buffer locally and are flushed best-effort —
 * if the network is down the buffer caps at 100 events and drops oldest.
 */

export type TelemetryEvent =
  | { name: "command_parse_failed"; category: string }
  | {
      name: "whisper_transcription_corrected";
      editDistance: number;
      lengthBucket: "short" | "medium" | "long";
    }
  | { name: "ocr_confidence_low"; confidence: number }
  | { name: "sync_conflict"; reason: string }
  | { name: "tool_validation_failed"; tool: string; errorType: string }
  | { name: "agent_loop_aborted"; turns: number; reason: string }
  | { name: "capture_started"; mode: "text" | "voice" | "photo" }
  | {
      name: "capture_completed";
      mode: "text" | "voice" | "photo";
      proposalCount: number;
      durationMs: number;
    }
  | { name: "capture_abandoned"; mode: "text" | "voice" | "photo"; reason: string }
  | { name: "model_load_started"; engine: "asr" | "ocr" }
  | { name: "model_load_completed"; engine: "asr" | "ocr"; durationMs: number }
  | { name: "model_load_failed"; engine: "asr" | "ocr"; message: string };

const BUFFER_CAP = 100;
let buffer: Array<{ event: TelemetryEvent; timestamp: string }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

let endpoint = "/api/v1/telemetry";
let fetchImpl: typeof fetch | null = null;

export function configureTelemetry(opts: { endpoint?: string; fetchImpl?: typeof fetch }) {
  if (opts.endpoint) endpoint = opts.endpoint;
  if (opts.fetchImpl) fetchImpl = opts.fetchImpl;
}

export function recordEvent(event: TelemetryEvent) {
  buffer.push({ event, timestamp: new Date().toISOString() });
  if (buffer.length > BUFFER_CAP) buffer = buffer.slice(-BUFFER_CAP);
  scheduleFlush();
}

export function getBufferedEventsForTest(): ReadonlyArray<{
  event: TelemetryEvent;
  timestamp: string;
}> {
  return buffer;
}

export function clearBufferForTest() {
  buffer = [];
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 2000);
}

async function flush() {
  if (typeof window === "undefined") return;
  if (buffer.length === 0) return;
  const f = fetchImpl ?? fetch;
  const events = buffer;
  buffer = [];
  try {
    await f(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events }),
      credentials: "include",
      keepalive: true,
    });
  } catch {
    // Drop on failure to avoid unbounded growth; the events table is
    // best-effort and we're not in the business of retrying telemetry.
  }
}

export function flushNow() {
  return flush();
}
