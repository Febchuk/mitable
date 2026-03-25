import { Router } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpServer } from "./index.js";
import { mcpAuthMiddleware, type McpAuthContext } from "./auth.js";

const router = Router();

// All MCP requests require API key auth
router.use(mcpAuthMiddleware);

// Track active SSE sessions
const sseTransports = new Map<string, SSEServerTransport>();

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
    message: "This server operates in stateless mode. Use GET /mcp/sse for SSE transport.",
  });
});

router.delete("/", (_req, res) => {
  res.status(405).json({
    error: "Method not allowed",
    message: "This server operates in stateless mode. Session termination is not needed.",
  });
});

/**
 * GET /mcp/sse — SSE transport for Claude Desktop compatibility.
 * Opens a long-lived SSE stream for server-to-client messages.
 */
router.get("/sse", async (req, res) => {
  const { organizationId } = (req as any).mcpAuth as McpAuthContext;

  try {
    const server = createMcpServer(organizationId);
    const transport = new SSEServerTransport("/mcp/sse", res);

    sseTransports.set(transport.sessionId, transport);

    res.on("close", () => {
      sseTransports.delete(transport.sessionId);
    });

    await server.connect(transport);
  } catch (error: any) {
    console.error("MCP SSE connection error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "SSE connection failed" });
    }
  }
});

/**
 * POST /mcp/sse — Receives client-to-server messages for an active SSE session.
 * Session ID is passed as a query parameter.
 */
router.post("/sse", async (req, res) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    // Return 405 so Streamable HTTP clients (e.g. mcp-remote) fall back to SSE
    res.status(405).json({ error: "Use GET /mcp/sse to establish an SSE session" });
    return;
  }

  const transport = sseTransports.get(sessionId);

  if (!transport) {
    res.status(404).json({ error: "SSE session not found or expired" });
    return;
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (error: any) {
    console.error("MCP SSE message error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to handle message" });
    }
  }
});

export const mcpRouter = router;
