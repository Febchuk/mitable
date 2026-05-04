/**
 * Phase 4 checkpoint end-to-end test.
 *
 * The admin layer is server-only (route handlers + agent loop + Supabase). We
 * test what matters most: the agent loop's tokenization contract, the
 * destructive-confirmation gate, the CSV import planner, the report queue +
 * email worker, and the extraction-to-form path. Real Anthropic + Supabase
 * boundaries are stubbed via narrow fakes that implement only the surface
 * each module touches.
 */

import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runAdminAgent } from "@/lib/admin/agent-loop";
import { AdminTokenizer } from "@/lib/admin/tokenizer";
import { parseCsv, planRosterImport } from "@/lib/admin/csv";
import { drainPendingReports, StubEmailSender } from "@/lib/admin/email-worker";
import { extractEntityFields } from "@/lib/admin/extraction";

const SCHOOL_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_ID = "33333333-3333-3333-3333-333333333333";
const STUDENT_ID = "66666666-6666-6666-6666-666666666666";
const CLASSROOM_ID = "22222222-2222-2222-2222-222222222222";
const SUBTOPIC_ID = "88888888-8888-8888-8888-888888888888";
const CURRICULUM_ID = "44444444-4444-4444-4444-444444444444";
const TOPIC_ID = "55555555-5555-5555-5555-555555555555";

interface StubTurn {
  toolUses: Array<{
    name: string;
    id: string;
    input: Record<string, unknown>;
  }>;
  text?: string;
}

function buildStubAnthropic(turns: StubTurn[]) {
  let i = 0;
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    calls,
    sdk: {
      messages: {
        async create(args: Anthropic.MessageCreateParamsNonStreaming) {
          calls.push(args);
          const turn = turns[i++];
          if (!turn) throw new Error(`Stub ran out of turns at index ${i}`);
          const content: Anthropic.ContentBlock[] = turn.toolUses.map(
            (t) =>
              ({
                type: "tool_use",
                id: t.id,
                name: t.name,
                input: t.input,
              }) as unknown as Anthropic.ToolUseBlock
          );
          if (turn.text) {
            content.push({ type: "text", text: turn.text } as Anthropic.TextBlock);
          }
          return {
            id: `msg-${i}`,
            type: "message",
            role: "assistant",
            model: args.model,
            stop_reason: turn.toolUses.length === 0 ? "end_turn" : "tool_use",
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
            content,
          } as unknown as Anthropic.Message;
        },
      },
    },
  };
}

