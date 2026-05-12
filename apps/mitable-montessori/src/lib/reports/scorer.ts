/**
 * AI scorer for Montessori reports. Takes a draft, returns a 0-100 composite
 * score plus per-category flags + reasoning bullets.
 *
 * The output shape is what the reading-pane AI callout consumes:
 *   - score:      single number 0-100 (red <60, amber 60-84, green ≥85)
 *   - flags:      4 categories (tone/evidence/pii/template), each ok/warn/fail
 *   - reasoning:  short bullets explaining the score
 *
 * Runs synchronously on /submit (so reviewers see a score immediately) and
 * fire-and-forget on autosave. Worst-case latency target is ~2s on Haiku.
 */

import { getAnthropic, HAIKU_MODEL } from "@/lib/anthropic/client";

export type ScorerFlag = {
  kind: "tone" | "evidence" | "pii" | "template";
  status: "ok" | "warn" | "fail";
  note: string;
};

export type ScorerResult = {
  score: number; // 0-100, clamped
  flags: ScorerFlag[];
  reasoning: string[];
};

export type ScorerInput = {
  reportType: "daily" | "major" | "incident";
  title: string | null;
  sections: Array<{
    heading: string;
    paragraphs: Array<{ html: string }>;
  }> | null;
  /** Plain-text fallback when `sections` is empty (older drafts). */
  body: string | null;
};

const SYSTEM_PROMPT = `You are an experienced Montessori lead teacher acting as a quality reviewer for written child observations. You read teacher-drafted reports and judge whether they are ready to send to a parent.

Your scoring rubric is descriptive, not evaluative. Reports earn high scores by:
- Citing observable behaviors (what the child did, in sequence) rather than judgments ("did great", "is so smart")
- Using calibrated Montessori language (sensitive periods, planes of development, prepared environment)
- Attributing direct speech clearly when quoting the child
- Filling each template section with sufficient detail (≥30 words is a reasonable floor)
- Preserving privacy: avoid surnames, other children's full names, addresses, medical details

Score bands:
- 85-100 (green): Ready to send. Reviewers will fast-approve without re-reading.
- 60-84 (amber): Solid but worth a closer look. One or two sections could be tighter.
- 0-59 (red): Needs more work. Sections missing, evaluative tone, or evidence sparse.

Output STRICT JSON matching this schema, nothing else:
{
  "score": <integer 0-100>,
  "flags": [
    { "kind": "tone", "status": "ok" | "warn" | "fail", "note": "<short reason>" },
    { "kind": "evidence", "status": "ok" | "warn" | "fail", "note": "<short reason>" },
    { "kind": "pii", "status": "ok" | "warn" | "fail", "note": "<short reason>" },
    { "kind": "template", "status": "ok" | "warn" | "fail", "note": "<short reason>" }
  ],
  "reasoning": [
    "<one-sentence bullet explaining the score>",
    "<another bullet, max 4 bullets total>"
  ]
}

ALL FOUR flag kinds must be present, in that order. Notes are short (under 60 chars). Reasoning has 2-4 bullets.`;

function buildUserMessage(input: ScorerInput): string {
  const lines: string[] = [];
  lines.push(`Report type: ${input.reportType}`);
  if (input.title) lines.push(`Title: ${input.title}`);
  lines.push("");
  if (input.sections && input.sections.length > 0) {
    for (const s of input.sections) {
      lines.push(`## ${s.heading}`);
      for (const p of s.paragraphs) {
        // Strip basic HTML tags so the model sees clean prose. Reports are
        // generated with minimal markup (<p>, <strong>) — anything richer
        // shouldn't reach this point.
        const text = p.html.replace(/<[^>]+>/g, "").trim();
        if (text) lines.push(text);
      }
      lines.push("");
    }
  } else if (input.body) {
    lines.push(input.body);
  } else {
    lines.push("(empty draft)");
  }
  return lines.join("\n");
}

/** Defensive parse — the model occasionally wraps JSON in prose. */
function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error("Scorer did not return JSON");
}

function clamp(n: unknown, lo: number, hi: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(lo, Math.min(hi, v));
}

function normalizeFlags(flags: unknown): ScorerFlag[] {
  const KINDS: ScorerFlag["kind"][] = ["tone", "evidence", "pii", "template"];
  const arr = Array.isArray(flags) ? flags : [];
  const byKind = new Map<string, ScorerFlag>();
  for (const f of arr) {
    if (typeof f !== "object" || f === null) continue;
    const obj = f as { kind?: unknown; status?: unknown; note?: unknown };
    if (typeof obj.kind !== "string" || typeof obj.status !== "string") continue;
    if (!KINDS.includes(obj.kind as ScorerFlag["kind"])) continue;
    if (!["ok", "warn", "fail"].includes(obj.status)) continue;
    byKind.set(obj.kind, {
      kind: obj.kind as ScorerFlag["kind"],
      status: obj.status as ScorerFlag["status"],
      note: typeof obj.note === "string" ? obj.note.slice(0, 120) : "",
    });
  }
  // Always return all four kinds, in canonical order, filling missing with
  // a neutral 'ok' so the UI can render the chip row predictably.
  return KINDS.map(
    (k) => byKind.get(k) ?? ({ kind: k, status: "ok", note: "" } satisfies ScorerFlag)
  );
}

function normalizeReasoning(reasoning: unknown): string[] {
  if (!Array.isArray(reasoning)) return [];
  return reasoning
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .slice(0, 4);
}

/** Run the scorer. Throws on hard failure (network, malformed JSON). Caller
 *  decides whether to surface the error or swallow it (autosave path). */
export async function scoreReport(input: ScorerInput): Promise<ScorerResult> {
  const anthropic = getAnthropic();
  const userMessage = buildUserMessage(input);

  const response = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  // Anthropic responses can have multiple content blocks. We only emit text.
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Scorer returned no text content");
  }

  const json = extractJsonBlock(textBlock.text);
  const parsed = JSON.parse(json) as {
    score?: unknown;
    flags?: unknown;
    reasoning?: unknown;
  };

  return {
    score: clamp(parsed.score, 0, 100),
    flags: normalizeFlags(parsed.flags),
    reasoning: normalizeReasoning(parsed.reasoning),
  };
}
