import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq, and, desc, sql, inArray, gte, lte } from "drizzle-orm";
import { db } from "../../../../db/client.js";
import * as schema from "../../../../db/schema/index.js";

export function registerSessionTools(server: McpServer, organizationId: string) {
  // ─── get_sessions ───────────────────────────────────────────────────
  server.registerTool(
    "get_sessions",
    {
      description:
        "List monitoring sessions with optional filters. Returns session metadata, duration, and capture counts.",
      inputSchema: {
        userId: z.string().uuid().optional().describe("Filter by specific user ID"),
        status: z
          .string()
          .optional()
          .describe("Filter by status: active, paused, ended, summarizing, ready, delivered"),
        dateFrom: z.string().optional().describe("ISO date string — sessions started on or after"),
        dateTo: z.string().optional().describe("ISO date string — sessions started on or before"),
        page: z.number().int().min(1).default(1).describe("Page number"),
        limit: z.number().int().min(1).max(100).default(20).describe("Results per page"),
      },
    },
    async ({ userId, status, dateFrom, dateTo, page, limit }) => {
      const conditions: any[] = [eq(schema.monitoringSessions.organizationId, organizationId)];

      if (userId) conditions.push(eq(schema.monitoringSessions.userId, userId));
      if (status) conditions.push(eq(schema.monitoringSessions.status, status));
      if (dateFrom) conditions.push(gte(schema.monitoringSessions.startedAt, new Date(dateFrom)));
      if (dateTo) conditions.push(lte(schema.monitoringSessions.startedAt, new Date(dateTo)));

      const offset = (page - 1) * limit;

      const [countResult, sessions] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.monitoringSessions)
          .where(and(...conditions)),
        db
          .select({
            id: schema.monitoringSessions.id,
            userId: schema.monitoringSessions.userId,
            name: schema.monitoringSessions.name,
            status: schema.monitoringSessions.status,
            sessionType: schema.monitoringSessions.sessionType,
            startedAt: schema.monitoringSessions.startedAt,
            endedAt: schema.monitoringSessions.endedAt,
            totalPausedMs: schema.monitoringSessions.totalPausedMs,
            finalSummary: schema.monitoringSessions.finalSummary,
          })
          .from(schema.monitoringSessions)
          .where(and(...conditions))
          .orderBy(desc(schema.monitoringSessions.startedAt))
          .limit(limit)
          .offset(offset),
      ]);

      // Get capture counts in batch
      const sessionIds = sessions.map((s) => s.id);
      let captureCounts: Record<string, number> = {};
      if (sessionIds.length > 0) {
        const counts = await db
          .select({
            sessionId: schema.sessionCaptures.sessionId,
            count: sql<number>`count(*)::int`,
          })
          .from(schema.sessionCaptures)
          .where(inArray(schema.sessionCaptures.sessionId, sessionIds))
          .groupBy(schema.sessionCaptures.sessionId);
        captureCounts = Object.fromEntries(counts.map((c) => [c.sessionId, c.count]));
      }

      const total = countResult[0]?.count ?? 0;
      const enriched = sessions.map((s) => {
        const totalMs = s.endedAt
          ? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()
          : Date.now() - new Date(s.startedAt).getTime();
        return {
          ...s,
          captureCount: captureCounts[s.id] ?? 0,
          durationMinutes: Math.round((totalMs - (s.totalPausedMs ?? 0)) / 60000),
        };
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              sessions: enriched,
              pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            }),
          },
        ],
      };
    }
  );

  // ─── get_session_detail ─────────────────────────────────────────────
  server.registerTool(
    "get_session_detail",
    {
      description:
        "Get full details of a single session including summary, workstreams, and key frames.",
      inputSchema: {
        sessionId: z.string().uuid().describe("The session ID"),
      },
    },
    async ({ sessionId }) => {
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(
          and(
            eq(schema.monitoringSessions.id, sessionId),
            eq(schema.monitoringSessions.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!session) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: "Session not found" }) },
          ],
        };
      }

      const [captureCountResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.sessionCaptures)
        .where(eq(schema.sessionCaptures.sessionId, sessionId));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              session: {
                id: session.id,
                userId: session.userId,
                name: session.name,
                status: session.status,
                sessionType: session.sessionType,
                sessionGoal: session.sessionGoal,
                startedAt: session.startedAt,
                endedAt: session.endedAt,
                totalPausedMs: session.totalPausedMs,
                finalSummary: session.finalSummary,
                rawActivitySummary: session.rawActivitySummary,
                keyActivities: session.keyActivities,
                accomplishments: session.accomplishments,
                blockers: session.blockers,
                timeBreakdown: session.timeBreakdown,
                taskBreakdown: session.taskBreakdown,
                captureCount: captureCountResult?.count ?? 0,
              },
            }),
          },
        ],
      };
    }
  );

  // ─── search_sessions ────────────────────────────────────────────────
  server.registerTool(
    "search_sessions",
    {
      description:
        "Semantic search across session data using natural language queries. Returns relevant session chunks ranked by similarity.",
      inputSchema: {
        query: z.string().describe("Natural language search query"),
        userId: z.string().uuid().optional().describe("Filter to a specific user's sessions"),
        topK: z.number().int().min(1).max(50).default(10).describe("Number of results"),
      },
    },
    async ({ query, userId, topK }) => {
      // Dynamic import to avoid circular dependency issues
      const { sessionRetrieverService } =
        await import("../../../../services/session-retriever.service.js");

      // If no userId specified, we need to pick one for the service (it requires userId).
      // For org-wide search, we pass a placeholder and rely on org scoping.
      // The service requires userId for security — we need to pass a valid user.
      if (!userId) {
        // Get all users in the org and search across them
        const orgUsers = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.organizationId, organizationId));

        const allChunks: any[] = [];
        for (const u of orgUsers) {
          try {
            const result = await sessionRetrieverService.search({
              query,
              organizationId,
              userId: u.id,
              topK,
            });
            allChunks.push(...result.chunks);
          } catch {
            // Skip users with no indexed sessions
          }
        }

        // Sort by similarity and take top K
        allChunks.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
        const topResults = allChunks.slice(0, topK);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ results: topResults }),
            },
          ],
        };
      }

      const result = await sessionRetrieverService.search({
        query,
        organizationId,
        userId,
        topK,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ results: result.chunks }),
          },
        ],
      };
    }
  );

  // ─── get_day_summary ────────────────────────────────────────────────
  server.registerTool(
    "get_day_summary",
    {
      description: "Get an AI-generated summary of a user's work day.",
      inputSchema: {
        userId: z.string().uuid().describe("The user to summarize"),
        date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today."),
      },
    },
    async ({ userId, date }) => {
      const targetDate = date ?? new Date().toISOString().slice(0, 10);
      const dayStart = new Date(targetDate + "T00:00:00.000Z");
      const dayEnd = new Date(targetDate + "T23:59:59.999Z");

      // Verify user belongs to this org
      const [user] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(eq(schema.users.id, userId), eq(schema.users.organizationId, organizationId)))
        .limit(1);

      if (!user) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "User not found in this organization" }),
            },
          ],
        };
      }

      const sessions = await db
        .select({
          id: schema.monitoringSessions.id,
          name: schema.monitoringSessions.name,
          finalSummary: schema.monitoringSessions.finalSummary,
          rawActivitySummary: schema.monitoringSessions.rawActivitySummary,
          startedAt: schema.monitoringSessions.startedAt,
          endedAt: schema.monitoringSessions.endedAt,
          totalPausedMs: schema.monitoringSessions.totalPausedMs,
        })
        .from(schema.monitoringSessions)
        .where(
          and(
            eq(schema.monitoringSessions.userId, userId),
            eq(schema.monitoringSessions.organizationId, organizationId),
            gte(schema.monitoringSessions.startedAt, dayStart),
            lte(schema.monitoringSessions.startedAt, dayEnd)
          )
        );

      if (sessions.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ summary: null, message: "No sessions found for this date" }),
            },
          ],
        };
      }

      // Build summary from existing session summaries
      const summaryParts = sessions.map((s) => {
        const summary = s.finalSummary || s.rawActivitySummary;
        const duration = s.endedAt
          ? Math.round(
              (new Date(s.endedAt).getTime() -
                new Date(s.startedAt).getTime() -
                (s.totalPausedMs ?? 0)) /
                60000
            )
          : null;
        return `Session: ${s.name || "Unnamed"} (${duration ? `${duration} min` : "in progress"})\n${summary || "No summary available"}`;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              date: targetDate,
              userId,
              sessionCount: sessions.length,
              sessionSummaries: summaryParts.join("\n\n---\n\n"),
            }),
          },
        ],
      };
    }
  );
}
