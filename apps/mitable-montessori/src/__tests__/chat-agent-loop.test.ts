/**
 * Phase 2 chat agent loop tests.
 *
 * Drives runReportChatAgent with a stubbed Anthropic SDK that scripts a series
 * of tool_use turns. Pins down:
 *   - read_report_sections result is returned to the agent and consumed
 *   - terminal tools (propose_prose_reply, ask_clarifying_question) emit the
 *     correct ChatAgentTerminalKind
 *   - server detokenizes terminal tool emissions before returning
 *   - validation regenerates once on token leak; second leak aborts
 *   - max-turns abort fires when the agent never calls a terminal tool
 *   - tokenization-against-refs respects multi-word display strings
 */

import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  runReportChatAgent,
  ChatAgentAbortError,
  __TEST__,
  type ChatAgentInput,
} from "@/lib/reports/chat-agent-loop";

type StubTurn = {
  toolUses: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
};

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
            usage: { input_tokens: 12, output_tokens: 7 },
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
      { id: "morning-p1", html: "[STUDENT_1] arrived quietly and chose the pink tower." },
    ],
  },
  {
    id: "afternoon",
    heading: "Afternoon",
    paragraphs: [{ id: "afternoon-p1", html: "Spent time with the metal insets." }],
  },
];

const BASE_INPUT: Omit<ChatAgentInput, "anthropic"> = {
  model: "claude-sonnet-4-6",
  tokenizedSections: TOKENIZED_SECTIONS,
  tokenizedTitle: "A steady Friday for [STUDENT_1]",
  references: REFERENCES,
  history: [],
  userMessage: "Could you summarize Ada Okafor's morning in one sentence?",
};

