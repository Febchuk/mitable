/**
 * Duration formatting utilities for Session Timeline
 */

/**
 * Format duration in minutes to human-readable string
 * @param minutes - Duration in minutes
 * @returns Formatted string like "2h 30m" or "45m"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return "<1m";

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  return `${mins}m`;
}

/**
 * Format duration in minutes to compact string for stats display
 * @param minutes - Duration in minutes
 * @returns Formatted string like "2h 30m"
 */
export function formatDurationCompact(minutes: number): string {
  if (minutes < 1) return "0m";

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  return `${mins}m`;
}

/**
 * Format time range from two ISO timestamps
 * @param startTime - ISO timestamp
 * @param endTime - ISO timestamp
 * @returns Formatted string like "09:00 AM - 10:45 AM"
 */
export function formatTimeRange(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  // If same time (or very close), just show one
  const diffMs = Math.abs(end.getTime() - start.getTime());
  if (diffMs < 60000) {
    // Less than 1 minute
    return formatTime(start);
  }

  return `${formatTime(start)} - ${formatTime(end)}`;
}

/**
 * Format a single timestamp to time string
 * @param timestamp - ISO timestamp
 * @returns Formatted string like "09:45 AM"
 */
export function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format timestamp for activity log (HH:MM format)
 * @param timestamp - ISO timestamp
 * @returns Formatted string like "09:45"
 */
export function formatTimeShort(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Calculate percentage with bounds
 * @param value - Numerator
 * @param total - Denominator
 * @returns Percentage (0-100)
 */
export function calculatePercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

/**
 * Calculate duration in minutes between two timestamps
 * @param startTime - ISO timestamp
 * @param endTime - ISO timestamp
 * @returns Duration in minutes
 */
export function getDurationMinutes(startTime: string, endTime: string): number {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60));
}

/**
 * Get position as percentage for timeline rendering
 * @param timestamp - ISO timestamp
 * @param sessionStart - Session start ISO timestamp
 * @param sessionEnd - Session end ISO timestamp
 * @returns Percentage (0-100)
 */
export function getTimelinePosition(
  timestamp: string,
  sessionStart: string,
  sessionEnd: string
): number {
  const time = new Date(timestamp).getTime();
  const start = new Date(sessionStart).getTime();
  const end = new Date(sessionEnd).getTime();

  const totalDuration = end - start;
  if (totalDuration <= 0) return 0;

  const position = ((time - start) / totalDuration) * 100;
  return Math.max(0, Math.min(100, position));
}

/**
 * Get width as percentage for timeline segment
 * @param startTime - Segment start ISO timestamp
 * @param endTime - Segment end ISO timestamp
 * @param sessionStart - Session start ISO timestamp
 * @param sessionEnd - Session end ISO timestamp
 * @returns Width percentage (0-100)
 */
export function getTimelineWidth(
  startTime: string,
  endTime: string,
  sessionStart: string,
  sessionEnd: string
): number {
  const segmentStart = new Date(startTime).getTime();
  const segmentEnd = new Date(endTime).getTime();
  const sessionStartTime = new Date(sessionStart).getTime();
  const sessionEndTime = new Date(sessionEnd).getTime();

  const totalDuration = sessionEndTime - sessionStartTime;
  if (totalDuration <= 0) return 0;

  const segmentDuration = segmentEnd - segmentStart;
  const width = (segmentDuration / totalDuration) * 100;

  // Ensure minimum visible width
  return Math.max(1, Math.min(100, width));
}

/**
 * Generate time labels for timeline axis
 * @param sessionStart - Session start ISO timestamp
 * @param sessionEnd - Session end ISO timestamp
 * @param labelCount - Number of labels to generate (default 6)
 * @returns Array of { time: string, position: number }
 */
export function generateTimeLabels(
  sessionStart: string,
  sessionEnd: string,
  labelCount: number = 6
): { time: string; position: number }[] {
  const start = new Date(sessionStart).getTime();
  const end = new Date(sessionEnd).getTime();
  const duration = end - start;

  if (duration <= 0) return [];

  const labels: { time: string; position: number }[] = [];

  for (let i = 0; i < labelCount; i++) {
    const position = (i / (labelCount - 1)) * 100;
    const timestamp = start + (duration * i) / (labelCount - 1);
    const date = new Date(timestamp);

    labels.push({
      time: date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }),
      position,
    });
  }

  return labels;
}
