import { beforeEach, expect, it, vi } from "vitest";
import { teacherShouldSeeProgress } from "@/lib/app/active-classroom";
import { getClassroomProgress } from "@/lib/queries/classroom-progress";

const mocks = vi.hoisted(() => ({ curriculum: "curriculum", assigned: true }));
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
        curriculum_subjects: [
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
