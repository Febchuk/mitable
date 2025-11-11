import type { SearchResult } from "../services/search.service.js";

/**
 * Thread Bundle - Groups related Slack messages into a conversational unit
 */
export interface ThreadBundle {
  threadTs: string; // Parent thread timestamp
  channelId: string;
  channelName: string;
  firstTs: number; // Parent timestamp (unix)
  lastTs: number; // Most recent reply timestamp (unix)
  participants: Set<string>; // Unique usernames
  replyCount: number;
  permalink: string; // Clickable Slack link to thread
  messages: SearchResult[]; // Parent + replies (chronologically sorted)
  score: number; // Composite thread relevance score
  title?: string; // Auto-generated thread title from parent text
}

/**
 * Generate Slack permalink from workspace ID, channel ID, and message timestamp
 * Converts "1234567890.123456" -> "https://workspace.slack.com/archives/C123/p1234567890123456"
 */
export function buildSlackPermalink(
  workspaceId: string,
  channelId: string,
  messageTs: string
): string {
  // Remove decimal point: "1234567890.123456" -> "1234567890123456"
  const ts = messageTs.replace(".", "");
  return `https://${workspaceId}.slack.com/archives/${channelId}/p${ts}`;
}

/**
 * Group search results into thread bundles
 * Standalone messages get their own "pseudo-thread"
 */
export function buildThreadBundles(results: SearchResult[], workspaceId: string): ThreadBundle[] {
  const threadMap = new Map<string, SearchResult[]>();

  // Group by thread_ts (or message_ts for standalone messages)
  for (const result of results) {
    if (result.source !== "slack") continue;

    const threadKey = result.threadTs || result.messageTs || result.id;
    if (!threadMap.has(threadKey)) {
      threadMap.set(threadKey, []);
    }
    threadMap.get(threadKey)!.push(result);
  }

  // Build bundles from groups
  const bundles: ThreadBundle[] = [];

  for (const [threadTs, messages] of threadMap.entries()) {
    // Sort messages chronologically
    const sorted = messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    const firstMessage = sorted[0];
    const lastMessage = sorted[sorted.length - 1];

    // Extract unique participants
    const participants = new Set<string>();
    for (const msg of sorted) {
      if (msg.username) {
        participants.add(msg.username);
      }
    }

    // Generate thread title from parent message (first 50 chars)
    const title = generateThreadTitle(firstMessage.text || "");

    // Build permalink to thread parent
    const permalink = buildSlackPermalink(workspaceId, firstMessage.channelId || "", threadTs);

    bundles.push({
      threadTs,
      channelId: firstMessage.channelId || "",
      channelName: firstMessage.channelName || "unknown",
      firstTs: firstMessage.timestamp || 0,
      lastTs: lastMessage.timestamp || 0,
      participants,
      replyCount: sorted.length - 1, // Exclude parent from count
      permalink,
      messages: sorted,
      score: 0, // Will be computed in scoring step
      title,
    });
  }

  return bundles;
}

/**
 * Generate a short thread title from the parent message text
 */
export function generateThreadTitle(text: string): string {
  // Remove URLs, mentions, and trim
  const cleaned = text
    .replace(/https?:\/\/[^\s]+/g, "") // Remove URLs
    .replace(/<@[A-Z0-9]+>/g, "") // Remove Slack user mentions
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();

  // Take first 50 chars
  if (cleaned.length <= 50) {
    return cleaned || "Thread discussion";
  }

  // Find last complete word within 50 chars
  const truncated = cleaned.substring(0, 50);
  const lastSpace = truncated.lastIndexOf(" ");

  return lastSpace > 0 ? truncated.substring(0, lastSpace) + "…" : truncated + "…";
}

/**
 * Score a thread bundle for relevance
 * Combines: max message relevance, reply count, recency, participant roles
 */
export function scoreThreadBundle(
  bundle: ThreadBundle,
  ownerUsernames: Set<string> = new Set()
): number {
  // 1. Max message relevance (55%)
  const maxScore = Math.max(...bundle.messages.map((m) => m.score || 0));

  // 2. Reply count (20%) - logarithmic scale
  const replyScore = Math.log1p(bundle.replyCount);

  // 3. Recency boost (15%)
  const now = Date.now() / 1000; // Unix timestamp
  const daysSinceLastReply = (now - bundle.lastTs) / (24 * 60 * 60);
  let recencyMultiplier = 1.0;
  if (daysSinceLastReply <= 7) {
    recencyMultiplier = 1.5; // Last 7 days
  } else if (daysSinceLastReply <= 30) {
    recencyMultiplier = 1.2; // Last 30 days
  }

  // 4. Participant role weight (10%)
  const participantScores = Array.from(bundle.participants).map((username) =>
    ownerUsernames.has(username) ? 1.25 : 1.0
  );
  const avgParticipantWeight =
    participantScores.reduce((sum, w) => sum + w, 0) / participantScores.length || 1.0;

  // Composite score
  const score =
    0.55 * maxScore + 0.2 * replyScore + 0.15 * recencyMultiplier + 0.1 * avgParticipantWeight;

  return score;
}

/**
 * Build thread rollup preamble for LLM context
 */
export function buildThreadRollup(bundles: ThreadBundle[]): string {
  if (bundles.length === 0) return "";

  const lines = ["[THREAD ROLLUP - Slack Conversations Found]"];

  for (const bundle of bundles) {
    // Human-readable date format: "September 15, 2024"
    const dateObj = new Date(bundle.firstTs * 1000);
    const date = dateObj.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const participants = Array.from(bundle.participants)
      .slice(0, 3) // Top 3 participants
      .map((u) => `@${u}`)
      .join(", ");

    const participantSuffix =
      bundle.participants.size > 3 ? ` +${bundle.participants.size - 3} more` : "";

    lines.push(
      `- Thread: "${bundle.title}"`,
      `  Channel: #${bundle.channelName}  • Date: ${date}  • Replies: ${bundle.replyCount}`,
      `  Key participants: ${participants}${participantSuffix}`,
      `  Link: ${bundle.permalink}`
    );
  }

  lines.push("[/THREAD ROLLUP]");

  return lines.join("\n");
}

/**
 * Format thread for AI context (parent + top K replies)
 */
export function formatThreadForContext(bundle: ThreadBundle, maxReplies: number = 5): string {
  const lines: string[] = [];

  // Thread header
  lines.push(`\n[Slack Thread - #${bundle.channelName}]`);

  // Parent message
  const parent = bundle.messages[0];
  const parentTimestamp = parent.timestamp
    ? new Date(parent.timestamp * 1000).toISOString()
    : "unknown";
  const parentUsername = parent.username || "Unknown";
  const parentText = parent.text || "";
  lines.push(`Parent: [${parentTimestamp}] ${parentUsername}: ${parentText}`);

  // Top K replies (skip parent)
  const replies = bundle.messages.slice(1, maxReplies + 1);

  replies.forEach((reply, idx) => {
    const timestamp = reply.timestamp ? new Date(reply.timestamp * 1000).toISOString() : "unknown";
    const username = reply.username || "Unknown";
    const text = reply.text || "";
    const prefix = idx < replies.length - 1 ? "├─" : "└─";
    lines.push(`${prefix} Reply ${idx + 1}: [${timestamp}] ${username}: ${text}`);
  });

  // Overflow indicator
  const overflowCount = bundle.messages.length - maxReplies - 1; // -1 for parent
  if (overflowCount > 0) {
    lines.push(`   (+${overflowCount} more replies in thread)`);
  }

  return lines.join("\n");
}
