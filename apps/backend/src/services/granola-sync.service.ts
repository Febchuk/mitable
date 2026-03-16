/**
 * Granola Sync Service
 *
 * Pulls meeting notes from a user's Granola account and creates
 * activity_blocks (blockType: "granola") on their daily calendar.
 *
 * Each meeting gets a single-shot Claude Haiku call to extract:
 *   - subscriberName: matched against known customers, or null for internal meetings
 *   - topicName: high-level topic for the meeting
 *
 * Flow:
 * 1. Fetch meetings via Granola MCP listMeetings tool
 * 2. For each meeting, run Claude Haiku to classify subscriber + topic
 * 3. Upsert activity_block per meeting
 * 4. Recalculate daily stats so metrics flow to dashboard + people view
 * 5. Update user's granolaLastSyncedAt timestamp
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { granolaService } from "./granola.service.js";
import { encryptionService } from "./encryption.service.js";
import { recalculateDailyStats } from "./activity-materializer.service.js";
import { addDiscoveredCustomers } from "./known-customers.service.js";
import { getKnownCustomers, getOrgName } from "./known-customers.service.js";
import { config } from "../config.js";
import { createLogger } from "../lib/logger.js";
import { parseJsonResponse } from "../lib/parse-json.js";

const logger = createLogger({ context: "granola-sync" });

// ============================================================================
// Types
// ============================================================================

interface SyncResult {
  success: boolean;
  meetingsProcessed: number;
  blocksCreated: number;
  blocksUpdated: number;
  errors: string[];
}

/** Shape of a meeting returned by Granola MCP list_meetings tool */
interface GranolaMeeting {
  id: string;
  title?: string | null;
  summary?: string | null;
  attendees?: { name?: string; email?: string }[];
  start_time?: string | null;
  end_time?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Output of Claude Haiku single-shot classification */
interface MeetingClassification {
  subscriberName: string | null;
  topicName: string | null;
}

// ============================================================================
// Service
// ============================================================================

class GranolaSyncService {
  private anthropic: Anthropic | null = null;

  constructor() {
    if (config.anthropic.apiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
    }
  }

  /**
   * Sync Granola meetings for a specific user.
   * Fetches via MCP, classifies with Claude Haiku, upserts activity blocks.
   */
  async syncUserMeetings(userId: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      meetingsProcessed: 0,
      blocksCreated: 0,
      blocksUpdated: 0,
      errors: [],
    };

