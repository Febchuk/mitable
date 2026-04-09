import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSessionTools } from "./tools/sessions.js";
import { registerMetricsTools } from "./tools/metrics.js";
import { registerDocumentTools } from "./tools/documents.js";
import { registerRecapTools } from "./tools/recaps.js";
import { registerIntegrationTools } from "./tools/integrations.js";
import { registerOrganizationResources } from "./resources/organization.js";

/**
 * Creates a stateless MCP server instance with org context baked in via closure.
 * Each HTTP request gets a fresh server — no session state to manage.
 */
export function createMcpServer(organizationId: string): McpServer {
  const server = new McpServer(
    { name: "mitable", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } }
  );

  // Register all tools with org context
  registerSessionTools(server, organizationId);
  registerMetricsTools(server, organizationId);
  registerDocumentTools(server, organizationId);
  registerRecapTools(server, organizationId);
  registerIntegrationTools(server, organizationId);

  // Register resources with org context
  registerOrganizationResources(server, organizationId);

  return server;
}
