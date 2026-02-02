/**
 * SessionChunkingService - Intelligent chunking for session data (classifier + storyteller)
 *
 * Philosophy:
 * - Sessions are activity timelines, not conversations
 * - Chunk by semantic activity groups, not arbitrary token counts
 * - Preserve temporal coherence (activities in same time window stay together)
 *
 * Chunking Strategy:
 * 1. Classifier chunks: Group events by time windows (5-10 min) or activity type
 * 2. Storyteller summary: 1-2 chunks from narrative summary
 * 3. Storyteller timeline: Optional detailed timeline chunks
 */

import { encoding_for_model } from "tiktoken";
import type { SessionCapture, SessionSummary } from "../db/schema/monitoring.schema.js";

const tokenizer = encoding_for_model("gpt-3.5-turbo");

/**
 * Classifier chunk - represents a group of classification events
 */
export interface ClassifierChunk {
  chunkType: "classifier";
  chunkIndex: number;
  text: string;
  metadata: {
    entities: {
      people: string[];
      systems: string[];
    };
    timeRange: {
      start: string;
      end: string;
    };
    activityCount: number;
    eventTypes: string[];
    captureIds: string[];
  };
}

/**
 * Storyteller summary chunk - narrative summary from storyteller
 */
export interface StorytellerSummaryChunk {
  chunkType: "storyteller_summary";
  chunkIndex: number;
  text: string;
  metadata: {
    timeRange: {
      start: string;
      end: string;
    };
    activityCount: number;
    hasSummary: boolean;
  };
}

/**
 * Storyteller timeline chunk - detailed timeline of activities
 */
export interface StorytellerTimelineChunk {
  chunkType: "storyteller_timeline";
  chunkIndex: number;
  text: string;
  metadata: {
    timeRange: {
      start: string;
      end: string;
    };
    activityCount: number;
    captureIds: string[];
  };
}

export type SessionChunk = ClassifierChunk | StorytellerSummaryChunk | StorytellerTimelineChunk;

export class SessionChunkingService {
  private static readonly MAX_CHUNK_TOKENS = 800;
  private static readonly TIME_WINDOW_MINUTES = 10; // Group activities within 10-minute windows

  /**
   * Chunk session data into semantically meaningful chunks
   */
  static async chunkSession(
    sessionId: string,
    sessionName: string | null,
    sessionGoal: string | null,
    sessionStart: Date,
    sessionEnd: Date | null,
    captures: SessionCapture[],
    summary: SessionSummary | null
  ): Promise<SessionChunk[]> {
    const chunks: SessionChunk[] = [];

    // 1. Chunk classifier data (activity events)
    const classifierChunks = await this.chunkClassifierData(
      sessionId,
      sessionName,
      sessionGoal,
      sessionStart,
      captures
    );
    chunks.push(...classifierChunks);

    // 2. Chunk storyteller summary
    if (summary) {
      const summaryChunks = await this.chunkStorytellerSummary(sessionStart, sessionEnd, summary);
      chunks.push(...summaryChunks);
    }

    // 3. Optional: Chunk storyteller timeline (if needed for detailed activity queries)
    // const timelineChunks = await this.chunkStorytellerTimeline(sessionStart, captures);
    // chunks.push(...timelineChunks);

    return chunks;
  }

  /**
   * Chunk classifier data into time-based activity groups
   */
  private static async chunkClassifierData(
    sessionId: string,
    sessionName: string | null,
    sessionGoal: string | null,
    sessionStart: Date,
    captures: SessionCapture[]
  ): Promise<ClassifierChunk[]> {
    const chunks: ClassifierChunk[] = [];

    // Filter captures with classifier data
    const classifiedCaptures = captures.filter((c) => c.classifierData);

    if (classifiedCaptures.length === 0) {
      return chunks;
    }

    // Group captures by time windows
    const timeWindows = this.groupByTimeWindows(classifiedCaptures, this.TIME_WINDOW_MINUTES);

    let chunkIndex = 0;
    for (const window of timeWindows) {
      const text = this.buildClassifierChunkText(
        sessionId,
        sessionName,
        sessionGoal,
        sessionStart,
        window
      );
      const tokenCount = this.countTokens(text);

      // If window is too large, split it
      if (tokenCount > this.MAX_CHUNK_TOKENS) {
        const splitChunks = this.splitLargeWindow(
          sessionId,
          sessionName,
          sessionGoal,
          sessionStart,
          window,
          chunkIndex
        );
        chunks.push(...splitChunks);
        chunkIndex += splitChunks.length;
      } else {
        chunks.push({
          chunkType: "classifier",
          chunkIndex: chunkIndex++,
          text,
          metadata: this.extractClassifierMetadata(window),
        });
      }
    }

    return chunks;
  }

