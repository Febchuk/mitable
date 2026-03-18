/**
 * Fireflies Sync Service
 *
 * Fetches meeting transcripts from Fireflies AI, classifies each with
 * Claude Haiku (subscriber + topic), and upserts activity_blocks
 * (blockType: "fireflies") so meetings flow into the metrics pipeline.
 *
 * Mirrors the Granola sync service pattern.
 */

import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { firefliesService, type FirefliesTranscript } from "./fireflies.service.js";
import { encryptionService } from "./encryption.service.js";
import { config } from "../config.js";
import { createLogger } from "../lib/logger.js";

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

    // Determine sync window: since last sync, or last 7 days
    const syncSince = user.firefliesLastSyncedAt
      ? new Date(user.firefliesLastSyncedAt).getTime()
      : Date.now() - 7 * 24 * 60 * 60 * 1000;

    try {
      // Fetch transcripts from Fireflies
      const transcripts = await firefliesService.listTranscripts(apiKey, {
        fromDate: syncSince,
        limit: 50,
      });

      if (transcripts.length === 0) {
        logger.debug({ userId }, "No new Fireflies transcripts");
        return result;
      }

      logger.info(
        { userId, count: transcripts.length },
        "Fetched Fireflies transcripts for sync",
      );

      // Process each transcript
      for (const transcript of transcripts) {
        try {
          const classification = await this.classifyMeeting(transcript);
          const { created } = await this.upsertMeetingAsBlock(
            userId,
            user.organizationId,
            transcript,
            classification,
          );

          result.meetingsProcessed++;
          if (created) {
            result.meetingsCreated++;
          } else {
            result.meetingsUpdated++;
          }
        } catch (err) {
          const msg = `Failed to process transcript ${transcript.id}: ${String(err)}`;
          logger.warn({ userId, transcriptId: transcript.id, error: String(err) }, msg);
          result.errors.push(msg);
        }
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
  ): Promise<MeetingClassification> {
    const title = transcript.title || "Untitled Meeting";
    const attendees = (transcript.meeting_attendees || [])
      .map((a) => a.displayName || a.name || a.email || "")
      .filter(Boolean);
    const summary = transcript.summary?.short_summary || transcript.summary?.overview || "";
    const topics = transcript.summary?.topics_discussed?.join(", ") || "";
    const meetingType = transcript.summary?.meeting_type || "";

    const prompt = `Classify this meeting for a work-tracking dashboard.

Title: ${title}
Attendees: ${attendees.join(", ") || "Unknown"}
Summary: ${summary}
Topics: ${topics}
Meeting Type: ${meetingType}

Return JSON with:
- subscriberName: The client/company/team this meeting was for (null if internal/unclear)
- topicName: Short topic label (e.g., "Sprint Planning", "Client Onboarding", "Design Review")

Rules:
- Use "Full Name (Abbreviation)" format for subscriber names when possible
- If purely internal (standup, 1:1, retro), set subscriberName to null
- topicName should be 2-4 words max

Respond ONLY with valid JSON, no markdown.`;

    try {
      const response = await this.callClassifier(prompt);
      const parsed = JSON.parse(response);
      return {
        topicName: parsed.topicName || null,
        subscriberName: parsed.subscriberName || null,
      };
    } catch (err) {
      logger.warn(
        { title, error: String(err) },
        "Meeting classification failed, using fallback",
      );
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
   * Create or update an activity block from a Fireflies transcript.
   */
  private async upsertMeetingAsBlock(
    userId: string,
    organizationId: string,
    transcript: FirefliesTranscript,
    classification: MeetingClassification,
  ): Promise<{ created: boolean; dailyActivityId: string }> {
    const startTime = transcript.date
      ? new Date(transcript.date)
      : new Date();
    const durationSeconds = transcript.duration || 0;
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    const attendees = (transcript.meeting_attendees || []).map((a) => ({
      name: a.displayName || a.name || "",
      email: a.email || "",
    }));
    const attendeeNames = attendees.map((a) => a.name).filter(Boolean);

    // Build description
    const descriptionParts: string[] = [];
    if (transcript.summary?.short_summary) {
      descriptionParts.push(transcript.summary.short_summary);
    } else if (transcript.summary?.overview) {
      descriptionParts.push(transcript.summary.overview);
    }
    if (attendeeNames.length > 0) {
      descriptionParts.push(`Attendees: ${attendeeNames.join(", ")}`);
    }
    if (transcript.summary?.action_items && transcript.summary.action_items.length > 0) {
      descriptionParts.push(`Action Items:\n${transcript.summary.action_items.map((i) => `- ${i}`).join("\n")}`);
    }
    const description = descriptionParts.join("\n\n") || null;

    const activityDate = startTime.toISOString().split("T")[0]!;
    const dailyActivityId = await this.ensureDailyActivity(userId, organizationId, activityDate);

    const blockName = `[Fireflies] ${transcript.title || "Meeting"}`;

    // Check if a block for this transcript already exists
    const existingBlocks = await db
      .select({ id: schema.activityBlocks.id })
      .from(schema.activityBlocks)
      .where(
        and(
          eq(schema.activityBlocks.userId, userId),
          eq(schema.activityBlocks.name, blockName),
        ),
      )
      .limit(1);

    const blockData = {
      dailyActivityId,
      userId,
      blockType: "fireflies" as const,
      name: blockName,
      startTime,
      endTime,
      durationMinutes,
      description,
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
    activityDate: string,
  ): Promise<string> {
    const [existing] = await db
      .select({ id: schema.userDailyActivities.id })
      .from(schema.userDailyActivities)
      .where(
        and(
          eq(schema.userDailyActivities.userId, userId),
          eq(schema.userDailyActivities.activityDate, activityDate),
          eq(schema.userDailyActivities.periodType, "daily"),
        ),
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
