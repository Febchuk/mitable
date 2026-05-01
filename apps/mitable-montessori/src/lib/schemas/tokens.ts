import { z } from "zod";

export const StudentToken = z.string().regex(/^\[STUDENT_\d+\]$/);
export const SubtopicToken = z.string().regex(/^\[SUBTOPIC_\d+\]$/);
export const ClassroomToken = z.string().regex(/^\[CLASSROOM_\d+\]$/);
export const GuardianToken = z.string().regex(/^\[GUARDIAN_\d+\]$/);
export const UserToken = z.string().regex(/^\[USER_\d+\]$/);

export type StudentTokenT = z.infer<typeof StudentToken>;
export type SubtopicTokenT = z.infer<typeof SubtopicToken>;
export type ClassroomTokenT = z.infer<typeof ClassroomToken>;
