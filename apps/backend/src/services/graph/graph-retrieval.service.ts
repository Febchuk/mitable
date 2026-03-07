import { and, desc, eq, gte, sql, isNotNull } from "drizzle-orm";
import { db } from "../../db/client";
import * as schema from "../../db/schema/index";
import { config } from "../../config";
import type { GraphFact, AppBehaviorFact, UserGraphProfileV2 } from "./types";
import {
  APP_NAME_ALIASES,
  TOP_ACTIVITIES_PER_APP,
  MIN_PATTERN_SUPPORT,
} from "./task-archetype-map";

class GraphRetrievalService {
  async getUserGraphProfile(userId: string, orgId: string): Promise<UserGraphProfileV2> {
    const [topTasks, topApps, preferences, domains, patterns, appBehaviors] = await Promise.all([
      this.getTopTasks(userId, orgId),
      this.getTopApps(userId, orgId),
      this.getStylePreferences(userId, orgId),
      this.getDomainHints(userId, orgId),
      this.getWorkflowPatterns(userId, orgId),
      this.getAppBehaviors(userId, orgId),
    ]);

    return {
      personKey: this.toPersonKey(userId, orgId),
      orgId,
      topTasks,
      topApps,
      preferences,
      domains,
      patterns,
      appBehaviors,
    };
  }

  private toPersonKey(userId: string, orgId: string): string {
    return Buffer.from(`${orgId}:${userId}`).toString("base64");
  }

  private async getTopTasks(userId: string, orgId: string): Promise<GraphFact[]> {
    const since = new Date(Date.now() - config.graph.lookbackDays * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        name: schema.sessionWorkstreams.name,
        evidenceCount: sql<number>`count(*)::int`,
        score: sql<number>`sum(${schema.sessionWorkstreams.totalDurationMinutes})::float`,
        lastSeenAt: sql<string>`max(${schema.sessionWorkstreams.updatedAt})::text`,
      })
      .from(schema.sessionWorkstreams)
      .innerJoin(
        schema.monitoringSessions,
        eq(schema.sessionWorkstreams.sessionId, schema.monitoringSessions.id)
      )
      .where(
        and(
          eq(schema.monitoringSessions.userId, userId),
          eq(schema.monitoringSessions.organizationId, orgId),
          gte(schema.sessionWorkstreams.updatedAt, since)
        )
      )
      .groupBy(schema.sessionWorkstreams.name)
      .orderBy(desc(sql`sum(${schema.sessionWorkstreams.totalDurationMinutes})`))
      .limit(config.graph.topKFacts);

