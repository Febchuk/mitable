import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import * as schema from "../../db/schema/index.js";

export function registerOrganizationResources(server: McpServer, organizationId: string) {
  // ─── mitable://organization ─────────────────────────────────────────
  server.registerResource(
    "organization",
    "mitable://organization",
    {
      description: "Organization name, domain, and settings",
    },
    async () => {
      const [org] = await db
        .select({
          id: schema.organizations.id,
          name: schema.organizations.name,
          domain: schema.organizations.domain,
          settings: schema.organizations.settings,
          createdAt: schema.organizations.createdAt,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, organizationId))
        .limit(1);

      return {
        contents: [
          {
            uri: "mitable://organization",
            text: JSON.stringify(org ?? { error: "Organization not found" }),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // ─── mitable://organization/subscription ────────────────────────────
  server.registerResource(
    "subscription",
    "mitable://organization/subscription",
    {
      description: "Subscription tier, status, usage, and limits",
    },
    async () => {
      const [sub] = await db
        .select({
          tier: schema.subscriptions.tier,
          status: schema.subscriptions.status,
          currentPeriodStart: schema.subscriptions.currentPeriodStart,
          currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
          trialEnd: schema.subscriptions.trialEnd,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.organizationId, organizationId))
        .limit(1);

      return {
        contents: [
          {
            uri: "mitable://organization/subscription",
            text: JSON.stringify(sub ?? { tier: "free", status: "active" }),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // ─── mitable://organization/integrations ────────────────────────────
  server.registerResource(
    "integrations",
    "mitable://organization/integrations",
    {
      description: "Connected integration providers, statuses, and last sync times",
    },
    async () => {
      const integrations = await db
        .select({
          provider: schema.integrations.provider,
          status: schema.integrations.status,
          lastSyncedAt: schema.integrations.lastSyncedAt,
          createdAt: schema.integrations.createdAt,
        })
        .from(schema.integrations)
        .where(eq(schema.integrations.organizationId, organizationId));

      return {
        contents: [
          {
            uri: "mitable://organization/integrations",
            text: JSON.stringify({ integrations }),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // ─── mitable://organization/team ────────────────────────────────────
  server.registerResource(
    "team",
    "mitable://organization/team",
    {
      description: "Team roster with user IDs, names, emails, roles, and statuses",
    },
    async () => {
      const team = await db
        .select({
          id: schema.users.id,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          email: schema.users.email,
          role: schema.users.role,
          jobTitle: schema.users.jobTitle,
          status: schema.users.status,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .where(eq(schema.users.organizationId, organizationId));

      return {
        contents: [
          {
            uri: "mitable://organization/team",
            text: JSON.stringify({ team }),
            mimeType: "application/json",
          },
        ],
      };
    }
  );
}
