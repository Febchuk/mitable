/**
 * Ring buffer of raw JSON log lines (development only).
 * Used for in-app feedback: production Railway logs won't contain dev-DB user IDs,
 * so we filter this buffer by userId instead of calling the Railway API.
 */

const MAX_LINES = 8000;
const buffer: string[] = [];

export function appendDevLogLine(line: string): void {
  if (process.env.NODE_ENV !== "development") return;
  buffer.push(line);
  while (buffer.length > MAX_LINES) buffer.shift();
}

/** Returns newline-joined log lines whose text includes the given user id. */
export function getDevBackendLogsForUser(userId: string, maxLines = 2500): string {
  if (process.env.NODE_ENV !== "development" || !userId) return "";
  const hits = buffer.filter((line) => line.includes(userId));
  if (hits.length <= maxLines) return hits.join("\n");
  return hits.slice(-maxLines).join("\n");
}
