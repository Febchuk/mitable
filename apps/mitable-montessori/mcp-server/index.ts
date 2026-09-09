import { FastMCP } from "@prefecthq/fastmcp-ts/server";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const DEFAULT_API_BASE_URL = "https://www.mitable.ng/api/public/v1";
const UUID = z.string().uuid();
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const server = new FastMCP({ name: "mitable-montessori", version: "0.1.0" });

/** Calls the school-scoped external API without exposing its key to the model. */
async function callApi(method: string, path: string, body?: unknown): Promise<string> {
  const apiKey = process.env.MITABLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MITABLE_API_KEY is not set. Create an external API key in Admin → API Keys and add it to the MCP server environment."
    );
  }

  const baseUrl = (process.env.MITABLE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    throw new Error(
      `Could not reach the Mitable API at ${baseUrl}: ${error instanceof Error ? error.message : "unknown network error"}`
    );
  }

  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    // Preserve a non-JSON error body to help diagnose a proxy or server failure.
  }
  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String(payload.error)
        : text || response.statusText;
    throw new Error(`Mitable API ${method} ${path} failed (${response.status}): ${detail}`);
  }
  return JSON.stringify(payload, null, 2);
}

function registerTool(
  name: string,
  description: string,
  parameters: z.ZodTypeAny,
  execute: (args: Record<string, unknown>) => Promise<string>,
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
) {
  server.tool(
    {
      name,
      description,
      input: parameters,
      inputSchema: zodToJsonSchema(parameters, { $refStrategy: "none" }) as Record<string, unknown>,
      annotations,
    },
    execute
  );
}

// Identity and people. Resolve a requester first before a workflow makes a write.
registerTool(
  "lookup_directory_by_email",
  "Resolve an exact email to active staff (including role) and/or guardian records in this school. Use this first to identify the requester before performing a write.",
  z.object({ email: z.string().email().describe("Requester email address") }),
  ({ email }) => callApi("GET", `/directory?email=${encodeURIComponent(String(email))}`),
  { readOnlyHint: true }
);
registerTool(
  "list_teachers",
  "List active teachers and their current classroom assignments.",
  z.object({}),
  () => callApi("GET", "/teachers"),
  { readOnlyHint: true }
);
registerTool(
  "list_guardians",
  "List guardian contacts, optionally for one exact email address. Includes parent-account activation status.",
  z.object({ email: z.string().email().optional() }),
  ({ email }) =>
    callApi("GET", email ? `/guardians?email=${encodeURIComponent(String(email))}` : "/guardians"),
  { readOnlyHint: true }
);
registerTool(
  "create_guardian",
  "Create a guardian contact. This does not send an invitation or create a parent sign-in account.",
  z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(50).nullable().optional(),
    preferredContactMethod: z.enum(["email", "phone", "either"]).optional(),
  }),
  (args) => callApi("POST", "/guardians", args)
);
registerTool(
  "get_guardian",
  "Get one guardian contact and parent-account status.",
  z.object({ guardianId: UUID }),
  ({ guardianId }) => callApi("GET", `/guardians/${guardianId}`),
  { readOnlyHint: true }
);
registerTool(
  "update_guardian",
  "Update a guardian's name, phone, or contact preference. Email cannot be changed through this API.",
  z
    .object({
      guardianId: UUID,
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().min(1).max(100).optional(),
      phone: z.string().max(50).nullable().optional(),
      preferredContactMethod: z.enum(["email", "phone", "either"]).optional(),
    })
    .refine(
      ({ guardianId: _guardianId, ...changes }) =>
        Object.values(changes).some((value) => value !== undefined),
      "Provide at least one field to update"
    ),
  ({ guardianId, ...changes }) => callApi("PATCH", `/guardians/${guardianId}`, changes)
);
registerTool(
  "list_guardian_students",
  "List a guardian's active children, including relationship and report-delivery settings.",
  z.object({ guardianId: UUID }),
  ({ guardianId }) => callApi("GET", `/guardians/${guardianId}/students`),
  { readOnlyHint: true }
);

// Classrooms and teacher assignments.
const programTypes = z
  .array(z.enum(["montessori", "iep", "speech"]))
  .min(1)
  .max(3);
