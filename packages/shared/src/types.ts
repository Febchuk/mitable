import { z } from "zod";

// Window types
export type WindowType = "agent" | "console" | "overlay" | "guide" | "nudge";

// Coordinate types for visual guidance
export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

// Screenshot capture types
export const ScreenshotMetadataSchema = z.object({
  width: z.number(),
  height: z.number(),
  originalWidth: z.number(),
  originalHeight: z.number(),
  captureMode: z.string(),
  timestamp: z.number(),
  window: z
    .object({
      title: z.string(),
      bounds: BoundingBoxSchema,
      sourceId: z.string(),
      display: z.object({
        id: z.number(),
        bounds: BoundingBoxSchema,
        workArea: BoundingBoxSchema,
        scaleFactor: z.number(),
        rotation: z.number(),
        internal: z.boolean(),
      }),
    })
    .optional(),
});

export type ScreenshotMetadata = z.infer<typeof ScreenshotMetadataSchema>;

export const ScreenshotResultSchema = z.object({
  dataUrl: z.string(),
  metadata: ScreenshotMetadataSchema,
});

export type ScreenshotResult = z.infer<typeof ScreenshotResultSchema>;

// UI Element detection
export const UIElementSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string().optional(),
  boundingBox: BoundingBoxSchema,
  confidence: z.number().min(0).max(1),
});

export type UIElement = z.infer<typeof UIElementSchema>;

// Extended UI Element with metadata for coordinate system
export const UIElementWithMetadataSchema = UIElementSchema.extend({
  normalized: z.boolean().default(false), // Whether coords are 0-1 range
  imageDimensions: z.object({
    width: z.number(),
    height: z.number()
  }).optional()
});

export type UIElementWithMetadata = z.infer<typeof UIElementWithMetadataSchema>;

// Image dimensions type for coordinate conversion
export const ImageDimensionsSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive()
});

export type ImageDimensions = z.infer<typeof ImageDimensionsSchema>;

// Conversation types
export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string().datetime(),
  uiElements: z.array(UIElementSchema).optional(),
});

export type Message = z.infer<typeof MessageSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  messages: z.array(MessageSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Conversation = z.infer<typeof ConversationSchema>;

// User types
export const UserSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.string(),
  department: z.string().optional(),
  startDate: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;
