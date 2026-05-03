import { z } from "zod";

export const AttendancePayloadSchema = z.object({
  student_id: z.string().uuid(),
  status: z.enum(["present", "absent"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comment: z.string().max(500).optional(),
});

export const ProgressPayloadSchema = z.object({
  student_id: z.string().uuid(),
  subtopic_id: z.string().uuid(),
  status: z.enum(["introduced", "practicing", "mastered", "na"]),
  comment: z.string().max(500).optional(),
});

export const NotePayloadSchema = z.object({
  student_id: z.string().uuid(),
  text: z.string().min(1).max(2000),
});

export const CommandSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().min(1),
  school_id: z.string().uuid(),
  user_id: z.string().uuid(),
  classroom_id: z.string().uuid(),
  source: z.enum(["voice", "photo", "text"]),
  raw_transcript: z.string().nullable(),
  command_type: z.enum(["attendance", "progress", "note"]),
  payload: z.union([AttendancePayloadSchema, ProgressPayloadSchema, NotePayloadSchema]),
  created_at: z.string(),
  approved_at: z.string(),
});

export type AttendancePayload = z.infer<typeof AttendancePayloadSchema>;
export type ProgressPayload = z.infer<typeof ProgressPayloadSchema>;
export type NotePayload = z.infer<typeof NotePayloadSchema>;
