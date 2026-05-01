/**
 * Phase 3 checkpoint end-to-end test.
 *
 * Drives the report-drafting agent loop with a stubbed Anthropic SDK and a
 * fixture data adapter:
 *   1. Agent calls get_student_commands and get_student_progress_summary
 *   2. Agent calls draft_report with a tokenized body
 *   3. Token-preservation validator passes
 *   4. Returned references match the union of refs the read tools yielded
 *
 * Also verifies:
 *   - leaked-name detection forces a regeneration
 *   - max-turn cap aborts cleanly
 *   - the workflow state machine enforces correct transitions
 *
 * Real Anthropic + Supabase HTTP boundaries are not touched. The agent loop
 * itself is what we're pinning down, since that's where the privacy invariant
 * and the report contract live.
 */

import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runReportAgent, AgentAbortError } from "@/lib/reports/agent-loop";
import type {
  ReportDataAdapter,
  ReportReferenceSet,
  TokenizedCommandRecord,
  TokenizedProgressRow,
} from "@/lib/reports/data-adapter";
import { validateTokenPreservation } from "@/lib/reports/token-preservation";

const STUDENT_REF = "66666666-6666-6666-6666-666666666666";
const SUBTOPIC_REF = "88888888-8888-8888-8888-888888888888";
const CLASSROOM_REF = "22222222-2222-2222-2222-222222222222";

class FixtureAdapter implements ReportDataAdapter {
  constructor(public readonly studentDisplay: string = "Maya Singh") {}
  async getStudentCommands(): Promise<{
    commands: TokenizedCommandRecord[];
    references: ReportReferenceSet;
  }> {
    const commands: TokenizedCommandRecord[] = [
      {
        student_token: "[STUDENT_1]",
        classroom_token: "[CLASSROOM_0]",
        subtopic_token: null,
        command_type: "attendance",
        status: "present",
        date: "2026-04-28",
        comment: null,
      },
      {
        student_token: "[STUDENT_1]",
        classroom_token: "[CLASSROOM_0]",
        subtopic_token: "[SUBTOPIC_1]",
        command_type: "progress",
        status: "practicing",
        date: "2026-04-29",
        comment: "Strong concentration on the third try.",
      },
    ];
    const references: ReportReferenceSet = {
      refs: [
        { id: STUDENT_REF, token: "[STUDENT_1]", display: this.studentDisplay, kind: "student" },
        { id: SUBTOPIC_REF, token: "[SUBTOPIC_1]", display: "Pink Tower", kind: "subtopic" },
        { id: CLASSROOM_REF, token: "[CLASSROOM_0]", display: "Sunflower Room", kind: "classroom" },
      ],
    };
    return { commands, references };
  }

  async getStudentProgressSummary(): Promise<{
    rows: TokenizedProgressRow[];
    references: ReportReferenceSet;
  }> {
    const rows: TokenizedProgressRow[] = [
      {
        subtopic_token: "[SUBTOPIC_1]",
        status: "practicing",
        comment: null,
        updated_at: "2026-04-29T15:00:00Z",
      },
    ];
    const references: ReportReferenceSet = {
      refs: [{ id: SUBTOPIC_REF, token: "[SUBTOPIC_1]", display: "Pink Tower", kind: "subtopic" }],
    };
    return { rows, references };
  }
}

interface StubTurn {
  toolUses: Array<
    | { name: "get_student_commands"; id: string }
    | { name: "get_student_progress_summary"; id: string }
    | {
        name: "draft_report";
        id: string;
        input: {
          student_token: string;
          report_type: "daily" | "major";
          period_start: string;
          period_end: string;
          title: string;
          draft_text: string;
        };
      }
  >;
}

function buildStubAnthropic(turns: StubTurn[]) {
  let i = 0;
  const calls: Array<Anthropic.MessageCreateParamsNonStreaming> = [];
  return {
    calls,
    sdk: {
      messages: {
        async create(args: Anthropic.MessageCreateParamsNonStreaming) {
          calls.push(args);
          const turn = turns[i++];
          if (!turn) throw new Error(`Stub ran out of turns at index ${i}`);
          return {
            id: `msg-${i}`,
            type: "message",
            role: "assistant",
            model: args.model,
            stop_reason: "tool_use",
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
            content: turn.toolUses.map((t) => {
              if (t.name === "draft_report") {
                return {
                  type: "tool_use",
                  id: t.id,
                  name: t.name,
                  input: t.input,
                } satisfies Anthropic.ToolUseBlock;
              }
              return {
                type: "tool_use",
                id: t.id,
                name: t.name,
                input: {
                  student_token: "[STUDENT_1]",
                  period_start: "2026-04-28",
                  period_end: "2026-05-01",
                },
              } satisfies Anthropic.ToolUseBlock;
            }),
          } as unknown as Anthropic.Message;
        },
      },
    },
  };
}

const COMMON_INPUT = {
  studentToken: "[STUDENT_1]",
  studentRef: STUDENT_REF,
  classroomToken: "[CLASSROOM_0]",
  classroomRef: CLASSROOM_REF,
  reportType: "daily" as const,
  periodStart: "2026-04-28",
  periodEnd: "2026-05-01",
  model: "claude-sonnet-4-6",
};

