import { z } from "zod";

export const StudentSchema = z.object({
  id: z.string().uuid(),
  school_id: z.string().uuid(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  preferred_name: z.string().max(100).nullable().optional(),
  birth_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  nicknames: z.array(z.string().max(100)).default([]),
  notes: z.string().max(2000).nullable().optional(),
});
