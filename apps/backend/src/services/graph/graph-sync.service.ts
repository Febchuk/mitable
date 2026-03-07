import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db/client";
import * as schema from "../../db/schema/index";
import { config } from "../../config";
import { createLogger } from "../../lib/logger";
import { graphClientService } from "./graph-client.service";
import { graphRetrievalService } from "./graph-retrieval.service";
import { graphMapperService } from "./graph-mapper.service";
import { graphScoringService } from "./graph-scoring.service";
import { SOURCE_RELIABILITY_WEIGHTS } from "./task-archetype-map";
import type { GraphSyncResultV2 } from "./types";

const logger = createLogger({ context: "graph-sync" });

function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.max(0, (now - then) / (24 * 60 * 60 * 1000));
}

class GraphSyncService {
  /**
   * Enhanced sync: runs the mapper pipeline then writes enriched data to Neo4j.
   */
  private async syncUsersViaMapper(since: Date): Promise<{
    syncedUsers: number;
    syncedAppBehaviors: number;
    syncedPatterns: number;
    syncedPreferences: number;
    pipelineStats: GraphSyncResultV2["pipelineStats"];
  }> {
    const users = await db
      .selectDistinct({
        userId: schema.monitoringSessions.userId,
        orgId: schema.monitoringSessions.organizationId,
      })
      .from(schema.monitoringSessions)
      .where(gte(schema.monitoringSessions.updatedAt, since));

    if (users.length === 0) {
      return { syncedUsers: 0, syncedAppBehaviors: 0, syncedPatterns: 0, syncedPreferences: 0, pipelineStats: undefined };
    }

    // Run the full pipeline (Stages A-D)
    const pipelineResult = await graphMapperService.runPipeline(users, since);

    let syncedAppBehaviors = 0;
    let syncedPatterns = 0;
    let syncedPreferences = 0;

    // Index pipeline outputs by user for efficient lookup
    const behaviorsByUser = new Map<string, typeof pipelineResult.appBehaviors>();
    for (const b of pipelineResult.appBehaviors) {
      const list = behaviorsByUser.get(b.userId) || [];
      list.push(b);
      behaviorsByUser.set(b.userId, list);
    }

    for (const user of users) {
      const profile = await graphRetrievalService.getUserGraphProfile(user.userId, user.orgId);

      // MERGE Person + Organization (unchanged)
      await graphClientService.runQuery(
        `
        MERGE (org:Organization {orgId: $orgId})
        MERGE (person:Person {personKey: $personKey})
        SET person.orgId = $orgId, person.updatedAt = datetime()
        MERGE (person)-[:MEMBER_OF]->(org)
        `,
        { orgId: user.orgId, personKey: profile.personKey }
      );

      // Write top tasks with scored weights
      for (const task of profile.topTasks) {
        const { weight } = graphScoringService.computeWeight({
          oldWeight: 0,
          daysSinceLastSeen: task.lastSeenAt ? daysSince(task.lastSeenAt) : 0,
          sourceReliability: SOURCE_RELIABILITY_WEIGHTS.workstream!,
          confidence: Math.min(1, task.score / 100),
        });

        await graphClientService.runQuery(
          `
          MERGE (person:Person {personKey: $personKey})
          MERGE (task:TaskArchetype {name: $taskName})
          MERGE (person)-[r:PERFORMS]->(task)
          SET r.weight = $weight, r.evidenceCount = $evidenceCount, r.lastSeenAt = datetime()
          `,
          {
            personKey: profile.personKey,
            taskName: task.object,
            weight,
            evidenceCount: task.evidenceCount,
          }
        );
      }

      // Write top apps with scored weights
      for (const app of profile.topApps) {
        const { weight } = graphScoringService.computeWeight({
          oldWeight: 0,
          daysSinceLastSeen: app.lastSeenAt ? daysSince(app.lastSeenAt) : 0,
          sourceReliability: SOURCE_RELIABILITY_WEIGHTS.session_capture!,
          confidence: Math.min(1, app.score / 100),
        });

        await graphClientService.runQuery(
          `
          MERGE (person:Person {personKey: $personKey})
          MERGE (app:App {name: $appName})
          MERGE (person)-[r:USES_APP]->(app)
          SET r.weight = $weight, r.evidenceCount = $evidenceCount, r.lastSeenAt = datetime()
          `,
          {
            personKey: profile.personKey,
            appName: app.object,
            weight,
            evidenceCount: app.evidenceCount,
          }
        );
      }

      // AppBehavior writes (new from pipeline)
      const userBehaviors = behaviorsByUser.get(user.userId) || [];
      for (const behavior of userBehaviors) {
        const { weight } = graphScoringService.computeWeight({
          oldWeight: 0,
          daysSinceLastSeen: 0,
          sourceReliability: SOURCE_RELIABILITY_WEIGHTS.session_capture!,
          confidence: behavior.confidence,
        });

        await graphClientService.runQuery(
          `
          MERGE (person:Person {personKey: $personKey})
          MERGE (app:App {name: $appName})
          MERGE (appBeh:AppBehavior {key: $behaviorKey})
          SET appBeh.statement = $statement,
              appBeh.topActivities = $topActivities,
              appBeh.evidenceCount = $evidenceCount,
              appBeh.updatedAt = datetime()
          MERGE (person)-[:USES_APP]->(app)
          MERGE (person)-[r:DOES_IN_APP]->(appBeh)
          SET r.weight = $weight, r.lastSeenAt = datetime()
          MERGE (appBeh)-[:FOR_APP]->(app)
          `,
          {
            personKey: profile.personKey,
            appName: behavior.appName,
            behaviorKey: `${profile.personKey}::${behavior.appName}`,
            statement: behavior.behaviorStatement,
            topActivities: behavior.topActivities,
            evidenceCount: behavior.evidenceCount,
            weight,
          }
        );
        syncedAppBehaviors++;
      }

      // TaskArchetype writes from pipeline
      for (const mapping of pipelineResult.archetypeMappings) {
        const { weight } = graphScoringService.computeWeight({
          oldWeight: 0,
          daysSinceLastSeen: 0,
          sourceReliability: SOURCE_RELIABILITY_WEIGHTS.workstream!,
          confidence: mapping.confidence,
        });

        await graphClientService.runQuery(
          `
          MERGE (person:Person {personKey: $personKey})
          MERGE (task:TaskArchetype {name: $archetypeKey})
          SET task.displayName = $displayName, task.domainKey = $domainKey
          MERGE (person)-[r:PERFORMS]->(task)
          SET r.weight = $weight, r.evidenceCount = $evidenceCount, r.lastSeenAt = datetime()
          `,
          {
            personKey: profile.personKey,
            archetypeKey: mapping.archetypeKey,
            displayName: mapping.displayName,
            domainKey: mapping.domainKey,
            weight,
            evidenceCount: mapping.evidenceCount,
          }
        );
      }

      // Preferences (existing logic)
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
        syncedPreferences++;
      }
    }

