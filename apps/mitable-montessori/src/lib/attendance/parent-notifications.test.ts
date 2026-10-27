import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/email/attendance", async (original) => ({
  ...(await original<object>()),
  sendAttendanceEmail: mocks.send,
}));
import { loadAttendanceSendPlan, dispatchAttendancePlan } from "./parent-notifications";

type Row = Record<string, unknown>;
// Stateful boundary exercises real plan/dispatch code, including conditional claims.
function fixture() {
  const child = (id: string) => ({
    id,
    school_id: "school",
    first_name: id,
    last_name: "Child",
    archived_at: null,
  });
  const mark = (id: string, status: string) => ({
    id: `mark-${id}`,
    student_id: id,
    classroom_id: "room",
    attendance_date: "2026-10-27",
    status,
    comment: null,
    arrival_time: null,
    departure_time: null,
    half_day: false,
    updated_at: "2026-10-27T09:00:00Z",
    source_command_id: `cmd-${id}`,
  });
  const tables: Record<string, Row[]> = {
    classrooms: [{ id: "room", name: "Toddler's House", school_id: "school" }],
    classroom_teacher_assignments: [
      { teacher_user_id: "teacher", classroom_id: "room", end_date: null },
    ],
    schools: [{ id: "school", name: "The Learning Place" }],
    student_classroom_enrollments: ["present", "absent", "unmarked"].map((id) => ({
      student_id: id,
      classroom_id: "room",
      end_date: null,
      students: child(id),
    })),
    attendance_records: [mark("present", "present"), mark("absent", "absent")],
    student_guardians: [
      {
        student_id: "present",
        receives_reports: true,
        guardians: { school_id: "school", email: " Parent@EXAMPLE.test " },
      },
      {
        student_id: "present",
        receives_reports: true,
        guardians: { school_id: "school", email: "parent@example.test" },
      },
      {
        student_id: "present",
        receives_reports: false,
        guardians: { school_id: "school", email: "opted-out@example.test" },
      },
      {
        student_id: "present",
        receives_reports: true,
        guardians: { school_id: "other-school", email: "foreign@example.test" },
      },
      {
        student_id: "unmarked",
        receives_reports: true,
        guardians: { school_id: "school", email: "unmarked@example.test" },
      },
    ],
    attendance_parent_deliveries: [],
  };
  const failures = new Set<string>();
  const db = {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let maximum = Infinity;
      let order: { key: string; ascending: boolean } | null = null;
      let operation = "select",
        patch: Row = {};
      const value = (r: Row, key: string) =>
        key.split(".").reduce<unknown>((current, part) => (current as Row | null)?.[part], r);
      const execute = () => {
        if (failures.has(table)) return { data: null, error: { message: "read failed" } };
        const rows = (tables[table] ??= []);
        if (
          operation === "upsert" &&
          !rows.some((r) =>
            [
              "school_id",
              "classroom_id",
              "student_id",
              "attendance_date",
              "recipient_email",
              "snapshot_hash",
            ].every((k) => r[k] === patch[k])
          )
        )
          rows.push({
            id: crypto.randomUUID(),
            status: "pending",
            attempts: 0,
            first_attempt_at: null,
            claimed_at: null,
            created_at: new Date(Date.now() + rows.length).toISOString(),
            ...patch,
          });
        let matching = rows.filter((r) => filters.every((f) => f(r)));
        if (order) {
          const { key, ascending } = order;
          matching = [...matching].sort(
            (a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1)
          );
        }
        matching = matching.slice(0, maximum);
        if (operation === "update") matching.forEach((r) => Object.assign(r, patch));
        return { data: structuredClone(matching), error: null };
      };
      const q = {
        select: () => q,
        order: (key: string, options: { ascending: boolean }) => {
          order = { key, ascending: options.ascending };
          return q;
        },
        limit: (n: number) => {
          maximum = n;
          return q;
        },
        eq: (key: string, expected: unknown) => {
          filters.push((r) => value(r, key) === expected);
          return q;
        },
        is: (key: string, expected: unknown) => {
          filters.push((r) => (value(r, key) ?? null) === expected);
          return q;
        },
        in: (key: string, expected: unknown[]) => {
          filters.push((r) => expected.includes(value(r, key)));
          return q;
        },
        upsert: (r: Row) => {
          operation = "upsert";
          patch = r;
          return q;
        },
        update: (r: Row) => {
          operation = "update";
          patch = r;
          return q;
        },
        single: async () => {
          const result = execute();
          return { ...result, data: result.data?.[0] ?? null };
        },
        maybeSingle: async () => q.single(),
        then: (resolve: (r: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, tables, failures };
}
const teacher = {
  userId: "teacher",
  schoolId: "school",
  role: "teacher" as const,
  email: "teacher@example.test",
};
const plan = (db: SupabaseClient) =>
  loadAttendanceSendPlan(db, teacher, "2026-10-27", ["room"], "https://school.example");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue("provider-1");
});

describe("attendance parent delivery", () => {
  it("uses only saved marked roster entries and eligible school guardians, deduplicating addresses", async () => {
    const f = fixture();
    const result = await plan(f.db);
    expect(result).toMatchObject({ present: 1, absent: 1, unmarked: 1, withoutEmail: 1 });
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0].recipient_email).toBe("parent@example.test");
    expect(result.deliveries[0].payload.text).toContain("marked present");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("denies foreign classrooms and unassigned teachers before reading attendance", async () => {
    const f = fixture();
    f.tables.classrooms[0].school_id = "other-school";
    await expect(plan(f.db)).rejects.toMatchObject({ status: 403 });
    f.tables.classrooms[0].school_id = "school";
    f.tables.classroom_teacher_assignments = [];
    await expect(plan(f.db)).rejects.toMatchObject({ status: 403 });
  });
  it("fails closed if a recipient lookup fails", async () => {
    const f = fixture();
    f.failures.add("student_guardians");
    await expect(plan(f.db)).rejects.toThrow("Could not load parent recipients");
  });
  it("changes confirmation when a saved mark or recipient changes", async () => {
    const f = fixture();
    const initial = await plan(f.db);
    f.tables.attendance_records[0].status = "absent";
    expect((await plan(f.db)).confirmation).not.toBe(initial.confirmation);
  });
  it("persists acceptance and does not send again on repeated confirmation", async () => {
    const f = fixture();
    const p = await plan(f.db);
    expect(await dispatchAttendancePlan(f.db, p)).toMatchObject({ sent: 1, failed: 0 });
    expect(await dispatchAttendancePlan(f.db, p)).toMatchObject({ sent: 0, alreadySent: 1 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(f.tables.attendance_parent_deliveries[0]).toMatchObject({
      status: "sent",
      provider_id: "provider-1",
    });
  });
  it("skips a no-op resave but sends real changes and a correction back", async () => {
    const f = fixture();
    await dispatchAttendancePlan(f.db, await plan(f.db));
    Object.assign(f.tables.attendance_records[0], {
      updated_at: "2026-10-27T10:00:00Z",
      source_command_id: "new-noop-command",
    });
    expect(await dispatchAttendancePlan(f.db, await plan(f.db))).toMatchObject({
      alreadySent: 1,
      sent: 0,
    });
    f.tables.attendance_records[0].status = "absent";
    expect(await dispatchAttendancePlan(f.db, await plan(f.db))).toMatchObject({ sent: 1 });
    f.tables.attendance_records[0].status = "present";
    expect(await dispatchAttendancePlan(f.db, await plan(f.db))).toMatchObject({ sent: 1 });
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(new Set(mocks.send.mock.calls.map((call) => call[1])).size).toBe(3);
  });
  it("reuses the pending provider key after a no-op resave", async () => {
    const f = fixture();
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    await dispatchAttendancePlan(f.db, await plan(f.db));
    Object.assign(f.tables.attendance_records[0], {
      updated_at: "2026-10-27T10:00:00Z",
      source_command_id: "new-noop-command",
    });
    expect(await dispatchAttendancePlan(f.db, await plan(f.db))).toMatchObject({ sent: 1 });
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
  });
  it("retries a failed send with the same delivery id and stored payload", async () => {
    const f = fixture();
    const p = await plan(f.db);
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    expect(await dispatchAttendancePlan(f.db, p)).toMatchObject({ sent: 0, failed: 1 });
    expect(await dispatchAttendancePlan(f.db, p)).toMatchObject({ sent: 1, failed: 0 });
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
  });
  it("allows only one send when requests race", async () => {
    const f = fixture();
    const p = await plan(f.db);
    const results = await Promise.all([
      dispatchAttendancePlan(f.db, p),
      dispatchAttendancePlan(f.db, p),
    ]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(results.reduce((n, r) => n + r.sent, 0)).toBe(1);
  });
  it("requires checking older uncertain attempts rather than resending beyond the provider window", async () => {
    const f = fixture();
    const p = await plan(f.db);
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    await dispatchAttendancePlan(f.db, p);
    f.tables.attendance_parent_deliveries[0].first_attempt_at = new Date(
      Date.now() - 25 * 60 * 60 * 1000
    ).toISOString();
    expect(await dispatchAttendancePlan(f.db, p)).toMatchObject({ needsReview: 1, sent: 0 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
