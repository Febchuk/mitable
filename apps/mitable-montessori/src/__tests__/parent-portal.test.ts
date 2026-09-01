import { describe, expect, it, vi } from "vitest";
import { loadParentPortalContext } from "@/lib/parents/portal";
import { createClient } from "@/utils/supabase/server";

describe("parent portal children", () => {
  it("loads every active child linked to the guardian", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "guardian-1",
        first_name: "Jordan",
        onboarding_completed_at: "2026-08-01T12:00:00Z",
      },
    });
    const guardianEq = vi.fn().mockReturnValue({ maybeSingle });
    const guardianSelect = vi.fn().mockReturnValue({ eq: guardianEq });

    const linksEq = vi.fn().mockResolvedValue({
      data: [
        {
          receives_reports: true,
          students: {
            id: "student-1",
            first_name: "Avery",
            last_name: "Stone",
            preferred_name: null,
            archived_at: null,
          },
        },
        {
          receives_reports: false,
          students: {
            id: "student-2",
            first_name: "Benjamin",
            last_name: "Stone",
            preferred_name: "Ben",
            archived_at: null,
          },
        },
      ],
    });
    const linksSelect = vi.fn().mockReturnValue({ eq: linksEq });

    const from = vi.fn((table: string) => {
      if (table === "guardians") return { select: guardianSelect };
      if (table === "student_guardians") return { select: linksSelect };
      throw new Error(`Unexpected table: ${table}`);
    });
    const supabase = { from } as unknown as ReturnType<typeof createClient>;

    const portal = await loadParentPortalContext(supabase, "auth-user-1", "jordan@example.com");

    expect(from).toHaveBeenNthCalledWith(1, "guardians");
    expect(from).toHaveBeenNthCalledWith(2, "student_guardians");
    expect(linksEq).toHaveBeenCalledWith("guardian_id", "guardian-1");
    expect(portal?.children).toEqual([
      { id: "student-1", name: "Avery Stone", receivesReports: true },
      { id: "student-2", name: "Ben", receivesReports: false },
    ]);
  });
});
