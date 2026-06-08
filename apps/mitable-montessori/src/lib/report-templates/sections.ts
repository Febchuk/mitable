import { z } from "zod";

/**
 * One row in the admin UI maps to entries across three storage columns:
 *   - sections          text[]   (heading list, source of order)
 *   - section_guidance  jsonb    ({ heading: prose })
 *   - section_meta      jsonb    ({ heading: { type, options? } })
 *
 * `text` is the implicit default for any heading missing from section_meta,
 * so existing templates render without a backfill.
 */

export const CURRICULUM_PROGRAMS = ["speech"] as const;
export type CurriculumProgram = (typeof CURRICULUM_PROGRAMS)[number];

export const TEMPLATE_FIELD_TYPES = [
  "text",
  "checklist",
  "single_select",
  "hardcoded",
  "curriculum",
] as const;
export type TemplateFieldType = (typeof TEMPLATE_FIELD_TYPES)[number];

export const TemplateSectionRowSchema = z
  .object({
    section: z.string().min(1).max(120),
    description: z.string().max(8000).optional().default(""),
    fieldType: z.enum(TEMPLATE_FIELD_TYPES).optional().default("text"),
    options: z.array(z.string().min(1).max(120)).max(40).optional().default([]),
    curriculumProgram: z.enum(CURRICULUM_PROGRAMS).optional(),
  })
  .superRefine((row, ctx) => {
    if (
      (row.fieldType === "checklist" || row.fieldType === "single_select") &&
      row.options.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "This field type needs at least one option",
      });
    }
    if (row.fieldType === "hardcoded" && !(row.description ?? "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["description"],
        message: "Fixed text cannot be empty",
      });
    }
    if (row.fieldType === "curriculum" && !row.curriculumProgram) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["curriculumProgram"],
        message: "Pick which curriculum to embed",
      });
    }
  });

export const TemplateSectionsSchema = z
  .array(TemplateSectionRowSchema)
  .min(1)
  .max(20)
  .refine((rows) => new Set(rows.map((r) => r.section)).size === rows.length, {
    message: "Each section title must be unique",
  });

export type TemplateSectionRow = z.infer<typeof TemplateSectionRowSchema>;

export type SectionMetaEntry =
  | { type: "text" }
  | { type: "hardcoded" }
  | { type: "checklist"; options: string[] }
  | { type: "single_select"; options: string[] }
  | { type: "curriculum"; program: CurriculumProgram }
  | { type: "progress_topic"; topicId: string };

export type SectionMeta = Record<string, SectionMetaEntry>;

/** Sections filled server-side (not sent to the drafting agent as empty prose). */
export function sectionExcludedFromAgent(meta: SectionMetaEntry | undefined): boolean {
  return (
    meta?.type === "hardcoded" || meta?.type === "curriculum" || meta?.type === "progress_topic"
  );
}

export function rowsToDb(rows: TemplateSectionRow[]): {
  sections: string[];
  section_guidance: Record<string, string>;
  section_meta: SectionMeta;
} {
  const section_meta: SectionMeta = {};
  for (const r of rows) {
    if (r.fieldType === "checklist") {
      section_meta[r.section] = { type: "checklist", options: r.options };
    } else if (r.fieldType === "single_select") {
      section_meta[r.section] = { type: "single_select", options: r.options };
    } else if (r.fieldType === "hardcoded") {
      section_meta[r.section] = { type: "hardcoded" };
    } else if (r.fieldType === "curriculum" && r.curriculumProgram) {
      section_meta[r.section] = { type: "curriculum", program: r.curriculumProgram };
    }
    // Plain text sections are left out of section_meta — the reader
    // resolves missing entries to { type: 'text' }, keeping the column
    // small for templates that don't need option lists.
  }
  return {
    sections: rows.map((r) => r.section),
    section_guidance: Object.fromEntries(rows.map((r) => [r.section, r.description])),
    section_meta,
  };
}

export function dbToRows(
  sections: string[],
  guidance: Record<string, string> | null | undefined,
  meta: SectionMeta | null | undefined
): TemplateSectionRow[] {
  const g = guidance ?? {};
  const m = meta ?? {};
  return sections.map((section) => {
    const entry = m[section];
    if (entry?.type === "checklist") {
      return {
        section,
        description: g[section] ?? "",
        fieldType: "checklist" as const,
        options: entry.options ?? [],
      };
    }
    if (entry?.type === "single_select") {
      return {
        section,
        description: g[section] ?? "",
        fieldType: "single_select" as const,
        options: entry.options ?? [],
      };
    }
    if (entry?.type === "hardcoded") {
      return {
        section,
        description: g[section] ?? "",
        fieldType: "hardcoded" as const,
        options: [],
      };
    }
    if (entry?.type === "curriculum") {
      return {
        section,
        description: g[section] ?? "",
        fieldType: "curriculum" as const,
        options: [],
        curriculumProgram: entry.program,
      };
    }
    return {
      section,
      description: g[section] ?? "",
      fieldType: "text" as const,
      options: [],
    };
  });
}