  /**
   * Chunk storyteller summary
   */
  private static async chunkStorytellerSummary(
    sessionStart: Date,
    sessionEnd: Date | null,
    summary: SessionSummary
  ): Promise<StorytellerSummaryChunk[]> {
    const chunks: StorytellerSummaryChunk[] = [];

    const narrativeText = this.buildStorytellerSummaryText(summary);
    const tokenCount = this.countTokens(narrativeText);

    // If summary is small enough, keep as single chunk
    if (tokenCount <= this.MAX_CHUNK_TOKENS) {
      chunks.push({
        chunkType: "storyteller_summary",
        chunkIndex: 0,
        text: narrativeText,
        metadata: {
          timeRange: {
            start: sessionStart.toISOString(),
            end: sessionEnd?.toISOString() || new Date().toISOString(),
          },
          activityCount: Array.isArray(summary.activities) ? summary.activities.length : 0,
          hasSummary: true,
        },
      });
    } else {
      // Split large summaries by sentence boundaries
      const sentences = narrativeText.split(/(?<=[.!?])\s+/);
      let currentChunk = "";
      let chunkIndex = 0;

      for (const sentence of sentences) {
        const testChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
        const testTokens = this.countTokens(testChunk);

        if (testTokens > this.MAX_CHUNK_TOKENS && currentChunk) {
          chunks.push({
            chunkType: "storyteller_summary",
            chunkIndex: chunkIndex++,
            text: currentChunk,
            metadata: {
              timeRange: {
                start: sessionStart.toISOString(),
                end: sessionEnd?.toISOString() || new Date().toISOString(),
              },
              activityCount: Array.isArray(summary.activities) ? summary.activities.length : 0,
              hasSummary: true,
            },
          });
          currentChunk = sentence;
        } else {
          currentChunk = testChunk;
        }
      }

      // Add remaining chunk
      if (currentChunk) {
        chunks.push({
          chunkType: "storyteller_summary",
          chunkIndex: chunkIndex++,
          text: currentChunk,
          metadata: {
            timeRange: {
              start: sessionStart.toISOString(),
              end: sessionEnd?.toISOString() || new Date().toISOString(),
            },
            activityCount: Array.isArray(summary.activities) ? summary.activities.length : 0,
            hasSummary: true,
          },
        });
      }
    }

    return chunks;
  }

  /**
   * Group captures into time windows
   */
  private static groupByTimeWindows(
    captures: SessionCapture[],
    windowMinutes: number
  ): SessionCapture[][] {
    if (captures.length === 0) return [];

    const windows: SessionCapture[][] = [];
    let currentWindow: SessionCapture[] = [captures[0]];
    let windowStart = new Date(captures[0].capturedAt);

    for (let i = 1; i < captures.length; i++) {
      const capture = captures[i];
      const captureTime = new Date(capture.capturedAt);
      const minutesSinceWindowStart = (captureTime.getTime() - windowStart.getTime()) / 1000 / 60;

      if (minutesSinceWindowStart <= windowMinutes) {
        currentWindow.push(capture);
      } else {
        windows.push(currentWindow);
        currentWindow = [capture];
        windowStart = captureTime;
      }
    }

    // Add final window
    if (currentWindow.length > 0) {
      windows.push(currentWindow);
    }

    return windows;
  }

