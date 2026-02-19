/**
 * Session Classification Service
 *
 * Classifies a session's captures into high-level activities using Groq.
 * Writes the result to monitoring_sessions.keyActivities as a JSONB array.
 *
 * Each activity: { activity, category, minutes, description }
 *
 * This is the per-session equivalent of the capture rollup's day-level
 * classification. The base unit is the activity (not the session), which
 * aligns with the upcoming calendar/journal feature where blocks = activities.
 */

import Groq from "groq-sdk";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, asc } from "drizzle-orm";
import { config } from "../config";
import { createLogger } from "../lib/logger";

const logger = createLogger({ context: "session-classification" });

const groq = new Groq({ apiKey: config.groq.apiKey });

export interface ClassifiedActivity {
  activity: string;
  category: string;
  minutes: number;
  description: string;
}

/**
 * Classify a single session's captures into activities via Groq.
 * Reads captures + optional transcript, writes keyActivities on the session.
 * Returns the classified activities (or empty array on failure).
 */
export async function classifySession(sessionId: string): Promise<ClassifiedActivity[]> {
  // Fetch captures for this session
  const captures = await db
    .select({
      appName: schema.sessionCaptures.appName,
      windowTitle: schema.sessionCaptures.windowTitle,
      activityDescription: schema.sessionCaptures.activityDescription,
      capturedAt: schema.sessionCaptures.capturedAt,
    })
    .from(schema.sessionCaptures)
    .where(eq(schema.sessionCaptures.sessionId, sessionId))
    .orderBy(asc(schema.sessionCaptures.capturedAt));

  if (captures.length === 0) {
    logger.debug({ sessionId }, "No captures — skipping classification");
    return [];
  }

  // Fetch session metadata for duration
  const [session] = await db
    .select({
      startedAt: schema.monitoringSessions.startedAt,
      endedAt: schema.monitoringSessions.endedAt,
      totalPausedMs: schema.monitoringSessions.totalPausedMs,
      name: schema.monitoringSessions.name,
    })
    .from(schema.monitoringSessions)
    .where(eq(schema.monitoringSessions.id, sessionId))
    .limit(1);

  if (!session) return [];

  const startMs = new Date(session.startedAt).getTime();
  const endMs = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  const activeMs = endMs - startMs - (session.totalPausedMs || 0);
  const totalMinutes = Math.max(1, Math.round(activeMs / 60000));

  // Fetch transcript if available
  let transcriptSnippet = "";
  try {
    const transcripts = await db
      .select({ transcript: schema.sessionTranscripts.transcript })
      .from(schema.sessionTranscripts)
      .where(eq(schema.sessionTranscripts.sessionId, sessionId));

    if (transcripts.length > 0) {
      transcriptSnippet = transcripts
        .map((t) => t.transcript)
        .filter(Boolean)
        .join(" ")
        .slice(0, 400);
    }
  } catch {
    // sessionTranscripts may not exist for older sessions
  }

  // Build capture lines for Groq
  const captureLines: string[] = [];
  for (const c of captures) {
    const parts: string[] = [];
    if (c.appName) parts.push(c.appName);
    if (c.windowTitle) parts.push(`"${c.windowTitle}"`);
    if (c.activityDescription) parts.push(`— ${c.activityDescription}`);
    if (parts.length > 0) captureLines.push(parts.join(" "));
  }

  const uniqueLines = [...new Set(captureLines)].slice(0, 60);

  const transcriptContext = transcriptSnippet
    ? `\nTranscript excerpt:\n${transcriptSnippet}`
    : "";

  const prompt = `You are a work activity classifier. Given screen capture observations from a single work session (${totalMinutes} minutes), classify them into distinct activities.

For each activity, provide:
- "activity": Short name (e.g., "Code review in VS Code", "Team standup on Zoom")
- "category": Type — one of: "Meeting", "Development", "Communication", "Documentation", "Design", "Research", "Project Management", "Browsing", "Other"
- "minutes": Duration in minutes
- "description": 1-2 sentence description of what was being done

Rules:
- Merge similar/consecutive captures into single activities
- Total minutes across all activities should roughly equal ${totalMinutes}
- If it looks like a video call / conference / huddle, category MUST be "Meeting"
- Be specific about what was done, not just app names
- If there's transcript data, use it to enrich the description (participants, topics discussed)

Respond in JSON:
{ "activities": [ { "activity": "...", "category": "...", "minutes": N, "description": "..." }, ... ] }

${session.name ? `Session name: "${session.name}"` : ""}
Capture observations (chronological):
${uniqueLines.map((l) => `• ${l}`).join("\n")}${transcriptContext}`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty Groq response");

    const parsed = JSON.parse(content) as { activities?: ClassifiedActivity[] };
    if (!Array.isArray(parsed.activities) || parsed.activities.length === 0) {
      throw new Error("No activities in Groq response");
    }

    const activities = parsed.activities;

    // Write to monitoring_sessions.keyActivities
    await db
      .update(schema.monitoringSessions)
      .set({ keyActivities: activities })
      .where(eq(schema.monitoringSessions.id, sessionId));

    logger.debug(
      { sessionId, activityCount: activities.length, totalMinutes },
      "Session classified"
    );

    return activities;
  } catch (error) {
    logger.warn({ sessionId, error: String(error) }, "Session classification failed — using fallback");

    // Fallback: single generic activity from captures
    const topApp = captures[0]?.appName || "Unknown";
    const fallback: ClassifiedActivity[] = [{
      activity: `Work session in ${topApp}`,
      category: "Other",
      minutes: totalMinutes,
      description: `${totalMinutes} minute session with ${captures.length} captures.`,
    }];

    await db
      .update(schema.monitoringSessions)
      .set({ keyActivities: fallback })
      .where(eq(schema.monitoringSessions.id, sessionId));

    return fallback;
  }
}

/**
 * Check if a session has Groq classification data (not just old storyteller format).
 * New format: { activity, category, minutes, description }
 * Old format: { activity, timestamp, confidence }
 */
export async function isSessionClassified(sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ keyActivities: schema.monitoringSessions.keyActivities })
    .from(schema.monitoringSessions)
    .where(eq(schema.monitoringSessions.id, sessionId))
    .limit(1);

  if (!row) return false;
  const activities = row.keyActivities as any[];
  return (
    Array.isArray(activities) &&
    activities.length > 0 &&
    typeof activities[0]?.category === "string" &&
    typeof activities[0]?.minutes === "number"
  );
}
