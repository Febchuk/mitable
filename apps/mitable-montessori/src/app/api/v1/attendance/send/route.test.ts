import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), plan: vi.fn(), send: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser: mocks.auth }));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/audit/log", () => ({ auditLog: mocks.audit }));
vi.mock("@/lib/attendance/parent-notifications", async (original) => ({
  ...(await original<object>()),
  loadAttendanceSendPlan: mocks.plan,
  dispatchAttendancePlan: mocks.send,
}));
import { POST } from "./route";
const confirmation = "a".repeat(64);
const run = (body = {}) =>
  POST(
    new Request("http://localhost/api/v1/attendance/send", {
      method: "POST",
      body: JSON.stringify({
        date: "2026-10-27",
        classroomIds: ["11111111-1111-4111-8111-111111111111"],
        ...body,
      }),
    })
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "test-key");
  mocks.auth.mockResolvedValue({
    ok: true,
    user: { userId: "teacher", schoolId: "school", role: "teacher" },
  });
  mocks.plan.mockResolvedValue({
    confirmation,
    present: 2,
    absent: 1,
    unmarked: 1,
    withoutEmail: 1,
    deliveries: [{}, {}],
  });
  mocks.send.mockResolvedValue({ sent: 1, alreadySent: 0, failed: 1, pending: 0, needsReview: 0 });
});
it("requires sign-in", async () => {
  mocks.auth.mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
  });
  expect((await run()).status).toBe(401);
  expect(mocks.plan).not.toHaveBeenCalled();
});
it("rejects malformed and impossible dates", async () => {
  expect((await run({ date: "2026-02-30" })).status).toBe(400);
  expect(mocks.plan).not.toHaveBeenCalled();
});
it("previews saved attendance and never sends without confirmation", async () => {
  expect(await (await run()).json()).toMatchObject({
    confirmation,
    present: 2,
    absent: 1,
    unmarked: 1,
    emails: 2,
  });
  expect(mocks.send).not.toHaveBeenCalled();
});
it("requires a new review when the source changed", async () => {
  expect((await run({ confirmation: "b".repeat(64) })).status).toBe(409);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("returns truthful partial results", async () => {
  expect(await (await run({ confirmation })).json()).toMatchObject({ sent: 1, failed: 1 });
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "attendance.send" }));
});
it("does not claim to send if email is unconfigured", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  expect((await run({ confirmation })).status).toBe(503);
  expect(mocks.send).not.toHaveBeenCalled();
});
