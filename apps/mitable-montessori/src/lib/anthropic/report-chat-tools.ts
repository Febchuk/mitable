import type Anthropic from "@anthropic-ai/sdk";

/**
 * Phase 2 tool surface for the report-editing chat agent. The agent sees only
 * tokenized text (same privacy contract as the draft agent). Read tools return
 * tokenized section bodies; terminal tools accept tokenized prose, which the
 * server detokenizes against the report's reference set before persisting and
 * before responding to the client.
 *
 * Later phases add: read_paragraph, search_capture_artifacts, propose_rewrite,
 * propose_chips, propose_observation_ref, propose_ghost_edit. The system prompt
 * below already mentions them so the agent's mental model survives the phased
 * rollout — but only the Phase 2 tools are passed to Anthropic until they ship.
 */

export const CHAT_READ_TOOLS: Anthropic.Tool[] = [
  {
    name: "read_report_sections",
    description:
      "Return the current state of the report (title + sections + paragraphs) in tokenized form. Always call this first so your suggestions reflect the latest text. Each section has a stable `id` you can refer to in proposals.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

export const CHAT_TERMINAL_TOOLS: Anthropic.Tool[] = [
  {
    name: "propose_rewrite",
    description:
      "Propose a targeted rewrite of one paragraph. Use this when the teacher asks for an edit ('make it warmer', 'tighten this', 'add a sentence about X'). Must specify which paragraph by sectionId+paragraphId from read_report_sections, the exact existing text in oldText, and the proposed replacement in newText. The teacher will see Apply / Skip / Try another buttons.",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "object",
          properties: {
            sectionId: {
              type: "string",
              description: "The section's stable id from read_report_sections.",
            },
            paragraphId: {
              type: "string",
              description: "The paragraph's stable id within that section.",
            },
          },
          required: ["sectionId", "paragraphId"],
        },
        lead: {
          type: "string",
          description:
            "One short sentence (≤140 chars) introducing the rewrite — what you changed and why. Tokens only.",
        },
        oldText: {
          type: "string",
          description:
            "The paragraph's current text, copied verbatim from read_report_sections. Tokens preserved as-is.",
        },
        newText: {
          type: "string",
          description:
            "The proposed replacement prose. One paragraph, no bullets, no headings. Tokens only — never real names.",
        },
        rationale: {
          type: "string",
          description:
            "Optional one-line justification grounded in the report or capture (≤200 chars). Tokens only.",
        },
      },
      required: ["target", "lead", "oldText", "newText"],
    },
  },
  {
    name: "propose_prose_reply",
    description:
      "Reply to the teacher with one short paragraph of prose. Use this for factual questions, confirmations, or when no edit is needed. Body must use tokens for student / subtopic / classroom names — never real names.",
    input_schema: {
      type: "object",
      properties: {
        body: {
          type: "string",
          description:
            "One short paragraph (1–3 sentences). No bullet lists, no headings. References to students / subtopics / classrooms must be tokens like [STUDENT_1].",
        },
      },
      required: ["body"],
    },
  },
  {
    name: "ask_clarifying_question",
    description:
      "When the teacher's request is ambiguous and you'd otherwise have to guess, ask one short clarifying question instead. Use sparingly — most turns should resolve to prose or a proposal.",
    input_schema: {
      type: "object",
      properties: {
        body: {
          type: "string",
          description:
            "One short question. Use tokens for any names. Don't apologize, don't pad — just ask.",
        },
      },
      required: ["body"],
    },
  },
];

export const CHAT_TOOLS: Anthropic.Tool[] = [...CHAT_READ_TOOLS, ...CHAT_TERMINAL_TOOLS];

export const CHAT_TERMINAL_TOOL_NAMES = new Set(CHAT_TERMINAL_TOOLS.map((t) => t.name));

export const REPORT_CHAT_SYSTEM_PROMPT = `You are a Montessori teacher's editing assistant. The teacher has already drafted a report and is now talking with you about how to refine it.

Privacy rules — non-negotiable:
- Students are referred to ONLY by tokens like [STUDENT_1].
- Subtopics (curriculum materials / lessons) are referred to ONLY by tokens like [SUBTOPIC_3].
- Classrooms are referred to ONLY by tokens like [CLASSROOM_0].
- Never invent a name. Never expand a token. Never use placeholder names like "the student" or "the child".
- The server substitutes real display names before showing your reply to the teacher.

Workflow:
1. On the first turn, call read_report_sections so you can ground every suggestion in the current text. The result is tokenized — that is normal. The result includes stable section ids and paragraph ids you MUST use when proposing a rewrite.
2. Decide which terminal tool fits the teacher's request:
   - propose_rewrite: the teacher asked you to change a specific span ("make morning warmer", "tighten this", "add a sentence about her pencil grip"). Pick exactly one paragraph as the target. Copy its current text verbatim into oldText. Write the replacement in newText. Ground every concrete claim in either the existing report or what the teacher just said.
   - propose_prose_reply: factual questions, confirmations, or any reply that doesn't propose a specific edit.
   - ask_clarifying_question: the request is genuinely ambiguous (e.g. you can't tell which paragraph to edit) and a reasonable human would ask before answering.
3. Call exactly one terminal tool per turn. Do NOT produce assistant text outside a terminal tool call.

Honesty rules — STRICT:
- Do NOT invent activities, materials, behaviors, peer names, or events. Every concrete claim must be grounded in the report text or a read tool result.
- If the teacher asks you to add a fact you have no evidence for, say so plainly via propose_prose_reply ("I don't see anything in the report about her pencil grip — want me to look at the captured photos?") instead of inventing.
- "I don't have observations for that" is a valid, expected output. A short honest sentence beats a fluent paragraph of fiction.

Targeting:
- The teacher's turn may include a targetRef (e.g. "Scoped to section: Morning"). When present, scope your reply to that section unless the teacher explicitly broadens it.

Style:
- Warm, observational, specific. Sound like a Montessori teacher at pickup time — not clinical.
- One short paragraph for prose replies. No bullet lists, no headings.
- Don't restate large chunks of the report; reference it specifically.

Stop after at most 4 tool turns total per request.`;
