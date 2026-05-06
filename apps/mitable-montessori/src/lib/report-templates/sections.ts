import { z } from "zod";

/** One row in the admin UI → DB `sections[]` + `section_guidance` jsonb. */
export const TemplateSectionRowSchema = z.object({
  section: z.string().min(1).max(120),
  description: z.string().max(8000).optional().default(""),
});

export const TemplateSectionsSchema = z
  .array(TemplateSectionRowSchema)
  .min(1)
  .max(20)
  .refine((rows) => new Set(rows.map((r) => r.section)).size === rows.length, {
    message: "Each section title must be unique",
  });

export type TemplateSectionRow = z.infer<typeof TemplateSectionRowSchema>;

export function rowsToDb(rows: TemplateSectionRow[]): {
  sections: string[];
  section_guidance: Record<string, string>;
} {
  return {
    sections: rows.map((r) => r.section),
    section_guidance: Object.fromEntries(rows.map((r) => [r.section, r.description])),
  };
}

export function dbToRows(
  sections: string[],
  guidance: Record<string, string> | null | undefined
): TemplateSectionRow[] {
  const g = guidance ?? {};
  return sections.map((section) => ({
    section,
    description: g[section] ?? "",
  }));
}
