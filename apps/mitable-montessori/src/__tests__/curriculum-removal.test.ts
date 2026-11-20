import { expect, it } from "vitest";
import { reportMemoryDb } from "./helpers/report-memory-db";
import {
  removeCurriculumTopic,
  removeCurriculumSubtopic,
  createCurriculumTopic,
  reorderCurriculumTopics,
} from "@/lib/admin/crud";
import { getCurriculumTree } from "@/lib/queries/curriculum-tree";

function fixture() {
  const lesson = {
    id: "lesson",
    topic_id: "topic",
    name: "Stringing",
    sort_order: 0,
    is_active: true,
  };
  const topic = {
    id: "topic",
    curriculum_id: "curriculum",
    subject_id: "subject",
    name: "Fine motor",
    sort_order: 0,
    is_active: true,
    marking_schema: "ipm",
    curriculum_subtopics: [lesson],
  };
  const subject = {
    id: "subject",
    curriculum_id: "curriculum",
    name: "Practical Life",
    sort_order: 0,
    is_active: true,
    curriculum_topics: [topic],
  };
  const db = reportMemoryDb({
    curricula: [{ id: "curriculum", school_id: "school", name: "Curriculum", is_active: true }],
    curriculum_subjects: [subject],
    curriculum_topics: [topic],
    curriculum_subtopics: [lesson],
    student_progress: [{ curriculum_subtopic_id: "lesson", status: "mastered" }],
    student_progress_history: [{ curriculum_subtopic_id: "lesson", new_status: "mastered" }],
  });
  return { ...db, ctx: { supabase: db.db, schoolId: "school", actorUserId: "admin" } };
}
it("removes a lesson from a fresh curriculum read while retaining its recorded progress", async () => {
  const f = fixture();
  await removeCurriculumSubtopic(f.ctx, "lesson");
  const reloaded = await getCurriculumTree(f.db, {
    schoolId: "school",
    curriculumId: "curriculum",
  });
  expect(reloaded?.subjects[0].topics[0].subtopics).toEqual([]);
  expect(f.tables.curriculum_subtopics[0].is_active).toBe(false);
  expect(f.tables.student_progress).toHaveLength(1);
  expect(f.tables.student_progress_history).toHaveLength(1);
});
it("removes a topic on reload and permits a new topic with that name", async () => {
  const f = fixture();
  await removeCurriculumTopic(f.ctx, "topic");
  expect(
    (await getCurriculumTree(f.db, { schoolId: "school", curriculumId: "curriculum" }))?.subjects[0]
      .topics
  ).toEqual([]);
  await expect(
    createCurriculumTopic(f.ctx, {
      curriculum_id: "curriculum",
      subject_id: "subject",
      name: "Fine motor",
      sort_order: 0,
    })
  ).resolves.toBeTruthy();
  const newTopic = f.tables.curriculum_topics[1];
  await expect(
    reorderCurriculumTopics(f.ctx, "subject", [String(newTopic.id)])
  ).resolves.toBeUndefined();
});
it("refuses to remove curriculum items in another school", async () => {
  const f = fixture();
  await expect(
    removeCurriculumTopic({ ...f.ctx, schoolId: "other-school" }, "topic")
  ).rejects.toMatchObject({ code: "not_found" });
  expect(f.tables.curriculum_topics[0].is_active).toBe(true);
});
it("shows database failures and leaves the item available", async () => {
  const f = fixture();
  f.failures.set("curriculum_topics", "Write unavailable");
  await expect(removeCurriculumTopic(f.ctx, "topic")).rejects.toThrow("Write unavailable");
  expect(f.tables.curriculum_topics[0].is_active).toBe(true);
});
