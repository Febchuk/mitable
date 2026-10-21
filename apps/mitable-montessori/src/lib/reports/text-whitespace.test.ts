import { describe, expect, it } from "vitest";
import {
  fieldPayloadToReadableText,
  paragraphHasTeacherContent,
  plainTextToReportParagraphHtml,
} from "./template-field-payload";
import { buildReportPdfBlocks } from "@/lib/pdf/sections-to-pdf-sections";

describe("report text whitespace", () => {
  it.each([
    "  Leading spaces",
    "Trailing spaces  ",
    "  First line  \n\n\tSecond line\n  ",
    "\n\nText\n\n",
    "   \n  ",
    '<notes> & "quotes" and literal &nbsp;',
  ])("preserves input through saved HTML and parent report blocks: %j", (text) => {
    const html = plainTextToReportParagraphHtml(text);
    expect(fieldPayloadToReadableText(html)).toBe(text);
    const blocks = buildReportPdfBlocks(
      [{ heading: "Project letter", paragraphs: [{ html }] }],
      {}
    );
    expect(blocks).toEqual([
      { kind: "section", heading: "Project letter", paragraphs: [{ text }] },
    ]);
  });

  it("reads older browser HTML without adding spaces around inline tags", () => {
    expect(
      fieldPayloadToReadableText(
        "<div>&nbsp;&nbsp;First <b>line</b>&nbsp;</div><div><br></div><div>  Last &#32;&#x20;</div>"
      )
    ).toBe("  First line \n\n  Last   ");
  });

  it("keeps newlines in older contenteditable divs", () => {
    expect(fieldPayloadToReadableText("First<div>Second</div><div>Third</div>")).toBe(
      "First\nSecond\nThird"
    );
  });

  it("still treats whitespace-only text as empty for send readiness", () => {
    expect(paragraphHasTeacherContent(" \n<br>&nbsp; ")).toBe(false);
  });
});