registerTool(
  "list_classrooms",
  "List active classrooms in the school.",
  z.object({}),
  () => callApi("GET", "/classrooms"),
  { readOnlyHint: true }
);
registerTool(
  "create_classroom",
  "Create an active classroom. Supply enabled program types when they differ from Montessori only.",
  z.object({
    name: z.string().min(1).max(200),
    code: z.string().max(20).nullable().optional(),
    curriculumId: UUID.nullable().optional(),
    programTypes: programTypes.optional(),
  }),
  (args) => callApi("POST", "/classrooms", args)
);
registerTool(
  "get_classroom",
  "Get one active classroom.",
  z.object({ classroomId: UUID }),
  ({ classroomId }) => callApi("GET", `/classrooms/${classroomId}`),
  { readOnlyHint: true }
);
registerTool(
  "update_classroom",
  "Change a classroom's name, code, curriculum, or enabled programs.",
  z
    .object({
      classroomId: UUID,
      name: z.string().min(1).max(200).optional(),
      code: z.string().max(20).nullable().optional(),
      curriculumId: UUID.nullable().optional(),
      programTypes: programTypes.optional(),
    })
    .refine(
      ({ classroomId: _classroomId, ...changes }) =>
        Object.values(changes).some((value) => value !== undefined),
      "Provide at least one field to update"
    ),
  ({ classroomId, ...changes }) => callApi("PATCH", `/classrooms/${classroomId}`, changes)
);
registerTool(
  "list_classroom_teachers",
  "List current teacher assignments for a classroom.",
  z.object({ classroomId: UUID }),
  ({ classroomId }) => callApi("GET", `/classrooms/${classroomId}/teachers`),
  { readOnlyHint: true }
);
registerTool(
  "assign_teacher_to_classroom",
  "Assign an existing teacher to a classroom. Assigning a lead automatically changes the previous lead to support.",
  z.object({
    classroomId: UUID,
    teacherId: UUID,
    role: z.enum(["lead", "support", "assistant"]).optional(),
    startDate: DATE.optional(),
  }),
  ({ classroomId, ...assignment }) =>
    callApi("POST", `/classrooms/${classroomId}/teachers`, assignment)
);
registerTool(
  "end_teacher_classroom_assignment",
  "End a teacher's current classroom assignment on a specific date. This preserves assignment history.",
  z.object({ classroomId: UUID, assignmentId: UUID, endDate: DATE }),
  ({ classroomId, ...assignment }) =>
    callApi("DELETE", `/classrooms/${classroomId}/teachers`, assignment),
  { destructiveHint: true }
);

// Students, enrollment, and family relationships.
registerTool(
  "list_students",
  "List active students, optionally limited to a classroom. Results include enrollment history.",
  z.object({ classroomId: UUID.optional() }),
  ({ classroomId }) =>
    callApi("GET", classroomId ? `/students?classroomId=${classroomId}` : "/students"),
  { readOnlyHint: true }
);
registerTool(
  "create_student",
  "Create a child profile. Set classroomId to create the student's initial primary enrollment.",
  z.object({
    firstName: z.string().min(1).max(120),
    lastName: z.string().min(1).max(120),
    preferredName: z.string().min(1).max(120).nullable().optional(),
    birthDate: DATE.nullable().optional(),
    nicknames: z.array(z.string().min(1).max(120)).max(20).optional(),
    notes: z.string().max(5000).nullable().optional(),
    classroomId: UUID.nullable().optional(),
    enrollmentStartDate: DATE.optional(),
  }),
  (args) => callApi("POST", "/students", args)
);
registerTool(
  "get_student",
  "Get one active student and enrollment history.",
  z.object({ studentId: UUID }),
  ({ studentId }) => callApi("GET", `/students/${studentId}`),
  { readOnlyHint: true }
);
registerTool(
  "update_student",
  "Correct a student's name, preferred name, birth date, nicknames, or notes. It does not change enrollment.",
  z
    .object({
      studentId: UUID,
      firstName: z.string().min(1).max(120).optional(),
      lastName: z.string().min(1).max(120).optional(),
      preferredName: z.string().min(1).max(120).nullable().optional(),
      birthDate: DATE.nullable().optional(),
      nicknames: z.array(z.string().min(1).max(120)).max(20).optional(),
      notes: z.string().max(5000).nullable().optional(),
    })
    .refine(
      ({ studentId: _studentId, ...changes }) =>
        Object.values(changes).some((value) => value !== undefined),
      "Provide at least one field to update"
    ),
  ({ studentId, ...changes }) => callApi("PATCH", `/students/${studentId}`, changes)
);
registerTool(
  "archive_student",
  "Archive a student. This is reversible in the Mitable app, but removes the child from active API lists.",
  z.object({ studentId: UUID }),
  ({ studentId }) => callApi("DELETE", `/students/${studentId}`),
  { destructiveHint: true }
);
registerTool(
  "transfer_student",
  "Move a student to another classroom on a date while preserving enrollment history. This ends current enrollments and starts a new primary enrollment atomically.",
  z.object({ studentId: UUID, classroomId: UUID, startDate: DATE }),
  ({ studentId, ...transfer }) => callApi("POST", `/students/${studentId}/transfer`, transfer)
);
registerTool(
  "list_student_guardians",
  "List guardian relationships for a student.",
  z.object({ studentId: UUID }),
  ({ studentId }) => callApi("GET", `/students/${studentId}/guardians`),
  { readOnlyHint: true }
);
const guardianLink = z.object({
  guardianId: UUID,
  relationship: z.enum(["mother", "father", "guardian", "other"]).optional(),
  isPrimaryContact: z.boolean().optional(),
  receivesReports: z.boolean().optional(),
});
registerTool(
  "link_guardian_to_student",
  "Link an existing guardian to a student and optionally set relationship, primary-contact, and report-delivery flags.",
  z.object({ studentId: UUID }).merge(guardianLink),
  ({ studentId, ...link }) => callApi("POST", `/students/${studentId}/guardians`, link)
);
registerTool(
  "update_student_guardian_link",
  "Update a student's existing relationship with a guardian, including contact and report-delivery flags.",
  z.object({ studentId: UUID }).merge(guardianLink),
  ({ studentId, ...link }) => callApi("PATCH", `/students/${studentId}/guardians`, link)
);
registerTool(
  "unlink_guardian_from_student",
  "Remove only the guardian–student link; neither the guardian nor student record is deleted.",
  z.object({ studentId: UUID, guardianId: UUID }),
  ({ studentId, guardianId }) =>
    callApi("DELETE", `/students/${studentId}/guardians?guardianId=${guardianId}`),
  { destructiveHint: true }
);

