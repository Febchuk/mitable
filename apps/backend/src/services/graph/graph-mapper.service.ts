/**
 * Graph Mapper Service
 *
 * Core activity-resolution pipeline (Stages A-D):
 *   A. Extract & Normalize — pull events from 3 source tables, normalize app names, deduplicate
 *   B. Derive App Behaviors — group by (user, app), extract top activities per app
 *   C. Map to Archetypes — deterministic keyword matching against archetype rules
 *   D. Mine Patterns — episode segmentation, chain extraction, frequency filtering
 */

import { and, eq, gte, sql, isNotNull } from "drizzle-orm";
import { db } from "../../db/client";
import * as schema from "../../db/schema/index";
import { createLogger } from "../../lib/logger";
import {
  ARCHETYPE_RULES,
  APP_NAME_ALIASES,
  SOURCE_RELIABILITY_WEIGHTS,
  DEDUPE_WINDOW_MS,
  EPISODE_GAP_MS,
  MIN_PATTERN_SUPPORT,
  TOP_ACTIVITIES_PER_APP,
} from "./task-archetype-map";
import type {
  ActivityEvent,
  AppBehavior,
  TaskArchetypeMapping,
  WorkflowPatternResult,
  MapperPipelineResult,
  TopicMapping,
  SubscriberMapping,
  ActionType,
} from "./types";
import { normalizeName } from "../normalize-name.js";

const logger = createLogger({ context: "graph-mapper" });

class GraphMapperService {
  /**
   * Run the full pipeline (Stages A through D).
   */
  async runPipeline(
    users: Array<{ userId: string; orgId: string }>,
    since: Date
  ): Promise<MapperPipelineResult> {
    const timings: Record<string, number> = {};
    let t0 = Date.now();

    // Stage A: Extract, normalize, deduplicate
    const rawEvents = await this.extractAndNormalize(users, since);
    timings.stageA_extractMs = Date.now() - t0;
    const rawEventCount = rawEvents.length;

    t0 = Date.now();
    const events = this.deduplicateEvents(rawEvents);
    timings.stageA_dedupeMs = Date.now() - t0;
    const afterDedupeCount = events.length;

    // Stage B: App behaviors
    t0 = Date.now();
    const appBehaviors = this.deriveAppBehaviors(events);
    timings.stageB_ms = Date.now() - t0;

    // Stage C: Archetype mapping
    t0 = Date.now();
    const archetypeMappings = this.mapToArchetypes(events);
    timings.stageC_ms = Date.now() - t0;

    // Stage D: Pattern mining
    t0 = Date.now();
    const workflowPatterns = this.minePatterns(events, archetypeMappings);
    timings.stageD_ms = Date.now() - t0;

    // Stage E: Topic & subscriber extraction from activity_blocks
    t0 = Date.now();
    const { topicMappings, subscriberMappings } = await this.extractTopicsAndSubscribers(
      users,
      since
    );
    timings.stageE_ms = Date.now() - t0;

    logger.info(
      {
        rawEventCount,
        afterDedupeCount,
        appBehaviors: appBehaviors.length,
        archetypes: archetypeMappings.length,
        patterns: workflowPatterns.length,
        topics: topicMappings.length,
        subscribers: subscriberMappings.length,
        timings,
      },
      "Mapper pipeline completed"
    );

    return {
      appBehaviors,
      archetypeMappings,
      workflowPatterns,
      topicMappings,
      subscriberMappings,
      stats: {
        rawEventCount,
        afterDedupeCount,
        stageTimingsMs: timings,
      },
    };
  }

  // ── Stage A: Extract & Normalize ──

