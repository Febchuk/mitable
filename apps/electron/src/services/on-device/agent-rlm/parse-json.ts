/**
 * Robust JSON parser for LLM responses.
 *
 * Handles markdown code fences, leading/trailing prose, and
 * concatenated JSON objects (takes the first valid one).
 */

export function parseJsonResponse<T = Record<string, unknown>>(raw: string): T {
  let cleaned = raw.trim();

  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through to extraction
  }

  const obj = extractFirstJsonObject(cleaned);
  if (obj !== null) return obj as T;

  throw new Error(`Failed to parse JSON from LLM response: ${raw.substring(0, 200)}`);
}

function extractFirstJsonObject(text: string): unknown | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          return JSON.parse(text.substring(start, i + 1));
        } catch {
          start = -1;
        }
      }
    }
  }
  return null;
}
