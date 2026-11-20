import { beforeEach, expect, it, vi } from "vitest";
import { reportMemoryDb } from "./helpers/report-memory-db";
const mocks = vi.hoisted(() => ({ db: null as unknown, allowed: true }));
vi.mock("@/lib/api/admin-auth", () => ({
  requireAdmin: async () =>
    mocks.allowed
      ? { ok: true, user: { schoolId: "school", userId: "admin", role: "admin" } }
      : { ok: false, response: Response.json({ error: "Admin role required" }, { status: 403 }) },
}));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => mocks.db }));
vi.mock("@/lib/audit/log", () => ({ auditLog: vi.fn() }));
import { GET, PUT } from "@/app/api/admin/grading-scale/route";
let f: ReturnType<typeof reportMemoryDb>;
beforeEach(() => {
  mocks.allowed = true;
  f = reportMemoryDb({
    elementary_grading_scales: [{ school_id: "other-school", a_min: 90, b_min: 70, c_min: 50 }],
  });
  mocks.db = f.db;
});
const req = (body: unknown) =>
  new Request("http://localhost/api/admin/grading-scale", {
    method: "PUT",
    body: JSON.stringify(body),
  });
it("saves only the authenticated admin's school scale and returns it on reload", async () => {
  expect(await (await GET()).json()).toEqual({ scale: null });
  expect((await PUT(req({ schoolId: "other-school", aMin: 80, bMin: 65, cMin: 40 }))).status).toBe(
    200
  );
  expect(await (await GET()).json()).toEqual({ scale: { aMin: 80, bMin: 65, cMin: 40 } });
  expect(f.tables.elementary_grading_scales[0].a_min).toBe(90);
});
it("rejects invalid scales without overwriting settings", async () => {
  expect((await PUT(req({ aMin: 40, bMin: 60, cMin: 20 }))).status).toBe(400);
  expect(f.tables.elementary_grading_scales).toHaveLength(1);
});
it("denies non-admin access to scale settings", async () => {
  mocks.allowed = false;
  expect((await GET()).status).toBe(403);
  expect((await PUT(req({ aMin: 80, bMin: 65, cMin: 40 }))).status).toBe(403);
});
