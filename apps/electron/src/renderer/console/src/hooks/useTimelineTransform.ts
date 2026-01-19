/**
 * useTimelineTransform
 *
 * Hook for transforming raw session captures into grouped timeline entries.
 * Groups consecutive captures by activity description (from Classifier) and app name.
 */

import { useMemo } from "react";
import type { SessionCapture } from "../services/monitoringService";

// Configuration for grouping algorithm
const GROUPING_CONFIG = {
  maxGapMinutes: 10, // Increased gap allowance since we have semantic grouping now
  minCapturesPerGroup: 1,
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

function timeDiffMinutes(time1: string, time2: string): number {
  const date1 = new Date(time1);
  const date2 = new Date(time2);
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
}

function generateId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Compute the dominant activity description for a group.
 * Prioritizes the most frequent non-null activityDescription.
 */
function computeDominantActivity(captures: SessionCapture[], appName: string | null): string {
  // Count frequency of each activity description
  const counts: Record<string, number> = {};

  captures.forEach((c) => {
    if (c.activityDescription) {
      counts[c.activityDescription] = (counts[c.activityDescription] || 0) + 1;
    }
  });

  // Find most frequent
  let bestActivity = "";
  let maxCount = 0;

  for (const [activity, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      bestActivity = activity;
    }
  }

  if (bestActivity) return bestActivity;

  // Fallback to first non-null activity
  const firstActivity = captures.find((c) => c.activityDescription)?.activityDescription;
  if (firstActivity) return firstActivity;

  return appName ? `Working in ${appName}` : "Activity";
}

/**
 * Group captures by Activity/App and time proximity
 */
function groupCaptures(
  captures: SessionCapture[],
  maxGapMinutes: number = GROUPING_CONFIG.maxGapMinutes
): TimelineGroup[] {
  if (!captures || captures.length === 0) {
    return [];
  }

  // Filter out captures with no useful info if needed, but we keep them for completeness
  const sorted = [...captures].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
  );

  const groups: TimelineGroup[] = [];
  let currentGroup: {
    appName: string | null;
    activity: string | null; // Track the "theme" of the group
    startTime: string;
    endTime: string;
    captures: SessionCapture[];
  } | null = null;

  for (const capture of sorted) {
    // Determine if this capture belongs to the current group
    // Criteria: Same App AND (Same Activity OR Time gap is small)

    // We treat "activityDescription" as a strong grouper.
    // If activity changes significantly, we break group.

    const activity = capture.activityDescription || null;

    const shouldStartNewGroup =
      currentGroup === null ||
      capture.appName !== currentGroup.appName ||
      // If activity description changes significantly and isn't just a continuation
      (activity && currentGroup.activity && activity !== currentGroup.activity) ||
      timeDiffMinutes(capture.capturedAt, currentGroup.endTime) > maxGapMinutes;

    if (shouldStartNewGroup) {
      // Finalize previous group
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

      // Start new group
      currentGroup = {
        appName: capture.appName,
        activity: activity,
        startTime: capture.capturedAt,
        endTime: capture.capturedAt,
        captures: [capture],
      };
    } else if (currentGroup) {
      // Add to current group
      currentGroup.captures.push(capture);
      currentGroup.endTime = capture.capturedAt;
      // Update group activity if it was null
      if (!currentGroup.activity && activity) {
        currentGroup.activity = activity;
      }
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

function calculateTotalDuration(captures: SessionCapture[]): number {
  if (captures.length < 2) return 0;
  const sorted = [...captures].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
  );
  const first = new Date(sorted[0].capturedAt);
  const last = new Date(sorted[sorted.length - 1].capturedAt);
  return Math.round((last.getTime() - first.getTime()) / (1000 * 60));
}

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
