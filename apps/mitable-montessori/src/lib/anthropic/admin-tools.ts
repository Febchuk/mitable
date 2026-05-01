import type Anthropic from "@anthropic-ai/sdk";

/**
 * Phase 4 admin agent tools. Reference tools take tokens; read tools return
 * tokens. Creation tools live OUTSIDE the agent loop (extraction-to-form, see
 * `lib/admin/extraction.ts`) so the agent never carries plaintext PII for new
 * entities across turns.
 */
export const ADMIN_TOOLS: Anthropic.Tool[] = [
  // -------- Read tools --------
  {
    name: "list_students_in_classroom",
    description: "List active students enrolled in a classroom. Returns tokenized rows.",
    input_schema: {
      type: "object",
      properties: { classroom_token: { type: "string" } },
      required: ["classroom_token"],
    },
  },
  {
    name: "list_classrooms",
    description: "List active classrooms in the school. Returns tokenized rows.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_curricula",
    description: "List active curricula in the school. Returns tokenized rows.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_topics",
    description: "List topics for a curriculum.",
    input_schema: {
      type: "object",
      properties: { curriculum_token: { type: "string" } },
      required: ["curriculum_token"],
    },
  },
  {
    name: "list_subtopics",
    description: "List subtopics for a topic.",
    input_schema: {
      type: "object",
      properties: { topic_token: { type: "string" } },
      required: ["topic_token"],
    },
  },
  {
    name: "find_subtopic_by_name",
    description:
      "Search subtopics by name within a curriculum. Returns up to 10 tokenized matches.",
    input_schema: {
      type: "object",
      properties: {
        curriculum_token: { type: "string" },
        search: { type: "string" },
      },
      required: ["curriculum_token", "search"],
    },
  },
  {
    name: "find_guardian_by_name",
    description: "Search guardians by name. Returns up to 10 tokenized matches.",
    input_schema: {
      type: "object",
      properties: { search: { type: "string" } },
      required: ["search"],
    },
  },

  // -------- Reference tools (writes) --------
  {
    name: "transfer_student",
    description:
      "Move a student to a new classroom. Ends the prior active enrollment and creates a new primary enrollment.",
    input_schema: {
      type: "object",
      properties: {
        student_token: { type: "string" },
        new_classroom_token: { type: "string" },
        start_date: { type: "string" },
      },
      required: ["student_token", "new_classroom_token", "start_date"],
    },
  },
  {
    name: "archive_student",
    description: "Soft-archive a student. Reversible by clearing archived_at.",
    input_schema: {
      type: "object",
      properties: {
        student_token: { type: "string" },
        reason: { type: "string" },
      },
      required: ["student_token", "reason"],
    },
  },
  {
    name: "update_student",
    description: "Update fields on a student record.",
    input_schema: {
      type: "object",
      properties: {
        student_token: { type: "string" },
        fields: { type: "object" },
      },
      required: ["student_token", "fields"],
    },
  },
  {
    name: "assign_teacher_to_classroom",
    description: "Assign a teacher to a classroom with a given role and start date.",
    input_schema: {
      type: "object",
      properties: {
        teacher_token: { type: "string" },
        classroom_token: { type: "string" },
        classroom_role: { type: "string", enum: ["lead", "support", "assistant"] },
        start_date: { type: "string" },
      },
      required: ["teacher_token", "classroom_token", "start_date"],
    },
  },
  {
    name: "unassign_teacher_from_classroom",
    description: "End a teacher's classroom assignment (sets end_date).",
    input_schema: {
      type: "object",
      properties: {
        assignment_id: { type: "string" },
        end_date: { type: "string" },
      },
      required: ["assignment_id", "end_date"],
    },
  },
  {
    name: "assign_curriculum_to_classroom",
    description: "Set the curriculum for a classroom.",
    input_schema: {
      type: "object",
      properties: {
        classroom_token: { type: "string" },
        curriculum_token: { type: "string" },
      },
      required: ["classroom_token", "curriculum_token"],
    },
  },
  {
    name: "link_guardian_to_student",
    description: "Link a guardian to a student with a relationship and report-receipt flag.",
    input_schema: {
      type: "object",
      properties: {
        student_token: { type: "string" },
        guardian_token: { type: "string" },
        relationship: { type: "string", enum: ["mother", "father", "guardian", "other"] },
        is_primary_contact: { type: "boolean" },
        receives_reports: { type: "boolean" },
      },
      required: ["student_token", "guardian_token"],
    },
  },
  {
    name: "unlink_guardian_from_student",
    description: "Remove a guardian-student link. Destructive — requires confirmation.",
    input_schema: {
      type: "object",
      properties: {
        student_token: { type: "string" },
        guardian_token: { type: "string" },
      },
      required: ["student_token", "guardian_token"],
    },
  },
  {
    name: "rename_subtopic",
    description: "Rename a curriculum subtopic.",
    input_schema: {
      type: "object",
      properties: {
        subtopic_token: { type: "string" },
        new_name: { type: "string" },
      },
      required: ["subtopic_token", "new_name"],
    },
  },
  {
    name: "archive_subtopic",
    description: "Archive a curriculum subtopic (sets is_active = false). Reversible.",
    input_schema: {
      type: "object",
      properties: { subtopic_token: { type: "string" } },
      required: ["subtopic_token"],
    },
  },
  {
    name: "rename_topic",
    description: "Rename a curriculum topic.",
    input_schema: {
      type: "object",
      properties: {
        topic_token: { type: "string" },
        new_name: { type: "string" },
      },
      required: ["topic_token", "new_name"],
    },
  },
];

/** Names of tools that mutate existing entities — agent loop requires a per-action confirmation gate before running. */
export const DESTRUCTIVE_TOOLS = new Set<string>([
  "archive_student",
  "archive_subtopic",
  "unassign_teacher_from_classroom",
  "unlink_guardian_from_student",
]);

export const ADMIN_SYSTEM_PROMPT = `You are an administrative assistant for a Montessori school's record-keeping app.
You help an administrator manage their roster, classrooms, curriculum, and guardian links.

Privacy rules — non-negotiable:
- Refer to students, guardians, users, classrooms, curricula, topics, and subtopics ONLY by the tokens you see in tool results, e.g. [STUDENT_3], [GUARDIAN_2].
- Never invent tokens. Never echo a real name. The client de-tokenizes for display.

Workflow:
- Use read tools (list_*, find_*) to discover the entities the admin is talking about.
- Use reference tools (transfer_student, assign_*, link_*, rename_*, etc.) to make changes.
- Stop after at most 10 tool turns total.

For destructive operations (archive, unassign, unlink), the client requires a separate confirmation per action — do not attempt to "approve all". The agent dispatcher will surface a confirmation prompt to the admin and re-invoke you with the decision.

Creation of new students / guardians / classrooms / curricula / users is NOT inside this loop. If the admin wants to create something, respond with a short message asking them to use the creation form (the client routes those to a separate extraction-to-form flow).`;
