import type { SectionMeta, SectionMetaEntry } from "@/lib/report-templates/sections";

export const DIRECTOR_COMMENT_HEADING = "Director's comment";
type Section = { id: string; heading: string; paragraphs: Array<{ id: string; html: string }> };

export function isDirectorComment(heading: string, meta?: SectionMetaEntry) {
  return (
    meta?.type === "director_comment" ||
    heading.trim().replace(/[’‘]/g, "'").toLowerCase() === "director's comment"
  );
}

/** A manual review field, kept separate from the class teacher's term feedback. */
export function withDirectorComment(
  sections: Section[],
  sectionMeta: SectionMeta
): { sections: Section[]; sectionMeta: SectionMeta } {
  const existing = sections.filter((section) =>
    isDirectorComment(section.heading, sectionMeta[section.heading])
  );
  if (existing.length)
    return {
      sections,
      sectionMeta: {
        ...sectionMeta,
        ...Object.fromEntries(
          existing.map((section) => [section.heading, { type: "director_comment" as const }])
        ),
      },
    };
  return {
    sections: [
      ...sections,
      {
        id: "director-comment",
        heading: DIRECTOR_COMMENT_HEADING,
        paragraphs: [{ id: "director-comment-value", html: "" }],
      },
    ],
    sectionMeta: {
      ...sectionMeta,
      [DIRECTOR_COMMENT_HEADING]: { type: "director_comment" as const },
    },
  };
}

export function directorComments(sections: Section[], meta: SectionMeta) {
  return sections.filter((section) => isDirectorComment(section.heading, meta[section.heading]));
}