    // Get user's Granola tokens + org
    const [user] = await db
      .select({
        granolaAccessTokenEncrypted: schema.users.granolaAccessTokenEncrypted,
        granolaRefreshTokenEncrypted: schema.users.granolaRefreshTokenEncrypted,
        granolaTokenExpiresAt: schema.users.granolaTokenExpiresAt,
        granolaLastSyncedAt: schema.users.granolaLastSyncedAt,
        organizationId: schema.users.organizationId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user?.granolaAccessTokenEncrypted) {
      result.errors.push("Granola not connected");
      return result;
    }

    // Resolve access token (refresh if expired)
    let accessToken: string;
    try {
      accessToken = await this.resolveAccessToken(userId, user);
    } catch (error) {
      result.errors.push(`Token error: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }

    // Fetch meetings via MCP list_meetings tool
    let meetings: GranolaMeeting[];
    try {
      const raw = await granolaService.listMeetings(accessToken, "last_30_days");
      meetings = this.parseMeetingsResponse(raw);
    } catch (error) {
      result.errors.push(`Fetch error: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }

    if (meetings.length === 0) {
      result.success = true;
      return result;
    }

    // Load known customers + org name for LLM context
    const [knownCustomers, orgName] = await Promise.all([
      getKnownCustomers(user.organizationId),
      getOrgName(user.organizationId),
    ]);

    // Process each meeting
    const touchedDailyIds = new Set<string>();
    const discoveredSubscribers: string[] = [];

    for (const meeting of meetings) {
      try {
        // Single-shot Claude Haiku classification
        const classification = await this.classifyMeeting(meeting, knownCustomers, orgName);

        const { created, dailyActivityId } = await this.upsertMeetingAsBlock(
          userId,
          user.organizationId,
          meeting,
          classification
        );

        result.meetingsProcessed++;
        if (created) result.blocksCreated++;
        else result.blocksUpdated++;
        touchedDailyIds.add(dailyActivityId);

        if (classification.subscriberName) {
          discoveredSubscribers.push(classification.subscriberName);
        }
      } catch (error) {
        result.errors.push(
          `Meeting ${meeting.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Recalculate daily stats for every day that was touched
    for (const dailyId of touchedDailyIds) {
      try {
        await recalculateDailyStats(dailyId);
      } catch (error) {
        logger.warn(
          { dailyId, error: String(error) },
          "Failed to recalculate daily stats after Granola sync"
        );
      }
    }

    // Auto-discover new customers
    if (discoveredSubscribers.length > 0) {
      addDiscoveredCustomers(user.organizationId, discoveredSubscribers).catch((err) =>
        logger.warn({ err: String(err) }, "Failed to persist discovered customers from Granola")
      );
    }

    // Update last synced timestamp
    await db
      .update(schema.users)
      .set({ granolaLastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    result.success = result.errors.length === 0;

    logger.info(
      {
        userId,
        meetings: result.meetingsProcessed,
        created: result.blocksCreated,
        updated: result.blocksUpdated,
        errors: result.errors.length,
      },
      "Granola sync completed"
    );

    return result;
  }

  // ============================================================================
  // Claude Haiku Single-Shot Classification
  // ============================================================================

  /**
   * Classify a single Granola meeting using Claude Haiku.
   * Extracts subscriberName and topicName from meeting content.
   * Falls back to null fields if Haiku is unavailable.
   */
  private async classifyMeeting(
    meeting: GranolaMeeting,
    knownCustomers: string[],
    orgName: string | null
  ): Promise<MeetingClassification> {
    if (!this.anthropic) {
      logger.debug("No Anthropic client — skipping meeting classification");
      return { subscriberName: null, topicName: meeting.title || null };
    }

    const attendeeList = (meeting.attendees || [])
      .map((a) => [a.name, a.email].filter(Boolean).join(" "))
      .join(", ");

    const orgContext = orgName
      ? `The user works at "${orgName}" — this is their own company, NOT an external customer.`
      : "";

    const customerList =
      knownCustomers.length > 0
        ? `Known customers/clients:\n${knownCustomers.map((c) => `- ${c}`).join("\n")}`
        : "No known customers yet.";

    const prompt = `You are classifying a meeting from a user's Granola meeting notes.

${orgContext}

${customerList}

Meeting title: ${meeting.title || "(untitled)"}
Attendees: ${attendeeList || "(none listed)"}
Summary:
${meeting.summary || "(no summary)"}

Based on the meeting content, extract:

1. **subscriberName**: The customer/client this meeting relates to.
   - FIRST check if the meeting content matches any known customer above. Use their name EXACTLY as listed.
   - If not a known customer but clearly an external client, provide their full name.
   - If this is an internal meeting, team standup, 1:1, or not related to any customer work, return null.
   - Do NOT invent subscribers for personal/social/internal meetings.

2. **topicName**: A concise 3-6 word topic for the meeting (e.g., "Sprint planning", "API integration review", "Quarterly business review with Acme").

Respond ONLY with JSON:
{ "subscriberName": "..." or null, "topicName": "..." }`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return { subscriberName: null, topicName: meeting.title || null };
      }

      const parsed = parseJsonResponse<MeetingClassification>(textBlock.text);
      return {
        subscriberName: parsed.subscriberName || null,
        topicName: parsed.topicName || meeting.title || null,
      };
    } catch (error) {
      const errStr = String(error);

      // Fatal errors — disable client for this process
      if (/401|403|invalid.*key|billing|authentication/i.test(errStr)) {
        logger.warn({ error: errStr }, "Claude auth/billing error — disabling for this process");
        this.anthropic = null;
      } else {
        logger.warn({ error: errStr, meetingId: meeting.id }, "Meeting classification failed");
      }

      return { subscriberName: null, topicName: meeting.title || null };
    }
  }

  // ============================================================================
  // Meeting → Activity Block
  // ============================================================================

  /**
   * Create or update an activity block from a Granola meeting.
   */
  private async upsertMeetingAsBlock(
    userId: string,
    organizationId: string,
    meeting: GranolaMeeting,
    classification: MeetingClassification
  ): Promise<{ created: boolean; dailyActivityId: string }> {
    const startTime = meeting.start_time
      ? new Date(meeting.start_time)
      : new Date(meeting.created_at || Date.now());
    const endTime = meeting.end_time
      ? new Date(meeting.end_time)
      : new Date(meeting.updated_at || Date.now());
    const durationMinutes = Math.max(
      1,
      Math.round((endTime.getTime() - startTime.getTime()) / 60000)
    );

    const attendees = (meeting.attendees || []).map((a) => ({
      name: a.name || "",
      email: a.email || "",
    }));
    const attendeeNames = attendees.map((a) => a.name).filter(Boolean);

    // Build description
    const descriptionParts: string[] = [];
    if (meeting.summary) descriptionParts.push(meeting.summary);
    if (attendeeNames.length > 0) {
      descriptionParts.push(`Attendees: ${attendeeNames.join(", ")}`);
    }
    const description = descriptionParts.join("\n\n") || null;

    const activityDate = startTime.toISOString().split("T")[0]!;
    const dailyActivityId = await this.ensureDailyActivity(userId, organizationId, activityDate);

    const blockName = `[Granola] ${meeting.title || "Meeting"}`;

    // Check if a block for this meeting already exists
    const existingBlocks = await db
      .select({ id: schema.activityBlocks.id })
      .from(schema.activityBlocks)
      .where(
        and(eq(schema.activityBlocks.userId, userId), eq(schema.activityBlocks.name, blockName))
      )
      .limit(1);

    const blockData = {
      dailyActivityId,
      userId,
      blockType: "granola" as const,
      name: blockName,
      startTime,
      endTime,
      durationMinutes,
      description,
      apps: JSON.stringify(["Granola"]),
      category: "meeting",
      participants: JSON.stringify(attendees),
      sourceSessionIds: JSON.stringify([]),
      topicName: classification.topicName,
      subscriberName: classification.subscriberName,
    };

    if (existingBlocks.length > 0) {
      await db
        .update(schema.activityBlocks)
        .set(blockData)
        .where(eq(schema.activityBlocks.id, existingBlocks[0].id));
      return { created: false, dailyActivityId };
    }

    await db.insert(schema.activityBlocks).values({
      ...blockData,
      sequenceNumber: 0,
    });
    return { created: true, dailyActivityId };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Parse the raw MCP listMeetings response into typed meetings.
   * Handles various response shapes defensively.
   */
  private parseMeetingsResponse(raw: unknown): GranolaMeeting[] {
    if (!raw) return [];

    // MCP tool results come wrapped: { content: [{ type: "text", text: "..." }] }
    const result = raw as Record<string, unknown>;
    let data: unknown = result;

    if (result.content && Array.isArray(result.content)) {
      const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
        (b) => b.type === "text" && b.text
      );
      if (textBlock?.text) {
        try {
          data = JSON.parse(textBlock.text);
        } catch {
          data = result;
        }
      }
    }

    // Try common response shapes
    if (Array.isArray(data)) return data as GranolaMeeting[];
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.meetings)) return obj.meetings as GranolaMeeting[];
    if (Array.isArray(obj.notes)) return obj.notes as GranolaMeeting[];
    if (Array.isArray(obj.results)) return obj.results as GranolaMeeting[];

    logger.warn({ shape: typeof data }, "Unexpected Granola meetings response shape");
    return [];
  }

  /**
   * Resolve a valid access token, refreshing if expired.
   */
  private async resolveAccessToken(
    userId: string,
    user: {
      granolaAccessTokenEncrypted: string | null;
      granolaRefreshTokenEncrypted: string | null;
      granolaTokenExpiresAt: Date | null;
    }
  ): Promise<string> {
    if (!user.granolaAccessTokenEncrypted) {
      throw new Error("Granola not connected");
    }

    let accessToken = encryptionService.decrypt(user.granolaAccessTokenEncrypted);

    const isExpired =
      user.granolaTokenExpiresAt && new Date(user.granolaTokenExpiresAt) < new Date();

    if (isExpired) {
      if (!user.granolaRefreshTokenEncrypted) {
        throw new Error("Granola token expired and no refresh token available");
      }

      const refreshToken = encryptionService.decrypt(user.granolaRefreshTokenEncrypted);
      const newTokenData = await granolaService.refreshToken(refreshToken);
      const tokenExpiresAt = new Date(Date.now() + newTokenData.expires_in * 1000);

      await db
        .update(schema.users)
        .set({
          granolaAccessTokenEncrypted: encryptionService.encrypt(newTokenData.access_token),
          granolaRefreshTokenEncrypted: newTokenData.refresh_token
            ? encryptionService.encrypt(newTokenData.refresh_token)
            : user.granolaRefreshTokenEncrypted,
          granolaTokenExpiresAt: tokenExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));

      accessToken = newTokenData.access_token;
    }

    return accessToken;
  }

  /**
   * Ensure a user_daily_activities row exists for the given date.
   */
  private async ensureDailyActivity(
    userId: string,
    organizationId: string,
    activityDate: string
  ): Promise<string> {
    const [existing] = await db
      .select({ id: schema.userDailyActivities.id })
      .from(schema.userDailyActivities)
      .where(
        and(
          eq(schema.userDailyActivities.userId, userId),
          eq(schema.userDailyActivities.activityDate, activityDate),
          eq(schema.userDailyActivities.periodType, "daily")
        )
      )
      .limit(1);

    if (existing) return existing.id;

    const [created] = await db
      .insert(schema.userDailyActivities)
      .values({
        userId,
        organizationId,
        activityDate,
        periodType: "daily",
        status: "completed",
      })
      .returning({ id: schema.userDailyActivities.id });

    return created.id;
  }
}

export const granolaSyncService = new GranolaSyncService();
