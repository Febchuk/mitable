import { Router } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./index.js";
import { mcpAuthMiddleware, type McpAuthContext } from "./auth.js";

const router = Router();

// All MCP requests require API key auth
router.use(mcpAuthMiddleware);

/**
 * POST /mcp — Streamable HTTP MCP endpoint (stateless).
 * Each request creates a fresh McpServer + transport with org context from the API key.
 */
router.post("/", async (req, res) => {
  const { organizationId } = (req as any).mcpAuth as McpAuthContext;

  try {
    const server = createMcpServer(organizationId);

    // Stateless transport: no session ID management
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    // Connect transport to server, then handle the request
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error: any) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed" });
    }
  }
});

/**
 * GET /mcp — Required by some MCP clients for SSE stream (stateless returns 405).
 * DELETE /mcp — Session termination (stateless returns 405).
 */
router.get("/", (_req, res) => {
  res.status(405).json({
    error: "Method not allowed",
    message: "This server operates in stateless mode. SSE streams are not supported.",
  });
});

router.delete("/", (_req, res) => {
  res.status(405).json({
    error: "Method not allowed",
    message: "This server operates in stateless mode. Session termination is not needed.",
  });
});

export const mcpRouter = router;
