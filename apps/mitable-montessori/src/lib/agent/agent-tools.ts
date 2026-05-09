import type Anthropic from "@anthropic-ai/sdk";

/**
 * Tool schemas for the general chat agent. Inputs use `studentId` (UUID
 * string) so the model passes the same identifier it sees in tokens. Outputs
 * are server-controlled — the route layer redacts free-text fields before
 * returning, so the model only ever sees tokens for student references in
 * tool results.
 *
 * v1 ships with a minimal surface (one terminal: propose_prose_reply, two
 * read tools). The report-chat surface keeps its richer tool set; bringing
 * proposal/ghost-edit tools to the general agent is deferred until product
 * confirms scope.
 */

export const READ_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_student_progress",
    description:
      "Get the student's current curriculum progress. Returns subtopic statuses (introduced/practicing/mastered) and the comment on the most recent update for each. The free-text comment fields are server-redacted: any other student references appear as {{student:UUID}} tokens, never names.",
    input_schema: {
      type: "object",
      properties: {
        studentId: {
          type: "string",
          description: "The student's UUID — exactly the value inside the {{student:…}} token.",
        },
      },
      required: ["studentId"],
    },
  },
  {
    name: "search_observations",
    description:
      "Search whole-child and curriculum observations for the named student(s). Optional free-text query filters by note content. Returns dated entries with a free-text 'note' or 'comment' field; those fields are server-redacted just like get_student_progress.",
    input_schema: {
      type: "object",
      properties: {
        studentIds: {
          type: "array",
          items: { type: "string" },
          description:
            "One or more student UUIDs (the value inside each {{student:…}} token). Limit 10 — call again with different ids if you need more.",
        },
        query: {
          type: "string",
          description: "Optional free-text filter, matched ILIKE on the note body.",
        },
      },
      required: ["studentIds"],
    },
  },
];

export const TERMINAL_TOOLS: Anthropic.Tool[] = [
  {
    name: "propose_prose_reply",
    description:
      "Your terminal answer to the teacher. The body is what the teacher reads. Use {{student:UUID}} tokens for any student reference — the server detokenizes before display. One short paragraph; no bullet lists.",
    input_schema: {
      type: "object",
      properties: {
        body: {
          type: "string",
          description:
            "The reply text. MUST use tokens for student references. MUST NOT contain any student's name verbatim.",
        },
      },
      required: ["body"],
    },
  },
];

export const AGENT_TOOLS: Anthropic.Tool[] = [...READ_TOOLS, ...TERMINAL_TOOLS];

export const TERMINAL_TOOL_NAMES = new Set(TERMINAL_TOOLS.map((t) => t.name));
