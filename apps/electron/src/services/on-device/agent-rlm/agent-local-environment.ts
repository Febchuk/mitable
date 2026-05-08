/**
 * Agent Local Environment
 *
 * Local SQLite-backed data access layer for the on-device Agent RLM.
 * Replaces AgentQueryEnvironment (which uses Postgres backend).
 */

import { promises as fs } from "fs";
import { localDb } from "../localDb";

const MAX_BLOCK_MD_CHARS = 15_000;

export class AgentLocalEnvironment {
  constructor(private userId: string) {}

  async getMyActivity(startDate?: string, endDate?: string) {
    const now = new Date();
    const end = endDate ? new Date(endDate + "T23:59:59") : now;
    const start = startDate
      ? new Date(startDate + "T00:00:00")
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const startMs = start.getTime();
    const endMs = end.getTime();

    const sessions = localDb
      .getAllSessionsByDateRange(startMs, endMs)
      .filter((s) => s.userId === this.userId);

    const result: Array<{
      id: string;
      type: string;
      date: string;
      startTime: string;
      endTime: string | null;
      durationMinutes: number;
      summary: string | null;
      status: string;
    }> = [];

    for (const session of sessions) {
      const story = localDb.getStoryForSession(session.id);
      const durationMs =
        (session.endedAt ?? Date.now()) - session.startedAt - (session.totalPausedMs ?? 0);

      result.push({
        id: session.id,
        type: "session",
        date: new Date(session.startedAt).toISOString().split("T")[0],
        startTime: new Date(session.startedAt).toISOString(),
        endTime: session.endedAt ? new Date(session.endedAt).toISOString() : null,
        durationMinutes: Math.round(durationMs / 60_000),
        summary: story?.narrative ?? session.finalSummary ?? null,
        status: session.status,
      });
    }

    return {
      dateRange: { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] },
      sessions: result,
      totalSessions: result.length,
      totalMinutes: result.reduce((sum, s) => sum + s.durationMinutes, 0),
    };
  }

  async getActivityDetail(id: string, type: "block" | "session" | "document") {
    if (type === "session" || type === "block") {
      const session = localDb.getMonitoringSession(id);
      if (!session) return { error: "Session not found" };

      // Try reading the block.md file — it has everything: summary, frame descriptions, transcripts
      const exportPath = localDb.getExportPath(id);
      if (exportPath) {
        try {
          let content = await fs.readFile(exportPath, "utf-8");
          if (content.length > MAX_BLOCK_MD_CHARS) {
            content =
              content.slice(0, MAX_BLOCK_MD_CHARS) +
              "\n\n[... truncated — file too large for single read ...]";
          }
          return {
            id: session.id,
            type: "session",
            source: "block.md",
            content,
          };
        } catch {
          // File missing or unreadable — fall back to DB assembly
        }
      }

      // Fallback: assemble from DB tables
      const story = localDb.getStoryForSession(id);
      const captures = localDb.getCapturesForSession(id);
      const transcriptions = localDb.getTranscriptionsForSession(id);

      const appCounts = new Map<string, number>();
      for (const cap of captures) {
        appCounts.set(cap.appName, (appCounts.get(cap.appName) ?? 0) + 1);
      }

      const topApps = [...appCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([app, count]) => ({ app, captureCount: count }));

      const transcript = transcriptions
        .map((t) => `[${t.source === "user" ? "You" : "Other"}] ${t.transcript}`)
        .join("\n");

      return {
        id: session.id,
        type: "session",
        source: "database",
        startTime: new Date(session.startedAt).toISOString(),
        endTime: session.endedAt ? new Date(session.endedAt).toISOString() : null,
        durationMinutes: Math.round(
          ((session.endedAt ?? Date.now()) - session.startedAt - (session.totalPausedMs ?? 0)) /
            60_000
        ),
        summary: story?.narrative ?? session.finalSummary ?? null,
        tasks: story?.tasks ? JSON.parse(story.tasks) : [],
        topApps,
        audioTranscript: transcript || null,
        captureCount: captures.length,
      };
    }

    return { error: `Type '${type}' not supported in local mode` };
  }

  async searchDocuments(query: string, limit?: number) {
    const chunks = localDb.searchDocChunks(query, this.userId, limit || 10);
    if (chunks.length === 0) {
      return { results: [], message: "No matching document content found." };
    }
    return {
      results: chunks.map((c) => ({
        documentName: c.documentName,
        chunkIndex: c.chunkIndex,
        content: c.content,
        rank: c.rank,
      })),
      totalResults: chunks.length,
    };
  }

  async listDocuments() {
    const docs = localDb.listDocuments(this.userId);
    return {
      documents: docs.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        fileType: d.fileType,
        fileSize: d.fileSize,
        chunkCount: d.chunkCount,
        status: d.status,
        createdAt: new Date(d.createdAt).toISOString(),
      })),
      totalDocuments: docs.length,
    };
  }
}
