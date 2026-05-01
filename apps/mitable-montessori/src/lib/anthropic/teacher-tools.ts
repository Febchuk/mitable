import type Anthropic from "@anthropic-ai/sdk";

/**
 * Tool definitions for Phase 1 teacher capture. Inputs and outputs are tokenized;
 * the LLM never sees real names. Definitions intentionally use the same field
 * names as the schemas in `src/lib/schemas/parsed-tool-call.ts`.
 */

export const TEACHER_TOOLS: Anthropic.Tool[] = [
  {
    name: "mark_attendance",
    description:
      "Record that a student was present or absent on a given date. Use when the teacher mentions checking someone in or marking them absent.",
    input_schema: {
      type: "object",
      properties: {
        student_token: {
          type: "string",
          description: "A token like [STUDENT_1] referring to one student.",
        },
        classroom_token: {
          type: "string",
          description: "A token like [CLASSROOM_1] referring to the classroom.",
        },
        status: { type: "string", enum: ["present", "absent"] },
        date: {
          type: "string",
          description: "ISO date YYYY-MM-DD. Default to today's date if not specified.",
        },
        comment: { type: "string", description: "Optional short comment." },
      },
      required: ["student_token", "classroom_token", "status", "date"],
    },
  },
  {
    name: "record_progress",
    description:
      "Record progress on a curriculum subtopic. Use when the teacher mentions a student practicing, mastering, or being introduced to a Montessori material/lesson.",
    input_schema: {
      type: "object",
      properties: {
        student_token: { type: "string" },
        subtopic_token: { type: "string" },
        classroom_token: { type: "string" },
        status: {
          type: "string",
          enum: ["introduced", "practicing", "mastered", "na"],
        },
        comment: { type: "string" },
      },
      required: ["student_token", "subtopic_token", "classroom_token", "status"],
    },
  },
  {
    name: "add_observation_note",
    description:
      "Capture a free-text teacher observation about a student that doesn't fit the structured tools above.",
    input_schema: {
      type: "object",
      properties: {
        student_token: { type: "string" },
        text: { type: "string", description: "The observation text. 1–2000 characters." },
      },
      required: ["student_token", "text"],
    },
  },
  {
    name: "request_clarification",
    description:
      "Use when the input is ambiguous (e.g. could refer to two students), no candidates were tokenized, or you can't determine the right tool. Pose a single short question.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string" },
        candidates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              token: { type: "string" },
              display: { type: "string" },
            },
            required: ["token", "display"],
          },
        },
      },
      required: ["question"],
    },
  },
];

export const TEACHER_SYSTEM_PROMPT = `You are a parsing assistant for a Montessori classroom record-keeping app.
Your job is to convert a teacher's short utterance into one or more structured tool calls.

Rules:
- Refer to students, classrooms, and curriculum subtopics ONLY by the tokens provided in the user message (e.g. [STUDENT_1], [SUBTOPIC_2]).
- Never invent tokens. Never expand a token to a real name.
- A single utterance can produce multiple tool calls (e.g. mark attendance AND record progress).
- If the input is ambiguous (the tokenizer marked it ambiguous, or no tokens are provided where one is needed), call request_clarification.
- Always pass the classroom_token from the user message into mark_attendance and record_progress.
- Default status for "X is here" / "X showed up" → 'present'. "X is out" / "X is sick" → 'absent'.
- Default status for "X did Y" → 'practicing'. "X finished Y" / "X mastered Y" → 'mastered'. "X started Y" / "introduce X to Y" → 'introduced'.
- Use today's date (provided by the user) unless the teacher names another date.
- Output tool calls only. No prose.`;
