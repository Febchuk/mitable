import { beforeEach, expect, it, vi } from "vitest";
import { teacherShouldSeeProgress } from "@/lib/app/active-classroom";
import { getClassroomProgress } from "@/lib/queries/classroom-progress";

const mocks = vi.hoisted(() => ({
  curriculum: "curriculum",
  assigned: true,
  fullCurriculum: false,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({}),
  headers: async () => new Headers({ "x-mitable-auth-user-id": "teacher" }),
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: () => ({
    from: (table: string) => {
      const data: Record<string, unknown> = {
        classroom_teacher_assignments: mocks.assigned
          ? [
              {
                classroom_role: "lead",
                start_date: "2026-10-01",
                classrooms: { id: "toddler", name: "Toddler's House", code: "Toddler" },
              },
            ]
          : [],
        classrooms: { curriculum_id: mocks.curriculum, program_types: ["montessori"] },
        curricula: { name: "Toddler curriculum" },
        students: [
          {
            id: "child",
            first_name: "Ada",
            last_name: "Stone",
            preferred_name: null,
            student_classroom_enrollments: [{ classroom_id: "toddler", end_date: null }],
          },
        ],
        curriculum_subjects: mocks.fullCurriculum
          ? [
              {
                id: "subject",
                name: "Full Toddler curriculum",
                sort_order: 0,
                curriculum_topics: Array.from({ length: 8 }, (_, index) => ({
                  id: `topic-${index}`,
                  name: `Topic ${index + 1}`,
                  sort_order: index,
                  marking_schema: "ipm",
                  curriculum_subtopics: Array.from(
                    { length: index === 0 ? 8 : 7 },
                    (_, lesson) => ({
                      id: `lesson-${index}-${lesson}`,
                      name: `Lesson ${index + 1}.${lesson + 1}`,
                      sort_order: lesson,
                    })
                  ),
                })),
              },
            ]
          : [
              {
                id: "subject",
                name: "Practical Life",
                sort_order: 0,
                curriculum_topics: [
                  {
                    id: "topic",
                    name: "Fine motor",
                    sort_order: 0,
                    marking_schema: "ipm",
                    curriculum_subtopics: [{ id: "material", name: "Stringing", sort_order: 0 }],
                  },
                ],
              },
            ],
        student_progress: [
          { student_id: "child", curriculum_subtopic_id: "material", status: "practicing" },
        ],
      };
      const result = () => ({ data: data[table] ?? [], error: null });
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        order: () => q,
        in: () => q,
        limit: () => q,
        returns: async () => result(),
        maybeSingle: async () => result(),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return q;
    },
  }),
}));
beforeEach(() => {
  mocks.curriculum = "curriculum";
  mocks.assigned = true;
  mocks.fullCurriculum = false;
});
it("loads every assigned lesson for the classroom grid even without saved marks", async () => {
  mocks.fullCurriculum = true;
  const progress = await getClassroomProgress("toddler");
  expect(progress?.topics).toHaveLength(8);
  expect(progress?.subtopics).toHaveLength(57);
  expect(progress?.subtopics).toContainEqual(
    expect.objectContaining({ id: "lesson-7-6", topicId: "topic-7" })
  );
});

it("shows Progress and loads the Toddler curriculum, roster and saved marks", async () => {
  expect(await teacherShouldSeeProgress()).toBe(true);
  const progress = await getClassroomProgress("toddler");
  expect(progress).toMatchObject({
    classroomId: "toddler",
    curriculumAssigned: true,
    subtopics: [{ id: "material", name: "Stringing" }],
    students: [{ id: "child" }],
    progress: { child: { material: "practicing" } },
  });
});
it("shows the normal assign-a-curriculum state if a Toddler room has no curriculum", async () => {
  mocks.curriculum = "";
  expect(await getClassroomProgress("toddler")).toMatchObject({
    curriculumAssigned: false,
    students: [{ id: "child" }],
  });
});
it("still requires an active classroom assignment", async () => {
  mocks.assigned = false;
  expect(await teacherShouldSeeProgress()).toBe(false);
  expect(await getClassroomProgress()).toBeNull();
});
