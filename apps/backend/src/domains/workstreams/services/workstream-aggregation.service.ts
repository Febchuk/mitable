/**
 * Workstream Aggregation Service
 *
 * Groups captures into workstreams and calculates session statistics.
 */

import type {
  Workstream,
  WorkstreamColor,
  SessionStats,
  TimeSegment,
  WorkstreamResponse,
} from "@mitable/shared";
import { WORKSTREAM_COLORS } from "@mitable/shared";
import { workstreamDetectionService } from "./workstream-detection.service.js";
import type { SessionWorkstream } from "../schema/workstreams.schema.js";

// Configuration
const CONFIG = {
  maxGapMinutes: 2, // Gap threshold for merging segments (reduced to detect context switches)
};

// Capture data from database
interface CaptureData {
  id: string;
  capturedAt: Date | string;
  appName: string | null;
  windowTitle: string | null;
  activityDescription: string | null;
  deltaChangeDescription: string | null;
  workstreamId?: string | null;
}

// Session context for workstream detection
interface SessionContext {
  linearIssueId?: string | null;
  linearIssueTitle?: string | null;
}

/**
 * Calculate duration in minutes between two timestamps
 */
function getDurationMinutes(start: string | Date, end: string | Date): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  return Math.round((endMs - startMs) / (1000 * 60));
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Workstream Aggregation Service
 */
