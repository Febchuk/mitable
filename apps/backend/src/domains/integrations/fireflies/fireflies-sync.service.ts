/**
 * Fireflies Sync Service
 *
 * Fetches meeting transcripts from Fireflies AI, classifies each with
 * Claude Haiku (subscriber + topic), and upserts activity_blocks
 * (blockType: "fireflies") so meetings flow into the metrics pipeline.
 *
 * Mirrors the Granola sync service pattern.
 */

import { db } from "../../../db/client.js";
import * as schema from "../../../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { firefliesService, type FirefliesTranscript } from "./fireflies.service.js";
import { encryptionService } from "../../auth/services/encryption.service.js";
import { recalculateDailyStats } from "../../../services/activity-materializer.service.js";
import {
  addDiscoveredCustomers,
  getKnownCustomers,
  getOrgName,
} from "../../auth/services/known-customers.service.js";
import { config } from "../../../config.js";
import { createLogger } from "../../shared-infra/lib/logger.js";

const logger = createLogger({ context: "fireflies-sync" });

// ============================================================================
// Types
// ============================================================================

interface MeetingClassification {
  topicName: string | null;
  subscriberName: string | null;
}

interface SyncResult {
  meetingsProcessed: number;
  meetingsCreated: number;
  meetingsUpdated: number;
  errors: string[];
}

// ============================================================================
// Service
// ============================================================================

