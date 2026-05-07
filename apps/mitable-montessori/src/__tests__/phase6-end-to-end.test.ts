/**
 * Phase 6 checkpoint end-to-end test for the report-editing chat agent.
 *
 * Drives `runReportChatAgent` end-to-end across a multi-turn thread,
 * exercising the full Phase 4 archetype set + Phase 5 cache accounting.
 * The fake Anthropic SDK scripts each turn's tool_use response so we can
 * pin behavior without hitting the real model:
 *
 *   1. Turn one: read_report_sections + propose_rewrite, with token leak
 *      validation + the post-leak regeneration nudge.
 *   2. Turn two: search_capture_artifacts + propose_observation_ref —
 *      the search callback is invoked with the agent's query and limit;
 *      the result is detokenized before reaching the wire format.
 *   3. Turn three: propose_chips with multi-word display tokenization.
 *   4. Turn four: propose_ghost_edit, asserting the server-stamped id +
 *      cache-token bookkeeping carries through.
 *
 * Pins the contract for the full archetype set in one test so we catch
 * cross-archetype regressions (e.g. a future schema change breaking only
 * one branch of the rowToChatMessage mapping).
 */

import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runReportChatAgent, type ChatAgentInput } from "@/lib/reports/chat-agent-loop";
import { rowToChatMessage } from "@/lib/reports/chat-message";

type StubResponse = {
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  /** Optional cache usage stats per turn — defaults to zero. */
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

function buildStubAnthropic(turns: StubResponse[]) {
  let i = 0;
  const calls: Array<Anthropic.MessageCreateParamsNonStreaming> = [];
  return {
    calls,
    sdk: {
      messages: {
        async create(args: Anthropic.MessageCreateParamsNonStreaming) {
          calls.push(args);
          const turn = turns[i++];
          if (!turn) throw new Error(`Stub ran out of turns at ${i}`);
          return {
            id: `msg-${i}`,
            type: "message",
            role: "assistant",
            model: args.model,
            stop_reason: "tool_use",
            stop_sequence: null,
            usage: {
              input_tokens: turn.usage?.input_tokens ?? 100,
              output_tokens: turn.usage?.output_tokens ?? 50,
              cache_creation_input_tokens: turn.usage?.cache_creation_input_tokens ?? 0,
              cache_read_input_tokens: turn.usage?.cache_read_input_tokens ?? 0,
            },
            content: turn.toolUses.map(
              (t) =>
                ({
                  type: "tool_use",
                  id: t.id,
                  name: t.name,
                  input: t.input,
                }) satisfies Anthropic.ToolUseBlock
            ),
          } as unknown as Anthropic.Message;
        },
      },
    },
  };
}

const REFERENCES = {
  refs: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      token: "[STUDENT_1]",
      display: "Ada Okafor",
      kind: "student" as const,
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      token: "[CLASSROOM_0]",
      display: "Sunflower Room",
      kind: "classroom" as const,
    },
  ],
};

const TOKENIZED_SECTIONS = [
  {
    id: "morning",
    heading: "Morning",
    paragraphs: [
      {
        id: "morning-p1",
        html: "[STUDENT_1] arrived quietly and chose the pink tower.",
      },
    ],
  },
  {
    id: "afternoon",
    heading: "Afternoon",
    paragraphs: [{ id: "afternoon-p1", html: "Spent time with the metal insets." }],
  },
];

const BASE_INPUT: Omit<ChatAgentInput, "anthropic" | "userMessage"> = {
  model: "claude-sonnet-4-6",
  tokenizedSections: TOKENIZED_SECTIONS,
  tokenizedTitle: "A steady Friday for [STUDENT_1]",
  references: REFERENCES,
  history: [],
};