describe("runReportChatAgent — Phase 2", () => {
  it("read tool → terminal prose: returns detokenized body", async () => {
    const stub = buildStubAnthropic([
      {
        toolUses: [{ id: "tu-1", name: "read_report_sections", input: {} }],
      },
      {
        toolUses: [
          {
            id: "tu-2",
            name: "propose_prose_reply",
            input: {
              body: "[STUDENT_1] settled into the morning by reaching for the pink tower without a prompt.",
            },
          },
        ],
      },
    ]);

    const out = await runReportChatAgent({ ...BASE_INPUT, anthropic: stub.sdk });
    if (out.terminalKind !== "prose") throw new Error(`expected prose, got ${out.terminalKind}`);

    expect(out.body).toBe(
      "Ada Okafor settled into the morning by reaching for the pink tower without a prompt."
    );
    expect(out.tokenizedBody).toContain("[STUDENT_1]");
    expect(out.turns).toBe(2);
    expect(out.regenerations).toBe(0);

    // The read tool result must have been fed back as a tool_result block on
    // the second call. Inspect the second SDK call's last message.
    const secondCall = stub.calls[1];
    const lastMsg = secondCall.messages[secondCall.messages.length - 1];
    expect(Array.isArray(lastMsg.content)).toBe(true);
    const firstBlock = (lastMsg.content as Anthropic.ToolResultBlockParam[])[0];
    expect(firstBlock.type).toBe("tool_result");
    expect((firstBlock.content as string).includes("morning")).toBe(true);
  });

  it("ask_clarifying_question terminal returns kind=clarify", async () => {
    const stub = buildStubAnthropic([
      {
        toolUses: [
          {
            id: "tu-1",
            name: "ask_clarifying_question",
            input: { body: "Should I focus only on [STUDENT_1] or include peers?" },
          },
        ],
      },
    ]);
    const out = await runReportChatAgent({ ...BASE_INPUT, anthropic: stub.sdk });
    if (out.terminalKind !== "clarify") {
      throw new Error(`expected clarify, got ${out.terminalKind}`);
    }
    expect(out.body).toBe("Should I focus only on Ada Okafor or include peers?");
  });

  it("regenerates once when the agent leaks a real name, then succeeds", async () => {
    const stub = buildStubAnthropic([
      // First attempt: leaks "Ada Okafor" — validator rejects, attempt aborts.
      {
        toolUses: [
          {
            id: "tu-1",
            name: "propose_prose_reply",
            input: {
              body: "Ada Okafor had a steady morning with the pink tower.",
            },
          },
        ],
      },
      // Second attempt: tokenized correctly.
      {
        toolUses: [
          {
            id: "tu-2",
            name: "propose_prose_reply",
            input: {
              body: "[STUDENT_1] had a steady morning with the pink tower.",
            },
          },
        ],
      },
    ]);

    const out = await runReportChatAgent({ ...BASE_INPUT, anthropic: stub.sdk });
    if (out.terminalKind !== "prose") throw new Error(`expected prose, got ${out.terminalKind}`);
    expect(out.body).toBe("Ada Okafor had a steady morning with the pink tower.");
    expect(out.regenerations).toBe(1);
  });

  it("aborts with validation_failed when the agent leaks names twice", async () => {
    const stub = buildStubAnthropic([
      {
        toolUses: [
          {
            id: "tu-1",
            name: "propose_prose_reply",
            input: { body: "Ada Okafor was great." },
          },
        ],
      },
      {
        toolUses: [
          {
            id: "tu-2",
            name: "propose_prose_reply",
            input: { body: "Ada was great again." },
          },
        ],
      },
    ]);

    await expect(runReportChatAgent({ ...BASE_INPUT, anthropic: stub.sdk })).rejects.toMatchObject({
      reason: "validation_failed",
    });
  });

  it("aborts with max_turns when the agent never calls a terminal tool", async () => {
    // Returns "read_report_sections" forever. With MAX_CHAT_TURNS_PER_REQUEST=4
    // and MAX_CHAT_REGENERATIONS=1, the loop runs at most 8 turns before
    // throwing max_turns.
    const sdk = {
      messages: {
        async create(args: Anthropic.MessageCreateParamsNonStreaming) {
          return {
            id: "msg-x",
            type: "message",
            role: "assistant",
            model: args.model,
            stop_reason: "tool_use",
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [
              {
                type: "tool_use",
                id: `r-${Math.random()}`,
                name: "read_report_sections",
                input: {},
              } as Anthropic.ToolUseBlock,
            ],
          } as unknown as Anthropic.Message;
        },
      },
    };
    const err = await runReportChatAgent({ ...BASE_INPUT, anthropic: sdk })
      .then(() => null)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ChatAgentAbortError);
    expect((err as ChatAgentAbortError).reason).toBe("max_turns");
  });

  it("includes prior history (re-tokenized) in the conversation context", async () => {
    const stub = buildStubAnthropic([
      {
        toolUses: [
          {
            id: "tu-1",
            name: "propose_prose_reply",
            input: { body: "Yes — the [STUDENT_1] bit is what stood out." },
          },
        ],
      },
    ]);
    await runReportChatAgent({
      ...BASE_INPUT,
      history: [
        {
          role: "user",
          body: "Did Ada Okafor seem settled this morning?",
        },
        {
          role: "assistant",
          body: "Ada Okafor came in calm and headed for the pink tower.",
        },
      ],
      anthropic: stub.sdk,
    });

    const firstCall = stub.calls[0];
    // First two messages should be the tokenized history; last is the new user turn.
    expect(firstCall.messages.length).toBeGreaterThanOrEqual(3);
    const userTextOf = (m: Anthropic.MessageParam) =>
      Array.isArray(m.content)
        ? m.content.map((b) => (b.type === "text" ? b.text : "")).join("")
        : "";
    expect(userTextOf(firstCall.messages[0])).toContain("[STUDENT_1]");
    expect(userTextOf(firstCall.messages[0])).not.toContain("Ada Okafor");
    expect(userTextOf(firstCall.messages[1])).toContain("[STUDENT_1]");
  });

  // ----- Phase 3: propose_rewrite emission -----

  it("propose_rewrite returns a proposal payload with detokenized prose fields", async () => {
    const stub = buildStubAnthropic([
      {
        toolUses: [
          {
            id: "tu-1",
            name: "propose_rewrite",
            input: {
              target: { sectionId: "morning", paragraphId: "morning-p1" },
              lead: "Here's a warmer take:",
              oldText: "[STUDENT_1] arrived quietly and chose the pink tower.",
              newText:
                "[STUDENT_1] came in quietly this morning and reached for the pink tower without prompting.",
              rationale: "Same facts, warmer tone.",
            },
          },
        ],
      },
    ]);

    const out = await runReportChatAgent({ ...BASE_INPUT, anthropic: stub.sdk });
    if (out.terminalKind !== "proposal") {
      throw new Error(`expected proposal, got ${out.terminalKind}`);
    }

    expect(out.proposal.target).toEqual({
      sectionId: "morning",
      paragraphId: "morning-p1",
    });
    expect(out.proposal.lead).toBe("Here's a warmer take:");
    expect(out.proposal.oldText).toContain("Ada Okafor");
    expect(out.proposal.newText).toContain("Ada Okafor");
    expect(out.proposal.rationale).toBe("Same facts, warmer tone.");
    // Tokenized snapshot kept for tool_trace.
    expect(out.proposal.tokenized.newText).toContain("[STUDENT_1]");
    expect(out.proposal.tokenized.newText).not.toContain("Ada Okafor");
  });

  it("rejects propose_rewrite with an unknown sectionId+paragraphId pair", async () => {
    const stub = buildStubAnthropic([
      // First attempt: bad target — agent should retry within the same loop.
      {
        toolUses: [
          {
            id: "tu-1",
            name: "propose_rewrite",
            input: {
              target: { sectionId: "ghost", paragraphId: "ghost-p" },
              lead: "Lead",
              oldText: "[STUDENT_1] foo.",
              newText: "[STUDENT_1] bar.",
            },
          },
        ],
      },
      // Recovery turn: correct target.
      {
        toolUses: [
          {
            id: "tu-2",
            name: "propose_rewrite",
            input: {
              target: { sectionId: "morning", paragraphId: "morning-p1" },
              lead: "Lead",
              oldText: "[STUDENT_1] foo.",
              newText: "[STUDENT_1] bar.",
            },
          },
        ],
      },
    ]);
    const out = await runReportChatAgent({ ...BASE_INPUT, anthropic: stub.sdk });
    if (out.terminalKind !== "proposal") throw new Error("expected proposal");
    expect(out.proposal.target.sectionId).toBe("morning");
    expect(out.turns).toBe(2);
    // Recovered without a regeneration (the bad target was a tool-error response,
    // not a token-leak validation failure).
    expect(out.regenerations).toBe(0);
  });

  it("regenerates the loop once when propose_rewrite leaks a real name", async () => {
    const stub = buildStubAnthropic([
      // First attempt: leaks "Ada Okafor" inside newText.
      {
        toolUses: [
          {
            id: "tu-1",
            name: "propose_rewrite",
            input: {
              target: { sectionId: "morning", paragraphId: "morning-p1" },
              lead: "Lead",
              oldText: "[STUDENT_1] arrived quietly and chose the pink tower.",
              newText: "Ada Okafor came in calm.",
            },
          },
        ],
      },
      // Second attempt: tokenized newText.
      {
        toolUses: [
          {
            id: "tu-2",
            name: "propose_rewrite",
            input: {
              target: { sectionId: "morning", paragraphId: "morning-p1" },
              lead: "Lead",
              oldText: "[STUDENT_1] arrived quietly and chose the pink tower.",
              newText: "[STUDENT_1] came in calm.",
            },
          },
        ],
      },
    ]);
    const out = await runReportChatAgent({ ...BASE_INPUT, anthropic: stub.sdk });
    if (out.terminalKind !== "proposal") throw new Error("expected proposal");
    expect(out.proposal.newText).toBe("Ada Okafor came in calm.");
    expect(out.regenerations).toBe(1);
  });
});

describe("tokenizeAgainstRefs", () => {
  it("replaces multi-word display strings before single-word ones", () => {
    const out = __TEST__.tokenizeAgainstRefs("Ada Okafor and Ada are different here.", [
      {
        id: "1",
        token: "[STUDENT_1]",
        display: "Ada Okafor",
        kind: "student",
      },
      {
        id: "2",
        token: "[STUDENT_2]",
        display: "Ada",
        kind: "student",
      },
    ]);
    expect(out).toBe("[STUDENT_1] and [STUDENT_2] are different here.");
  });

  it("matches case-insensitively but preserves the rest of the text", () => {
    const out = __TEST__.tokenizeAgainstRefs("ada had a steady day, ADA was great.", [
      { id: "1", token: "[STUDENT_1]", display: "Ada", kind: "student" },
    ]);
    expect(out).toBe("[STUDENT_1] had a steady day, [STUDENT_1] was great.");
  });

  it("does not match substrings of other words", () => {
    const out = __TEST__.tokenizeAgainstRefs("Adams was here, not Ada.", [
      { id: "1", token: "[STUDENT_1]", display: "Ada", kind: "student" },
    ]);
    expect(out).toBe("Adams was here, not [STUDENT_1].");
  });
});
