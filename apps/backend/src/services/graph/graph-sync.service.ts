import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db/client";
import * as schema from "../../db/schema";
import { config } from "../../config";
import { createLogger } from "../../lib/logger";
import { graphClientService } from "./graph-client.service";
import { graphRetrievalService } from "./graph-retrieval.service";
import type { GraphSyncResult } from "./types";

const logger = createLogger({ context: "graph-sync" });

class GraphSyncService {
  private async syncUsersToGraph(since: Date): Promise<number> {
    const users = await db
      .selectDistinct({
        userId: schema.monitoringSessions.userId,
        orgId: schema.monitoringSessions.organizationId,
      })
      .from(schema.monitoringSessions)
      .where(gte(schema.monitoringSessions.updatedAt, since));

    if (users.length === 0) return 0;

    let synced = 0;
    for (const user of users) {
      const profile = await graphRetrievalService.getUserGraphProfile(user.userId, user.orgId);

      await graphClientService.runQuery(
        `
        MERGE (org:Organization {orgId: $orgId})
        MERGE (person:Person {personKey: $personKey})
        SET person.orgId = $orgId, person.updatedAt = datetime()
        MERGE (person)-[:MEMBER_OF]->(org)
        `,
        { orgId: user.orgId, personKey: profile.personKey }
      );

      for (const task of profile.topTasks) {
        await graphClientService.runQuery(
          `
          MERGE (person:Person {personKey: $personKey})
          MERGE (task:TaskArchetype {name: $taskName})
          MERGE (person)-[r:PERFORMS]->(task)
          SET r.weight = $score, r.evidenceCount = $evidenceCount, r.lastSeenAt = datetime()
          `,
          {
            personKey: profile.personKey,
            taskName: task.object,
            score: task.score,
            evidenceCount: task.evidenceCount,
          }
        );
      }

      for (const app of profile.topApps) {
        await graphClientService.runQuery(
          `
          MERGE (person:Person {personKey: $personKey})
          MERGE (app:App {name: $appName})
          MERGE (person)-[r:USES_APP]->(app)
          SET r.weight = $score, r.evidenceCount = $evidenceCount, r.lastSeenAt = datetime()
          `,
          {
            personKey: profile.personKey,
            appName: app.object,
            score: app.score,
            evidenceCount: app.evidenceCount,
          }
        );
      }

      for (const pref of profile.preferences) {
        await graphClientService.runQuery(
          `
          MERGE (person:Person {personKey: $personKey})
          MERGE (pref:Preference {value: $value})
          MERGE (person)-[r:PREFERS]->(pref)
          SET r.weight = $score, r.lastSeenAt = datetime()
          `,
          {
            personKey: profile.personKey,
            value: pref.object,
            score: pref.score,
          }
        );
      }

      synced++;
    }

    return synced;
  }

  private async getSinceFromWatermark(defaultLookbackDays: number): Promise<Date> {
    const [row] = await db
      .select({ watermarkTs: schema.graphSyncWatermarks.watermarkTs })
      .from(schema.graphSyncWatermarks)
      .where(eq(schema.graphSyncWatermarks.source, "monitoring_sessions"))
      .limit(1);

    if (row?.watermarkTs) {
      return new Date(row.watermarkTs);
    }

    return new Date(Date.now() - defaultLookbackDays * 24 * 60 * 60 * 1000);
  }

  private async upsertWatermark(source: string, watermarkTs: Date, watermarkValue?: string) {
    await db
      .insert(schema.graphSyncWatermarks)
      .values({
        source,
        watermarkTs,
        watermarkValue: watermarkValue || null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.graphSyncWatermarks.source,
        set: {
          watermarkTs,
          watermarkValue: watermarkValue || null,
          updatedAt: new Date(),
        },
      });
  }

  private async materializeVisibilitySnapshots(lookbackDays: number): Promise<number> {
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const orgs = await db
      .selectDistinct({ organizationId: schema.monitoringSessions.organizationId })
      .from(schema.monitoringSessions)
      .where(gte(schema.monitoringSessions.updatedAt, since));

    if (orgs.length === 0) return 0;

    let snapshotCount = 0;
    for (const org of orgs) {
      const [overview] = await db
        .select({
          sessionCount: sql<number>`count(distinct ${schema.monitoringSessions.id})::int`,
          userCount: sql<number>`count(distinct ${schema.monitoringSessions.userId})::int`,
          workstreamCount: sql<number>`count(${schema.sessionWorkstreams.id})::int`,
          totalDurationMinutes: sql<number>`coalesce(sum(${schema.sessionWorkstreams.totalDurationMinutes}), 0)::int`,
        })
        .from(schema.monitoringSessions)
        .leftJoin(
          schema.sessionWorkstreams,
          eq(schema.monitoringSessions.id, schema.sessionWorkstreams.sessionId)
        )
        .where(
          and(
            eq(schema.monitoringSessions.organizationId, org.organizationId),
            gte(schema.monitoringSessions.updatedAt, since)
          )
        );

      const categories = await db
        .select({
          category: schema.sessionWorkstreams.category,
          totalDurationMinutes: sql<number>`sum(${schema.sessionWorkstreams.totalDurationMinutes})::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.sessionWorkstreams)
        .innerJoin(
          schema.monitoringSessions,
          eq(schema.sessionWorkstreams.sessionId, schema.monitoringSessions.id)
        )
        .where(
          and(
            eq(schema.monitoringSessions.organizationId, org.organizationId),
            gte(schema.sessionWorkstreams.updatedAt, since)
          )
        )
        .groupBy(schema.sessionWorkstreams.category);

      await db.insert(schema.workflowVisibilitySnapshots).values({
        organizationId: org.organizationId,
        userId: null,
        window: `${lookbackDays}d`,
        snapshotDate: new Date(),
        payload: {
          generatedAt: new Date().toISOString(),
          overview: {
            sessionCount: Number(overview?.sessionCount || 0),
            userCount: Number(overview?.userCount || 0),
            workstreamCount: Number(overview?.workstreamCount || 0),
            totalDurationMinutes: Number(overview?.totalDurationMinutes || 0),
          },
          categories: categories.map((row) => ({
            category: row.category || "uncategorized",
            totalDurationMinutes: Number(row.totalDurationMinutes || 0),
            count: Number(row.count || 0),
          })),
        },
      });
      snapshotCount++;
    }

    return snapshotCount;
  }

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
      const healthy = await graphClientService.healthCheck();
      if (!healthy) {
        throw new Error("Neo4j health check failed");
      }

      const since = await this.getSinceFromWatermark(config.graph.lookbackDays);
      const syncedUsersToGraph = await this.syncUsersToGraph(since);

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

      const snapshotsCreated = await this.materializeVisibilitySnapshots(config.graph.lookbackDays);

      const finishedAt = new Date();
      const result: GraphSyncResult = {
        success: true,
        syncedUsers: syncedUsersToGraph || Number(userCountRow?.count || 0),
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
            metadata: {
              mode: "nightly",
              lookbackDays: config.graph.lookbackDays,
              snapshotsCreated,
            },
          })
          .where(eq(schema.graphSyncRuns.id, runId));
      }

      await Promise.all([
        this.upsertWatermark("monitoring_sessions", finishedAt, finishedAt.toISOString()),
        this.upsertWatermark("session_workstreams", finishedAt, finishedAt.toISOString()),
        this.upsertWatermark("user_memories", finishedAt, finishedAt.toISOString()),
      ]);

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
