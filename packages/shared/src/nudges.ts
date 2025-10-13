import { z } from "zod";

// Nudge types for expert recommendations
export const NudgeTypeSchema = z.enum(["expert_match", "resource_recommendation", "task_reminder"]);

export type NudgeType = z.infer<typeof NudgeTypeSchema>;

export const ExpertProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string().email(),
  department: z.string(),
  role: z.string().optional(),
  expertise: z.array(z.string()),
  avatarUrl: z.string().url().optional(),
  responseRate: z.number().min(0).max(1),
  helpfulnessRating: z.number().min(0).max(5),
  availability: z.enum(["available", "away", "busy", "offline"]),
});

export type ExpertProfile = z.infer<typeof ExpertProfileSchema>;

export const NudgeSchema = z.object({
  id: z.string(),
  type: NudgeTypeSchema,
  userId: z.string(),
  conversationId: z.string().optional(),
  title: z.string(),
  description: z.string(),
  expert: ExpertProfileSchema.optional(),
  matchScore: z.number().min(0).max(1).optional(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  dismissed: z.boolean().default(false),
  accepted: z.boolean().default(false),
});

export type Nudge = z.infer<typeof NudgeSchema>;
