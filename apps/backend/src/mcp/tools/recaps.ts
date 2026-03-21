import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq, and, desc, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as schema from "../../db/schema/index.js";

export function registerRecapTools(server: McpServer, organizationId: string) {
  // ─── generate_recap ─────────────────────────────────────────────────
  server.registerTool(
    "generate_recap",
    {
      description:
        "Generate an AI recap from one or more session IDs. Returns a markdown work update.",
      inputSchema: {
        sessionIds: z
          .array(z.string().uuid())
          .min(1)
          .describe("Session IDs to include in the recap"),
        tone: z.enum(["professional", "casual", "concise", "detailed"]).default("professional"),
        length: z.enum(["brief", "standard", "comprehensive"]).default("standard"),
      },
    },
    async ({ sessionIds, tone, length }) => {
      // Verify all sessions belong to this org
      const sessions = await db
        .select({ id: schema.monitoringSessions.id, userId: schema.monitoringSessions.userId })
        .from(schema.monitoringSessions)
        .where(
          and(
            inArray(schema.monitoringSessions.id, sessionIds),
            eq(schema.monitoringSessions.organizationId, organizationId)
          )
        );

      if (sessions.length === 0) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: "No valid sessions found" }) },
          ],
        };
      }

      const validIds = sessions.map((s) => s.id);
      const userId = sessions[0].userId;

      const { recapRLMService } = await import("../../services/recap-rlm.service.js");
      const recap = await recapRLMService.generateRecap(validIds, userId, { tone, length });

      return { content: [{ type: "text" as const, text: JSON.stringify({ recap }) }] };
    }
  );

  // ─── list_recaps ────────────────────────────────────────────────────
  server.registerTool(
    "list_recaps",
    {
      description: "List previously generated recaps for the organization.",
      inputSchema: {
        userId: z.string().uuid().optional().describe("Filter to a specific user"),
        limit: z.number().int().min(1).max(50).default(20),
      },
    },
    async ({ userId, limit }) => {
      const conditions: any[] = [eq(schema.recaps.organizationId, organizationId)];
      if (userId) conditions.push(eq(schema.recaps.userId, userId));

      const recaps = await db
        .select({
          id: schema.recaps.id,
          userId: schema.recaps.userId,
          title: schema.recaps.title,
          content: schema.recaps.content,
          createdAt: schema.recaps.createdAt,
        })
        .from(schema.recaps)
        .where(and(...conditions))
        .orderBy(desc(schema.recaps.createdAt))
        .limit(limit);

      return { content: [{ type: "text" as const, text: JSON.stringify({ recaps }) }] };
    }
  );
}
