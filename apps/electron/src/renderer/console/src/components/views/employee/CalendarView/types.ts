/**
 * CalendarView Types
 *
 * Types for the passive calendar/journal activity tracking system.
 */

export type ActivityType =
  | "coding"
  | "browsing"
  | "communicating"
  | "designing"
  | "writing"
  | "reading"
  | "meeting"
  | "terminal"
  | "other";

export interface Capture {
  id: string;
  timestamp: Date;
  appName: string;
  windowTitle: string;
  thumbnailUrl?: string;
  isDeleted?: boolean;

  // Rich activity details
  activityType: ActivityType;
  activityDescription: string; // e.g., "Editing CalendarView component"
  documentName?: string; // e.g., "CalendarView.tsx"
  projectContext?: string; // e.g., "mitable/apps/electron"
  isContextSwitch?: boolean; // True if this is a switch from previous activity
  switchedFrom?: string; // What app/context they switched from
}

/**
 * WorkBlock status - aligns with MonitoringSession status
 */
export type WorkBlockStatus =
  | "active"
  | "paused"
  | "ended"
  | "summarizing"
  | "ready"
  | "delivered"
  | "failed";

/**
 * Delivery channel for block summaries (via Recaps)
 */
export type DeliveryChannel = "slack" | "email" | "linear";

/**
 * Delivery status for block summaries
 */
export type DeliveryStatus = "pending" | "sent" | "failed";

export type WorkBlockSource = "session" | "granola" | "fireflies";

export interface WorkBlock {
  id: string;
  startTime: Date;
  endTime: Date | null;
  duration: number; // minutes
  idleGapBefore: number | null; // minutes of idle before this block started
  summary: string;
  captures: Capture[];
  appBreakdown: { app: string; minutes: number; percentage: number }[];
  taskBreakdown: Array<{ shortTitle: string; description: string; minutes: number }>;
  isActive?: boolean;
  isFocusedSession?: boolean; // True if user explicitly started this block
  goal?: string; // Optional goal for focused sessions

  // Session-aligned fields (from MonitoringSession migration)
  name?: string; // Optional block name
  status: WorkBlockStatus;
  deliveryStatus?: DeliveryStatus;
  deliveryChannel?: DeliveryChannel;
  deliveredAt?: Date;
  rawActivitySummary?: string; // AI-generated raw summary
  finalSummary?: string; // User-edited final summary

  // Source tracking (for integration blocks like Granola)
  source?: WorkBlockSource;
  subscriberName?: string; // Customer/subscriber name (from Granola attendee extraction)
  participants?: { name: string; email: string }[];

  exportPath?: string | null;
}

export interface ActivityDay {
  id: string;
  date: Date;
  timezone: string;
  totalWorkTime: number; // minutes
  workBlocks: WorkBlock[];
  summary: string;
  topApps: { app: string; minutes: number }[];
}

export interface CalendarWeek {
  weekStart: Date;
  weekEnd: Date;
  days: ActivityDay[];
}
