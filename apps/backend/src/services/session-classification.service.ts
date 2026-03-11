/**
 * Session Classification Service
 *
 * Classifies a session's captures into high-level activities using Claude.
 * Writes the result to monitoring_sessions.keyActivities as a JSONB array.
 *
 * Each activity: { activity, category, minutes, description }
 *
 * Claude builds a narrative timeline from raw captures — grouping related
 * window switches into coherent activities (e.g., all Teams windows during
 * a call → one "Meeting" activity, filling out a timesheet mid-meeting →
 * a separate "Project Management" activity).
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import Groq from "groq-sdk";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq, asc } from "drizzle-orm";
import { config } from "../config";
import { createLogger } from "../lib/logger";

const logger = createLogger({ context: "session-classification" });

const anthropic = config.anthropic.apiKey
  ? new Anthropic({ apiKey: config.anthropic.apiKey })
  : null;
const openai = config.openai.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : null;
const groq = config.groq.apiKey ? new Groq({ apiKey: config.groq.apiKey }) : null;

export interface ClassifiedActivity {
  activity: string;
  category: string;
  minutes: number;
  description: string;
  topic?: string; // Higher-level theme, e.g. "Debugging API Issues"
  subscriber?: string; // Client/subscriber name, e.g. "Acme Corp" or null
}

/**
 * Classify a single session's captures into activities via Claude.
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
      finalSummary: schema.monitoringSessions.finalSummary,
      rawActivitySummary: schema.monitoringSessions.rawActivitySummary,
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
        .slice(0, 600);
    }
  } catch {
    // sessionTranscripts may not exist for older sessions
  }

  // Build timestamped capture lines for Claude
  const captureLines: string[] = [];
  for (const c of captures) {
    const time = new Date(c.capturedAt).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts: string[] = [time];
    if (c.appName) parts.push(c.appName);
    if (c.windowTitle) parts.push(`"${c.windowTitle}"`);
    if (c.activityDescription) parts.push(`— ${c.activityDescription}`);
    captureLines.push(parts.join(" | "));
  }

  // Include timestamps but deduplicate consecutive identical entries
  const deduped: string[] = [];
  let prev = "";
  for (const line of captureLines) {
    const withoutTime = line.substring(6); // strip HH:MM prefix
    if (withoutTime !== prev) {
      deduped.push(line);
      prev = withoutTime;
    }
  }
  const lines = deduped.slice(0, 80);

  const summaryContext = session.finalSummary || session.rawActivitySummary || "";
  const transcriptContext = transcriptSnippet
    ? `\n\nAudio transcript excerpt:\n${transcriptSnippet}`
    : "";

  const prompt = `You are a work-activity analyst. Given timestamped screen capture observations from a ${totalMinutes}-minute work session, build a **narrative timeline** of what the person actually did and classify it into distinct activities.

**Your job is to think like a human looking at this data:**
- Multiple window titles from "Microsoft Teams" (meeting views, chat, sharing, control bar, compact view) during the same time period = ONE meeting activity
- Briefly switching to a timesheet app (e.g., Costpoint, Harvest) while in a meeting = a SEPARATE "Project Management" activity
- Several Chrome tabs about the same topic = ONE research/browsing activity
- Consecutive VS Code captures = ONE development activity
- Don't create an activity for every window switch — group by WHAT the person was doing, not which window was in focus

**Categories** (pick exactly one per activity):
Meeting, Development, Communication, Documentation, Design, Research, Project Management, Browsing, Other

**Output format — strict JSON, no markdown:**
{"activities":[{"activity":"Short descriptive name","category":"Category","minutes":N,"description":"1-2 sentence description","topic":"Higher-level theme","subscriber":"Client name or null"}]}

**Rules:**
1. Total minutes across all activities MUST equal ${totalMinutes}
2. Each activity should be at least 1 minute
3. Prefer fewer, larger activities (3-6 is typical) over many tiny ones
4. If multiple apps are used for the same goal, that's ONE activity
5. Meeting-related windows (Teams meeting, Zoom call, Google Meet, etc.) = "Meeting"
6. Be specific in names: "Sprint planning with team" not "Meeting in Teams"
7. If a session summary exists below, use it to inform your classification
8. **topic**: A higher-level theme grouping (3-5 words). More specific than category, broader than the activity name. E.g., "Debugging API Issues" (under Development), "Sprint Planning" (under Meeting). Aim for 2-4 unique topics per session.
9. **subscriber**: If work is for/about a specific client, subscriber, or external stakeholder, provide their name. Clues: Slack channel names (#acme-support → "Acme"), ticket titles (ACME-1234 → "Acme"), window titles with company names, project names referencing clients. If internal work or no client context → null.

${session.name ? `Session name: "${session.name}"` : ""}
${summaryContext ? `Session summary: ${summaryContext.slice(0, 500)}` : ""}

Timestamped captures (chronological):
${lines.join("\n")}${transcriptContext}`;

  // Try Claude first, then OpenAI fallback, then Groq, then dumb fallback
  const activities =
    (await tryClassifyClaude(prompt)) ??
    (await tryClassifyOpenAI(prompt)) ??
    (await tryClassifyGroq(prompt));

  if (activities) {
    await db
      .update(schema.monitoringSessions)
      .set({ keyActivities: activities })
      .where(eq(schema.monitoringSessions.id, sessionId));

    logger.debug(
      { sessionId, activityCount: activities.length, totalMinutes },
      "Session classified"
    );
    return activities;
  }

  // Dumb fallback — all LLMs failed
  logger.warn({ sessionId }, "All LLMs (Claude, OpenAI, Groq) failed — using dumb fallback");
  const topApp = captures[0]?.appName || "Unknown";
  const fallback: ClassifiedActivity[] = [
    {
      activity: `Work session in ${topApp}`,
      category: "Other",
      minutes: totalMinutes,
      description: `${totalMinutes} minute session with ${captures.length} captures.`,
    },
  ];

  await db
    .update(schema.monitoringSessions)
    .set({ keyActivities: fallback })
    .where(eq(schema.monitoringSessions.id, sessionId));

  return fallback;
}

/** Parse LLM response text into activities array, or null */
function parseActivitiesJson(text: string): ClassifiedActivity[] | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { activities?: ClassifiedActivity[] };
    if (!Array.isArray(parsed.activities) || parsed.activities.length === 0) return null;
    return parsed.activities;
  } catch {
    return null;
  }
}

