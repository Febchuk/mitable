import type { SectionMeta } from "@/lib/report-templates/sections";
import { isDirectorComment } from "./director-comment";

export const TERM_FEEDBACK_FIELDS = [
  { id: "teacher-comment", heading: "Teacher's comment" },
  { id: "specials-report", heading: "Specials report" },
] as const;

type Section = { id: string; heading: string; paragraphs: Array<{ id: string; html: string }> };
const normalize = (heading: string) => heading.trim().replace(/[’‘]/g, "'").toLowerCase();

/** Manual term feedback stays separate from subject notes and the director's review. */
export function withTermFeedback(
  sections: Section[],
  sectionMeta: SectionMeta
): { sections: Section[]; sectionMeta: SectionMeta } {
  const next = [...sections];
  const meta = { ...sectionMeta };
  for (const field of TERM_FEEDBACK_FIELDS) {
    const existing = next.filter(
      (section) => normalize(section.heading) === normalize(field.heading)
    );
    if (existing.length) {
      for (const section of existing) meta[section.heading] = { type: "manual_text" };
      continue;
    }
    const directorIndex = next.findIndex((section) =>
      isDirectorComment(section.heading, meta[section.heading])
    );
    next.splice(directorIndex < 0 ? next.length : directorIndex, 0, {
      id: field.id,
      heading: field.heading,
      paragraphs: [{ id: `${field.id}-value`, html: "" }],
    });
    meta[field.heading] = { type: "manual_text" };
  }
  return { sections: next, sectionMeta: meta };
}
