import { z } from "zod";

/** Phase 4 Zod schemas for admin CRUD endpoints. Centralized here so the
 *  agent's tool definitions and the route handlers stay in lockstep. */

export const CreateUserSchema = z.object({
  role: z.enum(["admin", "teacher"]),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  phone: z.string().max(50).optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const CreateStudentSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  preferred_name: z.string().max(100).optional(),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  nicknames: z.array(z.string().max(100)).max(10).default([]),
  notes: z.string().max(2000).optional(),
  /** When set, creates an active primary enrollment in this classroom. */
  classroom_id: z.string().uuid().optional(),
});
export type CreateStudentInput = z.infer<typeof CreateStudentSchema>;

export const UpdateStudentSchema = z.object({
  studentId: z.string().uuid(),
  fields: CreateStudentSchema.partial(),
});

/** Raw guardian fields (LLM extraction / JSON schema). Use `CreateGuardianSchema` on POST. */
export const CreateGuardianBaseSchema = z.object({
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  email: z.string().max(254).optional(),
  phone: z.string().max(50).optional(),
  preferred_contact_method: z.enum(["email", "phone", "either"]).default("either"),
});

export const CreateGuardianSchema = CreateGuardianBaseSchema.transform((v) => ({
  first_name: (v.first_name ?? "").trim(),
  last_name: (v.last_name ?? "").trim(),
  email: (v.email ?? "").trim() || undefined,
  phone: (v.phone ?? "").trim() || undefined,
  preferred_contact_method: v.preferred_contact_method,
})).superRefine((v, ctx) => {
  const hasEmail = Boolean(v.email);
  const emailOk = hasEmail ? z.string().email().safeParse(v.email).success : false;
  if (hasEmail && !emailOk) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid email address",
      path: ["email"],
    });
    return;
  }
  const hasBothNames = v.first_name.length > 0 && v.last_name.length > 0;
  if (!emailOk && !hasBothNames) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide a valid email or both first and last name",
      path: ["email"],
    });
  }
});
export type CreateGuardianInput = z.infer<typeof CreateGuardianSchema>;

export const ProgressProgramSchema = z.enum(["montessori", "iep"]);

export const CreateClassroomSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(20).optional(),
  curriculum_id: z.string().uuid().optional(),
  /** Programs the classroom unlocks. Defaults to ['montessori'] when omitted. */
  program_types: z.array(ProgressProgramSchema).min(1).max(3).optional(),
});

/** Patch a classroom's program_types. Used by the admin "Edit programs"
 *  control to flip a Montessori room into Montessori + IEP, etc. */
export const UpdateClassroomProgramsSchema = z.object({
  classroom_id: z.string().uuid(),
  program_types: z.array(ProgressProgramSchema).min(1).max(3),
});

export const CreateCurriculumSchema = z.object({
  name: z.string().min(1).max(200),
  framework: z.string().max(100).default("montessori"),
  description: z.string().max(2000).optional(),
});

export const CreateCurriculumSubjectSchema = z.object({
  curriculum_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  sort_order: z.number().int().min(0).max(10000),
});

export const CreateCurriculumTopicSchema = z.object({
  curriculum_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  sort_order: z.number().int().min(0).max(10000),
});

export const CreateCurriculumSubtopicSchema = z.object({
  topic_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  sort_order: z.number().int().min(0).max(10000),
  aliases: z.array(z.string().max(200)).max(20).default([]),
});

export const AssignTeacherSchema = z.object({
  teacher_user_id: z.string().uuid(),
  classroom_id: z.string().uuid(),
  classroom_role: z.enum(["lead", "support", "assistant"]).default("support"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const UnassignTeacherSchema = z.object({
  assignment_id: z.string().uuid(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const TransferStudentSchema = z.object({
  student_id: z.string().uuid(),
  new_classroom_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const ArchiveStudentSchema = z.object({
  student_id: z.string().uuid(),
  reason: z.string().max(500),
});

export const LinkGuardianSchema = z.object({
  student_id: z.string().uuid(),
  guardian_id: z.string().uuid(),
  relationship: z.enum(["mother", "father", "guardian", "other"]).default("guardian"),
  is_primary_contact: z.boolean().default(false),
  receives_reports: z.boolean().default(true),
});

export const UnlinkGuardianSchema = z.object({
  student_id: z.string().uuid(),
  guardian_id: z.string().uuid(),
});

export const RenameSubtopicSchema = z.object({
  subtopic_id: z.string().uuid(),
  new_name: z.string().min(1).max(200),
});

export const ArchiveSubtopicSchema = z.object({
  subtopic_id: z.string().uuid(),
});

export const RenameTopicSchema = z.object({
  topic_id: z.string().uuid(),
  new_name: z.string().min(1).max(200),
});

export const AssignCurriculumSchema = z.object({
  classroom_id: z.string().uuid(),
  curriculum_id: z.string().uuid(),
});

export const ImportRosterSchema = z.object({
  csv_data: z.string().min(1).max(1_000_000),
  classroom_id: z.string().uuid(),
  dry_run: z.boolean().default(true),
});

export const ImportCurriculumSchema = z.object({
  csv_data: z.string().min(1).max(1_000_000),
  curriculum_id: z.string().uuid(),
  dry_run: z.boolean().default(true),
});
