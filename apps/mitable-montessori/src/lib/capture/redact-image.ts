"use client";

import type { OcrWord } from "@/lib/capture/types";
import type { RosterEntry } from "@/lib/capture/tokenize";
import Fuse from "fuse.js";

export interface RedactionResult {
  /** Object URL of the redacted JPEG — caller must revoke when done. */
  redactedUrl: string;
  /** Number of PII regions that were blacked out. */
  redactedCount: number;
}

/**
 * Identify which OCR words are student names, then draw solid black
 * rectangles over their bounding boxes on a copy of the original image.
 *
 * Returns an object URL to the redacted JPEG (ephemeral, never uploaded).
 */
export async function redactPiiFromImage(
  imageBlob: Blob,
  words: OcrWord[],
  roster: RosterEntry[]
): Promise<RedactionResult> {
  const piiBboxes = findPiiRegions(words, roster);
  if (piiBboxes.length === 0) {
    const url = URL.createObjectURL(imageBlob);
    return { redactedUrl: url, redactedCount: 0 };
  }

  const bitmap = await createImageBitmap(imageBlob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  ctx.fillStyle = "#000000";
  for (const box of piiBboxes) {
    const pad = 4;
    ctx.fillRect(
      box.x0 - pad,
      box.y0 - pad,
      box.x1 - box.x0 + pad * 2,
      box.y1 - box.y0 + pad * 2
    );
  }

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  const url = URL.createObjectURL(blob);
  return { redactedUrl: url, redactedCount: piiBboxes.length };
}

/**
 * Match OCR words against the classroom roster using Fuse.js fuzzy search.
 * Returns bounding boxes of words that look like student names.
 */
function findPiiRegions(
  words: OcrWord[],
  roster: RosterEntry[]
): Array<{ x0: number; y0: number; x1: number; y1: number }> {
  if (words.length === 0 || roster.length === 0) return [];

  const candidates: Array<{ phrase: string }> = [];
  for (const r of roster) {
    const parts = r.name.split(/\s+/).filter(Boolean);
    // Match first name, last name, or full name — any hit counts.
    if (parts.length > 0) candidates.push({ phrase: parts[0] });
    if (parts.length > 1) candidates.push({ phrase: parts[parts.length - 1] });
    if (parts.length > 1) candidates.push({ phrase: r.name });
  }

  const fuse = new Fuse(candidates, {
    keys: ["phrase"],
    threshold: 0.3,
    includeScore: true,
    minMatchCharLength: 3,
  });

  const bboxes: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  for (const word of words) {
    const cleaned = word.text.replace(/[.,!?;:'"]/g, "");
    if (cleaned.length < 3) continue;
    const result = fuse.search(cleaned, { limit: 1 });
    if (result[0] && (result[0].score ?? 1) <= 0.3) {
      bboxes.push(word.bbox);
    }
  }

  return bboxes;
}
