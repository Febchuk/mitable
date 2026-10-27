import { beforeEach, expect, it, vi } from "vitest";
import { reportMemoryDb } from "./helpers/report-memory-db";

const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("@/utils/supabase/server", () => ({ createClient: () => mocks.db }));
import { listCurriculumProgress } from "@/lib/queries/curriculum";

function fixture() {
  const topics = Array.from({ length: 8 }, (_, index) => ({
    id: `topic-${index}`,
    name: `Topic ${index + 1}`,
    sort_order: index,
    marking_schema: index === 7 ? "five_level" : "ipm",
    curriculum_subtopics: Array.from({ length: index === 0 ? 8 : 7 }, (_, lesson) => ({
      id: `lesson-${index}-${lesson}`,
      name: `Lesson ${index + 1}.${lesson + 1}`,
      sort_order: lesson,
    })).reverse(),
  }));
  return reportMemoryDb({
    student_classroom_enrollments: [
      {
        student_id: "child",
        end_date: null,
        is_primary: false,
        start_date: "2025-01-01",
        classrooms: { curriculum_id: "other-curriculum" },
      },
      {
        student_id: "child",
        end_date: null,
        is_primary: true,
        start_date: "2026-10-01",
        classrooms: { curriculum_id: "toddler-curriculum" },
      },
      {
        student_id: "child",
        end_date: "2026-09-30",
        is_primary: true,
        start_date: "2024-01-01",
        classrooms: { curriculum_id: "old-curriculum" },
      },
    ],
    curriculum_subjects: [
      {
        curriculum_id: "toddler-curriculum",
        sort_order: 1,
        curriculum_topics: topics.slice(4).reverse(),
      },
      {
        curriculum_id: "toddler-curriculum",
        sort_order: 0,
        curriculum_topics: topics.slice(0, 4).reverse(),
      },
      {
        curriculum_id: "other-curriculum",
        sort_order: 0,
        curriculum_topics: [{ ...topics[0], id: "wrong-topic" }],
      },
    ],
    student_progress: [
      {
        student_id: "child",
        curriculum_subtopic_id: "lesson-0-0",
        status: "practicing",
        comment: "Threaded three beads.",
        updated_at: "2026-10-20T09:00:00.000Z",
      },
      {
        student_id: "child",
        curriculum_subtopic_id: "lesson-7-6",
        status: "excellent",
        comment: null,
        updated_at: "2026-10-20T10:00:00.000Z",
      },
      { student_id: "child", curriculum_subtopic_id: "old-lesson", status: "mastered" },
      { student_id: "other-child", curriculum_subtopic_id: "lesson-0-1", status: "mastered" },
    ],
    student_progress_history: [
      {
        student_id: "child",
        curriculum_subtopic_id: "lesson-0-0",
        new_status: "introduced",
        changed_at: "2026-10-19T09:00:00.000Z",
      },
      {
        student_id: "child",
        curriculum_subtopic_id: "lesson-0-0",
        new_status: "practicing",
        changed_at: "2026-10-20T09:00:00.000Z",
      },
    ],
  });
}

let data: ReturnType<typeof fixture>;
beforeEach(() => {
  data = fixture();
  mocks.db = data.db;
});

it("shows all 57 assigned lessons across 8 topics when only two lessons have marks", async () => {
  const topics = await listCurriculumProgress("child");
  expect(topics).toHaveLength(8);
  expect(topics.flatMap((topic) => topic.subtopics)).toHaveLength(57);
  expect(topics.map((topic) => topic.topicId)).toEqual(
    Array.from({ length: 8 }, (_, i) => `topic-${i}`)
  );
  expect(topics[0].subtopics[0]).toMatchObject({
    subtopicId: "lesson-0-0",
    status: "practicing",
    comment: "Threaded three beads.",
    introducedAt: "2026-10-19T09:00:00.000Z",
    practicingAt: "2026-10-20T09:00:00.000Z",
  });
  expect(topics[0].subtopics[1]).toMatchObject({ status: "na", updatedAt: null, comment: null });
  expect(topics[7]).toMatchObject({ markingSchema: "five_level" });
  expect(topics[7].subtopics[6]).toMatchObject({ status: "excellent" });
  expect(JSON.stringify(topics)).not.toContain("old-lesson");
  expect(JSON.stringify(topics)).not.toContain("wrong-topic");
});

it("shows the full curriculum for a child without any saved progress", async () => {
  data.tables.student_progress = [];
  data.tables.student_progress_history = [];
  const lessons = (await listCurriculumProgress("child")).flatMap((topic) => topic.subtopics);
  expect(lessons).toHaveLength(57);
  expect(lessons.every((lesson) => lesson.status === "na" && lesson.updatedAt === null)).toBe(true);
});

it("does not turn a curriculum read failure into a partial or empty curriculum", async () => {
  data.failures.set("curriculum_subjects", "Curriculum unavailable");
  await expect(listCurriculumProgress("child")).rejects.toThrow("Curriculum unavailable");
});
