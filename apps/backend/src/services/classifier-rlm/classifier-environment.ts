/**
 * Classifier RLM Environment
 *
 * The environment holds all context data accessible to Classifier tools.
 */

export interface ClassifierContext {
  userId: string;
  sessionId: string;
  frameId: string;
  currentDelta: string;
  windowInfo?: {
    appName: string;
    windowTitle: string;
  };
  intervalEvidence?: {
    keyboardEventCount: number;
    copyCount: number;
    pasteCount: number;
    cutCount: number;
    mouseClickCount: number;
    mouseScrollCount: number;
  };
  previousDeltas?: Array<{
    description: string;
    timestamp: string;
  }>;
  recentHistory?: string[];
  timeElapsedSec?: number;
  userPersona?: {
    jobTitle?: string;
    regularTasks?: string[];
    regularApps?: string[];
    additionalContext?: string;
  };
}

export interface BatchContext {
  userId: string;
  sessionId: string;
  batchStartTime: number; // UNIX timestamp
  batchEndTime: number; // UNIX timestamp
  captures: Array<{
    frameId: string;
    windowInfo: {
      windowSourceId: string;
      appName: string;
      windowTitle: string;
    };
    capturedAt: number; // UNIX timestamp
    timestampISO: string; // ISO formatted timestamp
    sequenceNumber: number;
    hasPreviousFrame: boolean;
    deltaDescription?: string; // Visual change description from sensor (after analysis)
    deltaChanged?: boolean; // Whether visual change was detected
  }>;
  activityEvents: Array<{
    type: "keyboard" | "copy" | "paste" | "cut" | "click" | "scroll";
    timestampUnix: number;
    timestampISO: string;
  }>;
  activityTimeline: Array<{
    sequenceNumber: number;
    capturedAt: Date;
    activityDescription: string;
    classifierData?: any;
    windows: Array<{ appName: string; windowTitle: string }>;
  }>;
  userPersona?: {
    jobTitle?: string;
    regularTasks?: string[];
    regularApps?: string[];
    additionalContext?: string;
  };
  sessionGoal?: string;
}

/**
 * ClassifierEnvironment
 *
 * Represents the data environment for the Classifier RLM.
 * Tools operate on this environment to analyze context, evidence, and verify classifications.
 */
export class ClassifierEnvironment {
  private cache = new Map<string, any>();

  constructor(public readonly context: ClassifierContext | BatchContext) {}

  /**
   * Cache intermediate results (e.g., evidence analysis)
   */
  setCache(key: string, value: any): void {
    this.cache.set(key, value);
  }

  getCache(key: string): any | undefined {
    return this.cache.get(key);
  }

  hasCache(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Check if this is a batch context
   */
  isBatchContext(): boolean {
    return "batchStartTime" in this.context;
  }

  /**
   * Get all available context (single frame mode)
   */
  getContext() {
    if (this.isBatchContext()) {
      throw new Error("getContext() called on batch context - use getBatchContext() instead");
    }
    const ctx = this.context as ClassifierContext;
    return {
      currentDelta: ctx.currentDelta,
      previousDeltas: ctx.previousDeltas || [],
      recentHistory: ctx.recentHistory || [],
      timeElapsed: ctx.timeElapsedSec,
      windowInfo: ctx.windowInfo,
      userPersona: ctx.userPersona,
    };
  }

  /**
   * Get batch context (batch mode)
   */
  getBatchContext() {
    if (!this.isBatchContext()) {
      throw new Error("getBatchContext() called on single frame context");
    }
    return this.context as BatchContext;
  }

  /**
   * Get all evidence data (single frame mode)
   */
  getEvidence() {
    if (this.isBatchContext()) {
      return undefined;
    }
    return (this.context as ClassifierContext).intervalEvidence;
  }
}
