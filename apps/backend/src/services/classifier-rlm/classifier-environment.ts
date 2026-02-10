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
  sceneContext?: string; // Scene context from sensor (meeting participants, screen sharing, app environment)
  audioContext?: string; // Audio transcripts from ±5 seconds around screenshot
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

/**
 * ClassifierEnvironment
 *
 * Represents the data environment for the Classifier RLM.
 * Tools operate on this environment to analyze context, evidence, and verify classifications.
 */
export class ClassifierEnvironment {
  private cache = new Map<string, any>();

  constructor(public readonly context: ClassifierContext) {}

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
   * Get all available context
   */
  getContext() {
    return {
      currentDelta: this.context.currentDelta,
      sceneContext: this.context.sceneContext,
      audioContext: this.context.audioContext,
      previousDeltas: this.context.previousDeltas || [],
      recentHistory: this.context.recentHistory || [],
      timeElapsed: this.context.timeElapsedSec,
      windowInfo: this.context.windowInfo,
      userPersona: this.context.userPersona,
    };
  }

  /**
   * Get all evidence data
   */
  getEvidence() {
    return this.context.intervalEvidence;
  }
}
