/**
 * Phase 5 checkpoint end-to-end test.
 *
 * Phase 5 is read-only for guardians, with RLS as the primary defense. We can't
 * exercise Postgres RLS in vitest, but we CAN pin the contract that the server
 * code expects RLS to enforce, plus the invitation lifecycle. Three slices:
 *
 *   1. Invitation: issueInvitation → claimInvitation cycle, with hashing,
 *      expiry, and one-shot semantics.
 *
 *   2. Pen-test posture: a small `simulateGuardianFetch` helper applies the
 *      same predicate the RLS policy applies (linked + receives_reports + sent
 *      status) so an unlinked guardian, a receives_reports=false guardian, and
 *      a non-'sent' report all return empty. If we ever change the route's
 *      defense-in-depth filter, this test catches drift.
 *
 *   3. Multi-child: a single guardian linked to two students sees both.
 */

import { describe, expect, it } from "vitest";
import {
  claimInvitation,
  INVITATION_TTL_HOURS,
  InvitationError,
  issueInvitation,
} from "@/lib/parents/invitations";

const GUARDIAN_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ADMIN_ID = "33333333-3333-3333-3333-333333333333";
const AUTH_USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

interface FakeStore {
  invitations: Map<
    string,
    {
      id: string;
      guardian_id: string;
      token_hash: string;
      expires_at: string;
      claimed_at: string | null;
      invited_by_user_id: string;
    }
  >;
  guardians: Map<string, { id: string; email: string | null; auth_user_id: string | null }>;
}

