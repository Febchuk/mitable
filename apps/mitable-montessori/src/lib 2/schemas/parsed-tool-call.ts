import { z } from "zod";
import { ClassroomToken, StudentToken, SubtopicToken } from "@/lib/schemas/tokens";

/**
 * Tool calls returned by the LLM. All entity references are token strings.
 * The client de-tokenizes back to UUIDs before writing to Dexie.
 */

export const MarkAttendanceCall = z.object({
  tool: z.literal("mark_attendance"),
  args: z.object({
    student_token: StudentToken,
    classroom_token: ClassroomToken,
    status: z.enum(["present", "absent"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    comment: z.string().max(500).optional(),
  }),
});

export const RecordProgressCall = z.object({
  tool: z.literal("record_progress"),
  args: z.object({
    student_token: StudentToken,
    subtopic_token: SubtopicToken,
    classroom_token: ClassroomToken,
    status: z.enum(["introduced", "practicing", "mastered", "na"]),
    comment: z.string().max(500).optional(),
  }),
});

export const AddObservationNoteCall = z.object({
  tool: z.literal("add_observation_note"),
  args: z.object({
    student_token: StudentToken,
    text: z.string().min(1).max(2000),
  }),
});

export const RequestClarificationCall = z.object({
  tool: z.literal("request_clarification"),
  args: z.object({
    question: z.string().min(1).max(500),
    candidates: z
      .array(z.object({ token: z.string(), display: z.string() }))
      .max(10)
      .optional()
      .default([]),
  }),
});

export const ParsedToolCallSchema = z.discriminatedUnion("tool", [
  MarkAttendanceCall,
  RecordProgressCall,
  AddObservationNoteCall,
  RequestClarificationCall,
]);

export type ParsedToolCall = z.infer<typeof ParsedToolCallSchema>;
