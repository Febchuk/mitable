import { Request, Response, NextFunction } from "express";
import { apiKeyService } from "../services/api-key.service.js";

export interface McpAuthContext {
  organizationId: string;
  apiKeyId: string;
}

/**
 * Middleware that validates an MCP API key from the Authorization header.
 * Attaches org context to req.mcpAuth for downstream handlers.
 */
export async function mcpAuthMiddleware(
  req: Request & { mcpAuth?: McpAuthContext },
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const rawKey = authHeader.slice(7);
  const result = await apiKeyService.validateKey(rawKey);
  if (!result) {
    res.status(401).json({ error: "Invalid or revoked API key" });
    return;
  }

  req.mcpAuth = {
    organizationId: result.organizationId,
    apiKeyId: result.id,
  };
  next();
}
