/**
 * Granola Service
 *
 * Handles Granola MCP OAuth 2.1 integration:
 * - MCP OAuth discovery (Protected Resource Metadata → Authorization Server Metadata)
 * - Dynamic client registration (no pre-registered client_id needed)
 * - PKCE authorization flow
 * - Token exchange and refresh
 * - Listing meeting notes via Granola API
 * - Getting note details with transcripts and attendees
 */

import { config } from "../config.js";
import crypto from "crypto";

// ============================================================================
// Types
// ============================================================================

export interface GranolaOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface GranolaNoteOwner {
  id: string;
  name: string | null;
  email: string | null;
}

export interface GranolaAttendee {
  name: string;
  email: string;
}

export interface GranolaCalendarEvent {
  title?: string;
  start_time?: string;
  end_time?: string;
}

export interface GranolaFolderMembership {
  id: string;
  object: string;
  name: string;
}

export interface GranolaTranscriptSegment {
  speaker?: string;
  text: string;
  start_time?: number;
  end_time?: number;
}

export interface GranolaNote {
  id: string;
  object: "note";
  title: string | null;
  owner: GranolaNoteOwner;
  created_at: string;
  updated_at: string;
  calendar_event: GranolaCalendarEvent | null;
  attendees: GranolaAttendee[];
  folder_membership: GranolaFolderMembership[];
  summary_text: string | null;
  transcript?: GranolaTranscriptSegment[];
}

export interface GranolaListNotesResponse {
  notes: GranolaNote[];
  hasMore: boolean;
  cursor: string | null;
}

interface OAuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

interface DynamicClientRegistration {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
}

interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}

// ============================================================================
// PKCE Helpers
// ============================================================================

