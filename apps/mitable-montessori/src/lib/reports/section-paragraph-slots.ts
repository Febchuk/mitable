import type { SectionMetaEntry } from "@/lib/report-templates/sections";
import { paragraphHasTeacherContent } from "@/lib/reports/template-field-payload";

/** First paragraph index in a section that the teacher can still fill. */
export function firstOpenParagraphIndex(
  paragraphs: Array<{ html: string }>,
  fieldMeta?: SectionMetaEntry | null
): number | null {
  for (let i = 0; i < paragraphs.length; i++) {
    if (i === 0 && fieldMeta) {
      const structured =
        fieldMeta.type === "hardcoded" ||
        fieldMeta.type === "curriculum" ||
        fieldMeta.type === "progress_topic" ||
        fieldMeta.type === "checklist" ||
        fieldMeta.type === "single_select";
      if (structured) continue;
    }
    if (!paragraphHasTeacherContent(paragraphs[i].html)) {
      return i;
    }
  }
  return null;
}
