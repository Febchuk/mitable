import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerIntegrationTools(server: McpServer, organizationId: string) {
  // ─── list_slack_channels ────────────────────────────────────────────
  server.registerTool(
    "list_slack_channels",
    {
      description: "List Slack channels the bot is a member of.",
      inputSchema: {},
    },
    async () => {
      const { slackService } = await import("../../../../services/slack.service.js");

      try {
        const channels = await slackService.listChannels(organizationId);
        return { content: [{ type: "text" as const, text: JSON.stringify({ channels }) }] };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: error.message || "Slack not connected" }),
            },
          ],
        };
      }
    }
  );

  // ─── send_slack_message ─────────────────────────────────────────────
  server.registerTool(
    "send_slack_message",
    {
      description: "Send a message to a Slack channel.",
      inputSchema: {
        channelId: z.string().describe("Slack channel ID"),
        text: z.string().describe("Message text"),
      },
    },
    async ({ channelId, text }) => {
      const { slackService } = await import("../../../../services/slack.service.js");

      try {
        const result = await slackService.sendMessage(organizationId, channelId, { text });
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: error.message || "Failed to send message" }),
            },
          ],
        };
      }
    }
  );
}