function generatePKCE(): PKCEPair {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

// ============================================================================
// Service
// ============================================================================

class GranolaService {
  // Cached OAuth discovery results (shared across all users)
  private oauthMetadata: OAuthServerMetadata | null = null;
  private clientRegistration: DynamicClientRegistration | null = null;

  // Per-user PKCE verifiers, keyed by userId (temporary, cleared after callback)
  private pendingPKCE = new Map<string, string>();

  /**
   * Step 1: Discover OAuth server metadata from the Granola MCP endpoint.
   *
   * MCP OAuth 2.1 flow:
   * 1. Hit MCP server → 401 with WWW-Authenticate header → extract resource_metadata URL
   * 2. Fetch Protected Resource Metadata → extract authorization server URL
   * 3. Fetch /.well-known/oauth-authorization-server → get endpoints
   */
  async discoverOAuthMetadata(): Promise<OAuthServerMetadata> {
    if (this.oauthMetadata) return this.oauthMetadata;

    const mcpUrl = config.granola.mcpBaseUrl;

    // Step 1: Probe MCP server for resource metadata
    // Try the well-known path directly first
    let authServerUrl: string | null = null;

    try {
      const resourceMetaUrl = `${mcpUrl}/.well-known/oauth-protected-resource`;
      const resourceRes = await fetch(resourceMetaUrl);
      if (resourceRes.ok) {
        const resourceMeta = (await resourceRes.json()) as {
          resource: string;
          authorization_servers?: string[];
        };
        if (resourceMeta.authorization_servers?.length) {
          authServerUrl = resourceMeta.authorization_servers[0];
        }
      }
    } catch {
      // Fallback: try probing the MCP endpoint for 401
    }

    // Fallback: probe MCP SSE endpoint to get WWW-Authenticate header
    if (!authServerUrl) {
      try {
        const probeRes = await fetch(`${mcpUrl}/sse`, {
          method: "GET",
          headers: { Accept: "text/event-stream" },
        });
        if (probeRes.status === 401) {
          const wwwAuth = probeRes.headers.get("www-authenticate") || "";
          const match = wwwAuth.match(/resource_metadata="([^"]+)"/);
          if (match) {
            const metaRes = await fetch(match[1]);
            if (metaRes.ok) {
              const meta = (await metaRes.json()) as {
                authorization_servers?: string[];
              };
              if (meta.authorization_servers?.length) {
                authServerUrl = meta.authorization_servers[0];
              }
            }
          }
        }
      } catch {
        // Will fall through to default
      }
    }

    // If still no auth server URL, try the MCP base URL itself as the auth server
    if (!authServerUrl) {
      authServerUrl = mcpUrl;
    }

    // Step 2: Fetch authorization server metadata
    const wellKnownUrl = `${authServerUrl}/.well-known/oauth-authorization-server`;
    const asRes = await fetch(wellKnownUrl);

    if (!asRes.ok) {
      throw new Error(
        `Failed to discover Granola OAuth metadata from ${wellKnownUrl}: ${asRes.status}`
      );
    }

    this.oauthMetadata = (await asRes.json()) as OAuthServerMetadata;
    console.log(`[Granola] Discovered OAuth server: ${this.oauthMetadata.authorization_endpoint}`);
    return this.oauthMetadata;
  }

  /**
   * Step 2: Dynamically register this Mitable instance as an OAuth client.
   * Cached — only needs to happen once per server lifetime.
   */
  async ensureClientRegistration(): Promise<DynamicClientRegistration> {
    if (this.clientRegistration) return this.clientRegistration;

    const metadata = await this.discoverOAuthMetadata();

    if (!metadata.registration_endpoint) {
      throw new Error(
        "Granola OAuth server does not support dynamic client registration. " +
          "A pre-configured client_id may be required."
      );
    }

    const regRes = await fetch(metadata.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Mitable",
        redirect_uris: [config.granola.redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none", // Public client (PKCE only)
      }),
    });

    if (!regRes.ok) {
      const errorText = await regRes.text();
      throw new Error(`Granola dynamic client registration failed: ${errorText}`);
    }

    this.clientRegistration = (await regRes.json()) as DynamicClientRegistration;
    console.log(`[Granola] Registered as OAuth client: ${this.clientRegistration.client_id}`);
    return this.clientRegistration;
  }

  /**
   * Get the OAuth authorization URL for a user.
   * Discovers endpoints, registers client, generates PKCE — all automatically.
   */
  async getAuthUrl(userId: string): Promise<string> {
    const metadata = await this.discoverOAuthMetadata();
    const client = await this.ensureClientRegistration();
    const pkce = generatePKCE();

    // Store PKCE verifier for this user (needed during callback)
    this.pendingPKCE.set(userId, pkce.codeVerifier);

    const params = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: config.granola.redirectUri,
      response_type: "code",
      code_challenge: pkce.codeChallenge,
      code_challenge_method: "S256",
      state: userId,
    });

    // Add resource parameter (MCP server URL) per MCP OAuth spec
    params.set("resource", config.granola.mcpBaseUrl);

    return `${metadata.authorization_endpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token (with PKCE verifier).
   */
  async exchangeCodeForToken(code: string, userId: string): Promise<GranolaOAuthTokenResponse> {
    const metadata = await this.discoverOAuthMetadata();
    const client = await this.ensureClientRegistration();
    const codeVerifier = this.pendingPKCE.get(userId);

    if (!codeVerifier) {
      throw new Error("No PKCE verifier found for this user. OAuth flow may have expired.");
    }

    const body: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: config.granola.redirectUri,
      client_id: client.client_id,
      code_verifier: codeVerifier,
    };

    // Add resource parameter per MCP OAuth spec
    body.resource = config.granola.mcpBaseUrl;

    if (client.client_secret) {
      body.client_secret = client.client_secret;
    }

    const response = await fetch(metadata.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });

    // Clean up PKCE verifier
    this.pendingPKCE.delete(userId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange Granola code for token: ${errorText}`);
    }

    return response.json() as Promise<GranolaOAuthTokenResponse>;
  }

  /**
   * Refresh an expired access token.
   */
  async refreshToken(refreshToken: string): Promise<GranolaOAuthTokenResponse> {
    const metadata = await this.discoverOAuthMetadata();
    const client = await this.ensureClientRegistration();

    const body: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: client.client_id,
    };

    if (client.client_secret) {
      body.client_secret = client.client_secret;
    }

    const response = await fetch(metadata.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh Granola token: ${errorText}`);
    }

    return response.json() as Promise<GranolaOAuthTokenResponse>;
  }

  // ============================================================================
  // MCP JSON-RPC Tool Calls
  // ============================================================================

  private mcpCallId = 0;

  /**
   * Call an MCP tool via JSON-RPC over the Granola MCP endpoint.
   * Parses the SSE response format (event: message\ndata: {...}).
   */
  async callMcpTool(
    accessToken: string,
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    const mcpUrl = `${config.granola.mcpBaseUrl}/mcp`;
    this.mcpCallId++;

    const response = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: toolName, arguments: args },
        id: this.mcpCallId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP tool call ${toolName} failed: ${response.status} ${errorText}`);
    }

    // Parse SSE response: "event: message\ndata: {json}\n\n"
    const raw = await response.text();
    const dataLine = raw.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) {
      throw new Error(`MCP tool call ${toolName}: no data in response`);
    }

    const json = JSON.parse(dataLine.slice(6));

    if (json.error) {
      throw new Error(
        `MCP tool ${toolName} error: ${json.error.message || JSON.stringify(json.error)}`
      );
    }

    return json.result;
  }

  /**
   * List meetings via MCP list_meetings tool.
   * time_range: "this_week" | "last_week" | "last_30_days"
   */
  async listMeetings(
    accessToken: string,
    timeRange: "this_week" | "last_week" | "last_30_days" = "last_30_days"
  ): Promise<unknown> {
    return this.callMcpTool(accessToken, "list_meetings", {
      time_range: timeRange,
    });
  }

  /**
   * Get detailed meeting info by IDs (max 10 at a time).
   */
  async getMeetings(accessToken: string, meetingIds: string[]): Promise<unknown> {
    return this.callMcpTool(accessToken, "get_meetings", {
      meeting_ids: meetingIds,
    });
  }

  /**
   * Get transcript for a specific meeting.
   */
  async getMeetingTranscript(accessToken: string, meetingId: string): Promise<unknown> {
    return this.callMcpTool(accessToken, "get_meeting_transcript", {
      meeting_id: meetingId,
    });
  }

  /**
   * Query meetings using natural language.
   */
  async queryMeetings(
    accessToken: string,
    query: string,
    documentIds?: string[]
  ): Promise<unknown> {
    const args: Record<string, unknown> = { query };
    if (documentIds) args.document_ids = documentIds;
    return this.callMcpTool(accessToken, "query_granola_meetings", args);
  }

  /**
   * Check if Granola MCP integration is available.
   * Always true since no pre-configuration needed — discovery is automatic.
   */
  isConfigured(): boolean {
    return !!config.granola.mcpBaseUrl;
  }
}

export const granolaService = new GranolaService();
