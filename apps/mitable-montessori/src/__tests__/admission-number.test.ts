import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStudent } from "@/lib/admin/crud";
import { CreateStudentSchema, PatchStudentSchema } from "@/lib/schemas/admin";

describe("student admission numbers", () => {
  it("accepts admission numbers when creating or editing a student", () => {
    expect(
      CreateStudentSchema.parse({
        first_name: "Avery",
        last_name: "Stone",
        admission_number: "TLP-2048",
      }).admission_number
    ).toBe("TLP-2048");

    expect(PatchStudentSchema.parse({ admission_number: null })).toEqual({
      admission_number: null,
    });
  });

  it("stores a trimmed admission number on the student record", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "student-1" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const supabase = { from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient;

    const id = await createStudent(
      { supabase, schoolId: "school-1", actorUserId: "admin-1" },
      {
        first_name: "Avery",
        last_name: "Stone",
        admission_number: "  TLP-2048  ",
      }
    );

    expect(id).toBe("student-1");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admission_number: "TLP-2048",
        school_id: "school-1",
      })
    );
  });
});
