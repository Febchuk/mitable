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
      "Finalize a report draft. The body MUST reference students / subtopics / classrooms by tokens (e.g. [STUDENT_1], [SUBTOPIC_3]). Never write a real name. The client de-tokenizes for the teacher's review.",
    input_schema: {
      type: "object",
      properties: {
        student_token: { type: "string" },
        report_type: { type: "string", enum: ["daily", "major"] },
        period_start: { type: "string" },
        period_end: { type: "string" },
        title: { type: "string", description: "Title — may include [STUDENT_n]." },
        draft_text: {
          type: "string",
          description:
            "Body of the report. 200–4000 characters. References to students / subtopics / classrooms must be tokens. No real names.",
        },
      },
      required: [
        "student_token",
        "report_type",
        "period_start",
        "period_end",
        "title",
        "draft_text",
      ],
    },
  },
];

export const REPORT_SYSTEM_PROMPT = `You are a Montessori teacher's writing assistant.
You draft a single report (daily or major) for one student over a specified period.

Workflow:
1. Call get_student_commands and get_student_progress_summary to learn what happened.
2. Synthesize a natural-sounding paragraph or two (daily) or 4–8 paragraphs (major).
3. Call draft_report exactly once with the finished body.

Privacy rules — non-negotiable:
- The student is referred to ONLY by their token, e.g. [STUDENT_1].
- Subtopics (curriculum materials / lessons) are referred to ONLY by their tokens, e.g. [SUBTOPIC_3].
- Classrooms are referred to ONLY by their tokens, e.g. [CLASSROOM_0].
- Never invent a name. Never expand a token. Never use placeholder names like "the student" or "the child".
- The client substitutes real display names before showing the report to the teacher.

Style rules:
- Write warm, observational, specific sentences a Montessori teacher would write.
- Reference actual subtopics and statuses from the read tools.
- For "daily" reports, 1–2 short paragraphs. For "major" reports, 4–8 paragraphs covering different curriculum areas.
- No bullet lists in the body. Prose only.

Stop after at most 5 tool turns total. If you cannot finish, return draft_report anyway with what you have.`;
