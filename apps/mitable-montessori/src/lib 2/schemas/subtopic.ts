import { z } from "zod";

export const SubtopicSchema = z.object({
  id: z.string().uuid(),
  topic_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  sort_order: z.number().int().nonnegative(),
  is_active: z.boolean(),
  aliases: z.array(z.string()).default([]),
});
