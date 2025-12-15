/**
 * Session Delivery Service
 *
 * Handles formatting and delivering session summaries to various channels.
 * Currently supports Slack delivery with rich Block Kit formatting.
 *
 * @module session-delivery.service
 */

import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { slackService } from "./slack.service.js";

// ===========================
// Types
// ===========================

export interface DeliveryTarget {
  type: "slack";
  channelId: string;
  channelName?: string;
}

export interface DeliveryOptions {
  sessionId: string;
  target: DeliveryTarget;
  customMessage?: string;
}

export interface DeliveryResult {
  success: boolean;
  messageTs?: string;
  error?: string;
}

interface SessionData {
  id: string;
  organizationId: string;
  userId: string;
  name: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  totalPausedMs: number | null;
  rawActivitySummary: string | null;
  finalSummary: string | null;
  keyActivities: unknown;
}

// ===========================
// Session Delivery Service
// ===========================

class SessionDeliveryService {
  /**
   * Deliver a session summary to the specified target
   */
  async deliverSummary(options: DeliveryOptions): Promise<DeliveryResult> {
    const { sessionId, target, customMessage } = options;

    try {
      // Fetch session data
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, sessionId))
        .limit(1);

      if (!session) {
        return { success: false, error: "Session not found" };
      }

      // Ensure we have a summary to deliver
      const summary = session.finalSummary || session.rawActivitySummary;
      if (!summary) {
        return { success: false, error: "No summary available for this session" };
      }

      // Deliver based on target type
      switch (target.type) {
        case "slack":
          return this.deliverToSlack(session, target, summary, customMessage);
        default:
          return { success: false, error: `Unsupported delivery target: ${target.type}` };
      }
    } catch (error) {
      console.error("[SessionDeliveryService] Delivery failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Deliver summary to Slack channel using Block Kit formatting
   */
  private async deliverToSlack(
    session: SessionData,
    target: DeliveryTarget,
    summary: string,
    customMessage?: string
  ): Promise<DeliveryResult> {
    // Calculate session duration
    const duration = this.calculateDuration(session);

    // Format the message blocks
    const blocks = this.formatSlackBlocks(session, summary, duration, customMessage);

    // Create fallback text (for notifications)
    const fallbackText = customMessage
      ? `${customMessage}\n\nSession Summary: ${session.name || "Work Session"}`
      : `Work Session Summary: ${session.name || "Session"} (${duration})`;

    // Send to Slack
    const result = await slackService.sendMessage(
      session.organizationId,
      target.channelId,
      {
        text: fallbackText,
        blocks,
      }
    );

    if (result.ok) {
      // Update session with delivery info
      await db
        .update(schema.monitoringSessions)
        .set({
          deliveryStatus: "delivered",
          deliveryChannel: "slack",
          deliveryTarget: target.channelId,
          deliveredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.monitoringSessions.id, session.id));

      return { success: true, messageTs: result.ts };
    }

    return { success: false, error: result.error };
  }

  /**
   * Calculate human-readable session duration
   */
  private calculateDuration(session: SessionData): string {
    if (!session.startedAt || !session.endedAt) {
      return "Unknown duration";
    }

    const startTime = session.startedAt.getTime();
    const endTime = session.endedAt.getTime();
    const pausedMs = session.totalPausedMs || 0;

    const totalMs = endTime - startTime - pausedMs;
    const hours = Math.floor(totalMs / (1000 * 60 * 60));
    const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Format summary as Slack Block Kit blocks
   */
  private formatSlackBlocks(
    session: SessionData,
    summary: string,
    duration: string,
    customMessage?: string
  ): any[] {
    const blocks: any[] = [];

    // Header
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: session.name || "Work Session Summary",
        emoji: true,
      },
    });

    // Duration context
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*Duration:* ${duration}  |  *Ended:* ${this.formatTime(session.endedAt)}`,
        },
      ],
    });

    // Divider
    blocks.push({ type: "divider" });

    // Custom message if provided
    if (customMessage) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: customMessage,
        },
      });
      blocks.push({ type: "divider" });
    }

    // Summary content
    // Split into paragraphs for better readability
    const paragraphs = summary.split("\n\n").filter((p) => p.trim());

    for (const paragraph of paragraphs) {
      // Check if it's a bullet list
      if (paragraph.includes("\n- ") || paragraph.startsWith("- ")) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: paragraph,
          },
        });
      } else {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: paragraph,
          },
        });
      }
    }

    // Key activities if available
    const keyActivities = session.keyActivities as any[] | null;
    if (keyActivities && Array.isArray(keyActivities) && keyActivities.length > 0) {
      blocks.push({ type: "divider" });
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Key Activities:*",
        },
      });

      const activityList = keyActivities
        .slice(0, 5) // Limit to 5 activities
        .map((activity: any) => `• ${activity.description || activity}`)
        .join("\n");

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: activityList,
        },
      });
    }

    // Footer
    blocks.push({ type: "divider" });
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "_Generated by Mitable_",
        },
      ],
    });

    return blocks;
  }

  /**
   * Format timestamp for display
   */
  private formatTime(date: Date | null): string {
    if (!date) return "Unknown";

    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  /**
   * Update an already-delivered message (e.g., when summary is edited)
   */
  async updateDeliveredMessage(
    sessionId: string,
    messageTs: string
  ): Promise<DeliveryResult> {
    try {
      // Fetch session data
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, sessionId))
        .limit(1);

      if (!session) {
        return { success: false, error: "Session not found" };
      }

      if (!session.deliveryTarget) {
        return { success: false, error: "No delivery target recorded" };
      }

      const summary = session.finalSummary || session.rawActivitySummary;
      if (!summary) {
        return { success: false, error: "No summary available" };
      }

      // deliveryTarget is stored as jsonb but contains the channel ID string
      const channelId = typeof session.deliveryTarget === "string"
        ? session.deliveryTarget
        : String(session.deliveryTarget);

      const duration = this.calculateDuration(session);
      const blocks = this.formatSlackBlocks(session, summary, duration);

      const fallbackText = `Work Session Summary: ${session.name || "Session"} (${duration}) [Updated]`;

      const result = await slackService.updateMessage(
        session.organizationId,
        channelId,
        messageTs,
        {
          text: fallbackText,
          blocks,
        }
      );

      return { success: result.ok, error: result.error };
    } catch (error) {
      console.error("[SessionDeliveryService] Update failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Preview what the Slack message will look like (returns blocks without sending)
   */
  async previewSlackMessage(sessionId: string): Promise<{
    success: boolean;
    blocks?: any[];
    text?: string;
    error?: string;
  }> {
    try {
      const [session] = await db
        .select()
        .from(schema.monitoringSessions)
        .where(eq(schema.monitoringSessions.id, sessionId))
        .limit(1);

      if (!session) {
        return { success: false, error: "Session not found" };
      }

      const summary = session.finalSummary || session.rawActivitySummary;
      if (!summary) {
        return { success: false, error: "No summary available" };
      }

      const duration = this.calculateDuration(session);
      const blocks = this.formatSlackBlocks(session, summary, duration);
      const text = `Work Session Summary: ${session.name || "Session"} (${duration})`;

      return { success: true, blocks, text };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

export const sessionDeliveryService = new SessionDeliveryService();
