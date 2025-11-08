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

// ============================================================================
// Knowledge-Grounded Dynamic Guidance Schemas (New Feature)
// ============================================================================

/**
 * Step in the dynamic guide system
 * Simpler than GuideStep - no bounding boxes in MVP (conversational guidance only)
 */
export const StepSchema = z.object({
  stepNumber: z.number().int().positive(),
  description: z.string(), // Brief step description (e.g., "Navigate to roadmap page")
  status: z.enum(["pending", "current", "completed"]),
});

export type Step = z.infer<typeof StepSchema>;

/**
 * Embedding match from vector search
 * Follows the format of the search_knowledge tool response
 */
export const EmbeddingMatchSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
});

export type EmbeddingMatch = z.infer<typeof EmbeddingMatchSchema>;

/**
 * Record of plan adjustments
 * Tracks when/why stepList was modified during execution
 */
export const AdjustmentRecordSchema = z.object({
  timestamp: z.string().datetime(),
  reason: z.string(), // "User already completed step 2, skipping ahead"
  oldStepCount: z.number().int().min(0),
  newStepCount: z.number().int().min(0),
});

export type AdjustmentRecord = z.infer<typeof AdjustmentRecordSchema>;

/**
 * Solution object - the complete guide state
 * Stored in messages.cardData for workflow-type messages
 */
export const SolutionObjectSchema = z.object({
  solution: z.string(), // High-level goal: "Modify task descriptions in roadmap"
  supportingData: z.array(EmbeddingMatchSchema), // FULL embedding objects from search
  solutionExplanation: z.string(), // Why this approach based on company docs
  supportingDataExplanation: z.string(), // Why these specific docs support solution
  stepList: z.array(StepSchema), // Current plan (can be adjusted)
  currentStepIndex: z.number().int().min(0), // 0-based index
  searchQuery: z.string(), // Original query for reference
  adjustmentHistory: z.array(AdjustmentRecordSchema), // Track plan changes
  status: z.enum(["active", "completed", "abandoned", "paused"]).optional(), // Workflow status
  workflowSessionId: z.string().optional(), // Reference to workflow_sessions table
});

export type SolutionObject = z.infer<typeof SolutionObjectSchema>;

/**
 * Visual guidance response from Gemini Vision
 * Precise conversational descriptions (no bounding boxes in MVP)
 */
export const VisualGuidanceSchema = z.object({
  elementDescription: z.string(), // "Click the Edit button (pencil icon) in the top-right corner..."
  visualContext: z.string(), // "The button is in the top-right of the 'Q1 Planning' card..."
  confidence: z.enum(["high", "medium", "low"]),
  alternativeElements: z.array(z.string()).optional(), // Fallback if ambiguous
  conversationalMessage: z.string(), // AI-generated natural response for user display
});

export type VisualGuidance = z.infer<typeof VisualGuidanceSchema>;

/**
 * Interpretation option for vague prompts
 * Gemini Vision's guess about what user is asking based on screen
 */
export const InterpretationOptionSchema = z.object({
  task: z.string(), // "Modify task descriptions in the roadmap"
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(), // Why Gemini thinks this is what user wants
});

export type InterpretationOption = z.infer<typeof InterpretationOptionSchema>;
