/**
 * Structured values for template-driven checklist / single-select sections are
 * stored in the first paragraph's `html` as a prefixed JSON blob so we don't
 * need a DB migration. Plain prose remains the default for `text` sections.
 */

import type { SectionMeta } from "@/lib/report-templates/sections";

const PREFIX = "__MITABLE_FIELD_V1__";

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
  if (!trimmed) return { kind: "none" };
  return { kind: "legacy_prose", html };
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const d = decodeFieldPayload(html);
  if (d.kind === "checklist") return d.selected.length > 0;
  if (d.kind === "single_select") return (d.value?.trim().length ?? 0) > 0;
  if (d.kind === "none") return false;
  return stripTags(d.html).length > 0;
}

/** After agent draft: coerce first paragraph of structured sections to encoded payloads. */
export function normalizeSectionHtmlForTemplate(
  heading: string,
  html: string,
  meta: SectionMeta
): string {
  const entry = meta[heading];
  if (!entry || entry.type === "text") return html;

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
