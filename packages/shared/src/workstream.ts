/**
 * Workstream Types - Shared between frontend and backend
 *
 * Workstreams are logical groupings of work activity that span
 * multiple apps and potentially non-contiguous time segments.
 */

import { z } from "zod";

// Color types for workstream visualization
export const WorkstreamColorSchema = z.enum(["violet", "blue", "pink", "emerald", "amber", "cyan"]);

export type WorkstreamColor = z.infer<typeof WorkstreamColorSchema>;

export const WORKSTREAM_COLORS: WorkstreamColor[] = [
  "violet",
  "blue",
  "pink",
  "emerald",
  "amber",
  "cyan",
];

// Source of workstream detection
export const WorkstreamSourceSchema = z.enum([
  "window_title",
  "file_path",
  "git_branch",
  "linear_issue",
  "app_category",
  "app_name",
]);

export type WorkstreamSource = z.infer<typeof WorkstreamSourceSchema>;

// Time segment within a workstream
export const TimeSegmentSchema = z.object({
  startTime: z.string(), // ISO timestamp
  endTime: z.string(), // ISO timestamp
  durationMinutes: z.number(),
});

export type TimeSegment = z.infer<typeof TimeSegmentSchema>;

// Workstream assignment for a single capture
export const WorkstreamAssignmentSchema = z.object({
  name: z.string(),
  normalizedName: z.string(),
  source: WorkstreamSourceSchema,
  confidence: z.number().min(0).max(1),
});

export type WorkstreamAssignment = z.infer<typeof WorkstreamAssignmentSchema>;

// Aggregated workstream with all its data
export const WorkstreamSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: WorkstreamColorSchema,
  totalDurationMinutes: z.number(),
  segments: z.array(TimeSegmentSchema),
  appsUsed: z.array(z.string()),
  captureCount: z.number(),
  dominantActivity: z.string(),
  // Optional fields for API response
  captureIds: z.array(z.string()).optional(),
});

export type Workstream = z.infer<typeof WorkstreamSchema>;

// Session statistics
export const SessionStatsSchema = z.object({
  totalTimeMinutes: z.number(),
  deepWorkMinutes: z.number(),
  deepWorkPercent: z.number(),
  interruptionCount: z.number(),
  interruptionMinutes: z.number(),
  longestFocusMinutes: z.number(),
  longestFocusWorkstream: z.string(),
});

export type SessionStats = z.infer<typeof SessionStatsSchema>;

// API response for workstreams endpoint
export const WorkstreamResponseSchema = z.object({
  workstreams: z.array(WorkstreamSchema),
  sessionStats: SessionStatsSchema,
  sessionStartTime: z.string(),
  sessionEndTime: z.string(),
});

export type WorkstreamResponse = z.infer<typeof WorkstreamResponseSchema>;

// Activity type for visualization
export const ActivityTypeSchema = z.enum([
  "code",
  "terminal",
  "browser",
  "communication",
  "meeting",
  "design",
  "file",
  "unknown",
]);

export type ActivityType = z.infer<typeof ActivityTypeSchema>;

/**
 * Determine activity type from app/window context
 */
export function getActivityType(appName: string | null, windowTitle: string | null): ActivityType {
  const app = appName?.toLowerCase() || "";
  const title = windowTitle?.toLowerCase() || "";

  // Code editors
  if (
    ["code", "vscode", "visual studio", "intellij", "webstorm", "atom", "sublime"].some((e) =>
      app.includes(e)
    )
  ) {
    return "code";
  }

  // Terminal
  if (
    ["terminal", "iterm", "hyper", "warp", "console", "cmd", "powershell"].some((e) =>
      app.includes(e)
    )
  ) {
    return "terminal";
  }

  // Browser
  if (["chrome", "firefox", "safari", "edge", "browser", "arc"].some((e) => app.includes(e))) {
    return "browser";
  }

  // Communication
  if (["slack", "teams", "discord", "mail", "outlook", "messages"].some((e) => app.includes(e))) {
    return "communication";
  }

  // Meeting
  if (
    ["zoom", "meet", "teams", "webex", "facetime"].some((e) => app.includes(e) || title.includes(e))
  ) {
    return "meeting";
  }

  // Design
  if (["figma", "sketch", "xd", "photoshop", "illustrator", "canva"].some((e) => app.includes(e))) {
    return "design";
  }

  // File manager
  if (["finder", "explorer", "files"].some((e) => app.includes(e))) {
    return "file";
  }

  return "unknown";
}
