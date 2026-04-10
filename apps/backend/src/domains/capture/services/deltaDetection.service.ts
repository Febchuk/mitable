/**
 * Delta Detection Service
 * Compares consecutive frames to detect meaningful changes
 *
 * This service is critical for:
 * 1. Avoiding false attribution (user didn't accomplish something just by looking at it)
 * 2. Identifying actual user actions vs passive viewing
 * 3. Improving summary accuracy by focusing on delta changes
 */

import { DeltaChangeType, DeltaAnalysis } from "../../sessions/schema/monitoring.schema.js";

export interface FrameForDelta {
  frameId: string;
  timestamp: string;
  windowSourceId: string;
  appName: string;
  windowTitle: string;
  activityDescription?: string;
}

export interface DeltaDetectionResult {
  frameId: string;
  delta: DeltaAnalysis;
  onTask: boolean;
  taskRelevance?: string;
  importanceScore: number;
  importanceReason: string;
}

export interface DeltaDetectionConfig {
  minChangeThreshold: number; // Minimum change score to consider "changed"
  focusChangeWeight: number; // Weight for window focus changes
  contentChangeWeight: number; // Weight for content changes
  navigationWeight: number; // Weight for navigation changes
}

// Default config for threshold customization
export const DEFAULT_DELTA_CONFIG: DeltaDetectionConfig = {
  minChangeThreshold: 0.3,
  focusChangeWeight: 0.7,
  contentChangeWeight: 1.0,
  navigationWeight: 0.8,
};

/**
 * Analyze the delta between two consecutive frames
 */
export function detectDelta(
  currentFrame: FrameForDelta,
  previousFrame: FrameForDelta | null,
  _config: Partial<DeltaDetectionConfig> = {}
): DeltaAnalysis {
  // Config available for future enhancements (e.g., custom thresholds)
  // const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // First frame has no delta
  if (!previousFrame) {
    return {
      changed: true,
      changeType: "none",
      changeDescription: "First frame in session",
      userAction: "viewing",
    };
  }

  // Detect window focus change
  if (currentFrame.windowSourceId !== previousFrame.windowSourceId) {
    return {
      changed: true,
      changeType: "focus_change",
      changeDescription: `Switched from ${previousFrame.appName} to ${currentFrame.appName}`,
      userAction: "clicking",
    };
  }

  // Same window - check for content changes
  const contentChanged = analyzeContentChange(
    currentFrame.activityDescription,
    previousFrame.activityDescription
  );

  if (!contentChanged.changed) {
    return {
      changed: false,
      changeType: "none",
      changeDescription: "No significant change detected",
      userAction: "viewing",
    };
  }

  return contentChanged;
}

/**
 * Analyze content changes between frame descriptions
 */
function analyzeContentChange(
  currentDescription?: string,
  previousDescription?: string
): DeltaAnalysis {
  if (!currentDescription || !previousDescription) {
    return {
      changed: !!currentDescription,
      changeType: currentDescription ? "content_edit" : "none",
      changeDescription: currentDescription || "No description available",
      userAction: currentDescription ? "viewing" : "unknown",
    };
  }

  // Simple heuristic: check for typing indicators
  const typingPatterns = [
    "typing",
    "entered",
    "wrote",
    "input",
    "text field",
    "editing",
    "modified",
  ];
  const isTyping = typingPatterns.some(
    (p) =>
      currentDescription.toLowerCase().includes(p) && !previousDescription.toLowerCase().includes(p)
  );

  if (isTyping) {
    return {
      changed: true,
      changeType: "content_edit",
      changeDescription: currentDescription,
      userAction: "typing",
    };
  }

  // Check for navigation
  const navigationPatterns = [
    "navigated",
    "clicked",
    "opened",
    "switched",
    "went to",
    "selected",
    "expanded",
    "collapsed",
  ];
  const isNavigation = navigationPatterns.some(
    (p) =>
      currentDescription.toLowerCase().includes(p) && !previousDescription.toLowerCase().includes(p)
  );

  if (isNavigation) {
    return {
      changed: true,
      changeType: "navigation",
      changeDescription: currentDescription,
      userAction: "clicking",
    };
  }

  // Check for scroll
  const scrollPatterns = ["scrolled", "scroll", "viewing different"];
  const isScroll = scrollPatterns.some(
    (p) =>
      currentDescription.toLowerCase().includes(p) && !previousDescription.toLowerCase().includes(p)
  );

  if (isScroll) {
    return {
      changed: true,
      changeType: "scroll",
      changeDescription: currentDescription,
      userAction: "scrolling",
    };
  }

  // Check if descriptions are significantly different
  const similarity = calculateSimilarity(currentDescription, previousDescription);
  if (similarity < 0.7) {
    return {
      changed: true,
      changeType: "content_edit",
      changeDescription: currentDescription,
      userAction: "viewing",
    };
  }

  return {
    changed: false,
    changeType: "none",
    changeDescription: "Content appears unchanged",
    userAction: "viewing",
  };
}

