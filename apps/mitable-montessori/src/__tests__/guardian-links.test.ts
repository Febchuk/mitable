import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createGuardian, linkGuardianToStudent } from "@/lib/admin/crud";

const context = (supabase: SupabaseClient) => ({
  supabase,
  schoolId: "school-1",
  actorUserId: "admin-1",
});

describe("guardian identity and links", () => {
  it("reuses an existing same-email guardian so siblings share one parent", async () => {
    const ilike = vi.fn().mockResolvedValue({
      data: [
        {
          id: "guardian-existing",
          email: "Parent@Example.com",
          auth_user_id: "auth-parent",
        },
      ],
      error: null,
    });
    const schoolEq = vi.fn().mockReturnValue({ ilike });
    const select = vi.fn().mockReturnValue({ eq: schoolEq });
    const insert = vi.fn();
    const supabase = {
      from: vi.fn().mockReturnValue({ select, insert }),
    } as unknown as SupabaseClient;

    const id = await createGuardian(context(supabase), {
      first_name: "Parent",
      last_name: "Name",
      email: " parent@example.com ",
    });

    expect(id).toBe("guardian-existing");
    expect(ilike).toHaveBeenCalledWith("email", "parent@example.com");
    expect(insert).not.toHaveBeenCalled();
  });

  it("connects an unclaimed guardian to an existing school login with the same email", async () => {
    const guardianLookup = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          ilike: vi.fn().mockResolvedValue({
            data: [
              {
                id: "guardian-existing",
                email: "parent@example.com",
                auth_user_id: null,
              },
            ],
            error: null,
          }),
        }),
      }),
    };
    const staffLookup = {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          ilike: vi.fn().mockResolvedValue({
            data: [{ id: "auth-parent", email: "Parent@Example.com" }],
            error: null,
          }),
        }),
      }),
    };
    const finalEq = vi.fn().mockResolvedValue({ error: null });
    const firstEq = vi.fn().mockReturnValue({ eq: finalEq });
    const update = vi.fn().mockReturnValue({ eq: firstEq });
    let guardianCalls = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "users") return staffLookup;
        guardianCalls++;
        return guardianCalls === 1 ? guardianLookup : { update };
      }),
    } as unknown as SupabaseClient;

    const id = await createGuardian(context(supabase), {
      email: " parent@example.com ",
    });

    expect(id).toBe("guardian-existing");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ auth_user_id: "auth-parent" }));
    expect(firstEq).toHaveBeenCalledWith("id", "guardian-existing");
    expect(finalEq).toHaveBeenCalledWith("school_id", "school-1");
  });

  it("does not create a duplicate link for the same parent and child", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "link-existing" },
      error: null,
    });
    const guardianEq = vi.fn().mockReturnValue({ maybeSingle });
    const studentEq = vi.fn().mockReturnValue({ eq: guardianEq });
    const select = vi.fn().mockReturnValue({ eq: studentEq });
    const insert = vi.fn();
    const supabase = {
      from: vi.fn().mockReturnValue({ select, insert }),
    } as unknown as SupabaseClient;

    const id = await linkGuardianToStudent(context(supabase), {
      student_id: "student-1",
      guardian_id: "guardian-1",
    });

    expect(id).toBe("link-existing");
    expect(insert).not.toHaveBeenCalled();
  });
});
