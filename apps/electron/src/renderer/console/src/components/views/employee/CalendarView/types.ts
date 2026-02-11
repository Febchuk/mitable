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

export interface WorkBlock {
  id: string;
  startTime: Date;
  endTime: Date | null;
  duration: number; // minutes
  idleGapBefore: number | null; // minutes of idle before this block started
  summary: string;
  captures: Capture[];
  appBreakdown: { app: string; minutes: number; percentage: number }[];
  isActive?: boolean;
  isFocusedSession?: boolean; // True if user explicitly started this block
  goal?: string; // Optional goal for focused sessions
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
