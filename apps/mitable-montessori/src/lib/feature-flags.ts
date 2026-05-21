/**
 * Feature flag helpers. Read flags here so we can swap env → remote config later
 * without touching call sites.
 */

function readPublicFlag(name: string): boolean {
  const raw = process.env[name];
  return raw === "1" || raw === "true";
}

/**
 * When true, restores Today + Progress nav/routes and the global Ask Mitable
 * chatbot on top of the report-first teacher experience.
 */
export function addTodayProgressAndAgent(): boolean {
  return readPublicFlag("NEXT_PUBLIC_ADD_TODAY_PROGRESS_AND_AGENT");
}

export function enableCaptureWorker(): boolean {
  return readPublicFlag("NEXT_PUBLIC_ENABLE_CAPTURE_WORKER");
}

export function enableLocalIntent(): boolean {
  return readPublicFlag("NEXT_PUBLIC_ENABLE_LOCAL_INTENT");
}
