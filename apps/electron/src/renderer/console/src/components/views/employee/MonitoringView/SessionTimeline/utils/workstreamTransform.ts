/**
 * Workstream Transform Utility
 *
 * Groups raw session captures into logical workstreams based on
 * project context, activity patterns, and app usage.
 */

import { useMemo } from "react";
import type { SessionCapture } from "@/console/src/services/monitoringService";
import type {
  Workstream,
  WorkstreamColor,
  TransformedWorkstreams,
  SessionStats,
  TimeSegment,
} from "./types";
import { WORKSTREAM_COLORS } from "./types";
import { getDurationMinutes } from "./formatDuration";

// Configuration
const CONFIG = {
  maxGapMinutes: 10, // Gap threshold for merging segments
  communicationApps: ["slack", "teams", "mail", "outlook", "messages", "discord"],
  meetingApps: ["zoom", "meet", "webex", "facetime"],
  deepWorkApps: ["code", "vscode", "intellij", "webstorm", "terminal", "iterm", "figma", "xd"],
};

/**
 * Detect workstream name from capture context
 */
function detectWorkstream(capture: SessionCapture): string {
  const title = capture.windowTitle?.toLowerCase() || "";
  const app = capture.appName?.toLowerCase() || "";

  // 1. Project folder detection (VS Code, terminal, etc.)
  // Match patterns like "[project-name]" in title
  const bracketMatch = title.match(/\[([^\]]+)\]/);
  if (bracketMatch && bracketMatch[1].length > 2) {
    return bracketMatch[1];
  }

  // 2. File path detection - extract parent folder
  // Match patterns like "folder/file.ts" or "folder\file.ts"
  const pathMatch = title.match(/([^/\\]+)[/\\][^/\\]+\.\w+$/);
  if (pathMatch && pathMatch[1].length > 2 && !pathMatch[1].includes(" ")) {
    return pathMatch[1];
  }

  // 3. Git branch detection in terminal
  const gitMatch = title.match(/\(([a-z0-9-_/]+)\)/i);
  if ((gitMatch && gitMatch[1].includes("/")) || gitMatch?.[1].includes("-")) {
    return gitMatch[1].split("/").pop() || gitMatch[1];
  }

  // 4. Communication apps → "Communications"
  if (CONFIG.communicationApps.some((c) => app.includes(c))) {
    return "Communications";
  }

  // 5. Meeting apps → "Meetings"
  if (CONFIG.meetingApps.some((m) => app.includes(m) || title.includes(m))) {
    return "Meetings";
  }

  // 6. Design tool with file name
  if (app.includes("figma") || app.includes("sketch")) {
    // Extract design file name from title
    const figmaMatch = title.match(/^([^–-]+)/);
    if (figmaMatch && figmaMatch[1].trim().length > 2) {
      return figmaMatch[1].trim();
    }
  }

  // 7. Default: use app name as workstream
  return capture.appName || "Unknown";
}

/**
 * Normalize workstream name for consistency
 */
function normalizeWorkstreamName(name: string): string {
  // Capitalize first letter of each word
  return name
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
    .trim();
}

/**
 * Check if an app is a "deep work" app
 */
function isDeepWorkApp(appName: string | null): boolean {
  if (!appName) return false;
  const app = appName.toLowerCase();
  return CONFIG.deepWorkApps.some((d) => app.includes(d));
}

/**
 * Compute dominant activity for a workstream
 */
