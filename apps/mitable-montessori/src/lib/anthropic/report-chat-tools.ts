import type Anthropic from "@anthropic-ai/sdk";

export type ChatSectionRole = "progress_grid" | "topic_comments" | "text";

/**
 * Phase 4 tool surface for the report-editing chat agent. The agent sees only
 * tokenized text (same privacy contract as the draft agent). Read tools return
 * tokenized payloads; terminal tools accept tokenized prose, which the server
 * detokenizes against the report's reference set before persisting and before
 * responding to the client.
 *
 * Read tools:
 *   - read_report_sections: title + sections + paragraphs, tokenized.
 *   - search_capture_artifacts: free-text search over the report's stored
 *     photos / OCR notes. Each match returns artifactId + ocrText + when + area.
 *
 * Terminal tools (one or more terminal calls per assistant message — no free-form text):
 *   - propose_rewrite: structured paragraph rewrite (Apply/Skip/Try another).
 *   - propose_chips: clarifying question + 2–4 quick-reply chips.
 *   - propose_observation_ref: surface a captured artifact the report doesn't
 *     mention yet, with an optional suggested insertion point.
 *   - propose_ghost_edit: write a suggestion into a section's ghostEdit slot.
 *     Renders inline in the report pane (Accept/Reject/Edit-first), not in chat.
 *   - propose_prose_reply: plain prose reply.
 *   - ask_clarifying_question: short clarifying question (use sparingly).
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
  {
    name: "search_capture_artifacts",
    description:
      "Search the photos / OCR notes the teacher has attached to this report's chat thread. Use when the teacher mentions wanting to incorporate captured material, or when you suspect there's an observation that fills a gap in the report. Returns matches with artifactId, ocrText, capturedAt, and optional area.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Free-text query (e.g. 'sandpaper letter S', 'pencil grip'). Empty string returns the most recent artifacts.",
        },
        limit: {
          type: "integer",
          description: "Max results (default 5, max 20).",
        },
      },
      required: ["query"],
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
    name: "propose_chips",
    description:
      "Reply with a short clarifying question PLUS 2–4 quick-reply chips. Use when the teacher's request has a small set of plausible interpretations and you want them to pick one cheaply. Each chip's `prefill` is what the composer fills in when the teacher clicks — so write it as something they'd actually want to send.",
    input_schema: {
      type: "object",
      properties: {
        body: {
          type: "string",
          description: "Short clarifying sentence introducing the chips (≤200 chars). Tokens only.",
        },
        chips: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "Short button text (≤40 chars). Tokens only.",
              },
              prefill: {
                type: "string",
                description:
                  "What gets put into the composer when the teacher taps this chip. Tokens only.",
              },
            },
            required: ["label", "prefill"],
          },
        },
      },
      required: ["body", "chips"],
    },
  },
  {
    name: "propose_observation_ref",
    description:
      "Surface a captured photo or OCR'd note the teacher hasn't referenced yet. Use after search_capture_artifacts returns a match that fills a gap in the report. The teacher sees a thumbnail + quote + 'Pull in' button that inserts a paragraph into the suggested section.",
    input_schema: {
      type: "object",
      properties: {
        body: {
          type: "string",
          description: "One short sentence introducing the observation (≤200 chars). Tokens only.",
        },
        obs: {
          type: "object",
          properties: {
            artifactId: {
              type: "string",
              description: "The artifact id from search_capture_artifacts.",
            },
            quote: {
              type: "string",
              description: "Short quote from the OCR'd text (≤300 chars). Tokens only.",
            },
            when: {
              type: "string",
              description: "Display string for capturedAt (e.g. '10:14 AM').",
            },
            area: {
              type: "string",
              description: "Optional area label (e.g. 'Language area').",
            },
          },
          required: ["artifactId", "quote", "when"],
        },
        suggestedTarget: {
          type: "object",
          description:
            "Optional suggested insertion point. If omitted, Pull in appends to the most fitting section.",
          properties: {
            sectionId: { type: "string" },
            position: { type: "string", enum: ["append", "after", "new-paragraph"] },
          },
        },
      },
      required: ["body", "obs"],
    },
  },
  {
    name: "propose_ghost_edit",
    description:
      "Write an inline suggestion that lands BELOW a section in the report pane (not in the chat). Use for additive suggestions the teacher might want next to the section — e.g. 'add a sentence here about her pencil grip'. Call this tool once per section when a long dictation covers multiple areas. The teacher sees Accept / Reject / Edit-first buttons in the report itself.",
    input_schema: {
      type: "object",
      properties: {
        body: {
          type: "string",
          description:
            "Short confirmation sentence shown in the chat (≤200 chars), e.g. 'I added a suggestion below the Morning section.' Tokens only.",
        },
        target: {
          type: "object",
          properties: {
            sectionId: {
              type: "string",
              description: "The section to attach the ghost suggestion to.",
            },
          },
          required: ["sectionId"],
        },
        ghostEdit: {
          type: "object",
          properties: {
            html: {
              type: "string",
              description:
                "Suggested addition as plain text or simple HTML. One paragraph. Tokens only.",
            },
            sourceLabel: {
              type: "string",
              description:
                "Where the suggestion came from (e.g. '10:14 AM photo', 'your last note'). Tokens only.",
            },
          },
          required: ["html", "sourceLabel"],
        },
      },
      required: ["body", "target", "ghostEdit"],
    },
  },
  {
    name: "propose_new_section",
    description:
      "Add a NEW section to the report — a heading plus one or more paragraphs of initial content. Use this when the teacher asks to add a section (e.g. 'add a section for outdoor', 'we need a math section'), or when the teacher's content clearly belongs in a section that doesn't yet exist. The new section is auto-applied to the report when the proposal arrives; the chat shows a short confirmation. Tokens only — never real names.",
    input_schema: {
      type: "object",
      properties: {
        body: {
          type: "string",
          description:
            "Short confirmation sentence shown in the chat (≤200 chars), e.g. 'I added an Outdoor section with the morning observation.' Tokens only.",
        },
        heading: {
          type: "string",
          description:
            "The section heading (≤60 chars). Plain text, no tokens needed (headings are usually generic like 'Outdoor', 'Math', 'Practical life').",
        },
        paragraphs: {
          type: "array",
          description:
            "Initial paragraphs for the new section. At least one. Each paragraph is a single block of prose (no bullets, no nested headings). Tokens only — never real names.",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "string",
          },
        },
        afterSectionId: {
          type: "string",
          description:
            "Optional. The new section is inserted directly after this existing section. If omitted, the new section is appended to the end of the report.",
        },
      },
      required: ["body", "heading", "paragraphs"],
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
      "When the teacher's request is ambiguous and you'd otherwise have to guess, ask one short clarifying question instead. Prefer propose_chips when there's a small set of plausible answers — chips are cheaper for the teacher than typing.",
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
1. On the first turn, call read_report_sections so you can ground every suggestion in the current text. The result is tokenized — that is normal. Each section has a stable id and each paragraph has a stable id you MUST use when proposing a rewrite or ghost-edit.
2. If the teacher mentions captured photos / notes, OR if you suspect there's an observation that fills a gap, call search_capture_artifacts before proposing.
3. Decide which terminal tool fits the teacher's request:
   - propose_rewrite: a specific paragraph needs new wording.
   - propose_ghost_edit: an additive suggestion that should sit BELOW an EXISTING section.
   - propose_new_section: the teacher wants a brand-new section (e.g. "add a section for outdoor", "we need a math section"), OR the content the teacher narrated clearly belongs in a section that does not exist in read_report_sections. Provide a heading and at least one initial paragraph.
   - propose_observation_ref: a captured artifact would fill a gap in the report.
   - propose_chips: short ambiguity with 2–4 plausible answers — let the teacher pick cheaply.
   - propose_prose_reply: factual questions, confirmations, or any reply without an edit.
   - ask_clarifying_question: genuine ambiguity that doesn't fit a small chip set.
4. If the teacher's request implies edits to multiple paragraphs or sections, call the appropriate terminal tool ONCE PER EDIT in the same assistant message — e.g. two propose_rewrite calls when paragraphs 1 and 2 both need rewording, or several propose_ghost_edit calls when she narrated additions for Morning, Language, and Math in one turn. Each tool call still targets a single paragraph or section. Do NOT bundle multiple paragraphs into one tool call.
5. Long voice dictation: the teacher may paste a long transcript (minutes of speech, merged from chunked capture). Read the entire message, map each distinct observation to the matching section from read_report_sections, then emit one propose_ghost_edit (or propose_rewrite when replacing existing paragraph text) per section that needs content — all in the same terminal response after read_report_sections. Do not stop after the first section when later sentences clearly belong elsewhere.
6. Do NOT produce assistant text outside a terminal tool call.

Source-of-truth rules — STRICT:
- The teacher's chat message IS ground truth. When she says "she worked on the pink tower today" or "add that he had a tough drop-off", treat it as something that happened and incorporate it directly via propose_rewrite or propose_ghost_edit. Do not ask "are you sure?" or "I don't see that in the report" before applying.
- Read/search tools (read_report_sections, search_capture_artifacts) are SUPPLEMENTAL. Use them to ground existing report text or to surface artifacts the teacher might want — never to gatekeep teacher-asserted facts.
- The boundary on invention is unchanged: do not extrapolate beyond what the teacher said or what tools returned. But "the teacher just told me X" is itself sufficient evidence for X.
- search_capture_artifacts is a discovery aid, not a verification step. If the teacher tells you to add something, add it. You may also mention "I also found a photo from Tuesday that fits here" — but the addition does not depend on finding one.
- Example: teacher says "add that he had a tough drop-off this morning". You call propose_ghost_edit (or propose_rewrite) with prose describing the tough drop-off. You do NOT call propose_prose_reply with "I don't see drop-off mentioned — are you sure?".
- "I don't have observations for that" is appropriate ONLY when the teacher is asking you to fill a gap she did not narrate (e.g. "what did he do in math?" with no math content in capture or read tools). It is NOT appropriate when she is asserting a fact.

Targeting:
- The teacher's turn may include a targetRef (e.g. "Scoped to section: Morning"). When present, scope your reply to that section unless the teacher explicitly broadens it.

Style:
- Warm, observational, specific. Sound like a Montessori teacher at pickup time — not clinical.
- One short paragraph for prose replies. No bullet lists, no headings.
- Don't restate large chunks of the report; reference it specifically.

Stop after at most 4 tool turns total per request.`;

export const REPORT_CHAT_DEFAULT_CLASSROOM_SUPPLEMENT = `Default classroom report (curriculum progress template):
- read_report_sections may tag sections with sectionRole. progress_grid sections are I/P/M grids synced from progress history — LOCKED. Never call propose_rewrite or propose_ghost_edit on those paragraphs.
- topic_comments sections (paired comment prose for a curriculum topic) are the editable areas for teacher voice and edits about that subject and its lessons/materials. Target them with propose_ghost_edit (additive) or propose_rewrite (replace existing comment text).
- Map each voice-dictated observation to the Comments section for the matching topic when the speech mentions that subject area or specific materials within it.
- If the teacher narrates content for a curriculum area with NO matching section yet, call propose_new_section to add the missing topic section(s), mirroring the existing pattern (topic progress section + "{Topic} — Comments" prose section when both are needed), then propose_ghost_edit on the new Comments paragraph with the narrated prose.
- Do not invent or edit progress-grid marks — only comment prose from what the teacher said.`;

export function buildReportChatSystemPrompt(opts?: { defaultClassroomReport?: boolean }): string {
  if (!opts?.defaultClassroomReport) return REPORT_CHAT_SYSTEM_PROMPT;
  return `${REPORT_CHAT_SYSTEM_PROMPT}\n\n${REPORT_CHAT_DEFAULT_CLASSROOM_SUPPLEMENT}`;
}