/**
 * Simple Jaccard similarity for text comparison
 */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Determine if frame is on-task - always returns true now that goal context is removed
 */
export function determineOnTask(_frame: FrameForDelta): {
  onTask: boolean;
  taskRelevance?: string;
} {
  // All activity is considered on-task (goal context removed)
  return {
    onTask: true,
    taskRelevance: "All activity considered on-task",
  };
}

/**
 * Calculate importance score for Top-K selection
 */
export function calculateImportanceScore(
  frame: FrameForDelta,
  delta: DeltaAnalysis,
  onTask: boolean,
  config: {
    isFirstFrame?: boolean;
    isLastFrame?: boolean;
    timeSinceLastSelected?: number; // Minutes since last selected frame
    selectedWindowApps?: string[]; // Apps that user selected to monitor
  } = {}
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  // Base score for changed frames
  if (delta.changed) {
    const changeWeights: Record<DeltaChangeType, number> = {
      content_edit: 0.9,
      file_switch: 0.8,
      navigation: 0.7,
      focus_change: 0.5,
      scroll: 0.3,
      none: 0.1,
    };
    const changeScore = changeWeights[delta.changeType] || 0.1;
    score += changeScore * 0.4; // 40% weight for change type
    reasons.push(`${delta.changeType} change (+${(changeScore * 0.4).toFixed(2)})`);
  }

  // On-task bonus
  if (onTask) {
    score += 0.2;
    reasons.push("On-task (+0.20)");
  }

  // First/last frame bonus (important for context)
  if (config.isFirstFrame) {
    score += 0.15;
    reasons.push("First frame (+0.15)");
  }
  if (config.isLastFrame) {
    score += 0.15;
    reasons.push("Last frame (+0.15)");
  }

  // Temporal diversity bonus (avoid selecting consecutive frames)
  if (config.timeSinceLastSelected && config.timeSinceLastSelected > 15) {
    const diversityBonus = Math.min((config.timeSinceLastSelected - 15) * 0.01, 0.2);
    score += diversityBonus;
    reasons.push(`Temporal diversity (+${diversityBonus.toFixed(2)})`);
  }

  // Selected window bonus (user explicitly chose to monitor this app)
  if (
    config.selectedWindowApps &&
    config.selectedWindowApps.some((app) => frame.appName.toLowerCase().includes(app.toLowerCase()))
  ) {
    score += 0.1;
    reasons.push("Selected window (+0.10)");
  }

  // Clamp score to 0-1 range
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    reason: reasons.join(", "),
  };
}

/**
 * Select Top-K frames from a list
 */
export function selectTopKFrames(
  frames: Array<{
    frameId: string;
    importanceScore: number;
    timestamp: string;
  }>,
  k: number = 10,
  config: {
    temporalBucketMinutes?: number; // Group frames into buckets to ensure diversity
    maxPerBucket?: number; // Max frames to select from each bucket
  } = {}
): string[] {
  const { temporalBucketMinutes = 15, maxPerBucket = 2 } = config;

  // Group frames into temporal buckets
  const buckets = new Map<number, typeof frames>();

  for (const frame of frames) {
    const timestamp = new Date(frame.timestamp).getTime();
    const bucketKey = Math.floor(timestamp / (temporalBucketMinutes * 60 * 1000));

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    buckets.get(bucketKey)!.push(frame);
  }

  // Sort frames within each bucket by importance score
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => b.importanceScore - a.importanceScore);
  }

  // Select top frames from each bucket
  const selectedFrames: typeof frames = [];
  const sortedBucketKeys = [...buckets.keys()].sort((a, b) => a - b);

  // First pass: select top from each bucket
  for (const bucketKey of sortedBucketKeys) {
    const bucket = buckets.get(bucketKey)!;
    const toSelect = bucket.slice(0, maxPerBucket);
    selectedFrames.push(...toSelect);
  }

  // Sort by importance and take top K
  selectedFrames.sort((a, b) => b.importanceScore - a.importanceScore);

  return selectedFrames.slice(0, k).map((f) => f.frameId);
}

/**
 * Process a batch of frames for delta detection
 */
export function processBatchDelta(frames: FrameForDelta[]): DeltaDetectionResult[] {
  const results: DeltaDetectionResult[] = [];

  for (let i = 0; i < frames.length; i++) {
    const currentFrame = frames[i];
    const previousFrame = i > 0 ? frames[i - 1] : null;

    const delta = detectDelta(currentFrame, previousFrame);
    const { onTask, taskRelevance } = determineOnTask(currentFrame);
    const { score, reason } = calculateImportanceScore(currentFrame, delta, onTask, {
      isFirstFrame: i === 0,
      isLastFrame: i === frames.length - 1,
    });

    results.push({
      frameId: currentFrame.frameId,
      delta,
      onTask,
      taskRelevance,
      importanceScore: score,
      importanceReason: reason,
    });
  }

  return results;
}
