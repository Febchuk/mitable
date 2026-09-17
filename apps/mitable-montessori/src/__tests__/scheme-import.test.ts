import { describe, expect, it } from "vitest";
import { buildSchemeSubjects, previewSchemeImport, readSchemeCsv } from "@/lib/admin/scheme-import";
import type { CurriculumTree } from "@/lib/queries/curriculum-tree";

describe("scheme CSV import", () => {
  const sample =
    "\uFEFFWEEK,SOUNDS,NUMBERS,,SHAPES,COLOURS,,FRENCH\n" +
    "1,Getting Acquainted,,,,,,\n" +
    "2,REVISION,,,,,,\n" +
    '6,"c, a, d","1,2,3 (Quantify)","Circle, Triangle, Square",,Red,Bonjour,\n' +
    '7,"c, a, d","1,2,3 (Quantify)","Circle, Triangle, Square",,Yellow,Bonjour,\n' +
    "9,Mid- Term Break,,,,,,\n";

  it("pairs shifted subject headings with populated columns and collapses repeated weeks", () => {
    const result = readSchemeCsv(sample);
    expect(result.columns.map((column) => column.suggestedName)).toEqual([
      "SOUNDS",
      "NUMBERS",
      "SHAPES",
      "COLOURS",
      "FRENCH",
    ]);
    // The heading for Shapes is shifted one column from its values.
    expect(result.warning).toBeTruthy();
    const sounds = result.topics.find((topic) => topic.name === "c, a, d");
    expect(sounds?.weeks).toEqual(["6", "7"]);
    expect(result.topics.find((topic) => topic.name === "REVISION")?.included).toBe(false);
    expect(result.topics.find((topic) => topic.name === "Mid- Term Break")?.included).toBe(false);
  });

  it("keeps a comma-filled cell as one topic and imports one matching lesson", () => {
    const csv = readSchemeCsv(
      'WEEK,SOUNDS,NUMBERS,,SHAPES\n6,"c, a, d",1,"Circle, Triangle, Square",\n7,"c, a, d",1,"Circle, Triangle, Square",\n'
    );
    const names = Object.fromEntries(
      csv.columns.map((column) => [column.index, column.suggestedName])
    );
    const subjects = buildSchemeSubjects(csv.columns, csv.topics, names);
    expect(subjects.find((subject) => subject.name === "SOUNDS")?.topics).toEqual(["c, a, d"]);
    expect(subjects.find((subject) => subject.name === "SHAPES")?.topics).toEqual([
      "Circle, Triangle, Square",
    ]);

    const tree: CurriculumTree = {
      id: "curriculum",
      name: "Toddler",
      framework: "montessori",
      isActive: true,
      subjects: [
        {
          id: "subject",
          name: "Sounds",
          sortOrder: 0,
          topics: [
            {
              id: "topic",
              name: "c, a, d",
              sortOrder: 0,
              markingSchema: "ipm",
              subtopics: [],
            },
          ],
        },
      ],
    };
    const preview = previewSchemeImport(subjects, tree);
    expect(preview.subjects.find((subject) => subject.name === "SOUNDS")?.topics[0]).toMatchObject({
      action: "reuse",
      lessonAction: "add",
    });
    expect(preview.counts.lessons).toBe(3);

    tree.subjects[0].topics[0].subtopics.push({ id: "lesson", name: "c, a, d", sortOrder: 0 });
    expect(previewSchemeImport([{ name: "SOUNDS", topics: ["c, a, d"] }], tree).counts).toEqual({
      subjects: 0,
      topics: 0,
      lessons: 0,
      reusedTopics: 1,
    });
  });
});
