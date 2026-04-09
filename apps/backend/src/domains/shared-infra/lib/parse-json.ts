/**
 * Robust JSON parser for LLM responses via Groq.
 *
 * Groq's `response_format: { type: "json_object" }` intermittently returns
 * `json_validate_failed` (400) — ~3% of calls. Dropping that option and
 * parsing manually with this utility eliminates those errors.
 *
 * Handles:
 *  - Markdown code fences (```json … ```)
 *  - Leading/trailing prose around JSON
 *  - Concatenated JSON objects (takes the first valid one)
 */

import { logger } from "./logger";

/**
 * Parse a JSON object from a raw LLM text response.
 * Strips markdown fences, then falls back to extracting the first `{…}`.
 *
 * @throws {Error} if no valid JSON object can be extracted
 */
export function parseJsonResponse<T = Record<string, unknown>>(raw: string): T {
  let cleaned = raw.trim();

  // Strip markdown code fences
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Fast path: entire string is valid JSON
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through to extraction
  }

  // Slow path: extract first complete JSON object
  const obj = extractFirstJsonObject(cleaned);
  if (obj !== null) return obj as T;

  logger.warn({ snippet: raw.substring(0, 300) }, "Failed to parse JSON from LLM response");
  throw new Error(`Failed to parse JSON from LLM response: ${raw.substring(0, 200)}`);
}

/**
 * Walk the string character-by-character to find the first balanced `{…}`.
 */
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