  async extractAndNormalize(
    users: Array<{ userId: string; orgId: string }>,
    since: Date
  ): Promise<ActivityEvent[]> {
    if (users.length === 0) return [];

    const userIds = users.map((u) => u.userId);
    const orgMap = new Map(users.map((u) => [u.userId, u.orgId]));

    // Query 3 source tables in parallel
    const [captureRows, workstreamRows, workflowRows] = await Promise.all([
      this.querySessionCaptures(userIds, since),
      this.querySessionWorkstreams(userIds, since),
      this.queryWorkflowInteractions(userIds, since),
    ]);

    const events: ActivityEvent[] = [];

    // session_captures → sourceType="session_capture", confidence=0.7
    for (const row of captureRows) {
      events.push({
        eventId: row.id,
        occurredAt: new Date(row.capturedAt).toISOString(),
        userId: row.userId,
        orgId: orgMap.get(row.userId) || "",
        sessionId: row.sessionId,
        appName: this.normalizeAppName(row.appName),
        windowTitle: row.windowTitle || null,
        activityDescription: row.activityDescription || null,
        actionType: (row.actionType as ActionType) || null,
        sourceType: "session_capture",
        confidence: SOURCE_RELIABILITY_WEIGHTS.session_capture!,
        metadata: row.classifierData ? { classifierData: row.classifierData } : undefined,
      });
    }

    // session_workstreams → sourceType="workstream", confidence=0.85
    for (const row of workstreamRows) {
      const appsUsed = Array.isArray(row.appsUsed) ? row.appsUsed : [];
      events.push({
        eventId: row.id,
        occurredAt: new Date(row.updatedAt).toISOString(),
        userId: row.userId,
        orgId: orgMap.get(row.userId) || "",
        sessionId: row.sessionId,
        appName: appsUsed.length > 0 ? this.normalizeAppName(appsUsed[0] as string) : null,
        windowTitle: null,
        activityDescription: row.name || null,
        actionType: null,
        sourceType: "workstream",
        confidence: SOURCE_RELIABILITY_WEIGHTS.workstream!,
        metadata: {
          category: row.category,
          appsUsed: appsUsed.map((a) => this.normalizeAppName(a as string)),
        },
      });
    }

    // workflow_interactions → sourceType="workflow_interaction", confidence=1.0
    for (const row of workflowRows) {
      events.push({
        eventId: row.id,
        occurredAt: new Date(row.createdAt).toISOString(),
        userId: row.userId,
        orgId: orgMap.get(row.userId) || "",
        sessionId: row.workflowSessionId,
        appName: null,
        windowTitle: null,
        activityDescription: row.content || null,
        actionType: null,
        sourceType: "workflow_interaction",
        confidence: SOURCE_RELIABILITY_WEIGHTS.workflow_interaction!,
        metadata: { type: row.type },
      });
    }

    return events;
  }

  private async querySessionCaptures(userIds: string[], since: Date) {
    if (userIds.length === 0) return [];
    return db
      .select({
        id: schema.sessionCaptures.id,
        sessionId: schema.sessionCaptures.sessionId,
        capturedAt: schema.sessionCaptures.capturedAt,
        appName: schema.sessionCaptures.appName,
        windowTitle: schema.sessionCaptures.windowTitle,
        activityDescription: schema.sessionCaptures.activityDescription,
        actionType: schema.sessionCaptures.deltaUserAction,
        classifierData: schema.sessionCaptures.classifierData,
        userId: schema.monitoringSessions.userId,
      })
      .from(schema.sessionCaptures)
      .innerJoin(
        schema.monitoringSessions,
        eq(schema.sessionCaptures.sessionId, schema.monitoringSessions.id)
      )
      .where(
        and(
          sql`${schema.monitoringSessions.userId} = ANY(ARRAY[${sql.raw(userIds.map((id) => `'${id}'`).join(","))}]::uuid[])`,
          gte(schema.sessionCaptures.capturedAt, since),
          isNotNull(schema.sessionCaptures.activityDescription)
        )
      );
  }

  private async querySessionWorkstreams(userIds: string[], since: Date) {
    if (userIds.length === 0) return [];
    return db
      .select({
        id: schema.sessionWorkstreams.id,
        sessionId: schema.sessionWorkstreams.sessionId,
        name: schema.sessionWorkstreams.name,
        category: schema.sessionWorkstreams.category,
        appsUsed: schema.sessionWorkstreams.appsUsed,
        updatedAt: schema.sessionWorkstreams.updatedAt,
        userId: schema.monitoringSessions.userId,
      })
      .from(schema.sessionWorkstreams)
      .innerJoin(
        schema.monitoringSessions,
        eq(schema.sessionWorkstreams.sessionId, schema.monitoringSessions.id)
      )
      .where(
        and(
          sql`${schema.monitoringSessions.userId} = ANY(ARRAY[${sql.raw(userIds.map((id) => `'${id}'`).join(","))}]::uuid[])`,
          gte(schema.sessionWorkstreams.updatedAt, since)
        )
      );
  }

