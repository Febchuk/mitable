import { describe, expect, it } from "vitest";
import { projectLetterHasContent } from "./project-letter";
describe("project-letter delivery", () => {
  it("rejects a blank editor, including HTML placeholders", () => {
    expect(
      projectLetterHasContent({
        sections: [{ paragraphs: [{ html: "<p><br></p><p>&nbsp;</p>" }] }],
      })
    ).toBe(false);
  });
  it("accepts a teacher-written letter", () => {
    expect(
      projectLetterHasContent({
        sections: [{ paragraphs: [{ html: "<p>Please bring leaves for the project.</p>" }] }],
      })
    ).toBe(true);
  });
});
