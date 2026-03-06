import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db/client";
import * as schema from "../../db/schema";
import { config } from "../../config";
import { createLogger } from "../../lib/logger";
import { graphClientService } from "./graph-client.service";
import type { GraphSyncResult } from "./types";

const logger = createLogger({ context: "graph-sync" });

class GraphSyncService {
  async runNightlySync(): Promise<GraphSyncResult> {
    const startedAt = new Date();
    let runId: string | null = null;

    try {
      const [run] = await db
        .insert(schema.graphSyncRuns)
        .values({
          startedAt,
          success: false,
          metadata: { mode: "nightly" },
        })
        .returning({ id: schema.graphSyncRuns.id });
      runId = run?.id || null;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to initialize graph sync run row"
      );
    }

    if (!config.graph.enabled) {
      const finishedAt = new Date();
      const disabledResult = {
        success: true,
        syncedUsers: 0,
        syncedWorkstreams: 0,
        syncedPreferences: 0,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
      };

      if (runId) {
        await db
          .update(schema.graphSyncRuns)
          .set({
            finishedAt,
            success: true,
            durationMs: disabledResult.durationMs,
            syncedUsers: 0,
            syncedWorkstreams: 0,
            syncedPreferences: 0,
          })
          .where(eq(schema.graphSyncRuns.id, runId));
      }

      return disabledResult;
    }

    try {
      await graphClientService.healthCheck();

      const since = new Date(Date.now() - config.graph.lookbackDays * 24 * 60 * 60 * 1000);

      const [userCountRow] = await db
        .select({ count: sql<number>`count(distinct ${schema.monitoringSessions.userId})::int` })
        .from(schema.monitoringSessions)
        .where(gte(schema.monitoringSessions.updatedAt, since));

      const [workstreamCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.sessionWorkstreams)
        .where(gte(schema.sessionWorkstreams.updatedAt, since));

      const [preferenceCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.userMemories)
        .where(
          and(
            gte(schema.userMemories.updatedAt, since),
            sql`${schema.userMemories.category} in ('summary_style', 'recap_style')`
          )
        );

      // Neo4j write operations are intentionally staged for the next iteration.
      // This sync currently provides extraction counts and observability hooks.
      const finishedAt = new Date();
      const result: GraphSyncResult = {
        success: true,
        syncedUsers: Number(userCountRow?.count || 0),
        syncedWorkstreams: Number(workstreamCountRow?.count || 0),
        syncedPreferences: Number(preferenceCountRow?.count || 0),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
      };

      if (runId) {
        await db
          .update(schema.graphSyncRuns)
          .set({
            finishedAt,
            success: true,
            durationMs: result.durationMs,
            syncedUsers: result.syncedUsers,
            syncedWorkstreams: result.syncedWorkstreams,
            syncedPreferences: result.syncedPreferences,
          })
          .where(eq(schema.graphSyncRuns.id, runId));
      }

      logger.info(result, "Graph nightly sync completed");
      return result;
    } catch (error) {
      const finishedAt = new Date();
      const result: GraphSyncResult = {
        success: false,
        syncedUsers: 0,
        syncedWorkstreams: 0,
        syncedPreferences: 0,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };

      if (runId) {
        await db
          .update(schema.graphSyncRuns)
          .set({
            finishedAt,
            success: false,
            durationMs: result.durationMs,
            error: result.error || null,
          })
          .where(eq(schema.graphSyncRuns.id, runId));
      }

      logger.error({ error: result.error }, "Graph nightly sync failed");
      return result;
    }
  }
}

export const graphSyncService = new GraphSyncService();