  /**
   * Build text for classifier chunk
   */
  private static buildClassifierChunkText(
    _sessionId: string,
    sessionName: string | null,
    sessionGoal: string | null,
    sessionStart: Date,
    captures: SessionCapture[]
  ): string {
    const lines: string[] = [];

    lines.push(`Session: ${sessionName || "Unnamed Session"}`);
    if (sessionGoal) {
      lines.push(`Goal: ${sessionGoal}`);
    }
    lines.push(
      `Date: ${sessionStart.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
    );
    lines.push(
      `Time Window: ${new Date(captures[0].capturedAt).toLocaleTimeString()} - ${new Date(captures[captures.length - 1].capturedAt).toLocaleTimeString()}`
    );
    lines.push("");

    lines.push("Activities:");
    for (const capture of captures) {
      if (capture.activityDescription) {
        const time = new Date(capture.capturedAt).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        });
        lines.push(`${time} - ${capture.activityDescription}`);

        // Add entity context if available
        const classifierData = capture.classifierData as any;
        if (classifierData?.entities) {
          const { people, systems } = classifierData.entities;
          if (people?.length > 0) {
            lines.push(`  People: ${people.join(", ")}`);
          }
          if (systems?.length > 0) {
            lines.push(`  Systems: ${systems.join(", ")}`);
          }
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Build text for storyteller summary chunk
   */
  private static buildStorytellerSummaryText(summary: SessionSummary): string {
    const lines: string[] = [];

    lines.push("Session Summary:");
    lines.push("");
    lines.push(summary.narrativeSummary);

    return lines.join("\n");
  }

  /**
   * Extract metadata from classifier captures
   */
  private static extractClassifierMetadata(captures: SessionCapture[]) {
    const allPeople = new Set<string>();
    const allSystems = new Set<string>();
    const eventTypes = new Set<string>();

    for (const capture of captures) {
      if (capture.classifierData) {
        const data = capture.classifierData as any;

        // Extract entities
        if (data.entities?.people) {
          data.entities.people.forEach((p: string) => allPeople.add(p));
        }
        if (data.entities?.systems) {
          data.entities.systems.forEach((s: string) => allSystems.add(s));
        }

        // Extract event types
        if (data.actionType) {
          eventTypes.add(data.actionType);
        }
      }
    }

    return {
      entities: {
        people: Array.from(allPeople),
        systems: Array.from(allSystems),
      },
      timeRange: {
        start: captures[0].capturedAt.toISOString(),
        end: captures[captures.length - 1].capturedAt.toISOString(),
      },
      activityCount: captures.length,
      eventTypes: Array.from(eventTypes),
      captureIds: captures.map((c) => c.id),
    };
  }

  /**
   * Split large time window into smaller chunks
   */
  private static splitLargeWindow(
    _sessionId: string,
    sessionName: string | null,
    sessionGoal: string | null,
    sessionStart: Date,
    captures: SessionCapture[],
    startIndex: number
  ): ClassifierChunk[] {
    const chunks: ClassifierChunk[] = [];
    const midpoint = Math.floor(captures.length / 2);
    const firstHalf = captures.slice(0, midpoint);
    const secondHalf = captures.slice(midpoint);

    const firstText = this.buildClassifierChunkText(
      _sessionId,
      sessionName,
      sessionGoal,
      sessionStart,
      firstHalf
    );
    const secondText = this.buildClassifierChunkText(
      _sessionId,
      sessionName,
      sessionGoal,
      sessionStart,
      secondHalf
    );

    chunks.push({
      chunkType: "classifier",
      chunkIndex: startIndex,
      text: firstText,
      metadata: this.extractClassifierMetadata(firstHalf),
    });

    chunks.push({
      chunkType: "classifier",
      chunkIndex: startIndex + 1,
      text: secondText,
      metadata: this.extractClassifierMetadata(secondHalf),
    });

    return chunks;
  }

  /**
   * Count tokens in text
   */
  private static countTokens(text: string): number {
    return tokenizer.encode(text).length;
  }
}