function computeDominantActivity(captures: SessionCapture[]): string {
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
 * Generate unique ID
 */
function generateId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Group captures into workstreams
 */
function groupCaptures(captures: SessionCapture[]): Map<string, SessionCapture[]> {
  const groups = new Map<string, SessionCapture[]>();

  for (const capture of captures) {
    const rawName = detectWorkstream(capture);
    const workstreamName = normalizeWorkstreamName(rawName);

    if (!groups.has(workstreamName)) {
      groups.set(workstreamName, []);
    }
    groups.get(workstreamName)!.push(capture);
  }

  return groups;
}

/**
 * Build time segments from captures (handles non-contiguous time blocks)
 */
function buildSegments(captures: SessionCapture[]): TimeSegment[] {
  if (captures.length === 0) return [];

  // Sort by time
  const sorted = [...captures].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
  );

  const segments: TimeSegment[] = [];
  let currentSegment: { startTime: string; endTime: string } | null = null;

  for (const capture of sorted) {
    if (!currentSegment) {
      currentSegment = {
        startTime: capture.capturedAt,
        endTime: capture.capturedAt,
      };
    } else {
      const gap = getDurationMinutes(currentSegment.endTime, capture.capturedAt);

      if (gap > CONFIG.maxGapMinutes) {
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
          startTime: capture.capturedAt,
          endTime: capture.capturedAt,
        };
      } else {
        // Extend current segment
        currentSegment.endTime = capture.capturedAt;
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
function extractAppsUsed(captures: SessionCapture[]): string[] {
  const apps = new Set<string>();

  for (const capture of captures) {
    if (capture.appName) {
      apps.add(capture.appName);
    }
  }

  return Array.from(apps);
}

/**
 * Calculate session statistics
 */
function calculateSessionStats(workstreams: Workstream[]): SessionStats {
  // Total time
  const totalTimeMinutes = workstreams.reduce((sum, ws) => sum + ws.totalDurationMinutes, 0);

  // Deep work time (coding, design, etc.)
  let deepWorkMinutes = 0;
  workstreams.forEach((ws) => {
    const hasDeepWork = ws.captures.some((c) => isDeepWorkApp(c.appName));
    if (hasDeepWork && ws.name !== "Communications" && ws.name !== "Meetings") {
      deepWorkMinutes += ws.totalDurationMinutes;
    }
  });

  // Interruptions (communication/meetings)
  let interruptionCount = 0;
  let interruptionMinutes = 0;
  workstreams.forEach((ws) => {
    if (ws.name === "Communications" || ws.name === "Meetings") {
      interruptionCount += ws.segments.length;
      interruptionMinutes += ws.totalDurationMinutes;
    }
  });

  // Longest focus session
  let longestFocusMinutes = 0;
  let longestFocusWorkstream = "";

  workstreams.forEach((ws) => {
    if (ws.name !== "Communications" && ws.name !== "Meetings") {
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

/**
 * Transform captures into workstreams
 */
export function transformToWorkstreams(captures: SessionCapture[]): TransformedWorkstreams | null {
  if (!captures || captures.length === 0) {
    return null;
  }

  // Sort captures by time
  const sorted = [...captures].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
  );

  // Group captures by workstream
  const groups = groupCaptures(sorted);

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
    const segments = buildSegments(groupCaptures);
    const totalDuration = segments.reduce((sum, seg) => sum + seg.durationMinutes, 0);

    workstreams.push({
      id: generateId(),
      name,
      color: WORKSTREAM_COLORS[colorIndex % WORKSTREAM_COLORS.length] as WorkstreamColor,
      totalDurationMinutes: totalDuration,
      segments,
      appsUsed: extractAppsUsed(groupCaptures),
      captures: groupCaptures,
      dominantActivity: computeDominantActivity(groupCaptures),
    });

    colorIndex++;
  }

  // Calculate stats
  const sessionStats = calculateSessionStats(workstreams);

  // Session time bounds
  const sessionStartTime = sorted[0]?.capturedAt || new Date().toISOString();
  const sessionEndTime = sorted[sorted.length - 1]?.capturedAt || sessionStartTime;

  return {
    workstreams,
    sessionStats,
    sessionStartTime,
    sessionEndTime,
  };
}

/**
 * Hook for transforming captures into workstreams
 */
export function useWorkstreamTransform(
  captures: SessionCapture[] | undefined
): TransformedWorkstreams | null {
  return useMemo(() => {
    if (!captures || captures.length === 0) return null;
    return transformToWorkstreams(captures);
  }, [captures]);
}