describe("Phase 6 — chat agent end-to-end", () => {
  it("turn 1: rewrite with leak regeneration + cache-token bookkeeping", async () => {
    const stub = buildStubAnthropic([
      // First attempt: agent reads the report.
      {
        toolUses: [{ id: "tu-1", name: "read_report_sections", input: {} }],
        usage: { input_tokens: 200, output_tokens: 30, cache_creation_input_tokens: 200 },
      },
      // First proposal leaks "Ada Okafor" — validator rejects.
      {
        toolUses: [
          {
            id: "tu-2",
            name: "propose_rewrite",
            input: {
              target: { sectionId: "morning", paragraphId: "morning-p1" },
              lead: "Warmer take",
              oldText: "[STUDENT_1] arrived quietly and chose the pink tower.",
              newText: "Ada Okafor came in calmly.",
            },
          },
        ],
        usage: { input_tokens: 50, output_tokens: 80, cache_read_input_tokens: 200 },
      },
      // Recovery turn — clean tokens.
      {
        toolUses: [
          {
            id: "tu-3",
            name: "propose_rewrite",
            input: {
              target: { sectionId: "morning", paragraphId: "morning-p1" },
              lead: "Warmer take",
              oldText: "[STUDENT_1] arrived quietly and chose the pink tower.",
              newText: "[STUDENT_1] came in calmly and chose the pink tower without prompting.",
            },
          },
        ],
        usage: { input_tokens: 60, output_tokens: 90, cache_read_input_tokens: 200 },
      },
    ]);

    const out = await runReportChatAgent({
      ...BASE_INPUT,
      anthropic: stub.sdk,
      userMessage: "Make the morning warmer.",
    });
    if (out.terminalKind !== "proposal") throw new Error("expected proposal");
    expect(out.proposal.newText).toBe(
      "Ada Okafor came in calmly and chose the pink tower without prompting."
    );
    expect(out.regenerations).toBe(1);
    // Cache stats accumulated across all SDK calls in the turn.
    expect(out.cacheCreationInputTokens).toBe(200);
    expect(out.cacheReadInputTokens).toBe(400);
  });

  it("turn 2: search_capture_artifacts → propose_observation_ref roundtrip", async () => {
    const search = vi.fn(async (args: { query: string; limit: number }) => {
      expect(args.query).toBe("pencil grip");
      expect(args.limit).toBe(5);
      return [
        {
          artifactId: "a-1",
          quote: "[STUDENT_1] held the pencil with a tripod grip.",
          when: "10:14 AM",
          area: "Practical life",
          source: "photo" as const,
        },
      ];
    });
    const stub = buildStubAnthropic([
      {
        toolUses: [
          {
            id: "tu-1",
            name: "search_capture_artifacts",
            input: { query: "pencil grip", limit: 5 },
          },
        ],
      },
      {
        toolUses: [
          {
            id: "tu-2",
            name: "propose_observation_ref",
            input: {
              body: "Found a moment for [STUDENT_1] you didn't reference yet.",
              obs: {
                artifactId: "a-1",
                quote: "[STUDENT_1] held the pencil with a tripod grip.",
                when: "10:14 AM",
                area: "Practical life",
              },
              suggestedTarget: { sectionId: "morning", position: "append" },
            },
          },
        ],
      },
    ]);

    const out = await runReportChatAgent({
      ...BASE_INPUT,
      anthropic: stub.sdk,
      searchArtifacts: search,
      userMessage: "Anything in the captures about her pencil grip?",
    });
    if (out.terminalKind !== "obs-ref") throw new Error("expected obs-ref");
    expect(search).toHaveBeenCalledOnce();
    expect(out.obsRef.body).toContain("Ada Okafor");
    expect(out.obsRef.obs.quote).toContain("Ada Okafor");
    expect(out.obsRef.suggestedTarget?.sectionId).toBe("morning");
  });

  it("turn 3: propose_chips with multi-word display tokenization", async () => {
    const stub = buildStubAnthropic([
      {
        toolUses: [
          {
            id: "tu-1",
            name: "propose_chips",
            input: {
              body: "Two ways to handle [STUDENT_1] today:",
              chips: [
                { label: "Keep [STUDENT_1] focused", prefill: "Keep focus on [STUDENT_1]." },
                { label: "Drop the peer mention", prefill: "Drop the peer mention." },
                { label: "Mention briefly", prefill: "Mention briefly in the morning paragraph." },
              ],
            },
          },
        ],
      },
    ]);
    const out = await runReportChatAgent({
      ...BASE_INPUT,
      anthropic: stub.sdk,
      userMessage: "Should I mention Mateo here?",
    });
    if (out.terminalKind !== "chips") throw new Error("expected chips");
    expect(out.chips.body).toBe("Two ways to handle Ada Okafor today:");
    expect(out.chips.chips).toHaveLength(3);
    expect(out.chips.chips[0].label).toBe("Keep Ada Okafor focused");
    expect(out.chips.chips[0].prefill).toBe("Keep focus on Ada Okafor.");
  });

  it("turn 4: propose_ghost_edit emits a server-stamped id and detokenized html", async () => {
    const stub = buildStubAnthropic([
      {
        toolUses: [
          {
            id: "tu-1",
            name: "propose_ghost_edit",
            input: {
              body: "I added a suggestion below the morning section.",
              target: { sectionId: "morning" },
              ghostEdit: {
                html: "[STUDENT_1] held the pencil with a tripod grip during the writing block.",
                sourceLabel: "10:14 AM photo",
              },
            },
          },
        ],
      },
    ]);
    const out = await runReportChatAgent({
      ...BASE_INPUT,
      anthropic: stub.sdk,
      userMessage: "Add a sentence about her pencil grip below morning.",
    });
    if (out.terminalKind !== "ghost-edit") throw new Error("expected ghost-edit");
    expect(out.ghostEdit.target.sectionId).toBe("morning");
    expect(out.ghostEdit.ghostEdit.html).toContain("Ada Okafor");
    expect(out.ghostEdit.ghostEdit.id.length).toBeGreaterThan(0);
    expect(out.ghostEdit.ghostEdit.sourceLabel).toBe("10:14 AM photo");
  });
});