async function tryClassifyClaude(prompt: string): Promise<ClassifiedActivity[] | null> {
  if (!anthropic) return null;
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const content = response.content[0]?.type === "text" ? response.content[0].text : "";
    if (!content) throw new Error("Empty Claude response");
    return parseActivitiesJson(content);
  } catch (error) {
    logger.warn({ error: String(error) }, "Claude classification failed — trying OpenAI");
    return null;
  }
}

async function tryClassifyOpenAI(prompt: string): Promise<ClassifiedActivity[] | null> {
  if (!openai) return null;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1",
      max_completion_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const content = response.choices[0]?.message?.content || "";
    if (!content) throw new Error("Empty OpenAI response");
    return parseActivitiesJson(content);
  } catch (error) {
    logger.warn({ error: String(error) }, "OpenAI classification also failed — trying Groq");
    return null;
  }
}

async function tryClassifyGroq(prompt: string): Promise<ClassifiedActivity[] | null> {
  if (!groq) return null;
  try {
    const response = await groq.chat.completions.create({
      model: config.groq.chatModel || "openai/gpt-oss-120b",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const content = response.choices[0]?.message?.content || "";
    if (!content) throw new Error("Empty Groq response");
    return parseActivitiesJson(content);
  } catch (error) {
    logger.warn({ error: String(error) }, "Groq classification also failed");
    return null;
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
  if (
    !Array.isArray(activities) ||
    activities.length === 0 ||
    typeof activities[0]?.category !== "string" ||
    typeof activities[0]?.minutes !== "number"
  ) {
    return false;
  }

  // Detect dumb fallback: single "Other" activity starting with "Work session in"
  if (
    activities.length === 1 &&
    activities[0].category === "Other" &&
    activities[0].activity?.startsWith("Work session in")
  ) {
    return false;
  }

  return true;
}