class WorkstreamAggregationService {
  /**
   * Aggregate captures into workstreams with statistics
   */
  aggregateWorkstreams(
    captures: CaptureData[],
    sessionContext?: SessionContext
  ): WorkstreamResponse {
    if (!captures || captures.length === 0) {
      return {
        workstreams: [],
        sessionStats: {
          totalTimeMinutes: 0,
          deepWorkMinutes: 0,
          deepWorkPercent: 0,
          interruptionCount: 0,
          interruptionMinutes: 0,
          longestFocusMinutes: 0,
          longestFocusWorkstream: "",
        },
        sessionStartTime: new Date().toISOString(),
        sessionEndTime: new Date().toISOString(),
      };
    }

    // Sort captures by time
    const sorted = [...captures].sort(
      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    );

    // Group captures by workstream
    const groups = this.groupCapturesByWorkstream(sorted, sessionContext);

    // Build workstream objects
    const workstreams: Workstream[] = [];
    let colorIndex = 0;

    // Sort groups by first capture time
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
      const aFirst = a[1][0]?.capturedAt || "";
      const bFirst = b[1][0]?.capturedAt || "";
      return new Date(aFirst).getTime() - new Date(bFirst).getTime();
    });

    for (const [name, groupCaptures] of sortedGroups) {
      const segments = this.buildSegments(groupCaptures);
      const totalDuration = segments.reduce((sum, seg) => sum + seg.durationMinutes, 0);

      workstreams.push({
        id: generateId(),
        name,
        color: WORKSTREAM_COLORS[colorIndex % WORKSTREAM_COLORS.length] as WorkstreamColor,
        totalDurationMinutes: totalDuration,
        segments,
        appsUsed: this.extractAppsUsed(groupCaptures),
        captureCount: groupCaptures.length,
        dominantActivity: this.computeDominantActivity(groupCaptures),
        captureIds: groupCaptures.map((c) => c.id),
      });

      colorIndex++;
    }

    // Calculate session stats
    const sessionStats = this.calculateSessionStats(workstreams, captures);

    // Session time bounds
    const firstCapture = sorted[0]?.capturedAt;
    const lastCapture = sorted[sorted.length - 1]?.capturedAt;
    const sessionStartTime =
      firstCapture instanceof Date
        ? firstCapture.toISOString()
        : (firstCapture as string) || new Date().toISOString();
    const sessionEndTime =
      lastCapture instanceof Date
        ? lastCapture.toISOString()
        : (lastCapture as string) || sessionStartTime;

    return {
      workstreams,
      sessionStats,
      sessionStartTime,
      sessionEndTime,
    };
  }

  /**
   * Aggregate workstreams from RLM-generated database records
   * Transforms session_workstreams table data into the frontend format
   */
  aggregateFromRLMWorkstreams(
    rlmWorkstreams: SessionWorkstream[],
    captures: CaptureData[],
    sessionStartTime: string,
    sessionEndTime: string
  ): WorkstreamResponse {
    if (!rlmWorkstreams || rlmWorkstreams.length === 0) {
      return {
        workstreams: [],
        sessionStats: {
          totalTimeMinutes: 0,
          deepWorkMinutes: 0,
          deepWorkPercent: 0,
          interruptionCount: 0,
          interruptionMinutes: 0,
          longestFocusMinutes: 0,
          longestFocusWorkstream: "",
        },
        sessionStartTime,
        sessionEndTime,
      };
    }

    // Group captures by workstream ID
    const capturesByWorkstream = new Map<string, CaptureData[]>();
    for (const capture of captures) {
      if (capture.workstreamId) {
        if (!capturesByWorkstream.has(capture.workstreamId)) {
          capturesByWorkstream.set(capture.workstreamId, []);
        }
        capturesByWorkstream.get(capture.workstreamId)!.push(capture);
      }
    }

    // Transform RLM workstreams to frontend format
    const workstreams: Workstream[] = rlmWorkstreams.map((ws) => {
      const wsCaptures = capturesByWorkstream.get(ws.id) || [];
      // Pass all captures to detect interleaving (context switches to other workstreams)
      const segments = this.buildSegments(wsCaptures, captures);

      return {
        id: ws.id,
        name: ws.name,
        color: ws.color as WorkstreamColor,
        totalDurationMinutes: ws.totalDurationMinutes,
        segments,
        appsUsed: ws.appsUsed || [],
        captureCount: ws.captureCount,
        dominantActivity: ws.summary || this.computeDominantActivity(wsCaptures),
        captureIds: wsCaptures.map((c) => c.id),
        // RLM-specific fields
        category: ws.category || undefined,
        summary: ws.summary || undefined,
        isProvisional: ws.isProvisional,
      };
    });

    // Calculate session stats
    const sessionStats = this.calculateSessionStatsFromRLM(workstreams, rlmWorkstreams);

    return {
      workstreams,
      sessionStats,
      sessionStartTime,
      sessionEndTime,
    };
  }

  /**
   * Calculate session statistics from RLM workstreams
   */
  private calculateSessionStatsFromRLM(
    workstreams: Workstream[],
    rlmWorkstreams: SessionWorkstream[]
  ): SessionStats {
    // Total time
    const totalTimeMinutes = workstreams.reduce((sum, ws) => sum + ws.totalDurationMinutes, 0);

    // Deep work time (development, design, research)
    let deepWorkMinutes = 0;
    const deepWorkCategories = ["development", "design", "research", "review"];

    rlmWorkstreams.forEach((ws) => {
      if (ws.category && deepWorkCategories.includes(ws.category)) {
        deepWorkMinutes += ws.totalDurationMinutes;
      }
    });

    // Interruptions (communication/meetings)
    let interruptionCount = 0;
    let interruptionMinutes = 0;
    const interruptionCategories = ["communication", "meeting"];

    rlmWorkstreams.forEach((ws) => {
      if (ws.category && interruptionCategories.includes(ws.category)) {
        const wsData = workstreams.find((w) => w.id === ws.id);
        if (wsData) {
          interruptionCount += wsData.segments.length;
          interruptionMinutes += ws.totalDurationMinutes;
        }
      }
    });

    // Longest focus session
    let longestFocusMinutes = 0;
    let longestFocusWorkstream = "";

    rlmWorkstreams.forEach((ws) => {
      if (!ws.category || !interruptionCategories.includes(ws.category)) {
        const wsData = workstreams.find((w) => w.id === ws.id);
        if (wsData) {
          wsData.segments.forEach((seg) => {
            if (seg.durationMinutes > longestFocusMinutes) {
              longestFocusMinutes = seg.durationMinutes;
              longestFocusWorkstream = ws.name;
            }
          });
        }
      }
    });

    return {
      totalTimeMinutes,
      deepWorkMinutes,
      deepWorkPercent:
        totalTimeMinutes > 0 ? Math.round((deepWorkMinutes / totalTimeMinutes) * 100) : 0,
      interruptionCount,
      interruptionMinutes,
      longestFocusMinutes,
      longestFocusWorkstream,
    };
  }

  /**
   * Group captures by normalized workstream name
   */
  private groupCapturesByWorkstream(
    captures: CaptureData[],
    sessionContext?: SessionContext
  ): Map<string, CaptureData[]> {
    const groups = new Map<string, CaptureData[]>();

    for (const capture of captures) {
      const assignment = workstreamDetectionService.detectWorkstream({
        appName: capture.appName,
        windowTitle: capture.windowTitle,
        linearIssueId: sessionContext?.linearIssueId,
        linearIssueTitle: sessionContext?.linearIssueTitle,
      });

      const workstreamName = assignment.normalizedName;

      if (!groups.has(workstreamName)) {
        groups.set(workstreamName, []);
      }
      groups.get(workstreamName)!.push(capture);
    }

    return groups;
  }

  /**
   * Build time segments from captures (handles non-contiguous time blocks)
   * Breaks segments when:
   * 1. There's a gap > maxGapMinutes between consecutive captures
   * 2. OR there were captures from other workstreams in between (context switch)
   */
  private buildSegments(captures: CaptureData[], allCaptures?: CaptureData[]): TimeSegment[] {
    if (captures.length === 0) return [];

    // Sort by time
    const sorted = [...captures].sort(
      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    );

    // If we have all captures, we can detect interleaving (context switches)
    const sortedAllCaptures = allCaptures
      ? [...allCaptures].sort(
          (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
        )
      : null;

    const segments: TimeSegment[] = [];
    let currentSegment: { startTime: string; endTime: string } | null = null;

    for (let i = 0; i < sorted.length; i++) {
      const capture = sorted[i];
      const captureTime =
        capture.capturedAt instanceof Date ? capture.capturedAt.toISOString() : capture.capturedAt;

      if (!currentSegment) {
        currentSegment = {
          startTime: captureTime,
          endTime: captureTime,
        };
      } else {
        const gap = getDurationMinutes(currentSegment.endTime, captureTime);

        // Check if there were OTHER workstream captures in between (context switch)
        let hasInterleaving = false;
        if (sortedAllCaptures && gap > 0) {
          const prevTime = new Date(currentSegment.endTime).getTime();
          const currTime = new Date(captureTime).getTime();

          // Look for captures from OTHER workstreams between prev and curr
          hasInterleaving = sortedAllCaptures.some((c) => {
            if (c.workstreamId === capture.workstreamId) return false; // Same workstream
            const cTime = new Date(c.capturedAt).getTime();
            return cTime > prevTime && cTime < currTime;
          });
        }

        if (gap > CONFIG.maxGapMinutes || hasInterleaving) {
          // Finalize current segment and start new one
          segments.push({
            startTime: currentSegment.startTime,
            endTime: currentSegment.endTime,
            durationMinutes: Math.max(
              1,
              getDurationMinutes(currentSegment.startTime, currentSegment.endTime)
            ),
          });
          currentSegment = {
            startTime: captureTime,
            endTime: captureTime,
          };
        } else {
          // Extend current segment
          currentSegment.endTime = captureTime;
        }
      }
    }

    // Finalize last segment
    if (currentSegment) {
      segments.push({
        startTime: currentSegment.startTime,
        endTime: currentSegment.endTime,
        durationMinutes: Math.max(
          1,
          getDurationMinutes(currentSegment.startTime, currentSegment.endTime)
        ),
      });
    }

    return segments;
  }

  /**
   * Extract unique apps from captures
   */
  private extractAppsUsed(captures: CaptureData[]): string[] {
    const apps = new Set<string>();

    for (const capture of captures) {
      if (capture.appName) {
        apps.add(capture.appName);
      }
    }

    return Array.from(apps);
  }

  /**
   * Compute dominant activity for a workstream
   */
  private computeDominantActivity(captures: CaptureData[]): string {
    const counts: Record<string, number> = {};

    captures.forEach((c) => {
      const activity = c.activityDescription || c.deltaChangeDescription;
      if (activity) {
        counts[activity] = (counts[activity] || 0) + 1;
      }
    });

    let bestActivity = "";
    let maxCount = 0;

    for (const [activity, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        bestActivity = activity;
      }
    }

    return bestActivity || "Working";
  }

  /**
   * Calculate session statistics
   */
  private calculateSessionStats(workstreams: Workstream[], _captures: CaptureData[]): SessionStats {
    // Total time
    const totalTimeMinutes = workstreams.reduce((sum, ws) => sum + ws.totalDurationMinutes, 0);

    // Deep work time (coding, design, etc.)
    let deepWorkMinutes = 0;
    workstreams.forEach((ws) => {
      const hasDeepWork = ws.appsUsed.some((app) => workstreamDetectionService.isDeepWorkApp(app));
      if (hasDeepWork && !workstreamDetectionService.isInterruption(ws.name)) {
        deepWorkMinutes += ws.totalDurationMinutes;
      }
    });

    // Interruptions (communication/meetings)
    let interruptionCount = 0;
    let interruptionMinutes = 0;
    workstreams.forEach((ws) => {
      if (workstreamDetectionService.isInterruption(ws.name)) {
        interruptionCount += ws.segments.length;
        interruptionMinutes += ws.totalDurationMinutes;
      }
    });

    // Longest focus session
    let longestFocusMinutes = 0;
    let longestFocusWorkstream = "";

    workstreams.forEach((ws) => {
      if (!workstreamDetectionService.isInterruption(ws.name)) {
        ws.segments.forEach((seg) => {
          if (seg.durationMinutes > longestFocusMinutes) {
            longestFocusMinutes = seg.durationMinutes;
            longestFocusWorkstream = ws.name;
          }
        });
      }
    });

    return {
      totalTimeMinutes,
      deepWorkMinutes,
      deepWorkPercent:
        totalTimeMinutes > 0 ? Math.round((deepWorkMinutes / totalTimeMinutes) * 100) : 0,
      interruptionCount,
      interruptionMinutes,
      longestFocusMinutes,
      longestFocusWorkstream,
    };
  }
}

export const workstreamAggregationService = new WorkstreamAggregationService();
