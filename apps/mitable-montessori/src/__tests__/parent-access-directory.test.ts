import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { reportMemoryDb } from "./helpers/report-memory-db";
import { listParentAccess } from "@/lib/parents/access-directory";

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  allowed: true,
  reset: vi.fn(),
  account: vi.fn(),
}));
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: () => mocks.db }));
vi.mock("@/lib/api/admin-auth", () => ({
  requireAdmin: async () =>
    mocks.allowed
      ? { ok: true, user: { schoolId: "school", userId: "admin", role: "admin" } }
      : { ok: false, response: NextResponse.json({ error: "Admin required" }, { status: 403 }) },
}));
vi.mock("@/lib/audit/log", () => ({ auditLog: vi.fn() }));
import { GET } from "@/app/api/admin/guardians/route";
import { POST as resetPassword } from "@/app/api/admin/guardians/[id]/reset-password/route";

const guardian = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  school_id: "school",
  first_name: "Parent",
  last_name: id,
  email: `${id}@example.com`,
  phone: null,
  auth_user_id: null,
  onboarding_completed_at: null,
  guardian_invitations: [],
  student_guardians: [],
  ...extra,
});
let memory: ReturnType<typeof reportMemoryDb>;
beforeEach(() => {
  memory = reportMemoryDb({ guardians: [] });
  mocks.db = Object.assign(memory.db, {
    auth: { admin: { getUserById: mocks.account }, resetPasswordForEmail: mocks.reset },
  });
  mocks.allowed = true;
  mocks.reset.mockReset().mockResolvedValue({ error: null });
  mocks.account
    .mockReset()
    .mockResolvedValue({ data: { user: { email: "linked@example.com" } }, error: null });
});
const reset = (id: string) =>
  resetPassword(new Request("http://localhost/api", { method: "POST" }), {
    params: Promise.resolve({ id }),
  });

describe("parent access directory", () => {
  it("shows every access state without exposing invitation tokens or account IDs", async () => {
    memory.tables.guardians.push(
      guardian("registered", { auth_user_id: "account", onboarding_completed_at: "2026-10-01" }),
      guardian("pending", { auth_user_id: "account2" }),
      guardian("invited", {
        guardian_invitations: [
          { expires_at: "2027-01-01", claimed_at: null, token_hash: "secret" },
        ],
      }),
      guardian("expired", {
        guardian_invitations: [{ expires_at: "2020-01-01", claimed_at: null }],
      }),
      guardian("new"),
      guardian("no-email", { email: null }),
      guardian("claimed-only", {
        guardian_invitations: [{ expires_at: "2027-01-01", claimed_at: "2026-01-01" }],
      })
    );
    const list = await listParentAccess(memory.db, "school", Date.parse("2026-10-29"));
    expect(Object.fromEntries(list.map((row) => [row.id, row.status]))).toEqual({
      registered: "registered",
      pending: "setup_pending",
      invited: "invited",
      expired: "expired",
      new: "not_invited",
      "no-email": "missing_email",
      "claimed-only": "not_invited",
    });
    expect(JSON.stringify(list)).not.toMatch(/token_hash|auth_user_id|secret/);
  });
  it("paginates beyond the server row limit and keeps other schools out", async () => {
    memory.tables.guardians = Array.from({ length: 1001 }, (_, index) =>
      guardian(String(index).padStart(4, "0"))
    );
    memory.tables.guardians.push(guardian("foreign", { school_id: "elsewhere" }));
    expect(await listParentAccess(memory.db, "school")).toHaveLength(1001);
    const response = await GET();
    expect((await response.json()).parents).toHaveLength(1001);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("keeps parents with no child link and excludes malformed cross-school child links", async () => {
    memory.tables.guardians.push(
      guardian("one", {
        student_guardians: [
          {
            students: { id: "child", school_id: "school", first_name: "Avery", last_name: "Stone" },
          },
          {
            students: {
              id: "foreign",
              school_id: "other",
              first_name: "Private",
              last_name: "Child",
            },
          },
        ],
      }),
      guardian("unlinked")
    );
    expect(await listParentAccess(memory.db, "school")).toMatchObject([
      { id: "one", children: [{ id: "child", name: "Avery Stone" }] },
      { id: "unlinked", children: [] },
    ]);
  });
  it("reports database failures instead of showing an empty directory", async () => {
    memory.failures.set("guardians", "unavailable");
    expect((await GET()).status).toBe(500);
  });
  it("rejects non-admin directory reads and reset requests", async () => {
    mocks.allowed = false;
    expect((await GET()).status).toBe(403);
    expect((await reset("linked")).status).toBe(403);
    expect(mocks.reset).not.toHaveBeenCalled();
  });
  it("sends a reset only for a linked account in the administrator's school", async () => {
    memory.tables.guardians.push(guardian("linked", { auth_user_id: "account" }));
    expect((await reset("linked")).status).toBe(200);
    expect(mocks.account).toHaveBeenCalledWith("account");
    expect(mocks.reset).toHaveBeenCalledWith("linked@example.com", {
      redirectTo: expect.stringContaining("audience%3Dparent"),
    });
  });
  it("does not send resets for foreign, unregistered or mismatched accounts", async () => {
    memory.tables.guardians.push(
      guardian("foreign", { school_id: "other", auth_user_id: "account" }),
      guardian("new"),
      guardian("mismatch", { auth_user_id: "account" })
    );
    expect((await reset("foreign")).status).toBe(404);
    expect((await reset("new")).status).toBe(409);
    expect((await reset("mismatch")).status).toBe(409);
    expect(mocks.reset).not.toHaveBeenCalled();
  });
  it("shows email provider failures instead of claiming a reset was sent", async () => {
    memory.tables.guardians.push(guardian("linked", { auth_user_id: "account" }));
    mocks.reset.mockResolvedValue({ error: { message: "Rate limit" } });
    expect((await reset("linked")).status).toBe(500);
  });
});
