import { Type, type FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import { PROGRESS_STATUSES } from "@/lib/progress/marking-schemas";

/**
 * Gemini function declarations for the teacher agent, split into read tools
 * (executed server-side during a turn) and write tools (returned as proposals
 * for the teacher to confirm). Keep the descriptions concrete — Flash-Lite
 * leans on them to pick the right tool and to fill arguments from the roster.
 */

const UUID = "A UUID from the roster or a read-tool result. Never invent one.";

export const READ_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "list_curriculum",
    description:
      "List the FULL curriculum for the active classroom — every topic and its subtopics, each with an id and the topic's marking scheme. Call this once, then match the teacher's wording to the closest subtopic id(s) yourself. Prefer this over guessing a subtopic name.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "list_student_reports",
    description:
      "List a student's existing reports (draft and sent) so you can find the one to edit. Returns report ids, titles, type and status.",
    parameters: {
      type: Type.OBJECT,
      properties: { studentId: { type: Type.STRING, description: UUID } },
      required: ["studentId"],
    },
  },
  {
    name: "get_report",
    description:
      "Read one report's section headings and current text. Call this before edit_report_section so you know the exact heading to target and can incorporate existing content.",
    parameters: {
      type: Type.OBJECT,
      properties: { reportId: { type: Type.STRING, description: UUID } },
      required: ["reportId"],
    },
  },
];

export const WRITE_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "mark_attendance",
    description:
      "Mark attendance for ONE OR MORE students in a single call. Put every student the teacher mentioned in `entries`. Re-marking a student for the same date corrects the earlier mark.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        entries: {
          type: Type.ARRAY,
          description: "One entry per student.",
          items: {
            type: Type.OBJECT,
            properties: {
              studentId: { type: Type.STRING, description: UUID },
              status: { type: Type.STRING, enum: ["present", "absent"] },
              date: { type: Type.STRING, description: "YYYY-MM-DD. Defaults to today." },
              comment: {
                type: Type.STRING,
                description: "Optional short note (e.g. 'left early').",
              },
            },
            required: ["studentId", "status"],
          },
        },
      },
      required: ["entries"],
    },
  },
  {
    name: "record_progress",
    description:
      "Record progress for ONE OR MORE (student, subtopic) pairs in a single call. Put every mark the teacher asked for in `marks` — this is how you mark many students and/or subtopics at once. subtopicId must come from list_curriculum. Status is IPM (introduced, practicing, mastered), the five-level grade scale (none, minimum, satisfactory, good, excellent), or not_applicable for N/A — match the teacher's wording.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        marks: {
          type: Type.ARRAY,
          description: "One entry per (student, subtopic) pair.",
          items: {
            type: Type.OBJECT,
            properties: {
              studentId: { type: Type.STRING, description: UUID },
              subtopicId: {
                type: Type.STRING,
                description: "A subtopicId from list_curriculum.",
              },
              status: { type: Type.STRING, enum: [...PROGRESS_STATUSES] },
              comment: { type: Type.STRING, description: "Optional short note." },
            },
            required: ["studentId", "subtopicId", "status"],
          },
        },
      },
      required: ["marks"],
    },
  },
  {
    name: "add_observation",
    description:
      "Save one or more free-text observation / daily-log notes about students (e.g. 'was very focused during work cycle'). Put every note in `notes`. To give several children the same note, repeat it per student.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        notes: {
          type: Type.ARRAY,
          description: "One entry per (student, note).",
          items: {
            type: Type.OBJECT,
            properties: {
              studentId: { type: Type.STRING, description: UUID },
              text: { type: Type.STRING, description: "The observation, 1–500 characters." },
            },
            required: ["studentId", "text"],
          },
        },
      },
      required: ["notes"],
    },
  },
  {
    name: "create_daily_report",
    description:
      "Create draft daily reports for one or more students (each stays a draft for the teacher to review and send). Put every student in `studentIds`. Use when a teacher asks to start today's report / daily log for one or several children.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        studentIds: {
          type: Type.ARRAY,
          description: "One id per student.",
          items: { type: Type.STRING, description: UUID },
        },
      },
      required: ["studentIds"],
    },
  },
  {
    name: "edit_report_section",
    description:
      "Replace the text of one section of an existing draft report. Call get_report first to get the exact section heading. Only draft reports can be edited.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reportId: { type: Type.STRING, description: UUID },
        sectionHeading: {
          type: Type.STRING,
          description: "Exact heading of the section to replace, from get_report.",
        },
        text: { type: Type.STRING, description: "The new section text (plain text)." },
      },
      required: ["reportId", "sectionHeading", "text"],
    },
  },
];

/** Grade tools — offered only in elementary classrooms (gated in run.ts). */
export const GRADE_READ_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "list_grade_context",
    description:
      "For elementary exam grades: list the school's terms (with which one is current) and the subject/assessment pairs already recorded in this classroom. Call this before record_grade so you pick the right term and reuse existing subject/assessment names.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

