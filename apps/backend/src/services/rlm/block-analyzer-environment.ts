/**
 * Block Analyzer RLM Environment
 *
 * Holds all data for a single monitoring session.
 * The RLM interacts with this environment through tools to classify
 * the session's activities into named work and meeting blocks with
 * rich topic, subscriber, and category attribution.
 *
 * Data sources:
 *   - Session captures (classifier-enriched screenshots)
 *   - Audio transcripts (speaker-diarized, timestamped)
 *   - Master story (storyteller narrative)
 *   - Session metadata (start/end, goal, app list)
 */

export interface SessionMeta {
  sessionId: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMinutes: number;
  name: string | null;
  sessionGoal: string | null;
  linearIssueTitle: string | null;
  captureCount: number;
  hasTranscripts: boolean;
  hasMasterStory: boolean;
}

export interface SessionCapture {
  id: string;
  capturedAt: Date;
  appName: string | null;
  windowTitle: string | null;
  activityDescription: string | null;
  classifierData: {
    actionType?: string;
    events?: Array<{ type: string; verb: string; object: string; via?: string }>;
    entities?: { people: string[]; systems: string[] };
    metrics?: {
      messages_composed: number;
      links_opened: number;
      pastes_performed: number;
    };
    isContinuation?: boolean;
  } | null;
  deltaChanged: boolean;
  deltaChangeType: string | null;
  importanceScore: number;
}

export interface SessionTranscript {
  speakerId: number;
  transcript: string;
  startTime: Date;
  endTime: Date;
  confidence: number;
}

export interface SessionMasterStory {
  narrativeSummary: string;
  generationTimeMs: number | null;
}

export interface EmittedBlock {
  type: "work" | "meeting";
  name: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  description: string;
  apps: string[];
  category: string;
  participants?: string[];
  sourceSessionIds: string[];
  topicName?: string;
  subscriberName?: string;
}

export interface BlockAnalyzerUserProfile {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
}

const CAPTURE_PAGE_SIZE = 30;
const TRANSCRIPT_PAGE_SIZE = 20;

/**
 * BlockAnalyzerEnvironment
 *
 * The "E" in the RLM pattern. Holds all data for a single session
 * and provides paginated access via tools.
 */
export class BlockAnalyzerEnvironment {
  private emittedBlocks: EmittedBlock[] = [];

  constructor(
    public readonly session: SessionMeta,
    public readonly userProfile: BlockAnalyzerUserProfile,
    private readonly captures: SessionCapture[],
    private readonly transcripts: SessionTranscript[],
    private readonly masterStory: SessionMasterStory | null
  ) {}

  // ──────────────────────────────────────────────
  // Overview
  // ──────────────────────────────────────────────

  getSessionOverview() {
    const totalCaptures = this.captures.length;
    const totalTranscriptRows = this.transcripts.length;

    const firstCapture = this.captures.length > 0 ? this.captures[0].capturedAt : null;
    const lastCapture =
      this.captures.length > 0 ? this.captures[this.captures.length - 1].capturedAt : null;

    const uniqueApps = [
      ...new Set(this.captures.map((c) => c.appName).filter(Boolean) as string[]),
    ];

    // App time distribution (rough estimate from capture density)
    const appCounts = new Map<string, number>();
    for (const c of this.captures) {
      if (c.appName) {
        appCounts.set(c.appName, (appCounts.get(c.appName) || 0) + 1);
      }
    }
    const appDistribution = [...appCounts.entries()]
      .map(([app, count]) => ({
        app,
        captureCount: count,
        estimatedPct: totalCaptures > 0 ? Math.round((count / totalCaptures) * 100) : 0,
      }))
      .sort((a, b) => b.captureCount - a.captureCount);

    return {
      sessionId: this.session.sessionId,
      user: {
        name: [this.userProfile.firstName, this.userProfile.lastName].filter(Boolean).join(" "),
        jobTitle: this.userProfile.jobTitle,
      },
      startedAt: this.session.startedAt,
      endedAt: this.session.endedAt,
      durationMinutes: this.session.durationMinutes,
      name: this.session.name,
      goal: this.session.sessionGoal || this.session.linearIssueTitle,
      totalCaptures,
      totalTranscriptRows,
      hasTranscripts: this.session.hasTranscripts,
      hasMasterStory: this.session.hasMasterStory,
      firstActivity: firstCapture,
      lastActivity: lastCapture,
      uniqueApps,
      appDistribution,
    };
  }

  // ──────────────────────────────────────────────
  // Master Story
  // ──────────────────────────────────────────────

  getMasterStory(): SessionMasterStory | null {
    return this.masterStory;
  }

  // ──────────────────────────────────────────────
  // Captures (paginated)
  // ──────────────────────────────────────────────

  getCaptures(page: number): {
    captures: SessionCapture[];
    page: number;
    totalPages: number;
    totalCaptures: number;
  } {
    const totalPages = Math.ceil(this.captures.length / CAPTURE_PAGE_SIZE);
    const start = page * CAPTURE_PAGE_SIZE;
    const end = start + CAPTURE_PAGE_SIZE;

    return {
      captures: this.captures.slice(start, end).map((c) => ({
        id: c.id,
        capturedAt: c.capturedAt,
        appName: c.appName,
        windowTitle: c.windowTitle,
        activityDescription: c.activityDescription,
        classifierData: c.classifierData,
        deltaChanged: c.deltaChanged,
        deltaChangeType: c.deltaChangeType,
        importanceScore: c.importanceScore,
      })),
      page,
      totalPages,
      totalCaptures: this.captures.length,
    };
  }

