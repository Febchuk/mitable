import { z } from "zod";

export const GuardianSchema = z.object({
  id: z.string().uuid(),
  school_id: z.string().uuid(),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  preferred_contact_method: z.enum(["email", "phone", "either"]).nullable().optional(),
});
