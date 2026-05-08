/**
 * Storyteller RLM Environment
 *
 * Holds all classifications and transcriptions for a session. The storyteller
 * peeks via tools, summarizes in chunks, and merges into a final narrative.
 * Caches intermediate chunk summaries to avoid re-processing.
 */

import type { CompletionFn } from "./local-rlm-engine";
import type { LocalClassification, LocalTranscription } from "../pgDb";

export interface StoryTask {
  description: string;
  minutes: number;
}

export class StorytellerEnvironment {
  public readonly sessionId: string;
  public readonly classifications: LocalClassification[];
  public readonly transcriptions: LocalTranscription[];
  public readonly completionFn: CompletionFn;
  public readonly totalMinutes: number;

  private chunkSummaryCache = new Map<string, string>();
  private finalStory: { narrative: string; tasks: StoryTask[] } | null = null;

  constructor(opts: {
    sessionId: string;
    classifications: LocalClassification[];
    transcriptions: LocalTranscription[];
    completionFn: CompletionFn;
    totalMinutes?: number;
  }) {
    this.sessionId = opts.sessionId;
    this.classifications = opts.classifications;
    this.transcriptions = opts.transcriptions;
    this.completionFn = opts.completionFn;
    this.totalMinutes = opts.totalMinutes ?? this.computeTotalMinutes();
  }

  private computeTotalMinutes(): number {
    if (this.classifications.length < 2) return 1;
    const first = this.classifications[0].createdAt;
    const last = this.classifications[this.classifications.length - 1].createdAt;
    return Math.max(1, Math.round((last - first) / 60_000));
  }

  cacheChunkSummary(key: string, summary: string): void {
    this.chunkSummaryCache.set(key, summary);
  }

  getChunkSummary(key: string): string | undefined {
    return this.chunkSummaryCache.get(key);
  }

  getAllChunkSummaries(): Array<{ key: string; summary: string }> {
    return [...this.chunkSummaryCache.entries()].map(([key, summary]) => ({
      key,
      summary,
    }));
  }

  setFinalStory(story: { narrative: string; tasks: StoryTask[] }): void {
    this.finalStory = story;
  }

  getFinalStory(): { narrative: string; tasks: StoryTask[] } | null {
    return this.finalStory;
  }
}