  // ──────────────────────────────────────────────
  // Transcripts (paginated)
  // ──────────────────────────────────────────────

  getTranscripts(page: number): {
    transcripts: SessionTranscript[];
    page: number;
    totalPages: number;
    totalRows: number;
  } {
    const totalPages = Math.ceil(this.transcripts.length / TRANSCRIPT_PAGE_SIZE);
    const start = page * TRANSCRIPT_PAGE_SIZE;
    const end = start + TRANSCRIPT_PAGE_SIZE;

    return {
      transcripts: this.transcripts.slice(start, end),
      page,
      totalPages,
      totalRows: this.transcripts.length,
    };
  }

  // ──────────────────────────────────────────────
  // Captures by time range
  // ──────────────────────────────────────────────

  getCapturesByTimeRange(startTime: Date, endTime: Date): SessionCapture[] {
    return this.captures.filter((c) => c.capturedAt >= startTime && c.capturedAt <= endTime);
  }

  // ──────────────────────────────────────────────
  // Block emission
  // ──────────────────────────────────────────────

  emitBlock(block: EmittedBlock): { blockIndex: number; totalBlocks: number } {
    this.emittedBlocks.push(block);
    return {
      blockIndex: this.emittedBlocks.length - 1,
      totalBlocks: this.emittedBlocks.length,
    };
  }

  getEmittedBlocks(): EmittedBlock[] {
    return [...this.emittedBlocks].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  // ──────────────────────────────────────────────
  // Stats for finalization
  // ──────────────────────────────────────────────

  computeSessionStats() {
    const blocks = this.getEmittedBlocks();

    const totalWorkMinutes = blocks
      .filter((b) => b.type === "work")
      .reduce((sum, b) => sum + b.durationMinutes, 0);

    const totalMeetingMinutes = blocks
      .filter((b) => b.type === "meeting")
      .reduce((sum, b) => sum + b.durationMinutes, 0);

    const totalActiveMinutes = totalWorkMinutes + totalMeetingMinutes;

    // App breakdown
    const appMinutes = new Map<string, number>();
    for (const block of blocks) {
      const perAppMinutes = block.durationMinutes / Math.max(block.apps.length, 1);
      for (const app of block.apps) {
        appMinutes.set(app, (appMinutes.get(app) || 0) + perAppMinutes);
      }
    }
    const appBreakdown = [...appMinutes.entries()]
      .map(([app, minutes]) => ({ app, minutes: Math.round(minutes) }))
      .sort((a, b) => b.minutes - a.minutes);

    // Category breakdown
    const categoryMinutes = new Map<string, number>();
    for (const block of blocks) {
      const cat = block.category || "other";
      categoryMinutes.set(cat, (categoryMinutes.get(cat) || 0) + block.durationMinutes);
    }
    const categoryBreakdown = [...categoryMinutes.entries()]
      .map(([category, minutes]) => ({
        category,
        minutes,
        percentage: totalActiveMinutes > 0 ? Math.round((minutes / totalActiveMinutes) * 100) : 0,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    // Topic breakdown
    const topicMinutes = new Map<string, number>();
    for (const block of blocks) {
      if (block.topicName) {
        topicMinutes.set(
          block.topicName,
          (topicMinutes.get(block.topicName) || 0) + block.durationMinutes
        );
      }
    }
    const topicBreakdown = [...topicMinutes.entries()]
      .map(([topicName, minutes]) => ({
        topicName,
        minutes,
        percentage: totalActiveMinutes > 0 ? Math.round((minutes / totalActiveMinutes) * 100) : 0,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    // Subscriber breakdown
    const subscriberMinutes = new Map<string, number>();
    for (const block of blocks) {
      if (block.subscriberName) {
        subscriberMinutes.set(
          block.subscriberName,
          (subscriberMinutes.get(block.subscriberName) || 0) + block.durationMinutes
        );
      }
    }
    const subscriberBreakdown = [...subscriberMinutes.entries()]
      .map(([subscriberName, minutes]) => ({
        subscriberName,
        minutes,
        percentage: totalActiveMinutes > 0 ? Math.round((minutes / totalActiveMinutes) * 100) : 0,
      }))
      .sort((a, b) => b.minutes - a.minutes);

    return {
      totalWorkMinutes,
      totalMeetingMinutes,
      totalActiveMinutes,
      workPercentage:
        totalActiveMinutes > 0 ? Math.round((totalWorkMinutes / totalActiveMinutes) * 100) : 0,
      meetingPercentage:
        totalActiveMinutes > 0 ? Math.round((totalMeetingMinutes / totalActiveMinutes) * 100) : 0,
      appBreakdown,
      categoryBreakdown,
      topicBreakdown,
      subscriberBreakdown,
      blockCount: blocks.length,
      workBlockCount: blocks.filter((b) => b.type === "work").length,
      meetingBlockCount: blocks.filter((b) => b.type === "meeting").length,
    };
  }
}
