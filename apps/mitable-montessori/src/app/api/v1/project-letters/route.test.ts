import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  db: vi.fn(),
  classes: vi.fn(),
  resolve: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/api/auth", () => ({ requireUser: mocks.auth }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.db }) }));
vi.mock("@/lib/app/active-classroom", () => ({
  listTeacherClassroomsForCurrentUser: mocks.classes,
}));
vi.mock("@/lib/reports/create-report-sections", () => ({
  resolveStudentClassroomId: mocks.resolve,
}));
vi.mock("@/lib/audit/log", () => ({ auditLog: mocks.audit }));
import { POST } from "./route";
function q(data: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "insert"]) chain[method] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data, error: null }));
  chain.single = chain.maybeSingle;
  return chain;
}
const request = () =>
  new Request("http://localhost/api/v1/project-letters", {
    method: "POST",
    body: JSON.stringify({ childId: "11111111-1111-4111-8111-111111111111" }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    ok: true,
    user: { userId: "teacher", schoolId: "school", role: "teacher" },
  });
  mocks.classes.mockResolvedValue([{ id: "class", name: "Red" }]);
  mocks.resolve.mockResolvedValue("class");
  mocks.db.mockReturnValue(
    q({
      id: "11111111-1111-4111-8111-111111111111",
      first_name: "Ada",
      school_id: "school",
      archived_at: null,
    })
  );
});
it("refuses children outside the teacher's assigned class", async () => {
  mocks.resolve.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(403);
  expect(mocks.db).toHaveBeenCalledTimes(1);
});
it("creates a project report separate from daily progress", async () => {
  const inserted = q({ id: "report" });
  mocks.db
    .mockReturnValueOnce(
      q({
        id: "11111111-1111-4111-8111-111111111111",
        first_name: "Ada",
        school_id: "school",
        archived_at: null,
      })
    )
    .mockReturnValueOnce(inserted);
  expect(await (await POST(request())).json()).toEqual({ reportId: "report" });
  expect(inserted.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      report_type: "project",
      status: "draft",
      student_id: "11111111-1111-4111-8111-111111111111",
    })
  );
});
