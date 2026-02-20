/**
 * Day Analyzer RLM Environment
 *
 * Holds all of a user's session data for a single day.
 * The RLM interacts with this environment through tools to reconstruct
 * the user's day as a timeline of named work and meeting blocks.
 *
 * Data sources:
 *   - Classifier output (activityDescription, actionType, events, entities)
 *   - Master stories (storyteller narrative per session)
 *   - Audio transcripts (speaker-diarized, timestamped)
 *   - Session metadata (start/end times, selected windows, goals)
 */

export interface DaySession {
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

export interface DayCapture {
  id: string;
  sessionId: string;
  capturedAt: Date;
  appName: string | null;
  windowTitle: string | null;
  activityDescription: string | null;
  classifierData: {
    actionType?: string;
    events?: Array<{ type: string; verb: string; object: string; via?: string }>;
    entities?: { people: string[]; systems: string[] };
    metrics?: { messages_composed: number; links_opened: number; pastes_performed: number };
    isContinuation?: boolean;
  } | null;
  deltaChanged: boolean;
  deltaChangeType: string | null;
  importanceScore: number;
}

export interface DayTranscript {
  sessionId: string;
  speakerId: number;
  transcript: string;
  startTime: Date;
  endTime: Date;
  confidence: number;
}

export interface DayMasterStory {
  sessionId: string;
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
}

export interface DayAnalyzerUserProfile {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  regularTasks: string[];
  regularApps: string[];
}

const CAPTURE_PAGE_SIZE = 30;
const TRANSCRIPT_PAGE_SIZE = 20;

/**
 * DayAnalyzerEnvironment
 *
 * The "E" in the RLM pattern. Holds all data for a user's day
 * and provides paginated access via tools.
 */
export class DayAnalyzerEnvironment {
  private emittedBlocks: EmittedBlock[] = [];
  private cache = new Map<string, any>();

  constructor(
    public readonly date: Date,
    public readonly userProfile: DayAnalyzerUserProfile,
    public readonly sessions: DaySession[],
    private readonly captures: DayCapture[],
    private readonly transcripts: DayTranscript[],
    private readonly masterStories: DayMasterStory[]
  ) {}

  // ──────────────────────────────────────────────
  // Overview
  // ──────────────────────────────────────────────

  getDayOverview() {
    const totalCaptures = this.captures.length;
    const totalTranscriptRows = this.transcripts.length;
    const sessionsWithTranscripts = this.sessions.filter((s) => s.hasTranscripts).length;
    const sessionsWithStories = this.sessions.filter((s) => s.hasMasterStory).length;

    // Calculate total tracked time from sessions
    const totalTrackedMinutes = this.sessions.reduce((sum, s) => sum + s.durationMinutes, 0);

    // Find day boundaries
    const firstCapture = this.captures.length > 0 ? this.captures[0].capturedAt : null;
    const lastCapture =
      this.captures.length > 0 ? this.captures[this.captures.length - 1].capturedAt : null;

    // Unique apps used
    const uniqueApps = [
      ...new Set(this.captures.map((c) => c.appName).filter(Boolean) as string[]),
    ];

    return {
      date: this.date.toISOString().split("T")[0],
      user: {
        name: [this.userProfile.firstName, this.userProfile.lastName].filter(Boolean).join(" "),
        jobTitle: this.userProfile.jobTitle,
        regularApps: this.userProfile.regularApps,
      },
      sessionCount: this.sessions.length,
      totalCaptures,
      totalTranscriptRows,
      sessionsWithTranscripts,
      sessionsWithStories,
      totalTrackedMinutes,
      firstActivity: firstCapture,
      lastActivity: lastCapture,
      uniqueApps,
      sessions: this.sessions.map((s) => ({
        sessionId: s.sessionId,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationMinutes: s.durationMinutes,
        name: s.name,
        goal: s.sessionGoal || s.linearIssueTitle,
        captureCount: s.captureCount,
        hasTranscripts: s.hasTranscripts,
        hasMasterStory: s.hasMasterStory,
      })),
    };
  }

  // ──────────────────────────────────────────────
  // Session-level access
  // ──────────────────────────────────────────────

  getMasterStory(sessionId: string): DayMasterStory | null {
    return this.masterStories.find((s) => s.sessionId === sessionId) || null;
  }

  getSessionCaptures(
    sessionId: string,
    page: number
  ): {
    captures: DayCapture[];
    page: number;
    totalPages: number;
    totalCaptures: number;
  } {
    const sessionCaptures = this.captures.filter((c) => c.sessionId === sessionId);
    const totalPages = Math.ceil(sessionCaptures.length / CAPTURE_PAGE_SIZE);
    const start = page * CAPTURE_PAGE_SIZE;
    const end = start + CAPTURE_PAGE_SIZE;

    return {
      captures: sessionCaptures.slice(start, end).map((c) => ({
        id: c.id,
        sessionId: c.sessionId,
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
      totalCaptures: sessionCaptures.length,
    };
  }

  getSessionTranscripts(
    sessionId: string,
    page: number
  ): {
    transcripts: DayTranscript[];
    page: number;
    totalPages: number;
    totalRows: number;
  } {
    const sessionTranscripts = this.transcripts.filter((t) => t.sessionId === sessionId);
    const totalPages = Math.ceil(sessionTranscripts.length / TRANSCRIPT_PAGE_SIZE);
    const start = page * TRANSCRIPT_PAGE_SIZE;
    const end = start + TRANSCRIPT_PAGE_SIZE;

    return {
      transcripts: sessionTranscripts.slice(start, end),
      page,
      totalPages,
      totalRows: sessionTranscripts.length,
    };
  }

  // ──────────────────────────────────────────────
  // Cross-session capture access (time-ordered)
  // ──────────────────────────────────────────────

  getCapturesByTimeRange(startTime: Date, endTime: Date): DayCapture[] {
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
  // Cache
  // ──────────────────────────────────────────────

  setCache(key: string, value: any): void {
    this.cache.set(key, value);
  }

  getCache(key: string): any | undefined {
    return this.cache.get(key);
  }

  hasCache(key: string): boolean {
    return this.cache.has(key);
  }

  // ──────────────────────────────────────────────
  // Stats for finalization
  // ──────────────────────────────────────────────

  computeDayStats() {
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
      blockCount: blocks.length,
      workBlockCount: blocks.filter((b) => b.type === "work").length,
      meetingBlockCount: blocks.filter((b) => b.type === "meeting").length,
    };
  }
}
