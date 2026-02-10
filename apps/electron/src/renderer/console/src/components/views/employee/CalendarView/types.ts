/**
 * CalendarView Types
 *
 * Types for the passive calendar/journal activity tracking system.
 */

export interface Capture {
  id: string;
  timestamp: Date;
  appName: string;
  windowTitle: string;
  thumbnailUrl?: string;
  isDeleted?: boolean;
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