  private async queryWorkflowInteractions(userIds: string[], since: Date) {
    if (userIds.length === 0) return [];
    return db
      .select({
        id: schema.workflowInteractions.id,
        workflowSessionId: schema.workflowInteractions.workflowSessionId,
        type: schema.workflowInteractions.type,
        content: schema.workflowInteractions.content,
        createdAt: schema.workflowInteractions.createdAt,
        userId: schema.workflowSessions.userId,
      })
      .from(schema.workflowInteractions)
      .innerJoin(
        schema.workflowSessions,
        eq(schema.workflowInteractions.workflowSessionId, schema.workflowSessions.id)
      )
      .where(
        and(
          sql`${schema.workflowSessions.userId} = ANY(ARRAY[${sql.raw(userIds.map((id) => `'${id}'`).join(","))}]::uuid[])`,
          gte(schema.workflowInteractions.createdAt, since)
        )
      );
  }

  normalizeAppName(appName: string | null): string | null {
    if (!appName) return null;
    const lower = appName.toLowerCase().trim();
    return APP_NAME_ALIASES[lower] || appName.trim();
  }

  /**
   * Deduplicate: sort by (userId, occurredAt), collapse events where same user +
   * same app + same windowTitle + same activityDescription within DEDUPE_WINDOW_MS.
   * Keep the event with highest confidence.
   */
  deduplicateEvents(events: ActivityEvent[]): ActivityEvent[] {
    if (events.length <= 1) return events;

    // Sort by userId, then occurredAt
    const sorted = [...events].sort((a, b) => {
      const uCmp = a.userId.localeCompare(b.userId);
      if (uCmp !== 0) return uCmp;
      return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    });

    const result: ActivityEvent[] = [sorted[0]!];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]!;
      const last = result[result.length - 1]!;

      const sameUser = current.userId === last.userId;
      const sameApp = current.appName === last.appName;
      const sameWindow = current.windowTitle === last.windowTitle;
      const sameActivity = current.activityDescription === last.activityDescription;
      const withinWindow =
        Math.abs(new Date(current.occurredAt).getTime() - new Date(last.occurredAt).getTime()) <=
        DEDUPE_WINDOW_MS;

      if (sameUser && sameApp && sameWindow && sameActivity && withinWindow) {
        // Keep higher confidence
        if (current.confidence > last.confidence) {
          result[result.length - 1] = current;
        }
        continue;
      }

