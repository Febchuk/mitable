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

// UI Element detection
export const UIElementSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string().optional(),
  boundingBox: BoundingBoxSchema,
  confidence: z.number().min(0).max(1),
});

export type UIElement = z.infer<typeof UIElementSchema>;

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
