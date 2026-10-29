/**
 * Structured values for template-driven checklist / single-select sections are
 * stored in the first paragraph's `html` as a prefixed JSON blob so we don't
 * need a DB migration. Plain prose remains the default for `text` sections.
 */

import type { SectionMeta, SectionMetaEntry } from "@/lib/report-templates/sections";
import { isTermSkillsPayload, termSkillsForDisplay, termSkillsToReadableText } from "./term-skills";
import {
  isProgressTopicPayload,
  progressTopicToReadableText,
} from "@/lib/reports/progress-topic-payload";
import { decodeExamGrades, examGradesToReadableText } from "@/lib/reports/exam-grades-payload";

const PREFIX = "__MITABLE_FIELD_V1__";

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * HTML for a curriculum-backed section (speech = bullet list).
 *
 * Emits `• label<br>• label<br>…` rather than `<ul><li>…</li></ul>` so the
 * list survives both renderers: Tailwind's preflight zeroes `<ul>` styling
 * in the editor, and the PDF text-extraction path strips tags. A `•` glyph
 * plus `<br>` is portable through both.
 */
export function speechLabelsToReportHtml(labels: string[]): string {
  if (labels.length === 0) {
    return plainTextToReportParagraphHtml("No speech targets on file yet.");
  }
  return labels.map((l) => `• ${escapeHtmlText(l)}`).join("<br>");
}

/** Escape plain text for one report paragraph (`innerHTML`); newlines → `<br>`. */
export function plainTextToReportParagraphHtml(plain: string): string {
  const t = plain.replace(/\r\n/g, "\n");
  if (!t) return "";
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

/** Seed HTML when a report row is created from a template. */
export function initialParagraphHtmlForTemplateSection(
  heading: string,
  guidance: string,
  meta: SectionMeta,
  opts?: { speechLabels?: string[] }
): string {
  const entry = meta[heading];
  if (entry?.type === "hardcoded") {
    return plainTextToReportParagraphHtml(guidance);
  }
  if (entry?.type === "curriculum" && entry.program === "speech") {
    return speechLabelsToReportHtml(opts?.speechLabels ?? []);
  }
  return "";
}

export type DecodedFieldPayload =
  | { kind: "checklist"; selected: string[] }
  | { kind: "single_select"; value: string | null }
  | { kind: "legacy_prose"; html: string }
  | { kind: "none" };

export function encodeChecklist(selected: string[]): string {
  return PREFIX + JSON.stringify({ t: "checklist", s: selected });
}

export function encodeSingleSelect(value: string | null): string {
  return PREFIX + JSON.stringify({ t: "single_select", v: value });
}

export function decodeFieldPayload(html: string): DecodedFieldPayload {
  const trimmed = html.trim();
  if (trimmed.startsWith(PREFIX)) {
    try {
      const o = JSON.parse(trimmed.slice(PREFIX.length)) as {
        t?: string;
        s?: unknown;
        v?: unknown;
      };
      if (o.t === "checklist" && Array.isArray(o.s) && o.s.every((x) => typeof x === "string")) {
        return { kind: "checklist", selected: o.s as string[] };
      }
      if (o.t === "single_select" && (o.v === null || typeof o.v === "string")) {
        return { kind: "single_select", value: o.v };
      }
    } catch {
      /* fall through */
    }
  }
  if (!html) return { kind: "none" };
  return { kind: "legacy_prose", html };
}

function stripTags(html: string): string {
  // Decode only after removing tags: escaped teacher text must remain text.
  // Block boundaries from older contenteditable saves are line breaks too.
  return html
    .replace(/<(p|div)><br\s*\/?>\s*<\/\1>/gi, "<$1></$1>")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>\s*(?=<(p|div|li|h[1-6])\b)/gi, "\n")
    .replace(/([^>\n])<(?:div|p)\b[^>]*>/gi, "$1\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
      const named: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        nbsp: " ",
      };
      if (!code.startsWith("#")) return named[code.toLowerCase()] ?? entity;
      const point =
        code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    });
}