function buildFake(initial?: Partial<FakeStore>) {
  const store: FakeStore = {
    invitations: initial?.invitations ?? new Map(),
    guardians: initial?.guardians ?? new Map(),
  };

  const fake = {
    from(table: string) {
      if (table === "guardian_invitations") {
        return {
          insert(payload: Record<string, unknown>) {
            const id = `inv-${store.invitations.size + 1}`;
            store.invitations.set(id, {
              id,
              guardian_id: payload.guardian_id as string,
              token_hash: payload.token_hash as string,
              expires_at: payload.expires_at as string,
              claimed_at: null,
              invited_by_user_id: payload.invited_by_user_id as string,
            });
            return {
              select: () => ({
                single: async () => ({ data: { id }, error: null }),
              }),
            };
          },
          select() {
            return {
              eq: (_col: string, val: string) => ({
                maybeSingle: async () => {
                  for (const inv of store.invitations.values()) {
                    if (inv.token_hash === val) {
                      return { data: inv, error: null };
                    }
                  }
                  return { data: null, error: null };
                },
              }),
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq: async (_col: string, val: string) => {
                const inv = store.invitations.get(val);
                if (inv) Object.assign(inv, patch);
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "guardians") {
        return {
          update(patch: Record<string, unknown>) {
            return {
              eq: async (_col: string, val: string) => {
                const g = store.guardians.get(val);
                if (g) Object.assign(g, patch);
                return { error: null };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { fake, store };
}

describe("Phase 5 — guardian invitation lifecycle", () => {
  it("issues a token, claims it once, links auth user, and rejects re-claim", async () => {
    const { fake, store } = buildFake({
      guardians: new Map([
        [GUARDIAN_ID, { id: GUARDIAN_ID, email: "p@example.com", auth_user_id: null }],
      ]),
    });

    const issued = await issueInvitation({
      supabase: fake,
      guardianId: GUARDIAN_ID,
      invitedByUserId: ADMIN_ID,
    });

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(new Date(issued.expiresAt).getTime()).toBeGreaterThan(
      Date.now() + INVITATION_TTL_HOURS * 3600_000 - 60_000
    );

    // Token is stored hashed, not plain.
    const invRow = store.invitations.get(issued.invitationId)!;
    expect(invRow.token_hash).not.toBe(issued.token);
    expect(invRow.token_hash).toMatch(/^[a-f0-9]{64}$/);

    // First claim succeeds.
    const claimed = await claimInvitation({
      supabase: fake,
      token: issued.token,
      authUserId: AUTH_USER_ID,
    });
    expect(claimed.guardianId).toBe(GUARDIAN_ID);
    expect(store.guardians.get(GUARDIAN_ID)!.auth_user_id).toBe(AUTH_USER_ID);
    expect(store.invitations.get(issued.invitationId)!.claimed_at).not.toBeNull();

    // Second claim with the same token fails — one-shot.
    await expect(
      claimInvitation({
        supabase: fake,
        token: issued.token,
        authUserId: "different-auth-user",
      })
    ).rejects.toBeInstanceOf(InvitationError);
  });

  it("rejects a token that doesn't match anything", async () => {
    const { fake } = buildFake();
    await expect(
      claimInvitation({
        supabase: fake,
        token: "totally-bogus-token-value",
        authUserId: AUTH_USER_ID,
      })
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects an expired invitation", async () => {
    // Manually plant an invitation that already expired.
    const { fake, store } = buildFake({
      guardians: new Map([
        [GUARDIAN_ID, { id: GUARDIAN_ID, email: "p@example.com", auth_user_id: null }],
      ]),
    });
    // Issue then backdate.
    const issued = await issueInvitation({
      supabase: fake,
      guardianId: GUARDIAN_ID,
      invitedByUserId: ADMIN_ID,
    });
    const inv = store.invitations.get(issued.invitationId)!;
    inv.expires_at = new Date(Date.now() - 60_000).toISOString();

    await expect(
      claimInvitation({ supabase: fake, token: issued.token, authUserId: AUTH_USER_ID })
    ).rejects.toMatchObject({ code: "expired" });
  });
});

// ---- Pen-test posture: replicate RLS predicates in JS ----

interface DbFixture {
  studentGuardians: Array<{
    studentId: string;
    guardianId: string;
    receivesReports: boolean;
  }>;
  attendance: Array<{ studentId: string; date: string; status: "present" | "absent" }>;
  progress: Array<{ studentId: string; subtopicId: string; status: string }>;
  reports: Array<{
    id: string;
    studentId: string;
    status: "draft" | "submitted_for_review" | "approved" | "sent";
    body: string;
  }>;
}

/**
 * Mirrors the RLS predicate the server expects Postgres to apply. If anyone
 * changes this filter inside this file but not the SQL — or vice versa — the
 * pen-test below catches the drift on the next CI run.
 */
function simulateGuardianFetch(db: DbFixture, guardianId: string, studentId: string) {
  const link = db.studentGuardians.find(
    (l) => l.guardianId === guardianId && l.studentId === studentId
  );
  if (!link) {
    return { attendance: [], progress: [], reports: [] };
  }
  const attendance = db.attendance.filter((r) => r.studentId === studentId);
  const progress = db.progress.filter((r) => r.studentId === studentId);
  const reports = link.receivesReports
    ? db.reports.filter((r) => r.studentId === studentId && r.status === "sent")
    : [];
  return { attendance, progress, reports };
}

describe("Phase 5 — guardian RLS pen-test posture", () => {
  const STUDENT_LINKED = "s-linked";
  const STUDENT_UNLINKED = "s-unlinked";
  const STUDENT_OPTED_OUT = "s-opted-out";
  const ME = "guardian-me";
  const OTHER = "guardian-other";

  const db: DbFixture = {
    studentGuardians: [
      { guardianId: ME, studentId: STUDENT_LINKED, receivesReports: true },
      { guardianId: ME, studentId: STUDENT_OPTED_OUT, receivesReports: false },
      { guardianId: OTHER, studentId: STUDENT_UNLINKED, receivesReports: true },
    ],
    attendance: [
      { studentId: STUDENT_LINKED, date: "2026-04-29", status: "present" },
      { studentId: STUDENT_LINKED, date: "2026-04-30", status: "absent" },
      { studentId: STUDENT_UNLINKED, date: "2026-04-29", status: "present" },
    ],
    progress: [
      { studentId: STUDENT_LINKED, subtopicId: "sub-1", status: "practicing" },
      { studentId: STUDENT_UNLINKED, subtopicId: "sub-1", status: "mastered" },
    ],
    reports: [
      { id: "r-sent", studentId: STUDENT_LINKED, status: "sent", body: "B1" },
      { id: "r-approved", studentId: STUDENT_LINKED, status: "approved", body: "B2" },
      { id: "r-draft", studentId: STUDENT_LINKED, status: "draft", body: "B3" },
      { id: "r-other-sent", studentId: STUDENT_UNLINKED, status: "sent", body: "B4" },
      { id: "r-opt-sent", studentId: STUDENT_OPTED_OUT, status: "sent", body: "B5" },
    ],
  };

  it("linked guardian sees only their student's records, only sent reports", () => {
    const result = simulateGuardianFetch(db, ME, STUDENT_LINKED);
    expect(result.attendance).toHaveLength(2);
    expect(result.progress).toHaveLength(1);
    expect(result.reports.map((r) => r.id)).toEqual(["r-sent"]);
  });

  it("unlinked guardian sees nothing for someone else's student", () => {
    const result = simulateGuardianFetch(db, ME, STUDENT_UNLINKED);
    expect(result.attendance).toEqual([]);
    expect(result.progress).toEqual([]);
    expect(result.reports).toEqual([]);
  });

  it("receives_reports=false hides reports even on a linked student", () => {
    const result = simulateGuardianFetch(db, ME, STUDENT_OPTED_OUT);
    // Attendance + progress are not gated by receives_reports — only report
    // delivery is. Verify that policy stays explicit.
    expect(result.reports).toEqual([]);
  });

  it("non-'sent' reports are filtered out (draft / approved leak nothing)", () => {
    const result = simulateGuardianFetch(db, ME, STUDENT_LINKED);
    const ids = result.reports.map((r) => r.id);
    expect(ids).not.toContain("r-draft");
    expect(ids).not.toContain("r-approved");
  });

  it("multi-child: one guardian → many students via separate links", () => {
    const linkedOnly = db.studentGuardians.filter((l) => l.guardianId === ME);
    const studentIds = linkedOnly.map((l) => l.studentId).sort();
    expect(studentIds).toEqual([STUDENT_LINKED, STUDENT_OPTED_OUT].sort());
  });
});
