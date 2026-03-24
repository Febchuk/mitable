/**
 * Storyteller RLM Environment
 *
 * The "environment variable" (E) that holds all data accessible to Storyteller tools.
 * This is the TypeScript equivalent of the Python REPL variable from the RLM paper.
 */

export interface ClassifierEvent {
  type: "navigation" | "composition" | "paste" | "view" | "edit";
  verb: string;
  object: string;
  via?: string;
}

export interface Activity {
  activityDescription: string;
  capturedAt: Date;
  classifierData?: {
    actionType?: "VIEWING" | "NAVIGATION" | "PASTING" | "AUTHORING" | "EDITING" | "READING";
    events?: ClassifierEvent[];
    entities?: {
      people: string[];
      systems: string[];
    };
    metrics?: {
      messages_composed: number;
      links_opened: number;
      pastes_performed: number;
    };
    isContinuation?: boolean;
  };
}

export interface SessionMetadata {
  sessionId: string;
  totalActivities: number;
  durationMinutes: number;
  startTime: Date;
  endTime: Date;
}

/**
 * StorytellerEnvironment
 *
 * Represents the data environment for the Storyteller RLM.
 * Tools operate on this environment to chunk, filter, and summarize the timeline.
 */
export class StorytellerEnvironment {
  private cache = new Map<string, any>();

  constructor(
    public readonly timeline: Activity[],
    public readonly fullTranscriptText: string | undefined,
    public readonly metadata: SessionMetadata
  ) {}

  /**
   * Cache intermediate results (e.g., chunk summaries)
   * Prevents redundant LLM calls during recursive summarization
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
   * Get a slice of the timeline
   */
  getSlice(start: number, end: number): Activity[] {
    return this.timeline.slice(start, end);
  }

  /**
   * Get timeline statistics
   */
  getStats() {
    return {
      count: this.timeline.length,
      durationMinutes: this.metadata.durationMinutes,
      startTime: this.metadata.startTime,
      endTime: this.metadata.endTime,
    };
  }
}
