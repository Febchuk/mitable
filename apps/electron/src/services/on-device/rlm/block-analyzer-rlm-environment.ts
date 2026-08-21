/**
 * Block Analyzer RLM Environment (On-Device)
 *
 * Holds all data for a single session's block analysis.
 * The RLM reads block.md content, classifications, and captures
 * via tools to produce named activity blocks with client/topic attribution.
 */

import type { LocalClassification, LocalCapture, LocalTranscription } from "../pgDb";

export interface BlockAnalyzerSessionMeta {
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  durationMinutes: number;
  name: string | null;
  sessionGoal: string | null;
  captureCount: number;
  classificationCount: number;
  hasTranscripts: boolean;
  hasStory: boolean;
}

export interface EmittedBlock {
  type: "work" | "meeting";
  name: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  description: string;
  apps: string[];
  category: string;
  participants?: string[];
  topicName?: string;
  clientName?: string;
}

export interface KnownClient {
  name: string;
  totalMinutes: number;
  recentApps: string[];
  lastSeenDate: string;
}

const CONTENT_PAGE_SIZE = 4000;
const CAPTURES_PAGE_SIZE = 30;

export class BlockAnalyzerEnvironment {
  private emittedBlocks: EmittedBlock[] = [];

  constructor(
    public readonly session: BlockAnalyzerSessionMeta,
    private readonly blockMdContent: string,
    private readonly storyNarrative: string | null,
    private readonly classifications: LocalClassification[],
    private readonly captures: LocalCapture[],
    private readonly transcripts: LocalTranscription[],
    private readonly knownClients: KnownClient[]
  ) {}

  getSessionOverview() {
    const uniqueApps = [...new Set(this.captures.map((c) => c.appName).filter(Boolean))];

    const appCounts = new Map<string, number>();
    for (const c of this.captures) {
      if (c.appName) {
        appCounts.set(c.appName, (appCounts.get(c.appName) ?? 0) + 1);
      }
    }
    const appDistribution = [...appCounts.entries()]
      .map(([app, count]) => ({
        app,
        captureCount: count,
        estimatedPct:
          this.captures.length > 0 ? Math.round((count / this.captures.length) * 100) : 0,
      }))
      .sort((a, b) => b.captureCount - a.captureCount);

    return {
      sessionId: this.session.sessionId,
      startedAt: new Date(this.session.startedAt).toISOString(),
      endedAt: this.session.endedAt ? new Date(this.session.endedAt).toISOString() : null,
      durationMinutes: this.session.durationMinutes,
      name: this.session.name,
      goal: this.session.sessionGoal,
      captureCount: this.session.captureCount,
      classificationCount: this.session.classificationCount,
      hasTranscripts: this.session.hasTranscripts,
      hasStory: this.session.hasStory,
      blockMdLength: this.blockMdContent.length,
      uniqueApps,
      appDistribution,
    };
  }

  getStory(): { available: boolean; narrative?: string } {
    if (!this.storyNarrative) {
      return { available: false };
    }
    return { available: true, narrative: this.storyNarrative };
  }

  /**
   * Paginated access to block.md content.
   * For long sessions this can be huge, so we chunk it.
   */
  getBlockContent(page: number): {
    content: string;
    page: number;
    totalPages: number;
    totalChars: number;
  } {
    const totalPages = Math.max(1, Math.ceil(this.blockMdContent.length / CONTENT_PAGE_SIZE));
    const start = page * CONTENT_PAGE_SIZE;
    const end = Math.min(start + CONTENT_PAGE_SIZE, this.blockMdContent.length);

    return {
      content: this.blockMdContent.slice(start, end),
      page,
      totalPages,
      totalChars: this.blockMdContent.length,
    };
  }

  getCaptures(page: number): {
    captures: Array<{
      sequenceNumber: number;
      capturedAt: number;
      appName: string;
      windowTitle: string;
      sensorOutput: string;
    }>;
    page: number;
    totalPages: number;
    totalCaptures: number;
  } {
    const totalPages = Math.max(1, Math.ceil(this.captures.length / CAPTURES_PAGE_SIZE));
    const start = page * CAPTURES_PAGE_SIZE;
    const slice = this.captures.slice(start, start + CAPTURES_PAGE_SIZE);

    return {
      captures: slice.map((c) => ({
        sequenceNumber: c.sequenceNumber,
        capturedAt: c.capturedAt,
        appName: c.appName,
        windowTitle: c.windowTitle,
        sensorOutput: c.sensorOutput?.slice(0, 200) ?? "",
      })),
      page,
      totalPages,
      totalCaptures: this.captures.length,
    };
  }

  getClassifications(): Array<{
    batchIndex: number;
    startSequence: number;
    endSequence: number;
    activityDescription: string;
    activityType: string | null;
    importanceScore: number;
  }> {
    return this.classifications.map((c) => ({
      batchIndex: c.batchIndex,
      startSequence: c.startSequence,
      endSequence: c.endSequence,
      activityDescription: c.activityDescription,
      activityType: c.activityType,
      importanceScore: c.importanceScore,
    }));
  }

  getTranscripts(page: number): {
    transcripts: Array<{
      speakerId: number;
      transcript: string;
      startTimeMs: number;
      endTimeMs: number;
    }>;
    page: number;
    totalPages: number;
  } {
    const pageSize = 20;
    const totalPages = Math.max(1, Math.ceil(this.transcripts.length / pageSize));
    const start = page * pageSize;
    const slice = this.transcripts.slice(start, start + pageSize);

    return {
      transcripts: slice.map((t) => ({
        speakerId: t.speakerId,
        transcript: t.transcript,
        startTimeMs: t.startTimeMs,
        endTimeMs: t.endTimeMs,
      })),
      page,
      totalPages,
    };
  }

  getKnownClients(): { totalClients: number; clients: KnownClient[] } {
    return {
      totalClients: this.knownClients.length,
      clients: this.knownClients,
    };
  }

  emitBlock(block: EmittedBlock): { blockIndex: number; totalBlocks: number } {
    this.emittedBlocks.push(block);
    return {
      blockIndex: this.emittedBlocks.length - 1,
      totalBlocks: this.emittedBlocks.length,
    };
  }

  getEmittedBlocks(): EmittedBlock[] {
    return [...this.emittedBlocks].sort((a, b) => a.startMs - b.startMs);
  }

  listBlocks(): {
    totalBlocks: number;
    blocks: Array<{
      index: number;
      type: string;
      name: string;
      startMs: number;
      endMs: number;
      durationMinutes: number;
      category: string;
      topic?: string;
      client?: string;
    }>;
  } {
    const blocks = this.getEmittedBlocks();
    return {
      totalBlocks: blocks.length,
      blocks: blocks.map((b, i) => ({
        index: i,
        type: b.type,
        name: b.name,
        startMs: b.startMs,
        endMs: b.endMs,
        durationMinutes: Math.round(b.durationMs / 60000),
        category: b.category,
        topic: b.topicName,
        client: b.clientName,
      })),
    };
  }
}
