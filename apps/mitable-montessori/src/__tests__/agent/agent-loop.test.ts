/**
 * Agent loop tests for the general chat agent.
 *
 * Drives runAgentLoop with a stubbed Anthropic SDK that scripts a series of
 * tool_use turns. Tools are stubbed at the SDK level (we don't go through
 * Supabase) — the loop's job is orchestration, not data access. Pins down:
 *
 *   - happy path: terminal tool returns detokenized body + entities
 *   - leak rejection: regenerates once, aborts on second failure
 *   - hallucinated UUID: same recovery path as a leak
 *   - max-turns abort: agent never calls a terminal tool
 */

import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgentLoop, AgentAbortError } from "@/lib/agent/agent-loop";
import { buildTokenMap } from "@/lib/tokens/token-map";
import { formatStudentToken } from "@/lib/tokens/format";
import type { TokenRef } from "@/lib/tokens/types";
import type { RosterStudent } from "@/lib/agent/roster";

const A_ID = "7e1c8a3b-2f4d-4d6c-9a3e-12abcd34ef56";

function buildStubAnthropic(
  turns: Array<{ tools: Array<{ id: string; name: string; input: Record<string, unknown> }> }>
) {
  let i = 0;
  return {
    sdk: {
      messages: {
        async create(args: Anthropic.MessageCreateParamsNonStreaming) {
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
            content: turn.tools.map(
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

function buildSetup() {
  const refs: TokenRef[] = [
    { id: A_ID, display: "Amelia Hart", kind: "student", token: formatStudentToken(A_ID) },
  ];
  const tokenMap = buildTokenMap(refs);
  const roster: RosterStudent[] = [
    {
      id: A_ID,
      schoolId: "s1",
      classroomId: "c1",
      firstName: "Amelia",
      lastName: "Hart",
      preferredName: null,
      nicknames: [],
      display: "Amelia Hart",
      needles: ["Amelia", "Hart", "Amelia Hart"],
    },
  ];
  return { refs, tokenMap, roster };
}

describe("runAgentLoop", () => {
  it("happy path: terminal tool body is detokenized + entities are returned", async () => {
    const { refs, tokenMap, roster } = buildSetup();
    const stub = buildStubAnthropic([
      {
        tools: [
          {
            id: "tu-1",
            name: "propose_prose_reply",
            input: { body: `${formatStudentToken(A_ID)} had a strong week with the pink tower.` },
          },
        ],
      },
    ]);
    const result = await runAgentLoop({
      anthropic: stub.sdk,
      model: "claude-sonnet-4-6",
      history: [],
      userMessageTokenized: `${formatStudentToken(A_ID)} pink tower update`,
      tokenMap,
      refs,
      roster,
    });
    expect(result.body).toBe("Amelia Hart had a strong week with the pink tower.");
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].id).toBe(A_ID);
    expect(result.entities[0].display).toBe("Amelia Hart");
    expect(result.turns).toBe(1);
    expect(result.regenerations).toBe(0);
  });

  it("rejects a leaked name and regenerates; second clean turn succeeds", async () => {
    const { refs, tokenMap, roster } = buildSetup();
    const stub = buildStubAnthropic([
      {
        // First attempt leaks the name.
        tools: [
          {
            id: "tu-1",
            name: "propose_prose_reply",
            input: { body: "Amelia Hart had a strong week with the pink tower." },
          },
        ],
      },
      {
        // Regenerated attempt uses the token.
        tools: [
          {
            id: "tu-2",
            name: "propose_prose_reply",
            input: { body: `${formatStudentToken(A_ID)} had a strong week with the pink tower.` },
          },
        ],
      },
    ]);
    const result = await runAgentLoop({
      anthropic: stub.sdk,
      model: "claude-sonnet-4-6",
      history: [],
      userMessageTokenized: `${formatStudentToken(A_ID)} pink tower update`,
      tokenMap,
      refs,
      roster,
    });
    expect(result.body).toBe("Amelia Hart had a strong week with the pink tower.");
    expect(result.regenerations).toBe(1);
  });

  it("rejects an invented UUID and regenerates", async () => {
    const { refs, tokenMap, roster } = buildSetup();
    const FAKE = "99999999-9999-9999-9999-999999999999";
    const stub = buildStubAnthropic([
      {
        tools: [
          {
            id: "tu-1",
            name: "propose_prose_reply",
            input: { body: `{{student:${FAKE}}} is doing great.` },
          },
        ],
      },
      {
        tools: [
          {
            id: "tu-2",
            name: "propose_prose_reply",
            input: { body: `${formatStudentToken(A_ID)} is doing great.` },
          },
        ],
      },
    ]);
    const result = await runAgentLoop({
      anthropic: stub.sdk,
      model: "claude-sonnet-4-6",
      history: [],
      userMessageTokenized: `${formatStudentToken(A_ID)} update`,
      tokenMap,
      refs,
      roster,
    });
    expect(result.body).toBe("Amelia Hart is doing great.");
    expect(result.regenerations).toBe(1);
  });

  it("aborts when the agent never reaches a terminal tool within the turn budget", async () => {
    const { refs, tokenMap, roster } = buildSetup();
    // 4 turns of empty content. The loop will treat empty content as
    // "no tool call" and bail at the limit.
    const stub = {
      sdk: {
        messages: {
          async create(_args: Anthropic.MessageCreateParamsNonStreaming) {
            return {
              id: "msg-x",
              type: "message",
              role: "assistant",
              model: "claude-sonnet-4-6",
              stop_reason: "end_turn",
              stop_sequence: null,
              usage: { input_tokens: 1, output_tokens: 1 },
              content: [{ type: "text", text: "I cannot answer that." }],
            } as unknown as Anthropic.Message;
          },
        },
      },
    };
    await expect(
      runAgentLoop({
        anthropic: stub.sdk,
        model: "claude-sonnet-4-6",
        history: [],
        userMessageTokenized: "hi",
        tokenMap,
        refs,
        roster,
      })
    ).rejects.toBeInstanceOf(AgentAbortError);
  });
});