    return rows.map((row) => ({
      factType: "top_task",
      subject: "user",
      relation: "PERFORMS",
      object: row.name,
      score: Number(row.score || 0),
      evidenceCount: Number(row.evidenceCount || 0),
      lastSeenAt: row.lastSeenAt || undefined,
    }));
  }

  private async getTopApps(userId: string, orgId: string): Promise<GraphFact[]> {
    const since = new Date(Date.now() - config.graph.lookbackDays * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        appName: schema.sessionCaptures.appName,
        evidenceCount: sql<number>`count(*)::int`,
        lastSeenAt: sql<string>`max(${schema.sessionCaptures.capturedAt})::text`,
      })
      .from(schema.sessionCaptures)
      .innerJoin(
        schema.monitoringSessions,
        eq(schema.sessionCaptures.sessionId, schema.monitoringSessions.id)
      )
      .where(
        and(
          eq(schema.monitoringSessions.userId, userId),
          eq(schema.monitoringSessions.organizationId, orgId),
          gte(schema.sessionCaptures.capturedAt, since),
          sql`${schema.sessionCaptures.appName} is not null`
        )
      )
      .groupBy(schema.sessionCaptures.appName)
      .orderBy(desc(sql`count(*)`))
      .limit(config.graph.topKFacts);

    return rows
      .filter((row) => !!row.appName)
      .map((row) => ({
        factType: "top_app",
        subject: "user",
        relation: "USES_APP",
        object: row.appName!,
        score: Number(row.evidenceCount || 0),
        evidenceCount: Number(row.evidenceCount || 0),
        lastSeenAt: row.lastSeenAt || undefined,
      }));
  }

  private async getStylePreferences(userId: string, orgId: string): Promise<GraphFact[]> {
    const rows = await db
      .select({
        category: schema.userMemories.category,
        content: schema.userMemories.content,
        lastSeenAt: sql<string>`${schema.userMemories.updatedAt}::text`,
      })
      .from(schema.userMemories)
      .where(
        and(
          eq(schema.userMemories.userId, userId),
          eq(schema.userMemories.orgId, orgId),
          sql`${schema.userMemories.category} in ('summary_style', 'recap_style')`
        )
      )
      .orderBy(desc(schema.userMemories.updatedAt))
      .limit(config.graph.topKFacts);

    return rows.map((row) => ({
      factType: "style_preference",
      subject: "user",
      relation: "PREFERS",
      object: `${row.category}: ${row.content}`,
      score: 1,
      evidenceCount: 1,
      lastSeenAt: row.lastSeenAt || undefined,
    }));
  }

  private async getDomainHints(userId: string, orgId: string): Promise<GraphFact[]> {
    const [user] = await db
      .select({
        jobTitle: schema.users.jobTitle,
        regularTasks: schema.users.regularTasks,
      })
      .from(schema.users)
      .where(and(eq(schema.users.id, userId), eq(schema.users.organizationId, orgId)))
      .limit(1);

    if (!user) return [];

    const hints: GraphFact[] = [];

    if (user.jobTitle) {
      hints.push({
        factType: "domain_hint",
        subject: "user",
        relation: "ROLE_HINT",
        object: user.jobTitle,
        score: 1,
        evidenceCount: 1,
      });
    }

    const tasks = Array.isArray(user.regularTasks) ? (user.regularTasks as string[]) : [];
    for (const task of tasks.slice(0, config.graph.topKFacts)) {
      hints.push({
        factType: "domain_hint",
        subject: "user",
        relation: "REGULAR_TASK_HINT",
        object: task,
        score: 0.8,
        evidenceCount: 1,
      });
    }

    return hints;
  }

  /**
   * Get recurring workflow patterns from session workstreams.
   * Groups workstreams into chains per session, counts chain signatures
   * across sessions, filters to 2+ occurrences.
   */
  async getWorkflowPatterns(userId: string, orgId: string): Promise<GraphFact[]> {
    const since = new Date(Date.now() - config.graph.lookbackDays * 24 * 60 * 60 * 1000);

    // Get workstreams grouped by session, ordered by time
    const rows = await db
      .select({
        sessionId: schema.sessionWorkstreams.sessionId,
        name: schema.sessionWorkstreams.name,
        category: schema.sessionWorkstreams.category,
        updatedAt: schema.sessionWorkstreams.updatedAt,
      })
      .from(schema.sessionWorkstreams)
      .innerJoin(
        schema.monitoringSessions,
        eq(schema.sessionWorkstreams.sessionId, schema.monitoringSessions.id)
      )
      .where(
        and(
          eq(schema.monitoringSessions.userId, userId),
          eq(schema.monitoringSessions.organizationId, orgId),
          gte(schema.sessionWorkstreams.updatedAt, since)
        )
      )
      .orderBy(schema.sessionWorkstreams.sessionId, schema.sessionWorkstreams.updatedAt);

    if (rows.length === 0) return [];

    // Group by session to form chains
    const sessionChains = new Map<string, string[]>();
    for (const row of rows) {
      const chain = sessionChains.get(row.sessionId) || [];
      const category = row.category || "other";
      // Dedup consecutive
      if (chain.length === 0 || chain[chain.length - 1] !== category) {
        chain.push(category);
      }
      sessionChains.set(row.sessionId, chain);
    }

    // Count chain signatures
    const chainCounts = new Map<string, { chain: string[]; count: number; lastSeen: string }>();
    for (const [sessionId, chain] of sessionChains) {
      if (chain.length < 2) continue;
      const key = chain.join(" -> ");
      const existing = chainCounts.get(key) || { chain, count: 0, lastSeen: "" };
      existing.count++;
      // Use latest session's workstream updatedAt
      const sessionRows = rows.filter((r) => r.sessionId === sessionId);
      const latest = sessionRows[sessionRows.length - 1]?.updatedAt?.toISOString() || "";
      if (latest > existing.lastSeen) existing.lastSeen = latest;
      chainCounts.set(key, existing);
    }

    // Filter to recurring patterns
    const patterns: GraphFact[] = [];
    for (const [key, data] of chainCounts) {
      if (data.count < MIN_PATTERN_SUPPORT) continue;
      patterns.push({
        factType: "workflow_pattern",
        subject: "user",
        relation: "FOLLOWS_PATTERN",
        object: key,
        score: data.count,
        evidenceCount: data.count,
        lastSeenAt: data.lastSeen || undefined,
      });
    }

    return patterns.sort((a, b) => b.score - a.score).slice(0, config.graph.topKFacts);
  }

  /**
   * Get app behavior facts: group session captures by app,
   * count description frequency, extract top activities per app.
   */
  async getAppBehaviors(userId: string, orgId: string): Promise<AppBehaviorFact[]> {
    const since = new Date(Date.now() - config.graph.lookbackDays * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        appName: schema.sessionCaptures.appName,
        activityDescription: schema.sessionCaptures.activityDescription,
        capturedAt: schema.sessionCaptures.capturedAt,
      })
      .from(schema.sessionCaptures)
      .innerJoin(
        schema.monitoringSessions,
        eq(schema.sessionCaptures.sessionId, schema.monitoringSessions.id)
      )
      .where(
        and(
          eq(schema.monitoringSessions.userId, userId),
          eq(schema.monitoringSessions.organizationId, orgId),
          gte(schema.sessionCaptures.capturedAt, since),
          isNotNull(schema.sessionCaptures.appName),
          isNotNull(schema.sessionCaptures.activityDescription)
        )
      );

    if (rows.length === 0) return [];

    // Group by normalized app name
    const appGroups = new Map<
      string,
      { descriptions: Map<string, number>; count: number; lastSeen: string }
    >();

    for (const row of rows) {
      if (!row.appName || !row.activityDescription) continue;
      const normalizedApp = this.normalizeAppName(row.appName);

      const group = appGroups.get(normalizedApp) || {
        descriptions: new Map(),
        count: 0,
        lastSeen: "",
      };

      group.count++;
      group.descriptions.set(
        row.activityDescription,
        (group.descriptions.get(row.activityDescription) || 0) + 1
      );

      const ts = row.capturedAt.toISOString();
      if (ts > group.lastSeen) group.lastSeen = ts;
      appGroups.set(normalizedApp, group);
    }

    const behaviors: AppBehaviorFact[] = [];

    for (const [appName, group] of appGroups) {
      const topActivities = [...group.descriptions.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_ACTIVITIES_PER_APP)
        .map(([desc]) => desc);

      behaviors.push({
        factType: "app_behavior",
        subject: "user",
        relation: "DOES_IN_APP",
        object: appName,
        score: group.count,
        evidenceCount: group.count,
        lastSeenAt: group.lastSeen || undefined,
        topActivities,
      });
    }

    return behaviors
      .sort((a, b) => b.evidenceCount - a.evidenceCount)
      .slice(0, config.graph.topKFacts);
  }

  private normalizeAppName(appName: string): string {
    const lower = appName.toLowerCase().trim();
    return APP_NAME_ALIASES[lower] || appName.trim();
  }
}

export const graphRetrievalService = new GraphRetrievalService();
