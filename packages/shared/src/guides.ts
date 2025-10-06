import { z } from "zod";
import { BoundingBoxSchema } from "./types.js";

// Guide step with visual overlay information
export const GuideStepSchema = z.object({
  id: z.string(),
  stepNumber: z.number().int().positive(),
  instruction: z.string(),
  targetElement: z
    .object({
      label: z.string(),
      boundingBox: BoundingBoxSchema,
    })
    .optional(),
  arrowPosition: z
    .object({
      x: z.number(),
      y: z.number(),
      rotation: z.number(), // degrees
    })
    .optional(),
  completed: z.boolean().default(false),
});

export type GuideStep = z.infer<typeof GuideStepSchema>;

export const GuideSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  steps: z.array(GuideStepSchema),
  currentStep: z.number().int().min(0).default(0),
  completed: z.boolean().default(false),
  createdAt: z.string().datetime(),
});

export type Guide = z.infer<typeof GuideSchema>;
