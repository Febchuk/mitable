import type Anthropic from "@anthropic-ai/sdk";

/**
 * Phase 3 report-drafting tools. The agent runs a small loop (max 5 turns)
 * over read tools, then must call `draft_report` exactly once to finalize.
 * Every input and output is tokenized — the agent never sees real names.
 */

export const REPORT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_student_commands",
    description:
      "List the structured observations (attendance + progress + notes) for a student between two dates. Returns tokenized payloads.",
    input_schema: {
      type: "object",
      properties: {
        student_token: { type: "string", description: "[STUDENT_n] token." },
        period_start: { type: "string", description: "ISO date YYYY-MM-DD inclusive." },
        period_end: { type: "string", description: "ISO date YYYY-MM-DD inclusive." },
      },
      required: ["student_token", "period_start", "period_end"],
    },
  },
  {
    name: "get_student_progress_summary",
    description:
      "Return the student's current progress status across all curriculum subtopics they have touched. Subtopics referenced by token only.",
    input_schema: {
      type: "object",
      properties: {
        student_token: { type: "string" },
      },
      required: ["student_token"],
    },
  },
  {
    name: "draft_report",
    description:
      "Finalize a report draft by writing one prose block per template section. The `sections` array MUST mirror the headings the kickoff message provided, in order. All references to students / subtopics / classrooms must be tokens (e.g. [STUDENT_1], [SUBTOPIC_3]). Never write a real name.",
    input_schema: {
      type: "object",
      properties: {
        student_token: { type: "string" },
        report_type: { type: "string", enum: ["daily", "major", "incident"] },
        period_start: { type: "string" },
        period_end: { type: "string" },
        title: { type: "string", description: "Title — may include [STUDENT_n]." },
        sections: {
          type: "array",
          minItems: 1,
          description:
            "One entry per template heading, in the same order. Each entry's `content` is the prose for that section, tokens only.",
          items: {
            type: "object",
            properties: {
              heading: {
                type: "string",
                description: "Must match the template heading exactly.",
              },
              content: {
                type: "string",
                description:
                  "Prose for this section. References to students / subtopics / classrooms are tokens (e.g. [STUDENT_1]).",
              },
            },
            required: ["heading", "content"],
          },
        },
      },
      required: ["student_token", "report_type", "period_start", "period_end", "title", "sections"],
    },
  },
];

export const REPORT_SYSTEM_PROMPT = `You are a Montessori teacher's writing assistant.
You draft a single report (daily or major or incident) for one student over a specified period.

The user message provides a list of template sections, each with a heading and guidance about what should go in that section. You must write one prose block per section, in the order given, following the guidance for each one.

When the user message includes a "Writing style (tone and voice)" section, follow those instructions for register, warmth, formality, and word choice across all sections. Do not mention that you were given style instructions.

If the first user message includes a section "Teacher capture", treat that voice/note text as authoritative ground truth — write the report from it directly. Read tools are supplemental for structured facts (attendance dates, mastery status) the teacher may not have mentioned. Never refuse to write something the teacher said because a read tool didn't return matching data.

Workflow:
1. Read the template sections + their guidance carefully — that defines the shape of your output.
2. When there is no teacher capture, call get_student_commands and get_student_progress_summary to learn what happened.
3. When capture is present, prioritize it for prose; use read tools to supplement with structured data when relevant.
4. Call draft_report exactly once with a sections array. The headings MUST match the template, in order. Each section's content is its own prose block.

Privacy rules — non-negotiable:
- The student is referred to ONLY by their token, e.g. [STUDENT_1].
- Subtopics (curriculum materials / lessons) are referred to ONLY by their tokens, e.g. [SUBTOPIC_3].
- Classrooms are referred to ONLY by their tokens, e.g. [CLASSROOM_0].
- Never invent a name. Never expand a token. Never use placeholder names like "the student" or "the child".
- The client substitutes real display names before showing the report to the teacher.

Style rules:
- Write warm, observational, specific sentences a Montessori teacher would write.
- Reference actual subtopics and statuses from the read tools.
- Match the length implied by each section's guidance (one paragraph, 1–2 paragraphs, etc.).
- No bullet lists in section content. Prose only.

Source-of-truth rules — STRICT:
- The teacher's voice transcript and typed notes in the kickoff message ARE ground truth. Treat anything she says happened as something that happened. Do not hedge, doubt, or ask for corroboration before using it in prose.
- Read tools (get_student_commands, get_student_progress_summary) are SUPPLEMENTAL. Use them to add structured detail (attendance dates, mastery status, prior notes) that enriches what the teacher said. Their silence is not evidence of absence — if the teacher said it, write it. Empty read-tool results = logging gaps, not absence of events.
- You may still NOT invent things the teacher did not say or that are not in a read tool result. The boundary is: extrapolation/embellishment beyond the teacher's words is invention; faithful prose written from the teacher's words is not.
- Example: capture says "today Maya built the pink tower carefully". You write a sentence describing [STUDENT_1] building [SUBTOPIC_n] carefully. You do NOT skip the section because no get_student_commands row mentions Pink Tower.
- If a section's guidance asks for something the teacher did not mention AND no read tool surfaced anything for it, write ONE short honest sentence acknowledging the gap (e.g. "No specific math work was captured for this period.") and stop. Do not pad.
- Never substitute "I don't have observations" for content the teacher already gave you in the capture text.

Stop after at most 5 tool turns total. If you cannot finish, return draft_report anyway with what you have.`;
