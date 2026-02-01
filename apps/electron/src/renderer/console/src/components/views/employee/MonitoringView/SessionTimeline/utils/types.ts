/**
 * TypeScript interfaces for Session Timeline workstream visualization
 */

import type { SessionCapture } from "@/console/src/services/monitoringService";

export type WorkstreamColor = 'violet' | 'blue' | 'pink' | 'emerald' | 'amber' | 'cyan';

export const WORKSTREAM_COLORS: WorkstreamColor[] = [
  'violet',
  'blue',
  'pink',
  'emerald',
  'amber',
  'cyan'
];

export const WORKSTREAM_COLOR_MAP: Record<WorkstreamColor, { bg: string; border: string; text: string; dim: string }> = {
  violet: { bg: 'bg-violet-500', border: 'border-violet-500', text: 'text-violet-500', dim: 'bg-violet-500/30' },
  blue: { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-500', dim: 'bg-blue-500/30' },
  pink: { bg: 'bg-pink-500', border: 'border-pink-500', text: 'text-pink-500', dim: 'bg-pink-500/30' },
  emerald: { bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-500', dim: 'bg-emerald-500/30' },
  amber: { bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-500', dim: 'bg-amber-500/30' },
  cyan: { bg: 'bg-cyan-500', border: 'border-cyan-500', text: 'text-cyan-500', dim: 'bg-cyan-500/30' },
};

export interface TimeSegment {
  startTime: string;      // ISO timestamp
  endTime: string;        // ISO timestamp
  durationMinutes: number;
}

export interface Workstream {
  id: string;
  name: string;                    // "Auth System Refactor"
  color: WorkstreamColor;          // Assigned from palette
  totalDurationMinutes: number;    // Aggregated across all segments
  segments: TimeSegment[];         // Non-contiguous time blocks
  appsUsed: string[];              // ["VS Code", "Terminal", "Chrome"]
  captures: SessionCapture[];      // All captures in this workstream
  dominantActivity: string;        // Most common activity description
}

export interface TransformedWorkstreams {
  workstreams: Workstream[];
  sessionStats: SessionStats;
  sessionStartTime: string;  // ISO timestamp
  sessionEndTime: string;    // ISO timestamp
}

export interface SessionStats {
  totalTimeMinutes: number;
  deepWorkMinutes: number;
  deepWorkPercent: number;
  interruptionCount: number;
  interruptionMinutes: number;
  longestFocusMinutes: number;
  longestFocusWorkstream: string;
}

export interface TimelineSelection {
  workstreamId: string | null;
}

// Activity types for icons in the activity log
export type ActivityType = 'code' | 'terminal' | 'browser' | 'communication' | 'meeting' | 'design' | 'file' | 'unknown';

export function getActivityType(appName: string | null, windowTitle: string | null): ActivityType {
  const app = appName?.toLowerCase() || '';
  const title = windowTitle?.toLowerCase() || '';

  // Code editors
  if (['code', 'vscode', 'visual studio', 'intellij', 'webstorm', 'atom', 'sublime'].some(e => app.includes(e))) {
    return 'code';
  }

  // Terminal
  if (['terminal', 'iterm', 'hyper', 'warp', 'console', 'cmd', 'powershell'].some(e => app.includes(e))) {
    return 'terminal';
  }

  // Browser
  if (['chrome', 'firefox', 'safari', 'edge', 'browser', 'arc'].some(e => app.includes(e))) {
    return 'browser';
  }

  // Communication
  if (['slack', 'teams', 'discord', 'mail', 'outlook', 'messages'].some(e => app.includes(e))) {
    return 'communication';
  }

  // Meeting
  if (['zoom', 'meet', 'teams', 'webex', 'facetime'].some(e => app.includes(e) || title.includes(e))) {
    return 'meeting';
  }

  // Design
  if (['figma', 'sketch', 'xd', 'photoshop', 'illustrator', 'canva'].some(e => app.includes(e))) {
    return 'design';
  }

  // File manager
  if (['finder', 'explorer', 'files'].some(e => app.includes(e))) {
    return 'file';
  }

  return 'unknown';
}