    // WorkflowPattern writes (global, not per-user)
    for (const pattern of pipelineResult.workflowPatterns) {
      await graphClientService.runQuery(
        `
        MERGE (pattern:WorkflowPattern {patternKey: $patternKey})
        SET pattern.displayName = $displayName,
            pattern.taskChain = $taskChain,
            pattern.supportCount = $supportCount,
            pattern.confidence = $confidence,
            pattern.avgDurationMinutes = $avgDurationMinutes,
            pattern.updatedAt = datetime()
        `,
        {
          patternKey: pattern.patternKey,
          displayName: pattern.displayName,
          taskChain: pattern.taskChain,
          supportCount: pattern.supportCount,
          confidence: pattern.confidence,
          avgDurationMinutes: pattern.avgDurationMinutes,
        }
      );

      // Link pattern to constituent tasks
      for (let i = 0; i < pattern.taskChain.length; i++) {
        await graphClientService.runQuery(
          `
          MERGE (pattern:WorkflowPattern {patternKey: $patternKey})
          MERGE (task:TaskArchetype {name: $taskName})
          MERGE (pattern)-[r:INCLUDES_TASK]->(task)
          SET r.orderIndex = $orderIndex
          `,
          {
            patternKey: pattern.patternKey,
            taskName: pattern.taskChain[i],
            orderIndex: i,
          }
        );
      }
      syncedPatterns++;
    }

    return {
      syncedUsers: users.length,
      syncedAppBehaviors,
      syncedPatterns,
      syncedPreferences,
      pipelineStats: pipelineResult.stats,
    };
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

  async runNightlySync(): Promise<GraphSyncResultV2> {
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
      const disabledResult: GraphSyncResultV2 = {
        success: true,
        syncedUsers: 0,
        syncedWorkstreams: 0,
        syncedPreferences: 0,
        syncedAppBehaviors: 0,
        syncedPatterns: 0,
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

      // Use the enhanced mapper pipeline
      const mapperResult = await this.syncUsersViaMapper(since);

      const [workstreamCountRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.sessionWorkstreams)
        .where(gte(schema.sessionWorkstreams.updatedAt, since));

      const snapshotsCreated = await this.materializeVisibilitySnapshots(config.graph.lookbackDays);

      const finishedAt = new Date();
      const result: GraphSyncResultV2 = {
        success: true,
        syncedUsers: mapperResult.syncedUsers,
        syncedWorkstreams: Number(workstreamCountRow?.count || 0),
        syncedPreferences: mapperResult.syncedPreferences,
        syncedAppBehaviors: mapperResult.syncedAppBehaviors,
        syncedPatterns: mapperResult.syncedPatterns,
        pipelineStats: mapperResult.pipelineStats,
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
              syncedAppBehaviors: result.syncedAppBehaviors,
              syncedPatterns: result.syncedPatterns,
              pipelineStats: result.pipelineStats,
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
      const result: GraphSyncResultV2 = {
        success: false,
        syncedUsers: 0,
        syncedWorkstreams: 0,
        syncedPreferences: 0,
        syncedAppBehaviors: 0,
        syncedPatterns: 0,
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