describe("Phase 6 — rowToChatMessage round-trip", () => {
  it("round-trips a stored proposal payload back into the wire format", () => {
    const wire = rowToChatMessage({
      id: "msg-1",
      role: "assistant",
      kind: "proposal",
      payload: {
        lead: "Warmer take.",
        target: {
          sectionId: "morning",
          paragraphId: "morning-p1",
          headingDisplay: "Morning",
        },
        oldText: "Ada arrived at 8:42.",
        newText: "Ada came in quietly.",
        rationale: "Same facts, warmer tone.",
      },
      target_ref: null,
      actor_role: "assistant",
      applied_at: null,
      dismissed_at: null,
      created_at: "2026-05-07T09:00:00Z",
    });
    if (wire.kind !== "proposal") throw new Error("expected proposal");
    expect(wire.target.headingDisplay).toBe("Morning");
    expect(wire.rationale).toBe("Same facts, warmer tone.");
    expect(wire.actorRole).toBe("assistant");
  });

  it("round-trips a stored chips payload (chip ids preserved)", () => {
    const wire = rowToChatMessage({
      id: "msg-2",
      role: "assistant",
      kind: "chips",
      payload: {
        body: "Two ways to handle this:",
        chips: [
          { id: "c-0", label: "A", prefill: "A please." },
          { id: "c-1", label: "B", prefill: "B please." },
        ],
      },
      target_ref: null,
      actor_role: "assistant",
      applied_at: null,
      dismissed_at: null,
      created_at: "2026-05-07T09:01:00Z",
    });
    if (wire.kind !== "chips") throw new Error("expected chips");
    expect(wire.chips).toHaveLength(2);
    expect(wire.chips[0].id).toBe("c-0");
  });

  it("round-trips a stored ghost-edit payload (preserves applied/dismissed timestamps)", () => {
    const wire = rowToChatMessage({
      id: "msg-3",
      role: "assistant",
      kind: "ghost-edit",
      payload: {
        body: "Added a suggestion.",
        target: { sectionId: "morning" },
        ghostEdit: { id: "g-1", html: "Some text.", sourceLabel: "10:14 AM photo" },
      },
      target_ref: null,
      actor_role: "assistant",
      applied_at: "2026-05-07T09:02:00Z",
      dismissed_at: null,
      created_at: "2026-05-07T09:01:00Z",
    });
    if (wire.kind !== "ghost-edit") throw new Error("expected ghost-edit");
    expect(wire.appliedAt).toBe("2026-05-07T09:02:00Z");
    expect(wire.dismissedAt).toBeUndefined();
    expect(wire.ghostEdit.sourceLabel).toBe("10:14 AM photo");
  });
});
