import { parseCsv } from "@/lib/admin/csv";
import type { CurriculumTree } from "@/lib/queries/curriculum-tree";

export type SchemeSubjectInput = { name: string; topics: string[] };
export type SchemeColumn = { index: number; suggestedName: string; samples: string[] };
export type SchemeDraftTopic = {
  id: string;
  columnIndex: number;
  name: string;
  weeks: string[];
  rows: number[];
  included: boolean;
};

export function cleanSchemeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

const key = (name: string) => cleanSchemeName(name).toLocaleLowerCase();

/** Spreadsheet exports with merged headings may shift headings away from data.
 * Pair headings with populated columns in visual order, then require review. */
export function readSchemeCsv(text: string): {
  columns: SchemeColumn[];
  topics: SchemeDraftTopic[];
  warning: string | null;
} {
  const csv = parseCsv(text.replace(/^\uFEFF/, ""));
  const weekIndex = csv.headers.findIndex((header) => /^week\s*$/i.test(header));
  if (weekIndex < 0) throw new Error('The CSV needs a "WEEK" heading.');

  const dataColumns = [
    ...new Set(
      csv.rows.flatMap((row) =>
        row
          .map((value, index) => (value.trim() && index !== weekIndex ? index : -1))
          .filter((i) => i >= 0)
      )
    ),
  ].sort((a, b) => a - b);
  const headings = csv.headers
    .map((value, index) => ({ value: cleanSchemeName(value), index }))
    .filter(({ value, index }) => !!value && index !== weekIndex);
  if (dataColumns.length === 0) throw new Error("The CSV has no topics to import.");

  const pairedByOrder = headings.length === dataColumns.length;
  const columns = dataColumns.map((index, position) => ({
    index,
    suggestedName: pairedByOrder
      ? headings[position].value
      : cleanSchemeName(csv.headers[index] ?? "") || "",
    samples: csv.rows
      .map((row) => cleanSchemeName(row[index] ?? ""))
      .filter(Boolean)
      .slice(0, 3),
  }));

  const grouped = new Map<string, SchemeDraftTopic>();
  csv.rows.forEach((row, rowIndex) => {
    const populated = dataColumns.filter((index) => cleanSchemeName(row[index] ?? ""));
    for (const index of populated) {
      const name = cleanSchemeName(row[index] ?? "");
      const id = `${index}:${key(name)}`;
      const week = cleanSchemeName(row[weekIndex] ?? "") || `row ${rowIndex + 2}`;
      const existing = grouped.get(id);
      if (existing) {
        if (!existing.weeks.includes(week)) existing.weeks.push(week);
        existing.rows.push(rowIndex + 2);
      } else {
        grouped.set(id, {
          id,
          columnIndex: index,
          name,
          weeks: [week],
          rows: [rowIndex + 2],
          included: !(populated.length === 1 && /^(revision|mid\s*-?\s*term\s+break)$/i.test(name)),
        });
      }
    }
  });

  return {
    columns,
    topics: [...grouped.values()],
    warning:
      pairedByOrder && headings.some((heading, position) => heading.index !== dataColumns[position])
        ? "Some headings are shifted from their topic columns. Check each suggested subject against the sample values."
        : headings.length !== dataColumns.length
          ? "Some columns do not have matching headings. Name or ignore each column before continuing."
          : null,
  };
}

export function buildSchemeSubjects(
  columns: SchemeColumn[],
  topics: SchemeDraftTopic[],
  names: Record<number, string>
): SchemeSubjectInput[] {
  const mapped = new Set(columns.map((column) => column.index));
  const subjects = new Map<string, SchemeSubjectInput>();
  const topicKeys = new Map<string, Set<string>>();
  for (const topic of topics.filter((item) => item.included)) {
    if (!mapped.has(topic.columnIndex)) continue;
    const subjectName = cleanSchemeName(names[topic.columnIndex] ?? "");
    if (!subjectName) continue; // Explicitly ignored column.
    const topicName = cleanSchemeName(topic.name);
    if (!topicName) throw new Error("An included topic needs a name.");
    if (subjectName.length > 200 || topicName.length > 200) {
      throw new Error("Subject and topic names must be 200 characters or fewer.");
    }
    const subjectKey = key(subjectName);
    if (!subjects.has(subjectKey)) {
      subjects.set(subjectKey, { name: subjectName, topics: [] });
      topicKeys.set(subjectKey, new Set());
    }
    if (!topicKeys.get(subjectKey)!.has(key(topicName))) {
      subjects.get(subjectKey)!.topics.push(topicName);
      topicKeys.get(subjectKey)!.add(key(topicName));
    }
  }
  return [...subjects.values()];
}

export type SchemePreview = {
  subjects: Array<{
    name: string;
    action: "add" | "reuse";
    topics: Array<{ name: string; action: "add" | "reuse"; lessonAction: "add" | "reuse" }>;
  }>;
  counts: { subjects: number; topics: number; lessons: number; reusedTopics: number };
};

export function previewSchemeImport(
  input: SchemeSubjectInput[],
  tree: CurriculumTree
): SchemePreview {
  const subjects: SchemePreview["subjects"] = [];
  const seenSubjects = new Map<string, SchemePreview["subjects"][number]>();
  const counts = { subjects: 0, topics: 0, lessons: 0, reusedTopics: 0 };
  for (const entry of input) {
    const subjectName = cleanSchemeName(entry.name);
    const subjectKey = key(subjectName);
    const existingSubject = tree.subjects.find((subject) => key(subject.name) === subjectKey);
    let subject = seenSubjects.get(subjectKey);
    if (!subject) {
      subject = { name: subjectName, action: existingSubject ? "reuse" : "add", topics: [] };
      if (!existingSubject) counts.subjects++;
      seenSubjects.set(subjectKey, subject);
      subjects.push(subject);
    }
    for (const rawName of entry.topics) {
      const name = cleanSchemeName(rawName);
      if (subject.topics.some((topic) => key(topic.name) === key(name))) continue;
      const existingTopic = existingSubject?.topics.find((topic) => key(topic.name) === key(name));
      const existingLesson = existingTopic?.subtopics.some(
        (lesson) => key(lesson.name) === key(name)
      );
      const action = existingTopic ? "reuse" : "add";
      const lessonAction = existingLesson ? "reuse" : "add";
      if (action === "add") counts.topics++;
      else counts.reusedTopics++;
      if (lessonAction === "add") counts.lessons++;
      subject.topics.push({ name, action, lessonAction });
    }
  }
  return { subjects, counts };
}
