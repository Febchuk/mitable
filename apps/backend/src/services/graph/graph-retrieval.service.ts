import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db/client";
import * as schema from "../../db/schema";
import { config } from "../../config";
import type { GraphFact, UserGraphProfile } from "./types";

class GraphRetrievalService {
  async getUserGraphProfile(userId: string, orgId: string): Promise<UserGraphProfile> {
    const [topTasks, topApps, preferences, domains] = await Promise.all([
      this.getTopTasks(userId, orgId),
      this.getTopApps(userId, orgId),
      this.getStylePreferences(userId, orgId),
      this.getDomainHints(userId, orgId),
    ]);

    return {
      personKey: this.toPersonKey(userId, orgId),
      orgId,
      topTasks,
      topApps,
      preferences,
      domains,
      patterns: [],
    };
  }

  private toPersonKey(userId: string, orgId: string): string {
    // Pseudonymized key used by graph-facing consumers.
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
}

export const graphRetrievalService = new GraphRetrievalService();