      result.push(current);
    }

    return result;
  }

  // ── Stage B: App Behaviors ──

  deriveAppBehaviors(events: ActivityEvent[]): AppBehavior[] {
    // Group by (userId, orgId, appName)
    const groups = new Map<string, ActivityEvent[]>();

    for (const event of events) {
      if (!event.appName) continue;
      const key = `${event.userId}::${event.orgId}::${event.appName}`;
      const group = groups.get(key) || [];
      group.push(event);
      groups.set(key, group);
    }

    const behaviors: AppBehavior[] = [];

    for (const [, group] of groups) {
      const first = group[0]!;
      // Count activity description frequencies
      const activityCounts = new Map<string, number>();
      for (const event of group) {
        if (event.activityDescription) {
          activityCounts.set(
            event.activityDescription,
            (activityCounts.get(event.activityDescription) || 0) + 1
          );
        }
      }

      // Sort by frequency, take top N
      const topActivities = [...activityCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_ACTIVITIES_PER_APP)
        .map(([desc]) => desc);

      if (topActivities.length === 0) continue;

      const topThree = topActivities.slice(0, 3).join(", ");
      const behaviorStatement = `User primarily uses ${first.appName} for ${topThree}`;

      const avgConfidence = group.reduce((sum, e) => sum + e.confidence, 0) / group.length;

      behaviors.push({
        appName: first.appName!,
        userId: first.userId,
        orgId: first.orgId,
        topActivities,
        behaviorStatement,
        evidenceCount: group.length,
        confidence: Math.round(avgConfidence * 100) / 100,
      });
    }

    return behaviors;
  }

  // ── Stage C: Archetype Mapping ──

  /**
   * For each event, try keyword match in activityDescription against ARCHETYPE_RULES.
   * First match wins. Fallback: try category alias from metadata.
   */
  resolveArchetype(event: ActivityEvent): string | null {
    const desc = event.activityDescription?.toLowerCase() || "";
    const category = (event.metadata?.category as string)?.toLowerCase() || "";

    // Primary: keyword match on description
    if (desc) {
      for (const rule of ARCHETYPE_RULES) {
        for (const keyword of rule.keywords) {
          if (desc.includes(keyword)) {
            return rule.archetypeKey;
          }
        }
      }
    }

    // Fallback: category alias match
    if (category) {
      for (const rule of ARCHETYPE_RULES) {
        if (rule.categoryAliases.includes(category)) {
          return rule.archetypeKey;
        }
      }
    }

    return null;
  }

  mapToArchetypes(events: ActivityEvent[]): TaskArchetypeMapping[] {
    // Accumulate per archetype
    const accum = new Map<
      string,
      {
        evidenceCount: number;
        totalConfidence: number;
        sourceActivities: Set<string>;
      }
    >();

    for (const event of events) {
      const archetypeKey = this.resolveArchetype(event);
      if (!archetypeKey) continue;

      const existing = accum.get(archetypeKey) || {
        evidenceCount: 0,
        totalConfidence: 0,
        sourceActivities: new Set<string>(),
      };

      existing.evidenceCount++;
      existing.totalConfidence += event.confidence;
      if (event.activityDescription) {
        existing.sourceActivities.add(event.activityDescription);
      }
      accum.set(archetypeKey, existing);
    }

    const mappings: TaskArchetypeMapping[] = [];

    for (const [archetypeKey, data] of accum) {
      const rule = ARCHETYPE_RULES.find((r) => r.archetypeKey === archetypeKey);
      if (!rule) continue;

      mappings.push({
        archetypeKey,
        displayName: rule.displayName,
        domainKey: rule.domainKey,
        evidenceCount: data.evidenceCount,
        confidence: Math.round((data.totalConfidence / data.evidenceCount) * 100) / 100,
        sourceActivities: [...data.sourceActivities].slice(0, 10),
      });
    }

    return mappings.sort((a, b) => b.evidenceCount - a.evidenceCount);
  }

  // ── Stage D: Pattern Mining ──

  minePatterns(
    events: ActivityEvent[],
    _archetypeMappings: TaskArchetypeMapping[]
  ): WorkflowPatternResult[] {
    // Group events by userId, sort chronologically
    const byUser = new Map<string, ActivityEvent[]>();
    for (const event of events) {
      const group = byUser.get(event.userId) || [];
      group.push(event);
      byUser.set(event.userId, group);
    }

    // Track chain occurrences globally
    const chainCounts = new Map<
      string,
      {
        chain: string[];
        count: number;
        totalDurationMs: number;
      }
    >();

    for (const [, userEvents] of byUser) {
      // Sort chronologically
      const sorted = [...userEvents].sort(
        (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
      );

      // Segment into episodes (gap > 30 min = new episode)
      const episodes: ActivityEvent[][] = [];
      let currentEpisode: ActivityEvent[] = [sorted[0]!];

      for (let i = 1; i < sorted.length; i++) {
        const gap =
          new Date(sorted[i]!.occurredAt).getTime() - new Date(sorted[i - 1]!.occurredAt).getTime();

        if (gap > EPISODE_GAP_MS) {
          episodes.push(currentEpisode);
          currentEpisode = [sorted[i]!];
        } else {
          currentEpisode.push(sorted[i]!);
        }
      }
      if (currentEpisode.length > 0) episodes.push(currentEpisode);

      // Convert each episode to a task chain
      for (const episode of episodes) {
        const archetypeChain: string[] = [];
        for (const event of episode) {
          const archetype = this.resolveArchetype(event);
          if (!archetype) continue;
          // Dedup consecutive duplicates
          if (
            archetypeChain.length === 0 ||
            archetypeChain[archetypeChain.length - 1] !== archetype
          ) {
            archetypeChain.push(archetype);
          }
        }

        if (archetypeChain.length < 2) continue;

        const chainKey = archetypeChain.join(" -> ");

        // Episode duration
        const firstTime = new Date(episode[0]!.occurredAt).getTime();
        const lastTime = new Date(episode[episode.length - 1]!.occurredAt).getTime();
        const durationMs = lastTime - firstTime;

        const existing = chainCounts.get(chainKey) || {
          chain: archetypeChain,
          count: 0,
          totalDurationMs: 0,
        };
        existing.count++;
        existing.totalDurationMs += durationMs;
        chainCounts.set(chainKey, existing);
      }
    }

    // Filter to chains with support >= MIN_PATTERN_SUPPORT
    const patterns: WorkflowPatternResult[] = [];

    for (const [chainKey, data] of chainCounts) {
      if (data.count < MIN_PATTERN_SUPPORT) continue;

      const displayParts = data.chain.map((key) => {
        const rule = ARCHETYPE_RULES.find((r) => r.archetypeKey === key);
        return rule?.displayName || key;
      });

      patterns.push({
        patternKey: chainKey,
        displayName: displayParts.join(" -> "),
        taskChain: data.chain,
        supportCount: data.count,
        confidence: Math.min(1, data.count / 10), // Simple confidence: more occurrences = higher
        avgDurationMinutes: Math.round(data.totalDurationMs / data.count / 60_000),
      });
    }

    return patterns.sort((a, b) => b.supportCount - a.supportCount);
  }

  // ── Stage E: Topic & Subscriber Extraction ──


  async extractTopicsAndSubscribers(
    users: Array<{ userId: string; orgId: string }>,
    since: Date
  ): Promise<{ topicMappings: TopicMapping[]; subscriberMappings: SubscriberMapping[] }> {
    if (users.length === 0) return { topicMappings: [], subscriberMappings: [] };

    const userIds = users.map((u) => u.userId);
    const orgMap = new Map(users.map((u) => [u.userId, u.orgId]));

    // Query activity_blocks with topic_name or subscriber_name populated
    const rows = await db
      .select({
        userId: schema.activityBlocks.userId,
        topicName: schema.activityBlocks.topicName,
        subscriberName: schema.activityBlocks.subscriberName,
        category: schema.activityBlocks.category,
        durationMinutes: schema.activityBlocks.durationMinutes,
      })
      .from(schema.activityBlocks)
      .where(
        and(
          sql`${schema.activityBlocks.userId} = ANY(ARRAY[${sql.raw(userIds.map((id) => `'${id}'`).join(","))}]::uuid[])`,
          gte(schema.activityBlocks.createdAt, since),
          sql`(${schema.activityBlocks.topicName} IS NOT NULL OR ${schema.activityBlocks.subscriberName} IS NOT NULL)`
        )
      );

    // Aggregate topics per org
    const topicAccum = new Map<
      string,
      {
        name: string;
        orgId: string;
        parentCategory: string;
        totalMinutes: number;
        evidenceCount: number;
      }
    >();
    const subscriberAccum = new Map<
      string,
      {
        name: string;
        orgId: string;
        aliases: Set<string>;
        totalMinutes: number;
        evidenceCount: number;
      }
    >();

    for (const row of rows) {
      const orgId = orgMap.get(row.userId) || "";

      if (row.topicName) {
        const normalized = normalizeName(row.topicName);
        const key = `${orgId}::${normalized}`;
        const existing = topicAccum.get(key) || {
          name: row.topicName,
          orgId,
          parentCategory: row.category || "other",
          totalMinutes: 0,
          evidenceCount: 0,
        };
        existing.totalMinutes += row.durationMinutes;
        existing.evidenceCount++;
        topicAccum.set(key, existing);
      }

      if (row.subscriberName) {
        const normalized = normalizeName(row.subscriberName);
        const key = `${orgId}::${normalized}`;
        const existing = subscriberAccum.get(key) || {
          name: row.subscriberName,
          orgId,
          aliases: new Set<string>(),
          totalMinutes: 0,
          evidenceCount: 0,
        };
        existing.aliases.add(row.subscriberName);
        existing.totalMinutes += row.durationMinutes;
        existing.evidenceCount++;
        subscriberAccum.set(key, existing);
      }
    }

    const topicMappings: TopicMapping[] = [...topicAccum.entries()].map(([, data]) => ({
      name: data.name,
      normalizedName: normalizeName(data.name),
      orgId: data.orgId,
      parentCategory: data.parentCategory,
      totalMinutes: data.totalMinutes,
      evidenceCount: data.evidenceCount,
    }));

    const subscriberMappings: SubscriberMapping[] = [...subscriberAccum.entries()].map(
      ([, data]) => ({
        name: data.name,
        normalizedName: normalizeName(data.name),
        orgId: data.orgId,
        aliases: [...data.aliases],
        totalMinutes: data.totalMinutes,
        evidenceCount: data.evidenceCount,
      })
    );

    return { topicMappings, subscriberMappings };
  }
}

export const graphMapperService = new GraphMapperService();
