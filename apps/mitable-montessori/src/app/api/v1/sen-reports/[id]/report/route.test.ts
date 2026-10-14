import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  allowed: vi.fn(),
  scoped: vi.fn(),
  admin: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({
  requireUser: mocks.auth,
  requireTeacherForClassroom: mocks.allowed,
}));
vi.mock("@/utils/supabase/server", () => ({ createClient: () => ({ from: mocks.scoped }) }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.admin }) }));
vi.mock("@/lib/audit/log", () => ({ auditLog: mocks.audit }));
import { POST } from "./route";
function query(data: unknown) {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "in", "order", "insert", "update"])
    q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => ({ data, error: null }));
  q.single = q.maybeSingle;
  q.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return q;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    ok: true,
    user: { userId: "teacher", schoolId: "school", role: "teacher" },
  });
  mocks.allowed.mockResolvedValue(true);
  mocks.scoped.mockImplementation((table) =>
    query(
      table === "sen_daily_reports"
        ? {
            id: "s1",
            student_id: "child",
            school_id: "school",
            sen_report_group_id: "team",
            report_date: "2026-10-14",
            remarks: "Teacher remarks",
            sen_daily_report_scores: [{ metric_id: "m1", score: 3 }],
          }
        : table === "sen_report_groups"
          ? { classroom_id: "class", template_id: "template", name: "Red" }
          : [
              {
                id: "m1",
                label: "Skill",
                section: "skill",
                score_labels: ["1", "2", "3", "4", "5"],
              },
            ]
    )
  );
});
const run = () =>
  POST(new Request("http://localhost/api", { method: "POST" }), {
    params: Promise.resolve({ id: "s1" }),
  });
it("denies preparation without classroom access", async () => {
  mocks.allowed.mockResolvedValue(false);
  expect((await run()).status).toBe(403);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("returns 404 for a source outside the visible school scope", async () => {
  mocks.scoped.mockReturnValue(query(null));
  expect((await run()).status).toBe(404);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it("reopens a sent snapshot without updating or inserting", async () => {
  const existing = query({ id: "r1", status: "sent", created_by_user_id: "teacher" });
  mocks.admin.mockReturnValue(existing);
  expect(await (await run()).json()).toEqual({ reportId: "r1" });
  expect(existing.update).not.toHaveBeenCalled();
  expect(existing.insert).not.toHaveBeenCalled();
});
it("creates a separate SEN report linked to the saved assessment", async () => {
  const inserted = query({ id: "r2" });
  mocks.admin.mockReturnValueOnce(query(null)).mockReturnValueOnce(inserted);
  expect(await (await run()).json()).toEqual({ reportId: "r2" });
  expect(inserted.insert).toHaveBeenCalledWith(
    expect.objectContaining({ sen_daily_report_id: "s1", report_type: "sen", student_id: "child" })
  );
});
