import { z } from "zod";

// Window types
export type WindowType = "agent" | "console" | "conversation";

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

// Multi-window capture types
export const WindowScreenshotSchema = z.object({
  windowId: z.string(),
  windowTitle: z.string(),
  appName: z.string(),
  dataUrl: z.string(),
  metadata: z.object({
    width: z.number(),
    height: z.number(),
    scaleFactor: z.number(),
    bounds: BoundingBoxSchema,
  }),
});

export type WindowScreenshot = z.infer<typeof WindowScreenshotSchema>;

export const BlockedWindowMetadataSchema = z.object({
  windowTitle: z.string(),
  appName: z.string(),
  reason: z.string(), // "Window title denied" or "App name denied"
});

export type BlockedWindowMetadata = z.infer<typeof BlockedWindowMetadataSchema>;

export const MultiWindowCaptureSuccessSchema = z.object({
  success: z.literal(true),
  screenshots: z.array(WindowScreenshotSchema),
  blockedWindows: z.array(BlockedWindowMetadataSchema),
  totalWindowsDetected: z.number(),
  captureTimestamp: z.number(),
});

export type MultiWindowCaptureSuccess = z.infer<typeof MultiWindowCaptureSuccessSchema>;

export const MultiWindowCaptureErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  reason: z.enum(["policy_blocked", "technical_error", "no_window"]),
  blockedApp: z.string().optional(),
  blockedWindow: z.string().optional(),
});

export type MultiWindowCaptureError = z.infer<typeof MultiWindowCaptureErrorSchema>;

export const MultiWindowCaptureResultSchema = z.union([
  MultiWindowCaptureSuccessSchema,
  MultiWindowCaptureErrorSchema,
]);

export type MultiWindowCaptureResult = z.infer<typeof MultiWindowCaptureResultSchema>;

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

  // Workflow relationship fields (optional - for linking messages to workflow sessions)
  workflowSessionId: z.string().uuid().nullable().optional(),
  relatedStepIndex: z.number().int().nullable().optional(),
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

// Watch Mode Types for selective screenshot capture
export interface WatchableWindow {
  windowId: string;
  appName: string;
  windowTitle: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isBlocked: boolean;
  blockReason?: string;
}

export interface SelectedWindowInfo {
  windowId: string;
  appName: string;
  windowTitle: string;
}

export interface WatchState {
  isWatching: boolean;
  selectedWindows: SelectedWindowInfo[]; // Windows that user has selected to watch
}

export interface WatchButtonState {
  appName: string;
  windowTitle: string;
  status: 'unwatched' | 'watching' | 'blocked';
  blockReason?: string;
}
