import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/attendance/parent-notifications", () => ({ dispatchAttendancePlan: mocks.send }));
import { POST } from "./route";
beforeEach(() => vi.clearAllMocks());
it("still requires sign-in", async () => {
  mocks.auth.mockResolvedValue({
    ok: false,
    response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }),
  });
  expect((await POST()).status).toBe(401);
});
it.each(["teacher", "admin"])(
  "blocks attendance email requests from an old %s tab without invoking delivery",
  async (role) => {
    mocks.auth.mockResolvedValue({ ok: true, user: { role, userId: "qa", schoolId: "school" } });
    const response = await POST();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("Attendance emails are disabled"),
    });
    expect(mocks.send).not.toHaveBeenCalled();
  }
);
