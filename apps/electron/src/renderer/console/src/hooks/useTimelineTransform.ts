/**
 * useTimelineTransform
 *
 * Hook for transforming raw session captures into grouped timeline entries.
 * Groups consecutive captures by application and time proximity.
 */

import { useMemo } from "react";
import type { SessionCapture } from "../services/monitoringService";

// Configuration for grouping algorithm
const GROUPING_CONFIG = {
  maxGapMinutes: 5, // Max gap between captures to stay in same group
  minCapturesPerGroup: 1, // Min captures to form a group
};

export interface TimelineGroup {
  id: string;
  appName: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  captures: SessionCapture[];
  dominantActivity: string;
  captureCount: number;
}

export interface TransformedTimeline {
  groups: TimelineGroup[];
  totalCaptures: number;
  totalDurationMinutes: number;
}

/**
 * Calculate time difference in minutes between two ISO date strings
 */
function timeDiffMinutes(time1: string, time2: string): number {
  const date1 = new Date(time1);
  const date2 = new Date(time2);
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
}

/**
 * Generate a unique ID for groups
 */
function generateId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Compute the dominant activity description for a group.
 * Uses the capture with highest confidence, or falls back to first activity.
 */
function computeDominantActivity(captures: SessionCapture[], appName: string | null): string {
  // Find capture with highest confidence that has an activity description
  const withActivity = captures.filter((c) => c.activityDescription);

  if (withActivity.length === 0) {
    return appName ? `Working in ${appName}` : "Activity";
  }

  // Sort by confidence (descending) and pick the best one
  const sorted = [...withActivity].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  return sorted[0].activityDescription || `Working in ${appName || "unknown app"}`;
}

/**
 * Group captures by application and time proximity
 */
function groupCaptures(
  captures: SessionCapture[],
  maxGapMinutes: number = GROUPING_CONFIG.maxGapMinutes
): TimelineGroup[] {
  if (!captures || captures.length === 0) {
    return [];
  }

  // Sort captures by captured time (ascending)
  const sorted = [...captures].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
  );

  const groups: TimelineGroup[] = [];
  let currentGroup: {
    appName: string | null;
    startTime: string;
    endTime: string;
    captures: SessionCapture[];
  } | null = null;

  for (const capture of sorted) {
    const shouldStartNewGroup =
      currentGroup === null ||
      capture.appName !== currentGroup.appName ||
      timeDiffMinutes(capture.capturedAt, currentGroup.endTime) > maxGapMinutes;

    if (shouldStartNewGroup) {
      // Finalize previous group if exists
      if (currentGroup && currentGroup.captures.length >= GROUPING_CONFIG.minCapturesPerGroup) {
        const durationMinutes = timeDiffMinutes(currentGroup.endTime, currentGroup.startTime);
        groups.push({
          id: generateId(),
          appName: currentGroup.appName,
          startTime: currentGroup.startTime,
          endTime: currentGroup.endTime,
          durationMinutes: Math.max(1, Math.round(durationMinutes)), // At least 1 minute
          captures: currentGroup.captures,
          dominantActivity: computeDominantActivity(currentGroup.captures, currentGroup.appName),
          captureCount: currentGroup.captures.length,
        });
      }

      // Start new group
      currentGroup = {
        appName: capture.appName,
        startTime: capture.capturedAt,
        endTime: capture.capturedAt,
        captures: [capture],
      };
    } else if (currentGroup) {
      // Add to current group
      currentGroup.captures.push(capture);
      currentGroup.endTime = capture.capturedAt;
    }
  }

  // Finalize last group
  if (currentGroup && currentGroup.captures.length >= GROUPING_CONFIG.minCapturesPerGroup) {
    const durationMinutes = timeDiffMinutes(currentGroup.endTime, currentGroup.startTime);
    groups.push({
      id: generateId(),
      appName: currentGroup.appName,
      startTime: currentGroup.startTime,
      endTime: currentGroup.endTime,
      durationMinutes: Math.max(1, Math.round(durationMinutes)),
      captures: currentGroup.captures,
      dominantActivity: computeDominantActivity(currentGroup.captures, currentGroup.appName),
      captureCount: currentGroup.captures.length,
    });
  }

  return groups;
}

/**
 * Calculate total duration from captures
 */
function calculateTotalDuration(captures: SessionCapture[]): number {
  if (captures.length < 2) return 0;

  const sorted = [...captures].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
  );

  const first = new Date(sorted[0].capturedAt);
  const last = new Date(sorted[sorted.length - 1].capturedAt);

  return Math.round((last.getTime() - first.getTime()) / (1000 * 60));
}

/**
 * Hook to transform raw captures into grouped timeline
 */
export function useTimelineTransform(
  captures: SessionCapture[] | undefined,
  options: { maxGapMinutes?: number } = {}
): TransformedTimeline | null {
  return useMemo(() => {
    if (!captures || captures.length === 0) return null;

    const { maxGapMinutes = GROUPING_CONFIG.maxGapMinutes } = options;
    const groups = groupCaptures(captures, maxGapMinutes);

    return {
      groups,
      totalCaptures: captures.length,
      totalDurationMinutes: calculateTotalDuration(captures),
    };
  }, [captures, options.maxGapMinutes]);
}
