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
import OpenAI from "openai";
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

/** Shape of a meeting returned by Granola MCP list_meetings / get_meetings tools */
interface GranolaMeeting {
  id: string;
  title?: string | null;
  summary?: string | null;
  notes?: string | null;
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
  private openai: OpenAI | null = null;
  private deepseek: OpenAI | null = null;

  constructor() {
    if (config.anthropic.apiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
      logger.info("Granola sync using Claude Haiku 4.5");
    }
    if (config.openai.apiKey) {
      this.openai = new OpenAI({ apiKey: config.openai.apiKey });
      logger.info("GPT-5 fallback configured for Granola sync");
    }
    if (config.deepseek.apiKey) {
      this.deepseek = new OpenAI({
        apiKey: config.deepseek.apiKey,
        baseURL: "https://api.deepseek.com",
      });
      logger.info("DeepSeek V3.2 configured for Granola sync (last resort)");
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
      logger.info(
        { rawType: typeof raw, rawPreview: JSON.stringify(raw).slice(0, 800) },
        "Raw Granola MCP listMeetings response"
      );
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

    // Pre-fetch existing external IDs so we can skip already-ingested meetings
    const existingExternalIds = new Set<string>();
    const existingRows = await db
      .select({ externalId: schema.activityBlocks.externalId })
      .from(schema.activityBlocks)
      .where(
        and(
          eq(schema.activityBlocks.userId, userId),
          eq(schema.activityBlocks.blockType, "granola")
        )
      );
    for (const row of existingRows) {
      if (row.externalId) existingExternalIds.add(row.externalId);
    }

    // Only enrich new meetings with notes (skip already-ingested)
    const newMeetings = meetings.filter((m) => !existingExternalIds.has(m.id));
    if (newMeetings.length > 0) {
      await this.enrichMeetingsWithNotes(accessToken, newMeetings);
    }

    // Process each meeting
    const touchedDailyIds = new Set<string>();
    const discoveredSubscribers: string[] = [];

    for (const meeting of meetings) {
      try {
        // Skip already-ingested meetings (no re-classification, no transcript refetch)
        if (meeting.id && existingExternalIds.has(meeting.id)) {
          logger.debug({ meetingId: meeting.id }, "Skipping already-ingested Granola meeting");
          result.meetingsProcessed++;
          continue;
        }

        // Single-shot Claude Haiku classification
        const classification = await this.classifyMeeting(meeting, knownCustomers, orgName);

        // Fetch full transcript for agent context (paid tiers only)
        let rawTranscript: string | null = null;
        try {
          const transcriptRaw = await granolaService.getMeetingTranscript(accessToken, meeting.id);
          rawTranscript = this.formatTranscript(transcriptRaw);
          // Filter paywall messages — not a real transcript
          if (rawTranscript && /only available to paid/i.test(rawTranscript)) {
            logger.debug({ meetingId: meeting.id }, "Transcript paywalled, using notes instead");
            rawTranscript = null;
          }
        } catch (err) {
          logger.warn(
            { meetingId: meeting.id, error: String(err) },
            "Failed to fetch Granola transcript"
          );
        }

        // If transcript is paywalled, store notes as rawTranscript for agentic use
        if (!rawTranscript && meeting.notes) {
          rawTranscript = meeting.notes;
        }

        const { created, dailyActivityId } = await this.upsertMeetingAsBlock(
          userId,
          user.organizationId,
          meeting,
          classification,
          rawTranscript
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

  // ──────────────────────────────────────────────
  // LLM Classification — Haiku 4.5 → GPT-5 → DeepSeek
  // ──────────────────────────────────────────────

  /**
   * Classify a single Granola meeting using LLM fallback chain.
   * Haiku 4.5 (primary) → GPT-5 (fallback) → DeepSeek V3.2 (last resort).
   * Returns null fields if all providers are exhausted.
   */
  private async classifyMeeting(
    meeting: GranolaMeeting,
    knownCustomers: string[],
    orgName: string | null
  ): Promise<MeetingClassification> {
    const fallback: MeetingClassification = {
      subscriberName: null,
      topicName: meeting.title || null,
    };

    if (!this.anthropic && !this.openai && !this.deepseek) {
      logger.debug("No LLM clients available — skipping meeting classification");
      return fallback;
    }

    const prompt = this.buildClassificationPrompt(meeting, knownCustomers, orgName);

    // 1. Try Claude Haiku 4.5
    if (this.anthropic) {
      const MAX_RETRIES = 2;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          return await this.classifyWithClaude(prompt);
        } catch (error) {
          const errStr = String(error);
          const isFatal = /401|403|invalid.*key|billing|authentication/i.test(errStr);
          if (isFatal) {
            logger.warn(
              { error: errStr },
              "Claude auth/billing error — permanently disabling for this process"
            );
            this.anthropic = null;
            break;
          }
          const isRetryable = /429|rate.?limit|529|overloaded/i.test(errStr);
          if (isRetryable && attempt < MAX_RETRIES) {
            const delayMs = (attempt + 1) * 5000;
            logger.warn(
              { error: errStr, attempt: attempt + 1, delayMs },
              `Claude rate-limited/overloaded — retrying in ${delayMs / 1000}s`
            );
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
          logger.warn(
            { error: errStr, meetingId: meeting.id },
            "Claude failed — falling back to GPT-5"
          );
          break;
        }
      }
    }

    // 2. Try GPT-5
    if (this.openai) {
      try {
        return await this.classifyWithOpenAI(prompt, this.openai, "gpt-5");
      } catch (error) {
        logger.warn(
          { error: String(error), meetingId: meeting.id },
          "GPT-5 failed — falling back to DeepSeek"
        );
      }
    }

    // 3. Try DeepSeek V3.2
    if (this.deepseek) {
      try {
        return await this.classifyWithOpenAI(prompt, this.deepseek, "deepseek-chat");
      } catch (error) {
        logger.warn(
          { error: String(error), meetingId: meeting.id },
          "DeepSeek also failed — all providers exhausted"
        );
      }
    }

    return fallback;
  }

  /**
   * Build the classification prompt for a meeting.
   */
  private buildClassificationPrompt(
    meeting: GranolaMeeting,
    knownCustomers: string[],
    orgName: string | null
  ): string {
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

    return `You are classifying a meeting from a user's Granola meeting notes.

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
  }

  /**
   * Claude Haiku 4.5 single-shot classification.
   */
  private async classifyWithClaude(prompt: string): Promise<MeetingClassification> {
    const response = await this.anthropic!.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Empty text response from Claude Haiku");
    }

    const parsed = parseJsonResponse<MeetingClassification>(textBlock.text);
    return {
      subscriberName: parsed.subscriberName || null,
      topicName: parsed.topicName || null,
    };
  }

  /**
   * OpenAI-compatible classification (GPT-5 or DeepSeek V3.2).
   */
  private async classifyWithOpenAI(
    prompt: string,
    client: OpenAI,
    model: string
  ): Promise<MeetingClassification> {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 200,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You classify meetings. Respond ONLY with valid JSON, no markdown or code fences.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error(`Empty response from ${model}`);

    const parsed = parseJsonResponse<MeetingClassification>(content);
    return {
      subscriberName: parsed.subscriberName || null,
      topicName: parsed.topicName || null,
    };
  }

  // ============================================================================
  // Meeting → Activity Block
  // ============================================================================

  /**
   * Format a Granola MCP transcript response into readable speaker-by-speaker text.
   */
  private formatTranscript(raw: unknown): string | null {
    if (!raw) return null;

    // MCP tool results come wrapped: { content: [{ type: "text", text: "..." }] }
    const result = raw as Record<string, unknown>;
    let segments: Array<{ speaker?: string; text?: string; start_time?: number }> = [];

    if (result.content && Array.isArray(result.content)) {
      const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
        (b) => b.type === "text" && b.text
      );
      if (textBlock?.text) {
        try {
          const parsed = JSON.parse(textBlock.text);
          if (Array.isArray(parsed)) segments = parsed;
          else if (parsed.transcript && Array.isArray(parsed.transcript))
            segments = parsed.transcript;
          else if (parsed.segments && Array.isArray(parsed.segments)) segments = parsed.segments;
        } catch {
          // Not JSON — might be plain text transcript
          return textBlock.text;
        }
      }
    }

    if (segments.length === 0) return null;

    return segments
      .map((s) => {
        const speaker = s.speaker || "Unknown";
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
    meeting: GranolaMeeting,
    classification: MeetingClassification,
    rawTranscript: string | null
  ): Promise<{ created: boolean; dailyActivityId: string }> {
    const startTime = meeting.start_time
      ? new Date(meeting.start_time)
      : new Date(meeting.created_at || Date.now());
    const DEFAULT_MEETING_MINUTES = 60;
    let endTime: Date;
    let durationMinutes: number;
    if (meeting.end_time) {
      endTime = new Date(meeting.end_time);
      durationMinutes = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));
    } else {
      durationMinutes = DEFAULT_MEETING_MINUTES;
      endTime = new Date(startTime.getTime() + DEFAULT_MEETING_MINUTES * 60000);
    }

    const attendees = (meeting.attendees || []).map((a) => ({
      name: a.name || "",
      email: a.email || "",
    }));
    const attendeeNames = attendees.map((a) => a.name).filter(Boolean);

    // Build description — prefer notes/summary over just attendee list
    const descriptionParts: string[] = [];
    if (meeting.notes) descriptionParts.push(meeting.notes);
    else if (meeting.summary) descriptionParts.push(meeting.summary);
    if (attendeeNames.length > 0) {
      descriptionParts.push(`Attendees: ${attendeeNames.join(", ")}`);
    }
    const description = descriptionParts.join("\n\n") || null;

    const activityDate = startTime.toISOString().split("T")[0]!;
    const dailyActivityId = await this.ensureDailyActivity(userId, organizationId, activityDate);

    const blockName = `[Granola] ${meeting.title || "Meeting"}`;
    const externalId = meeting.id || null;

    // Check if a block for this meeting already exists (by externalId first, then name fallback)
    let existingBlocks: { id: string }[] = [];
    if (externalId) {
      existingBlocks = await db
        .select({ id: schema.activityBlocks.id })
        .from(schema.activityBlocks)
        .where(
          and(
            eq(schema.activityBlocks.userId, userId),
            eq(schema.activityBlocks.blockType, "granola"),
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
      blockType: "granola" as const,
      name: blockName,
      externalId,
      startTime,
      endTime,
      durationMinutes,
      description,
      rawTranscript,
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
  // Meeting Enrichment
  // ============================================================================

  /**
   * Batch-fetch meeting details via get_meetings (max 10 per call) to get
   * enhanced notes and private notes. Mutates meetings in place.
   */
  private async enrichMeetingsWithNotes(
    accessToken: string,
    meetings: GranolaMeeting[]
  ): Promise<void> {
    const BATCH_SIZE = 10;

    for (let i = 0; i < meetings.length; i += BATCH_SIZE) {
      const batch = meetings.slice(i, i + BATCH_SIZE);
      const ids = batch.map((m) => m.id).filter(Boolean);
      if (ids.length === 0) continue;

      try {
        const raw = await granolaService.getMeetings(accessToken, ids);
        const details = this.parseMeetingDetails(raw);

        // Merge notes back into the meeting objects
        for (const meeting of batch) {
          const detail = details.get(meeting.id);
          if (detail) {
            meeting.notes = detail.notes || meeting.notes || null;
            meeting.summary = detail.summary || meeting.summary || null;
            if (detail.end_time) meeting.end_time = detail.end_time;
          }
        }

        logger.info(
          { batchSize: ids.length, enriched: details.size },
          "Enriched Granola meetings with notes via get_meetings"
        );
      } catch (err) {
        logger.warn(
          { batchStart: i, error: String(err) },
          "Failed to enrich Granola meetings with notes"
        );
      }
    }
  }

  /**
   * Parse get_meetings response into a map of meeting ID → details.
   * Handles both JSON and XML response shapes from Granola MCP.
   */
  private parseMeetingDetails(
    raw: unknown
  ): Map<string, { notes?: string; summary?: string; end_time?: string }> {
    const details = new Map<string, { notes?: string; summary?: string; end_time?: string }>();
    if (!raw) return details;

    // Extract text from MCP wrapper
    const result = raw as Record<string, unknown>;
    let rawText: string | null = null;

    if (result.content && Array.isArray(result.content)) {
      const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
        (b) => b.type === "text" && b.text
      );
      if (textBlock?.text) rawText = textBlock.text;
    }

    if (!rawText) {
      logger.debug("get_meetings returned empty text");
      return details;
    }

    logger.debug({ preview: rawText.slice(0, 500) }, "Raw get_meetings response");

    // Try JSON first
    try {
      const parsed = JSON.parse(rawText);
      const arr = Array.isArray(parsed)
        ? parsed
        : parsed.meetings || parsed.results || parsed.notes || [];
      for (const m of arr) {
        if (m.id) {
          details.set(m.id, {
            notes: m.enhanced_notes || m.private_notes || m.notes || undefined,
            summary: m.summary || undefined,
            end_time: m.end_time || undefined,
          });
        }
      }
      return details;
    } catch {
      // Not JSON — try XML
    }

    // XML: <meeting id="...">...<enhanced_notes>...</enhanced_notes>...<private_notes>...</private_notes>...</meeting>
    const meetingRegex = /<meeting\s+([^>]+)>([\s\S]*?)<\/meeting>/g;
    let match: RegExpExecArray | null;
    while ((match = meetingRegex.exec(rawText)) !== null) {
      const attrStr = match[1];
      const body = match[2];

      const idMatch = attrStr.match(/id="([^"]*)"/);
      if (!idMatch) continue;
      const id = idMatch[1];

      // Extract notes content from various possible XML tags
      const enhancedMatch = body.match(/<enhanced_notes>([\s\S]*?)<\/enhanced_notes>/);
      const privateMatch = body.match(/<private_notes>([\s\S]*?)<\/private_notes>/);
      const notesMatch = body.match(/<notes>([\s\S]*?)<\/notes>/);
      const summaryMatch = body.match(/<summary>([\s\S]*?)<\/summary>/);
      const endTimeMatch = attrStr.match(/end_time="([^"]*)"|end="([^"]*)"/);

      const notes =
        enhancedMatch?.[1]?.trim() ||
        privateMatch?.[1]?.trim() ||
        notesMatch?.[1]?.trim() ||
        undefined;

      details.set(id, {
        notes,
        summary: summaryMatch?.[1]?.trim() || undefined,
        end_time: endTimeMatch?.[1] || endTimeMatch?.[2] || undefined,
      });
    }

    return details;
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
    let rawText: string | null = null;

    if (result.content && Array.isArray(result.content)) {
      const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
        (b) => b.type === "text" && b.text
      );
      if (textBlock?.text) {
        rawText = textBlock.text;
        try {
          data = JSON.parse(textBlock.text);
        } catch {
          // Not JSON — might be XML, handled below
          data = null;
        }
      }
    }

    // Try common JSON response shapes
    if (Array.isArray(data)) return data as GranolaMeeting[];
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.meetings)) return obj.meetings as GranolaMeeting[];
      if (Array.isArray(obj.notes)) return obj.notes as GranolaMeeting[];
      if (Array.isArray(obj.results)) return obj.results as GranolaMeeting[];
    }

    // Granola MCP returns XML: <meeting id="..." title="..." date="...">
    if (rawText && rawText.includes("<meeting ")) {
      return this.parseMeetingsXml(rawText);
    }

    logger.warn(
      {
        shape: typeof data,
        preview: JSON.stringify(raw).slice(0, 500),
      },
      "Unexpected Granola meetings response shape"
    );
    return [];
  }

  /**
   * Parse Granola's XML-formatted meeting list into typed meetings.
   * Format: <meeting id="..." title="..." date="..."><known_participants>...</known_participants></meeting>
   */
  private parseMeetingsXml(xml: string): GranolaMeeting[] {
    const meetings: GranolaMeeting[] = [];
    const meetingRegex = /<meeting\s+([^>]+)>([\s\S]*?)<\/meeting>/g;

    let match: RegExpExecArray | null;
    while ((match = meetingRegex.exec(xml)) !== null) {
      const attrs: Record<string, string> = {};
      const attrStr = match[1];
      const body = match[2];

      const attrRegex = /(\w+)="([^"]*)"/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
      }

      if (!attrs.id) continue;

      // Parse participants from <known_participants> block
      const attendees: { name?: string; email?: string }[] = [];
      const participantsMatch = body.match(/<known_participants>([\s\S]*?)<\/known_participants>/);
      if (participantsMatch) {
        const lines = participantsMatch[1].trim().split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          // Format: "Name (role) <email>" or just "Name <email>"
          const emailMatch = trimmed.match(/^(.+?)\s*<([^>]+)>/);
          if (emailMatch) {
            // Strip "(note creator)" or other role annotations from name
            const name = emailMatch[1].replace(/\s*\([^)]*\)\s*$/, "").trim();
            attendees.push({ name, email: emailMatch[2] });
          } else {
            attendees.push({ name: trimmed });
          }
        }
      }

      meetings.push({
        id: attrs.id,
        title: attrs.title || null,
        start_time: attrs.date || null,
        attendees,
      });
    }

    logger.info({ count: meetings.length }, "Parsed Granola meetings from XML");
    return meetings;
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

    // Proactive refresh: refresh when within 1 hour of expiry (not after)
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const isExpiredOrSoon =
      user.granolaTokenExpiresAt &&
      new Date(user.granolaTokenExpiresAt).getTime() < Date.now() + ONE_HOUR_MS;

    if (isExpiredOrSoon) {
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
