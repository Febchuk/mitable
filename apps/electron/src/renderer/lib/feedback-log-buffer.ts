/**
 * Captures the same stream as DevTools (console.*) and batches it to the main process,
 * which appends to `renderer.log` next to `main.log` — avoids unbounded RAM in the renderer.
 */

const pending: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_MS = 350;
const MAX_PENDING_LINES = 120;

let consoleCaptureInstalled = false;

function flushToMain(chunk: string): void {
  try {
    const w = window as Window & {
      consoleAPI?: { appendRendererLogChunk?: (s: string) => void };
    };
    w.consoleAPI?.appendRendererLogChunk?.(chunk);
  } catch {
    /* ignore */
  }
}

function flushNow(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pending.length === 0) return;
  const chunk = pending.join("\n") + "\n";
  pending.length = 0;
  flushToMain(chunk);
}

function scheduleFlush(): void {
  if (pending.length >= MAX_PENDING_LINES) {
    flushNow();
    return;
  }
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (pending.length === 0) return;
    const chunk = pending.join("\n") + "\n";
    pending.length = 0;
    flushToMain(chunk);
  }, FLUSH_MS);
}

function pushLine(text: string): void {
  const t = text.trim();
  if (!t) return;
  pending.push(t);
  scheduleFlush();
}

function safeSerializeArgs(args: unknown[]): string {
  if (!args.length) return "";
  return args
    .map((a) => {
      if (a === undefined) return "undefined";
      if (a === null) return "null";
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.stack || a.message;
      try {
        const s = JSON.stringify(a);
        return s.length > 2000 ? `${s.slice(0, 2000)}…(truncated)` : s;
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

/**
 * Patch global console once; lines are flushed to main → renderer.log on disk.
 */
export function installConsoleCaptureForFeedback(): void {
  if (typeof window === "undefined" || consoleCaptureInstalled) return;
  consoleCaptureInstalled = true;

  type Method = "log" | "info" | "warn" | "error" | "debug" | "trace";
  const methods: Method[] = ["log", "info", "warn", "error", "debug", "trace"];

  for (const method of methods) {
    const orig = console[method].bind(console) as (...args: unknown[]) => void;
    (console as unknown as Record<string, (...args: unknown[]) => void>)[method] = (
      ...args: unknown[]
    ) => {
      try {
        const serialized = safeSerializeArgs(args);
        pushLine(
          `${new Date().toISOString()} [console.${method}]${serialized ? ` ${serialized}` : ""}`
        );
      } catch {
        /* never break the real console */
      }
      orig(...args);
    };
  }
}

/** Call before reading logs so the last lines are on disk (e.g. Send Feedback). */
export function flushRendererLogsPending(): void {
  flushNow();
}