export const GRADE_WRITE_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "record_grade",
    description:
      "Record one or more elementary exam grades. Put every grade in `grades`. Each needs the student, a termId (from list_grade_context — default to the current term), a subject and assessment name (reuse existing ones from list_grade_context where they match), a percentage (0–100), and a letter grade. This school has NO automatic percentage→letter mapping, so if the teacher gives only a percentage, ask them for the letter before calling this.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        grades: {
          type: Type.ARRAY,
          description: "One entry per grade.",
          items: {
            type: Type.OBJECT,
            properties: {
              studentId: { type: Type.STRING, description: UUID },
              termId: { type: Type.STRING, description: "A termId from list_grade_context." },
              subject: { type: Type.STRING, description: "e.g. Mathematics." },
              assessmentName: { type: Type.STRING, description: "e.g. End-of-term exam." },
              percentage: { type: Type.NUMBER, description: "0–100." },
              gradeLabel: { type: Type.STRING, description: "Letter/label, e.g. A or B+." },
            },
            required: [
              "studentId",
              "termId",
              "subject",
              "assessmentName",
              "percentage",
              "gradeLabel",
            ],
          },
        },
      },
      required: ["grades"],
    },
  },
];

// ---- Per-tool argument validation (also used when applying) ----

export const ARG_SCHEMAS = {
  mark_attendance: z.object({
    entries: z
      .array(
        z.object({
          studentId: z.string().uuid(),
          status: z.enum(["present", "absent"]),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          comment: z.string().max(500).optional(),
        })
      )
      .min(1)
      .max(1000),
  }),
  record_progress: z.object({
    marks: z
      .array(
        z.object({
          studentId: z.string().uuid(),
          subtopicId: z.string().uuid(),
          status: z.enum(PROGRESS_STATUSES),
          comment: z.string().max(500).optional(),
        })
      )
      .min(1)
      .max(1000),
  }),
  add_observation: z.object({
    notes: z
      .array(
        z.object({
          studentId: z.string().uuid(),
          text: z.string().trim().min(1).max(500),
        })
      )
      .min(1)
      .max(1000),
  }),
  create_daily_report: z.object({
    studentIds: z.array(z.string().uuid()).min(1).max(200),
  }),
  edit_report_section: z.object({
    reportId: z.string().uuid(),
    sectionHeading: z.string().min(1).max(200),
    text: z.string().trim().min(1).max(8000),
  }),
  record_grade: z.object({
    grades: z
      .array(
        z.object({
          studentId: z.string().uuid(),
          termId: z.string().uuid(),
          subject: z.string().trim().min(1).max(120),
          assessmentName: z.string().trim().min(1).max(160),
          percentage: z.number().min(0).max(100),
          gradeLabel: z.string().trim().min(1).max(80),
        })
      )
      .min(1)
      .max(1000),
  }),
} as const;

export interface TeacherAgentContext {
  todayIso: string;
  classroomName: string;
  roster: Array<{ id: string; name: string }>;
  /** Elementary classrooms unlock the exam-grade tools. */
  isElementary: boolean;
}

export function buildSystemPrompt(ctx: TeacherAgentContext): string {
  const rosterLines =
    ctx.roster.length > 0
      ? ctx.roster.map((s) => `  - ${s.name} → ${s.id}`).join("\n")
      : "  (no students enrolled)";

  const gradeLine = ctx.isElementary
    ? `- Exam grades (this IS an elementary classroom): call list_grade_context first for terms + existing subjects/assessments. Default to the current term unless the teacher names another; reuse an existing subject/assessment spelling when it matches. Every grade needs a letter (gradeLabel) — if the teacher gives only a percentage, ask for the letter before recording.\n`
    : "";

  return `You are Mitable, a warm, concise assistant for a Montessori teacher. You help the teacher keep classroom records by calling tools. You never chit-chat at length.

Today is ${ctx.todayIso}.
Active classroom: ${ctx.classroomName}.

Students in this classroom (name → studentId). Resolve any name the teacher says to one of these ids:
${rosterLines}

How to work:
- Before you write anything, load the options you'll match against: for progress call list_curriculum once (every topic + subtopic with ids); students come from the roster above; report sections from get_report. Match the teacher's words to those real options.
- Input is often voice- or photo-transcribed, so names and lesson names may be misspelled or garbled. ALWAYS map to the CLOSEST real option (a student in the roster, a subtopic from list_curriculum) instead of rejecting or inventing — that is how you fix transcription typos. Only ask a clarifying question when two options are genuinely, equally plausible.
- Batch everything into ONE call per tool covering all the teacher asked for: record_progress with every mark in \`marks\`; mark_attendance with every student in \`entries\`; add_observation with every note in \`notes\`; create_daily_report with every student in \`studentIds\`. Never call a write tool once per student — there is no limit on how many you can include in one call.
- Every write is shown to the teacher as ONE confirmation card and is applied only after they tap Confirm. Once you have the arguments, call the write tool, then say in one short sentence what you're about to record.
- Never invent an id. Resolve students from the roster above, subtopics from list_curriculum, reports from list_student_reports / get_report.
- Attendance: "here/came in/showed up" → present; "out/sick/away" → absent. Default the date to today unless the teacher says otherwise.
- Progress wording: "started/introduced" → introduced; "worked on/practiced" → practicing; "finished/mastered/got it" → mastered. A grade word (excellent/good/satisfactory/minimum/none) → the five-level scale. "doesn't apply / N/A / skip" → not_applicable.
${gradeLine}- Keep replies to one or two sentences. Do not restate the whole roster. Never show raw ids — use names.`;
}
