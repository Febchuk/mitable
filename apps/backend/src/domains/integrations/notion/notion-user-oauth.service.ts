/**
 * Notion User OAuth Service
 *
 * Handles per-user Notion OAuth for document exports
 * Uses HTTP Basic Authentication as per Notion API spec
 */

import { config } from "../../../config.js";

interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_icon: string;
  owner: {
    type: string;
    user?: {
      id: string;
      name: string;
      avatar_url: string;
      type: string;
      person: {
        email: string;
      };
    };
  };
  duplicated_template_id?: string;
}

interface NotionRefreshTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_icon: string;
  owner: {
    type: string;
  };
}

class NotionUserOAuthService {
  /**
   * Exchange authorization code for access token
   * Uses HTTP Basic Authentication as per Notion OAuth spec
   */
  async exchangeCodeForToken(code: string): Promise<NotionTokenResponse> {
    const { clientId, clientSecret, userRedirectUri } = config.notion;

    // Encode credentials for HTTP Basic Auth
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: userRedirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to exchange Notion code for token: ${response.status} - ${errorText}`
      );
    }

    return (await response.json()) as NotionTokenResponse;
  }

  /**
   * Refresh access token
   * Note: Notion rotates BOTH access_token AND refresh_token on refresh
   */
  async refreshAccessToken(refreshToken: string): Promise<NotionRefreshTokenResponse> {
    const { clientId, clientSecret } = config.notion;

    // Encode credentials for HTTP Basic Auth
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh Notion token: ${response.status} - ${errorText}`);
    }

    return (await response.json()) as NotionRefreshTokenResponse;
  }
}

export const notionUserOAuthService = new NotionUserOAuthService();