/** Guess which template options the drafted prose refers to (for migration + post-draft normalize). */
export function inferChecklistSelections(proseHtml: string, options: string[]): string[] {
  const plain = stripTags(proseHtml).toLowerCase();
  if (!plain) return [];
  const selected: string[] = [];
  for (const opt of options) {
    const t = opt.trim().toLowerCase();
    if (t && plain.includes(t)) selected.push(opt);
  }
  return selected;
}

export function inferSingleSelect(proseHtml: string, options: string[]): string | null {
  const plain = stripTags(proseHtml).toLowerCase();
  for (const opt of options) {
    const t = opt.trim().toLowerCase();
    if (t && plain.includes(t)) return opt;
  }
  return null;
}

/** Plain text for PDF, chat tokenization, and markdown `body` — never exposes raw JSON prefixes. */
export function fieldPayloadToReadableText(html: string): string {
  if (isTermSkillsPayload(html)) return termSkillsToReadableText(html);
  if (decodeExamGrades(html)) return examGradesToReadableText(html);
  if (isProgressTopicPayload(html)) {
    return progressTopicToReadableText(html);
  }
  const d = decodeFieldPayload(html);
  if (d.kind === "checklist") {
    if (d.selected.length === 0) return "";
    return d.selected.map((s) => `• ${s}`).join("\n");
  }
  if (d.kind === "single_select") {
    return (d.value ?? "").trim();
  }
  if (d.kind === "none") return "";
  return stripTags(d.html);
}

/**
 * True when the teacher has entered something we should treat as "filled"
 * (autosave draft kickoff uses this).
 */
export function paragraphHasTeacherContent(html: string): boolean {
  if (isTermSkillsPayload(html))
    return termSkillsForDisplay(html).some((group) => group.rows.some((row) => row.value));
  const d = decodeFieldPayload(html);
  if (d.kind === "checklist") return d.selected.length > 0;
  if (d.kind === "single_select") return (d.value?.trim().length ?? 0) > 0;
  if (d.kind === "none") return false;
  return stripTags(d.html).trim().length > 0;
}

/**
 * Whether this paragraph counts as "filled" for draft readiness / empty-report checks.
 * Template hardcoded boilerplate does not count — teachers did not write it.
 */
export function paragraphCountsTowardDraftReadiness(
  html: string,
  fieldMeta?: SectionMetaEntry | null
): boolean {
  if (
    fieldMeta?.type === "hardcoded" ||
    fieldMeta?.type === "curriculum" ||
    fieldMeta?.type === "progress_topic" ||
    fieldMeta?.type === "term_history" ||
    fieldMeta?.type === "exam_grades"
  ) {
    return false;
  }
  return paragraphHasTeacherContent(html);
}

/** After agent draft: coerce first paragraph of structured sections to encoded payloads. */
export function normalizeSectionHtmlForTemplate(
  heading: string,
  html: string,
  meta: SectionMeta
): string {
  const entry = meta[heading];
  if (
    !entry ||
    entry.type === "text" ||
    entry.type === "hardcoded" ||
    entry.type === "curriculum" ||
    entry.type === "progress_topic" ||
    entry.type === "term_history" ||
    entry.type === "term_skills" ||
    entry.type === "director_comment" ||
    entry.type === "exam_grades"
  ) {
    return html;
  }

  const decoded = decodeFieldPayload(html);
  if (entry.type === "checklist") {
    if (decoded.kind === "checklist") return encodeChecklist(decoded.selected);
    if (decoded.kind === "none") return encodeChecklist([]);
    return encodeChecklist(inferChecklistSelections(html, entry.options));
  }
  if (entry.type === "single_select") {
    if (decoded.kind === "single_select") return encodeSingleSelect(decoded.value);
    if (decoded.kind === "none") return encodeSingleSelect(null);
    return encodeSingleSelect(inferSingleSelect(html, entry.options));
  }
  return html;
}
