import { describe, expect, it } from "vitest";
import {
  endStudentEnrollment,
  enrollStudentInClassroom,
  type AdminContext,
} from "@/lib/admin/crud";

const STUDENT_ID = "00000000-0000-4000-8000-000000000001";
const CLASSROOM_ID = "00000000-0000-4000-8000-000000000002";
const SCHOOL_ID = "00000000-0000-4000-8000-000000000003";

function schoolRecord(id: string) {
  const query = {
    eq: () => query,
    maybeSingle: async () => ({ data: { id }, error: null }),
  };
  return {
    select: () => query,
  };
}

describe("classroom enrollments", () => {
  it("moves a child instead of creating a second active classroom enrollment", async () => {
    const ended: Array<Record<string, unknown>> = [];
    const inserted: Array<Record<string, unknown>> = [];
    const supabase = {
      from(table: string) {
        if (table === "students") return schoolRecord(STUDENT_ID);
        if (table === "classrooms") return schoolRecord(CLASSROOM_ID);
        if (table === "student_classroom_enrollments") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                }),
              }),
            }),
            update(values: Record<string, unknown>) {
              ended.push(values);
              return { eq: () => ({ is: async () => ({ error: null }) }) };
            },
            insert(values: Record<string, unknown>) {
              inserted.push(values);
              return {
                select: () => ({
                  single: async () => ({ data: { id: "enrollment-2" }, error: null }),
                }),
              };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    } as unknown as AdminContext["supabase"];

    await expect(
      enrollStudentInClassroom(
        { supabase, schoolId: SCHOOL_ID, actorUserId: "admin-1" },
        { student_id: STUDENT_ID, classroom_id: CLASSROOM_ID, start_date: "2026-09-14" }
      )
    ).resolves.toBe("enrollment-2");

    expect(ended).toEqual([{ end_date: "2026-09-14" }]);
    expect(inserted).toEqual([
      {
        student_id: STUDENT_ID,
        classroom_id: CLASSROOM_ID,
        start_date: "2026-09-14",
        end_date: null,
        is_primary: true,
      },
    ]);
  });

  it("ends only the selected classroom enrollment without archiving the child", async () => {
    const ended: Array<Record<string, unknown>> = [];
    const supabase = {
      from(table: string) {
        if (table === "students") return schoolRecord(STUDENT_ID);
        if (table === "classrooms") return schoolRecord(CLASSROOM_ID);
        if (table === "student_classroom_enrollments") {
          return {
            update(values: Record<string, unknown>) {
              ended.push(values);
              return {
                eq: () => ({
                  eq: () => ({
                    is: () => ({
                      select: async () => ({ data: [{ id: "enrollment-1" }], error: null }),
                    }),
                  }),
                }),
              };
            },
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    } as unknown as AdminContext["supabase"];

    await expect(
      endStudentEnrollment(
        { supabase, schoolId: SCHOOL_ID, actorUserId: "admin-1" },
        { student_id: STUDENT_ID, classroom_id: CLASSROOM_ID, end_date: "2026-09-14" }
      )
    ).resolves.toBe("enrollment-1");

    expect(ended).toEqual([{ end_date: "2026-09-14" }]);
  });
});