describe("Phase 3 — report drafting agent loop", () => {
  it("converges in 2 turns: read commands → draft → tokens preserved", async () => {
    const adapter = new FixtureAdapter();
    const stub = buildStubAnthropic([
      {
        toolUses: [
          { name: "get_student_commands", id: "tu-1" },
          { name: "get_student_progress_summary", id: "tu-2" },
        ],
      },
      {
        toolUses: [
          {
            name: "draft_report",
            id: "tu-3",
            input: {
              student_token: "[STUDENT_1]",
              report_type: "daily",
              period_start: "2026-04-28",
              period_end: "2026-05-01",
              title: "Daily report for [STUDENT_1]",
              draft_text:
                "[STUDENT_1] showed strong concentration during [SUBTOPIC_1] this week. " +
                "We saw consistent practicing across [CLASSROOM_0], with attentive return to materials.",
            },
          },
        ],
      },
    ]);

    const result = await runReportAgent({
      ...COMMON_INPUT,
      adapter,
      anthropic: stub.sdk,
    });

    expect(result.turns).toBe(2);
    expect(result.regenerations).toBe(0);
    expect(result.draft.title).toContain("[STUDENT_1]");
    expect(result.draft.draft_text).toContain("[STUDENT_1]");
    expect(result.draft.draft_text).toContain("[SUBTOPIC_1]");
    expect(result.draft.draft_text.toLowerCase()).not.toContain("maya");
    expect(result.draft.draft_text.toLowerCase()).not.toContain("pink tower");

    // References merged across both read tools.
    const tokens = new Set(result.references.refs.map((r) => r.token));
    expect(tokens.has("[STUDENT_1]")).toBe(true);
    expect(tokens.has("[SUBTOPIC_1]")).toBe(true);
    expect(tokens.has("[CLASSROOM_0]")).toBe(true);

    // Validator agrees the draft is clean.
    const v = validateTokenPreservation(result.draft.draft_text, result.references.refs);
    expect(v.ok).toBe(true);
  });

  it("regenerates when the draft leaks a real student name", async () => {
    const adapter = new FixtureAdapter();
    const stub = buildStubAnthropic([
      {
        toolUses: [{ name: "get_student_commands", id: "tu-1" }],
      },
      {
        // First draft attempt: leaks "Maya".
        toolUses: [
          {
            name: "draft_report",
            id: "tu-2",
            input: {
              student_token: "[STUDENT_1]",
              report_type: "daily",
              period_start: "2026-04-28",
              period_end: "2026-05-01",
              title: "Daily report",
              draft_text: "Maya did the [SUBTOPIC_1] today and was attentive.",
            },
          },
        ],
      },
      // Second attempt restarts the agent — first turn reads commands again.
      {
        toolUses: [{ name: "get_student_commands", id: "tu-3" }],
      },
      {
        // Second draft attempt: clean.
        toolUses: [
          {
            name: "draft_report",
            id: "tu-4",
            input: {
              student_token: "[STUDENT_1]",
              report_type: "daily",
              period_start: "2026-04-28",
              period_end: "2026-05-01",
              title: "Daily report",
              draft_text: "[STUDENT_1] worked steadily on [SUBTOPIC_1] today.",
            },
          },
        ],
      },
    ]);

    const result = await runReportAgent({
      ...COMMON_INPUT,
      adapter,
      anthropic: stub.sdk,
    });

    expect(result.regenerations).toBe(1);
    expect(result.draft.draft_text.toLowerCase()).not.toContain("maya");
  });

  it("aborts cleanly when the agent never calls draft_report", async () => {
    const adapter = new FixtureAdapter();
    const turns: StubTurn[] = [];
    // Three regeneration attempts × 5 turns each = 15 stub turns of read tools.
    for (let i = 0; i < 15; i++) {
      turns.push({ toolUses: [{ name: "get_student_commands", id: `tu-${i}` }] });
    }
    const stub = buildStubAnthropic(turns);

    await expect(
      runReportAgent({
        ...COMMON_INPUT,
        adapter,
        anthropic: stub.sdk,
      })
    ).rejects.toBeInstanceOf(AgentAbortError);
  });

  it("validator catches leaked names and unknown tokens", () => {
    const refs = [
      { id: STUDENT_REF, token: "[STUDENT_1]", display: "Maya Singh", kind: "student" as const },
      { id: SUBTOPIC_REF, token: "[SUBTOPIC_1]", display: "Pink Tower", kind: "subtopic" as const },
    ];
    const clean = validateTokenPreservation("[STUDENT_1] practiced [SUBTOPIC_1].", refs);
    expect(clean.ok).toBe(true);

    const leak = validateTokenPreservation("Maya practiced [SUBTOPIC_1].", refs);
    expect(leak.ok).toBe(false);
    expect(leak.leakedNames).toContain("Maya Singh");

    const unknown = validateTokenPreservation("[STUDENT_1] saw [SUBTOPIC_99].", refs);
    expect(unknown.ok).toBe(false);
    expect(unknown.unknownTokens).toContain("[SUBTOPIC_99]");
  });
});

describe("Phase 3 — report workflow state machine", () => {
  it("draft → submitted_for_review → approved → sent (admin path)", async () => {
    // We exercise the transition rules via a fake supabase client. This pins
    // down the contract in `lib/reports/workflow.ts` without touching real
    // Postgres.
    const { runWorkflowFixture } = await import("./helpers");
    const trace = await runWorkflowFixture();
    expect(trace).toEqual([
      "submit:draft→submitted_for_review",
      "approve:submitted_for_review→approved",
      "send:approved→sent",
    ]);
  });

  it("rejects send before approval", async () => {
    const { attemptInvalidSend } = await import("./helpers");
    await expect(attemptInvalidSend()).rejects.toThrow(/Cannot send a report in status 'draft'/);
  });
});