// Teacher day-to-day records.
registerTool(
  "list_attendance",
  "Read attendance records, optionally filtered by date and/or classroom.",
  z.object({ date: DATE.optional(), classroomId: UUID.optional() }),
  ({ date, classroomId }) => {
    const query = new URLSearchParams();
    if (date) query.set("date", String(date));
    if (classroomId) query.set("classroomId", String(classroomId));
    return callApi("GET", `/attendance${query.size ? `?${query}` : ""}`);
  },
  { readOnlyHint: true }
);
registerTool(
  "record_attendance",
  "Create or correct one student's attendance. Calling again for the same student and date updates the existing mark.",
  z.object({
    studentId: UUID,
    classroomId: UUID,
    date: DATE,
    status: z.enum(["present", "absent"]),
    comment: z.string().max(2000).nullable().optional(),
  }),
  (args) => callApi("POST", "/attendance", args)
);
registerTool(
  "list_reports",
  "List report records, optionally for one student.",
  z.object({ studentId: UUID.optional() }),
  ({ studentId }) => callApi("GET", studentId ? `/reports?studentId=${studentId}` : "/reports"),
  { readOnlyHint: true }
);
registerTool(
  "create_report_draft",
  "Create a draft daily or major report. It remains a draft so the app's review and sending process cannot be bypassed.",
  z.object({
    studentId: UUID,
    classroomId: UUID,
    type: z.enum(["daily", "major"]),
    title: z.string().min(1).max(200),
    body: z.string().max(20_000).nullable().optional(),
    reportDate: DATE.optional(),
    periodStart: DATE.nullable().optional(),
    periodEnd: DATE.nullable().optional(),
  }),
  (args) => callApi("POST", "/reports", args)
);
registerTool(
  "get_report",
  "Get one report including its body.",
  z.object({ reportId: UUID }),
  ({ reportId }) => callApi("GET", `/reports/${reportId}`),
  { readOnlyHint: true }
);
registerTool(
  "update_report_draft",
  "Edit a draft report's title, body, report date, or period dates. Sent reports cannot be changed through this API.",
  z
    .object({
      reportId: UUID,
      title: z.string().min(1).max(200).optional(),
      body: z.string().max(20_000).nullable().optional(),
      reportDate: DATE.optional(),
      periodStart: DATE.nullable().optional(),
      periodEnd: DATE.nullable().optional(),
    })
    .refine(
      ({ reportId: _reportId, ...changes }) =>
        Object.values(changes).some((value) => value !== undefined),
      "Provide at least one field to update"
    ),
  ({ reportId, ...changes }) => callApi("PATCH", `/reports/${reportId}`, changes)
);
registerTool(
  "delete_report_draft",
  "Delete a draft report. Sent reports cannot be deleted through this API.",
  z.object({ reportId: UUID }),
  ({ reportId }) => callApi("DELETE", `/reports/${reportId}`),
  { destructiveHint: true }
);

server.run().catch((error: unknown) => {
  console.error("Failed to start the Mitable Montessori MCP server", error);
  process.exitCode = 1;
});