class FirefliesSyncService {
  /**
   * Sync recent meetings for a single user.
   * Called by the cron job for each user with a Fireflies API key.
   */
  async syncUserMeetings(userId: string): Promise<SyncResult> {
    const result: SyncResult = {
      meetingsProcessed: 0,
      meetingsCreated: 0,
      meetingsUpdated: 0,
      errors: [],
    };

    // Fetch user record
    const [user] = await db
      .select({
        id: schema.users.id,
        organizationId: schema.users.organizationId,
        firefliesApiKeyEncrypted: schema.users.firefliesApiKeyEncrypted,
        firefliesLastSyncedAt: schema.users.firefliesLastSyncedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user?.firefliesApiKeyEncrypted) {
      result.errors.push("Fireflies not connected");
      return result;
    }

    const apiKey = encryptionService.decrypt(user.firefliesApiKeyEncrypted);

    // Always fetch last 30 days to consolidate historical data
    const syncSince = Date.now() - 30 * 24 * 60 * 60 * 1000;

    try {
      // Fetch transcripts from Fireflies
      logger.info(
        { userId, syncSince: new Date(syncSince).toISOString() },
        "Fetching Fireflies transcripts"
      );
      let transcripts = await firefliesService.listTranscripts(apiKey, {
        fromDate: syncSince,
        limit: 50,
      });

      // If date-filtered query returns 0, retry without date filter as fallback
      if (transcripts.length === 0) {
        logger.info({ userId }, "Date-filtered query returned 0, retrying without date filter");
        transcripts = await firefliesService.listTranscripts(apiKey, { limit: 50 });
      }

      if (transcripts.length === 0) {
        logger.info({ userId }, "No Fireflies transcripts found (even without date filter)");
        return result;
      }

      logger.info({ userId, count: transcripts.length }, "Fetched Fireflies transcripts for sync");

      // Load known customers + org name for LLM classification context
      const [knownCustomers, orgName] = await Promise.all([
        getKnownCustomers(user.organizationId),
        getOrgName(user.organizationId),
      ]);

      // Pre-fetch existing external IDs so we can skip already-ingested meetings
      const existingExternalIds = new Set<string>();
      const existingRows = await db
        .select({ externalId: schema.activityBlocks.externalId })
        .from(schema.activityBlocks)
        .where(
          and(
            eq(schema.activityBlocks.userId, userId),
            eq(schema.activityBlocks.blockType, "fireflies")
          )
        );
      for (const row of existingRows) {
        if (row.externalId) existingExternalIds.add(row.externalId);
      }

      // Process each transcript
      const touchedDailyIds = new Set<string>();
      const discoveredSubscribers: string[] = [];

      for (const transcript of transcripts) {
        try {
          // Skip already-ingested meetings (no re-classification, no transcript refetch)
          if (transcript.id && existingExternalIds.has(transcript.id)) {
            logger.debug(
              { transcriptId: transcript.id },
              "Skipping already-ingested Fireflies meeting"
            );
            result.meetingsProcessed++;
            continue;
          }

          const classification = await this.classifyMeeting(transcript, knownCustomers, orgName);

          // Fetch full transcript (sentences) for agent context
          let rawTranscript: string | null = null;
          try {
            const detail = await firefliesService.getTranscript(apiKey, transcript.id);
            rawTranscript = this.formatTranscript(detail);
          } catch (err) {
            logger.warn(
              { transcriptId: transcript.id, error: String(err) },
              "Failed to fetch transcript detail"
            );
          }

          const { created, dailyActivityId } = await this.upsertMeetingAsBlock(
            userId,
            user.organizationId,
            transcript,
            classification,
            rawTranscript
          );

          result.meetingsProcessed++;
          if (created) {
            result.meetingsCreated++;
          } else {
            result.meetingsUpdated++;
          }
          touchedDailyIds.add(dailyActivityId);

          if (classification.subscriberName) {
            discoveredSubscribers.push(classification.subscriberName);
          }
        } catch (err) {
          const msg = `Failed to process transcript ${transcript.id}: ${String(err)}`;
          logger.warn({ userId, transcriptId: transcript.id, error: String(err) }, msg);
          result.errors.push(msg);
        }
      }

      // Recalculate daily stats for every day that was touched
      for (const dailyId of touchedDailyIds) {
        try {
          await recalculateDailyStats(dailyId);
        } catch (error) {
          logger.warn(
            { dailyId, error: String(error) },
            "Failed to recalculate daily stats after Fireflies sync"
          );
        }
      }

      // Auto-discover new customers
      if (discoveredSubscribers.length > 0) {
        addDiscoveredCustomers(user.organizationId, discoveredSubscribers).catch((err) =>
          logger.warn({ err: String(err) }, "Failed to persist discovered customers from Fireflies")
        );
      }

      // Update last synced timestamp
      await db
        .update(schema.users)
        .set({
          firefliesLastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));
    } catch (err) {
      const msg = `Fireflies API error: ${String(err)}`;
      logger.error({ userId, error: String(err) }, msg);
      result.errors.push(msg);
    }

    return result;
  }

  // ==========================================================================
  // Classification
  // ==========================================================================

  /**
   * Classify a meeting with Claude Haiku to extract subscriber and topic.
   * Uses the same pattern as Granola sync.
   */
  private async classifyMeeting(
    transcript: FirefliesTranscript,
    knownCustomers: string[],
    orgName: string | null
  ): Promise<MeetingClassification> {
    const title = transcript.title || "Untitled Meeting";
    const attendees = (transcript.meeting_attendees || [])
      .map((a) => a.displayName || a.name || a.email || "")
      .filter(Boolean);
    const summary = transcript.summary?.short_summary || transcript.summary?.overview || "";
    const topics = transcript.summary?.topics_discussed?.join(", ") || "";
    const meetingType = transcript.summary?.meeting_type || "";

    const orgContext = orgName
      ? `The user works at "${orgName}" — this is their own company, NOT an external customer.`
      : "";

    const customerList =
      knownCustomers.length > 0
        ? `Known customers/clients:\n${knownCustomers.map((c) => `- ${c}`).join("\n")}`
        : "No known customers yet.";

    const prompt = `You are classifying a meeting from a user's Fireflies AI transcripts.

${orgContext}

${customerList}

Meeting title: ${title}
Attendees: ${attendees.join(", ") || "Unknown"}
Summary: ${summary}
Topics: ${topics}
Meeting Type: ${meetingType}

Based on the meeting content, extract:

1. **subscriberName**: The customer/client this meeting relates to.
   - FIRST check if the meeting content matches any known customer above. Use their name EXACTLY as listed.
   - If not a known customer but clearly an external client, provide their full name.
   - If this is an internal meeting, team standup, 1:1, or not related to any customer work, return null.
   - Do NOT invent subscribers for personal/social/internal meetings.

2. **topicName**: A concise 3-6 word topic for the meeting (e.g., "Sprint planning", "API integration review", "Quarterly business review").

Respond ONLY with JSON:
{ "subscriberName": "..." or null, "topicName": "..." }`;

    try {
      const response = await this.callClassifier(prompt);
      const parsed = JSON.parse(response);
      return {
        topicName: parsed.topicName || null,
        subscriberName: parsed.subscriberName || null,
      };
    } catch (err) {
      logger.warn({ title, error: String(err) }, "Meeting classification failed, using fallback");
      return { topicName: title.slice(0, 200), subscriberName: null };
    }
  }

  /**
   * Call the Haiku classifier with cascading fallbacks (Haiku → GPT-4o-mini → DeepSeek).
   */
  private async callClassifier(prompt: string): Promise<string> {
    // Try Claude Haiku first
    if (config.anthropic.apiKey) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.anthropic.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-20250414",
            max_tokens: 256,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            content: Array<{ type: string; text?: string }>;
          };
          const text = data.content?.find((b) => b.type === "text")?.text;
          if (text) return text;
        }
      } catch {
        // Fall through to next provider
      }
    }

    // Fallback: OpenAI GPT-4o-mini
    if (config.openai.apiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.openai.apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            max_tokens: 256,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            choices: Array<{ message: { content: string } }>;
          };
          const text = data.choices?.[0]?.message?.content;
          if (text) return text;
        }
      } catch {
        // Fall through to next provider
      }
    }

    // Fallback: DeepSeek
    if (config.deepseek.apiKey) {
      try {
        const res = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.deepseek.apiKey}`,
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            max_tokens: 256,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            choices: Array<{ message: { content: string } }>;
          };
          const text = data.choices?.[0]?.message?.content;
          if (text) return text;
        }
      } catch {
        // All providers failed
      }
    }

    throw new Error("All classification providers failed");
  }

  // ==========================================================================
  // Block Upsert
  // ==========================================================================

  /**
   * Format transcript sentences into readable speaker-by-speaker text.
   */
  private formatTranscript(transcript: FirefliesTranscript): string | null {
    if (!transcript.sentences || transcript.sentences.length === 0) return null;

    return transcript.sentences
      .map((s) => {
        const speaker = s.speaker_name || "Unknown";
        const mins = Math.floor((s.start_time || 0) / 60);
        const secs = Math.floor((s.start_time || 0) % 60);
        const ts = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
        return `${speaker} (${ts}): ${s.text || ""}`;
      })
      .join("\n");
  }

  private async upsertMeetingAsBlock(
    userId: string,
    organizationId: string,
    transcript: FirefliesTranscript,
    classification: MeetingClassification,
    rawTranscript: string | null
  ): Promise<{ created: boolean; dailyActivityId: string }> {
    const startTime = transcript.date ? new Date(transcript.date) : new Date();
    const durationSeconds = transcript.duration || 0;
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    // Build participants from all available sources:
    // 1. meeting_attendees (calendar-linked meetings)
    // 2. speakers (detected from audio)
    // 3. participants (email list)
    const attendeeMap = new Map<string, { name: string; email: string }>();

    for (const a of transcript.meeting_attendees || []) {
      const name = a.displayName || a.name || "";
      const email = a.email || "";
      const key = email || name;
      if (key) attendeeMap.set(key, { name, email });
    }

    // Add speakers if not already present (common for desktop recordings)
    for (const s of transcript.speakers || []) {
      if (s.name && !attendeeMap.has(s.name)) {
        attendeeMap.set(s.name, { name: s.name, email: "" });
      }
    }

    // Add participant emails if not already present
    for (const p of transcript.participants || []) {
      if (p && !attendeeMap.has(p)) {
        attendeeMap.set(p, { name: p, email: p.includes("@") ? p : "" });
      }
    }

    const attendees = [...attendeeMap.values()];
    const attendeeNames = attendees.map((a) => a.name).filter(Boolean);

    // Build description — include full AI-generated summary from Fireflies
    // Fields: overview (top bullets), outline/shorthand_bullet (detailed notes),
    // action_items, topics_discussed
    const s = transcript.summary;
    const descriptionParts: string[] = [];

    // Log available summary fields for debugging
    if (s) {
      logger.info(
        {
          hasOverview: !!s.overview,
          hasOutline: !!s.outline,
          hasShorthandBullet: !!s.shorthand_bullet,
          hasBulletGist: !!s.bullet_gist,
          hasGist: !!s.gist,
          hasShortSummary: !!s.short_summary,
          hasActionItems: !!s.action_items,
          hasTopics: !!s.topics_discussed,
        },
        "Fireflies summary fields available"
      );
    }

    // 1. Overview (top-level bullet summary)
    if (s?.overview) {
      descriptionParts.push(s.overview);
    }

    // 2. Detailed notes (outline or shorthand_bullet — the full "Notes" section)
    if (s?.outline) {
      const outlineItems = Array.isArray(s.outline) ? s.outline : [String(s.outline)];
      if (outlineItems.length > 0) {
        descriptionParts.push(`## Notes\n${outlineItems.join("\n\n")}`);
      }
    } else if (s?.shorthand_bullet) {
      const bullets = Array.isArray(s.shorthand_bullet)
        ? s.shorthand_bullet
        : [String(s.shorthand_bullet)];
      if (bullets.length > 0) {
        descriptionParts.push(`## Notes\n${bullets.join("\n")}`);
      }
    } else if (s?.bullet_gist) {
      const gistBullets = Array.isArray(s.bullet_gist) ? s.bullet_gist : [String(s.bullet_gist)];
      if (gistBullets.length > 0) {
        descriptionParts.push(`## Notes\n${gistBullets.join("\n")}`);
      }
    }

    // Fallback if no overview: use short_summary or gist
    if (descriptionParts.length === 0) {
      if (s?.short_summary) descriptionParts.push(s.short_summary);
      else if (s?.gist) descriptionParts.push(s.gist);
    }

    // 3. Attendees
    if (attendeeNames.length > 0) {
      descriptionParts.push(`**Attendees:** ${attendeeNames.join(", ")}`);
    }

    // 4. Action items
    if (s?.action_items) {
      const items = Array.isArray(s.action_items) ? s.action_items : [String(s.action_items)];
      if (items.length > 0) {
        descriptionParts.push(`## Action Items\n${items.map((i) => `- ${i}`).join("\n")}`);
      }
    }

    // 5. Topics
    if (s?.topics_discussed) {
      const topics = Array.isArray(s.topics_discussed)
        ? s.topics_discussed
        : [String(s.topics_discussed)];
      if (topics.length > 0) {
        descriptionParts.push(`**Topics:** ${topics.join(", ")}`);
      }
    }

    const description = descriptionParts.join("\n\n") || null;

    const activityDate = startTime.toISOString().split("T")[0]!;
    const dailyActivityId = await this.ensureDailyActivity(userId, organizationId, activityDate);

    const blockName = `[Fireflies] ${transcript.title || "Meeting"}`;
    const externalId = transcript.id || null;

    // Check if a block for this transcript already exists (by externalId first, then name fallback)
    let existingBlocks: { id: string }[] = [];
    if (externalId) {
      existingBlocks = await db
        .select({ id: schema.activityBlocks.id })
        .from(schema.activityBlocks)
        .where(
          and(
            eq(schema.activityBlocks.userId, userId),
            eq(schema.activityBlocks.blockType, "fireflies"),
            eq(schema.activityBlocks.externalId, externalId)
          )
        )
        .limit(1);
    }
    if (existingBlocks.length === 0) {
      existingBlocks = await db
        .select({ id: schema.activityBlocks.id })
        .from(schema.activityBlocks)
        .where(
          and(eq(schema.activityBlocks.userId, userId), eq(schema.activityBlocks.name, blockName))
        )
        .limit(1);
    }

    const blockData = {
      dailyActivityId,
      userId,
      blockType: "fireflies" as const,
      name: blockName,
      externalId,
      startTime,
      endTime,
      durationMinutes,
      description,
      rawTranscript,
      apps: JSON.stringify(["Fireflies"]),
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

  // ==========================================================================
  // Helpers
  // ==========================================================================

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

export const firefliesSyncService = new FirefliesSyncService();