function buildFakeSupabase(initial?: {
  reports?: Array<{ id: string; status: string; title?: string; body?: string }>;
  recipients?: Array<{
    id: string;
    report_id: string;
    guardian_id: string;
    email_snapshot: string | null;
    delivery_status: string;
  }>;
}) {
  const reports = new Map(
    initial?.reports?.map((r) => [r.id, { ...r, title: r.title ?? "T", body: r.body ?? "B" }])
  );
  const recipients = new Map(initial?.recipients?.map((r) => [r.id, { ...r }]) ?? []);
  const writes: Array<{ table: string; payload: unknown }> = [];

  const fake = {
    from(table: string) {
      if (table === "report_recipients") {
        return {
          select() {
            return {
              eq: (_col: string, val: string) => ({
                limit: async () => {
                  const rows = Array.from(recipients.values())
                    .filter((r) => r.delivery_status === val)
                    .map((r) => {
                      const rep = reports?.get(r.report_id);
                      return {
                        id: r.id,
                        report_id: r.report_id,
                        guardian_id: r.guardian_id,
                        email_snapshot: r.email_snapshot,
                        reports: rep
                          ? { title: rep.title, body: rep.body, status: rep.status }
                          : null,
                      };
                    });
                  return { data: rows, error: null };
                },
              }),
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq: async (_col: string, val: string) => {
                const r = recipients.get(val);
                if (r) Object.assign(r, patch);
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "students") {
        return {
          update(_patch: Record<string, unknown>) {
            return {
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          },
        };
      }
      writes.push({ table, payload: null });
      return {
        insert(payload: unknown) {
          writes.push({ table, payload });
          return {
            select: () => ({
              single: async () => ({
                data: { id: `${table}-${writes.length}` },
                error: null,
              }),
            }),
          };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { fake, reports, recipients, writes };
}

describe("Phase 4 — admin agent + tokenization", () => {
  it("agent runs read tools then a non-destructive write with stable tokens", async () => {
    const tokenizer = AdminTokenizer.from([
      { id: STUDENT_ID, token: "[STUDENT_1]", display: "Maya Singh", kind: "student" },
      { id: CLASSROOM_ID, token: "[CLASSROOM_1]", display: "Sunflower", kind: "classroom" },
    ]);

    const stub = buildStubAnthropic([
      {
        toolUses: [
          {
            name: "list_classrooms",
            id: "tu-1",
            input: {},
          },
        ],
      },
      {
        toolUses: [
          {
            name: "transfer_student",
            id: "tu-2",
            input: {
              student_token: "[STUDENT_1]",
              new_classroom_token: "[CLASSROOM_1]",
              start_date: "2026-05-01",
            },
          },
        ],
      },
      {
        toolUses: [],
        text: "Done — [STUDENT_1] is now in [CLASSROOM_1].",
      },
    ]);

    // Build a fake supabase that satisfies the read + write tools.
    const fake = {
      from(table: string) {
        if (table === "classrooms") {
          return {
            select() {
              return {
                eq: () => ({
                  eq: async () => ({
                    data: [
                      {
                        id: CLASSROOM_ID,
                        name: "Sunflower",
                        code: "SUN",
                        curriculum_id: null,
                      },
                    ],
                    error: null,
                  }),
                }),
              };
            },
          };
        }
        if (table === "student_classroom_enrollments") {
          return {
            update(_p: Record<string, unknown>) {
              return {
                eq: () => ({ is: async () => ({ error: null }) }),
              };
            },
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: "enroll-new" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await runAdminAgent({
      prompt: "Move Maya to the Sunflower room starting May 1.",
      prefillReferences: tokenizer.references(),
      ctx: { supabase: fake, schoolId: SCHOOL_ID, actorUserId: ACTOR_ID },
      anthropic: stub.sdk,
      model: "claude-sonnet-4-6",
    });

    expect(result.executed.map((e) => e.tool)).toEqual(["list_classrooms", "transfer_student"]);
    expect(result.pendingConfirmations).toHaveLength(0);
    expect(result.finalMessage).toContain("[STUDENT_1]");
    expect(result.finalMessage).not.toContain("Maya");

    // Privacy: tool results never carried raw names. The admin's free-text
    // prompt may contain names (the admin typed them), but tool result blocks
    // — the way roster data flows back to the model — must stay tokenized.
    const lastCall = stub.calls.at(-1)!;
    const toolResultsBlob = lastCall.messages
      .filter((m) => m.role === "user")
      .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
      .filter((b) => (b as { type?: string }).type === "tool_result")
      .map((b) => {
        const c = (b as { content?: unknown }).content;
        return typeof c === "string" ? c : JSON.stringify(c);
      })
      .join(" ")
      .toLowerCase();
    expect(toolResultsBlob).not.toContain("maya");
    expect(toolResultsBlob).not.toContain("sunflower");
  });

  it("destructive op (archive_student) blocks until admin confirms, then runs", async () => {
    const tokenizer = AdminTokenizer.from([
      { id: STUDENT_ID, token: "[STUDENT_1]", display: "Maya Singh", kind: "student" },
    ]);

    // First run: agent calls archive_student → blocked → pendingConfirmations.
    const stub1 = buildStubAnthropic([
      {
        toolUses: [
          {
            name: "archive_student",
            id: "tu-1",
            input: { student_token: "[STUDENT_1]", reason: "Withdrawn" },
          },
        ],
      },
    ]);

    const ctx = {
      supabase: {
        from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      schoolId: SCHOOL_ID,
      actorUserId: ACTOR_ID,
    };

    const blocked = await runAdminAgent({
      prompt: "Archive Maya.",
      prefillReferences: tokenizer.references(),
      ctx,
      anthropic: stub1.sdk,
      model: "claude-sonnet-4-6",
    });
    expect(blocked.executed).toHaveLength(0);
    expect(blocked.pendingConfirmations).toHaveLength(1);
    expect(blocked.pendingConfirmations[0].tool).toBe("archive_student");

    // Re-invoke with the approval.
    const stub2 = buildStubAnthropic([
      {
        toolUses: [
          {
            name: "archive_student",
            id: "tu-2",
            input: { student_token: "[STUDENT_1]", reason: "Withdrawn" },
          },
        ],
      },
      { toolUses: [], text: "Archived." },
    ]);
    const granted = await runAdminAgent({
      prompt: "Archive Maya.",
      prefillReferences: tokenizer.references(),
      approvedDestructive: blocked.pendingConfirmations.map((p) => ({
        tool: p.tool,
        args: p.args,
      })),
      ctx,
      anthropic: stub2.sdk,
      model: "claude-sonnet-4-6",
    });
    expect(granted.executed.map((e) => e.tool)).toEqual(["archive_student"]);
    expect(granted.pendingConfirmations).toHaveLength(0);
  });

  it("admin tokenizer assigns stable tokens across kinds", () => {
    const t = new AdminTokenizer();
    expect(t.token("student", STUDENT_ID, "Maya")).toBe("[STUDENT_1]");
    expect(t.token("student", STUDENT_ID, "Maya")).toBe("[STUDENT_1]"); // stable
    expect(t.token("subtopic", SUBTOPIC_ID, "Pink Tower")).toBe("[SUBTOPIC_1]");
    expect(t.token("classroom", CLASSROOM_ID, "Sunflower")).toBe("[CLASSROOM_1]");
    expect(t.token("curriculum", CURRICULUM_ID, "Default")).toBe("[CURRICULUM_1]");
    expect(t.token("topic", TOPIC_ID, "Sensorial")).toBe("[TOPIC_1]");
    const refs = t.references();
    expect(refs).toHaveLength(5);
    expect(t.resolve("[STUDENT_1]")?.id).toBe(STUDENT_ID);
    expect(t.resolve("[NOTHING_99]")).toBeNull();
  });
});

describe("Phase 4 — CSV roster import planner", () => {
  it("handles canonical headers, aliases, conflicts, and bad dates", () => {
    const csv = parseCsv(
      [
        "First Name,Last Name,DOB,Nickname",
        "Maya,Singh,2018-04-12,",
        "Harper,Williamson,bad-date,Harp",
        ",Jones,2017-01-01,",
        "Harper,Williamson,2017-09-01,Harp",
      ].join("\n")
    );
    expect(csv.headers).toEqual(["First Name", "Last Name", "DOB", "Nickname"]);
    expect(csv.rowCount).toBe(4);

    const existing = new Set(["maya singh"]);
    const plan = planRosterImport(csv, existing);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({ first_name: "Harper", last_name: "Williamson" });
    const reasons = plan.conflicts.map((c) => c.reason).sort();
    expect(reasons).toEqual(["duplicate_name", "invalid_date", "missing_field"]);
  });

  it("parses quoted CSV with embedded commas + newlines", () => {
    const csv = parseCsv(
      'first_name,last_name,notes\n"Mei","Lee","Loves\nthe ""pink tower"", really"'
    );
    expect(csv.rows).toHaveLength(1);
    expect(csv.rows[0][2]).toBe('Loves\nthe "pink tower", really');
  });
});

describe("Phase 4 — email worker", () => {
  it("drains 'pending' for 'sent' reports and skips wrong-state reports", async () => {
    const { fake } = buildFakeSupabase({
      reports: [
        { id: "r-ok", status: "sent" },
        { id: "r-not-ready", status: "approved" },
      ],
      recipients: [
        {
          id: "rec-1",
          report_id: "r-ok",
          guardian_id: "g-1",
          email_snapshot: "g1@example.com",
          delivery_status: "pending",
        },
        {
          id: "rec-2",
          report_id: "r-not-ready",
          guardian_id: "g-2",
          email_snapshot: "g2@example.com",
          delivery_status: "pending",
        },
        {
          id: "rec-3",
          report_id: "r-ok",
          guardian_id: "g-3",
          email_snapshot: null,
          delivery_status: "pending",
        },
      ],
    });
    const sender = new StubEmailSender();
    const result = await drainPendingReports(fake, sender);

    expect(result.attempted).toBe(3);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(2);
    expect(sender.sentJobs).toHaveLength(1);
    expect(sender.sentJobs[0].guardianId).toBe("g-1");
    const reasons = result.failures.map((f) => f.error).sort();
    expect(reasons).toEqual(["missing guardian email", "parent report not in 'sent' state"]);
  });
});

describe("Phase 4 — extraction-to-form", () => {
  it("extracts guardian fields without inventing values", async () => {
    const stub = buildStubAnthropic([
      {
        toolUses: [
          {
            name: "fill_guardian_form",
            id: "tu-1",
            input: {
              first_name: "Priya",
              last_name: "Singh",
              email: "priya@example.com",
              preferred_contact_method: "email",
            },
          },
        ],
      },
    ]);
    const result = await extractEntityFields({
      entity: "guardian",
      description: "Priya Singh, email priya@example.com, prefers email contact.",
      anthropic: stub.sdk,
      model: "claude-haiku-4-5",
    });
    expect(result.fields).toMatchObject({
      first_name: "Priya",
      last_name: "Singh",
      email: "priya@example.com",
      preferred_contact_method: "email",
    });
  });
});
