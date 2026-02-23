/**
 * Recap RLM Service
 *
 * Independent recap engine that generates recaps directly from raw capture
 * classifications (sessionCaptures), never depending on session summaries.
 *
 * Pipeline:
 * 1. Fetch raw classifications from sessionCaptures for given session IDs
 * 2. Deduplicate & cluster consecutive similar activities
 * 3. Build structured activity timeline
 * 4. Send to LLM with recap prompt (Claude → OpenAI → Groq)
 * 5. Return markdown recap content
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import Groq from "groq-sdk";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, and, inArray, asc } from "drizzle-orm";
import { config } from "../config";
import { createLogger } from "../lib/logger";

const logger = createLogger({ context: "recap-rlm" });

const anthropic = config.anthropic.apiKey
  ? new Anthropic({ apiKey: config.anthropic.apiKey })
  : null;
const openai = config.openai.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : null;
const groq = config.groq.apiKey ? new Groq({ apiKey: config.groq.apiKey }) : null;

interface ActivityCluster {
  timeRange: string;
  startTime: Date;
  endTime: Date;
  app: string;
  activity: string;
  durationMinutes: number;
  frameCount: number;
  confidence: string;
}

interface SessionBlock {
  sessionId: string;
  sessionName: string;
  sessionGoal: string | null;
  startedAt: Date;
  endedAt: Date;
  activeMinutes: number;
  clusters: ActivityCluster[];
}

class RecapRLMService {
  /**
   * Generate a recap from raw capture classifications for given session IDs.
   * Never depends on session summaries.
   */
  async generateRecap(
    sessionIds: string[],
    userId: string,
    options: { tone?: string; length?: string } = {}
  ): Promise<string> {
    const { tone = "professional", length = "standard" } = options;

    logger.info({ sessionIds, userId }, "Generating recap from raw classifications");

    // 1. Fetch session metadata
    const sessions = await db
      .select({
        id: schema.monitoringSessions.id,
        name: schema.monitoringSessions.name,
        sessionGoal: schema.monitoringSessions.sessionGoal,
        startedAt: schema.monitoringSessions.startedAt,
        endedAt: schema.monitoringSessions.endedAt,
        totalPausedMs: schema.monitoringSessions.totalPausedMs,
      })
      .from(schema.monitoringSessions)
      .where(inArray(schema.monitoringSessions.id, sessionIds));

    if (sessions.length === 0) {
      logger.warn({ sessionIds }, "No sessions found for recap");
      return "No session data available for recap.";
    }

    // 2. For each session, fetch raw captures and build clusters
    const blocks: SessionBlock[] = [];

    for (const session of sessions) {
      const captures = await db
        .select({
          capturedAt: schema.sessionCaptures.capturedAt,
          appName: schema.sessionCaptures.appName,
          windowTitle: schema.sessionCaptures.windowTitle,
          activityDescription: schema.sessionCaptures.activityDescription,
          deltaChanged: schema.sessionCaptures.deltaChanged,
          deltaChangeDescription: schema.sessionCaptures.deltaChangeDescription,
          deltaChangeType: schema.sessionCaptures.deltaChangeType,
          confidence: schema.sessionCaptures.confidence,
          analysisStatus: schema.sessionCaptures.analysisStatus,
        })
        .from(schema.sessionCaptures)
        .where(
          and(
            eq(schema.sessionCaptures.sessionId, session.id),
            eq(schema.sessionCaptures.analysisStatus, "analyzed")
          )
        )
        .orderBy(asc(schema.sessionCaptures.capturedAt));

      if (captures.length === 0) {
        logger.warn({ sessionId: session.id }, "No analyzed captures for session");
        continue;
      }

      const clusters = this.clusterActivities(captures);
      const startedAt = new Date(session.startedAt);
      const endedAt = session.endedAt ? new Date(session.endedAt) : new Date();
      const activeMinutes = Math.round(
        Math.max(0, endedAt.getTime() - startedAt.getTime() - (session.totalPausedMs || 0)) / 60000
      );

      blocks.push({
        sessionId: session.id,
        sessionName: session.name || "Work session",
        sessionGoal: session.sessionGoal,
        startedAt,
        endedAt,
        activeMinutes,
        clusters,
      });
    }

    if (blocks.length === 0) {
      logger.warn({ sessionIds }, "No capture data found for any session");
      return "No activity data was captured during these sessions.";
    }

    // 3. Build prompt and call LLM
    const prompt = this.buildPrompt(blocks, tone, length);
    const recap = await this.callLLM(prompt);

    logger.info(
      { sessionIds, blockCount: blocks.length, recapLength: recap.length },
      "Recap generated from raw classifications"
    );

    return recap;
  }

  /**
   * Cluster consecutive captures into activity groups.
   * Collapses frames with similar activity descriptions and same app context.
   */
  private clusterActivities(
    captures: Array<{
      capturedAt: Date;
      appName: string | null;
      windowTitle: string | null;
      activityDescription: string | null;
      deltaChanged: boolean | null;
      deltaChangeDescription: string | null;
      deltaChangeType: string | null;
      confidence: string | null;
    }>
  ): ActivityCluster[] {
    const clusters: ActivityCluster[] = [];
    let current: {
      app: string;
      activity: string;
      startTime: Date;
      endTime: Date;
      frames: number;
      confidences: number[];
    } | null = null;

    for (const cap of captures) {
      const app = cap.appName || "Unknown";
      const activity = cap.activityDescription || cap.deltaChangeDescription || "Working";
      const conf = parseFloat(cap.confidence || "0.5");

      // Start new cluster if app changed or activity is substantially different
      if (!current || current.app !== app || !this.isSimilarActivity(current.activity, activity)) {
        // Flush previous cluster
        if (current) {
          clusters.push(this.flushCluster(current));
        }
        current = {
          app,
          activity,
          startTime: cap.capturedAt,
          endTime: cap.capturedAt,
          frames: 1,
          confidences: [conf],
        };
      } else {
        // Extend current cluster
        current.endTime = cap.capturedAt;
        current.frames++;
        current.confidences.push(conf);
        // Use the most descriptive activity in the cluster
        if (activity.length > current.activity.length) {
          current.activity = activity;
        }
      }
    }

    // Flush last cluster
    if (current) {
      clusters.push(this.flushCluster(current));
    }

    return clusters;
  }

  /**
   * Check if two activity descriptions are similar enough to merge.
   * Uses simple heuristic: shared significant words.
   */
  private isSimilarActivity(a: string, b: string): boolean {
    const stopWords = new Set([
      "the",
      "a",
      "an",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "and",
      "or",
      "is",
      "was",
    ]);
    const wordsA = new Set(
      a
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w))
    );
    const wordsB = new Set(
      b
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w))
    );

    if (wordsA.size === 0 || wordsB.size === 0) return false;

    let overlap = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) overlap++;
    }

    const similarity = overlap / Math.min(wordsA.size, wordsB.size);
    return similarity >= 0.5;
  }

  private flushCluster(current: {
    app: string;
    activity: string;
    startTime: Date;
    endTime: Date;
    frames: number;
    confidences: number[];
  }): ActivityCluster {
    const durationMs = current.endTime.getTime() - current.startTime.getTime();
    const durationMinutes = Math.max(1, Math.round(durationMs / 60000));
    const avgConf = current.confidences.reduce((a, b) => a + b, 0) / current.confidences.length;

    return {
      timeRange: `${this.formatTime(current.startTime)}-${this.formatTime(current.endTime)}`,
      startTime: current.startTime,
      endTime: current.endTime,
      app: current.app,
      activity: current.activity,
      durationMinutes,
      frameCount: current.frames,
      confidence: avgConf >= 0.7 ? "high" : avgConf >= 0.4 ? "medium" : "low",
    };
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  /**
   * Build the LLM prompt from clustered activity data.
   */
  private buildPrompt(blocks: SessionBlock[], tone: string, length: string): string {
    const toneInstructions: Record<string, string> = {
      professional:
        "Use a professional, polished tone suitable for a manager or stakeholder update.",
      casual: "Use a casual, conversational tone like a Slack update to teammates.",
      concise: "Be extremely concise — bullet points and short phrases only.",
      detailed: "Be thorough and detailed, covering each session's contributions.",
    };

    const lengthInstructions: Record<string, string> = {
      brief: "Keep the recap under 100 words.",
      standard: "Keep the recap between 100-250 words.",
      comprehensive: "Write a comprehensive recap of 250-500 words covering all details.",
    };

    const blockSections = blocks
      .map((block) => {
        const header = [
          `Session: "${block.sessionName}" (${block.activeMinutes}m)`,
          block.sessionGoal ? `Goal: ${block.sessionGoal}` : null,
          `Time: ${this.formatTime(block.startedAt)} - ${this.formatTime(block.endedAt)}`,
        ]
          .filter(Boolean)
          .join("\n");

        const activities = block.clusters
          .map(
            (c, i) =>
              `${i + 1}. ${c.timeRange} (${c.durationMinutes}m) — ${c.app}: ${c.activity} [${c.frameCount} frames, ${c.confidence} confidence]`
          )
          .join("\n");

        return `${header}\n\nActivities:\n${activities}`;
      })
      .join("\n\n---\n\n");

    return `You are writing a work recap from raw activity data captured during work sessions.
The data below comes directly from automated screen analysis — each activity was detected from the user's screen at regular intervals.

<activity_data>
${blockSections}
</activity_data>

<tone>${toneInstructions[tone] || toneInstructions.professional}</tone>
<length>${lengthInstructions[length] || lengthInstructions.standard}</length>

<instructions>
- Write in first person ("I worked on...", "I completed...")
- Combine related activities across sessions into coherent themes
- Use markdown formatting (headers, bullets, bold) for readability
- Include a brief opening line summarizing the overall period
- Group by theme/project rather than by individual session or chronological order
- Focus on accomplishments and progress, not the tools used
- Ignore low-confidence activities or merge them into nearby high-confidence ones
- If the same activity spans multiple time blocks, combine them and report total time
- Only mention facts present in the activity data above
</instructions>

Write the recap now (markdown only, no JSON wrapping):`;
  }

  /**
   * Call LLM with Claude → OpenAI → Groq fallback chain.
   */
  private async callLLM(prompt: string): Promise<string> {
    // Primary: Claude
    if (anthropic) {
      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        });
        const text = response.content.find((b) => b.type === "text");
        if (text && text.type === "text" && text.text.trim()) {
          logger.info("Recap generated via Claude Sonnet 4.5");
          return text.text.trim();
        }
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          "Claude failed for recap — falling back to OpenAI"
        );
      }
    }

    // Fallback: OpenAI
    if (openai) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-5",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
          max_completion_tokens: 1000,
        });
        const content = completion.choices[0]?.message?.content?.trim();
        if (content) {
          logger.info("Recap generated via OpenAI GPT-5 (fallback)");
          return content;
        }
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          "OpenAI failed for recap — falling back to Groq"
        );
      }
    }

    // Last resort: Groq
    if (groq) {
      try {
        const completion = await groq.chat.completions.create({
          model: config.groq.chatModel || "openai/gpt-oss-120b",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
          max_tokens: 1000,
        });
        const content = completion.choices[0]?.message?.content?.trim();
        if (content) {
          logger.info("Recap generated via Groq (last resort)");
          return content;
        }
      } catch (error) {
        logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          "Groq also failed for recap"
        );
      }
    }

    return "Unable to generate recap — all LLM providers failed.";
  }
}

export const recapRLMService = new RecapRLMService();
