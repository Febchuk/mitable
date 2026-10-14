export function projectLetterHasContent(report: {
  sections?: Array<{ paragraphs: Array<{ html: string }> }> | null;
  body?: string | null;
}): boolean {
  return Boolean(
    report.body?.trim() ||
    report.sections?.some((section) =>
      section.paragraphs.some((paragraph) =>
        paragraph.html
          .replace(/<[^>]*>/g, "")
          .replace(/&nbsp;|&#160;/gi, " ")
          .trim()
      )
    )
  );
}
