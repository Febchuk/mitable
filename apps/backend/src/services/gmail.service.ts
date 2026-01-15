/**
 * Google Workspace Service
 *
 * Handles Google Workspace API interactions for per-user OAuth:
 * - OAuth token exchange and refresh
 * - Sending emails via Gmail
 * - Getting user's Gmail profile
 * - Creating and managing Google Docs documents
 * - Managing Drive files and folders
 */

import { config } from "../config.js";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1";

// Scopes for sending emails, reading profile, creating docs, and managing Drive files
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/documents", // Create and edit Google Docs
  "https://www.googleapis.com/auth/drive.file", // Access files created by this app
];

interface GmailOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

interface GmailSendResult {
  id: string;
  threadId: string;
  labelIds: string[];
}

class GmailService {
  /**
   * Get the OAuth authorization URL for the user to grant access
   */
  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.gmail.clientId,
      redirect_uri: config.gmail.redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES.join(" "),
      access_type: "offline", // Required to get refresh token
      prompt: "consent", // Force consent to always get refresh token
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<GmailOAuthTokenResponse> {
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.gmail.redirectUri,
        client_id: config.gmail.clientId,
        client_secret: config.gmail.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange code for token: ${errorText}`);
    }

    return response.json() as Promise<GmailOAuthTokenResponse>;
  }

  /**
   * Refresh an expired access token
   */
  async refreshToken(refreshToken: string): Promise<GmailOAuthTokenResponse> {
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.gmail.clientId,
        client_secret: config.gmail.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh token: ${errorText}`);
    }

    return response.json() as Promise<GmailOAuthTokenResponse>;
  }

  /**
   * Get the user's Gmail profile
   */
  async getProfile(accessToken: string): Promise<GmailProfile> {
    const response = await fetch(`${GMAIL_API_URL}/users/me/profile`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get Gmail profile: ${errorText}`);
    }

    return response.json() as Promise<GmailProfile>;
  }

  /**
   * Send an email via Gmail API
   * Uses RFC 2822 formatted message
   */
  async sendEmail(
    accessToken: string,
    to: string,
    subject: string,
    body: string,
    fromName?: string
  ): Promise<GmailSendResult> {
    // Get sender's email from profile
    const profile = await this.getProfile(accessToken);
    const fromEmail = profile.emailAddress;

    // Build RFC 2822 formatted email
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
    const emailContent = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      "",
      body,
    ].join("\r\n");

    // Encode to base64url format (Gmail API requirement)
    const encodedMessage = Buffer.from(emailContent)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await fetch(`${GMAIL_API_URL}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encodedMessage,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to send email: ${errorText}`);
    }

    return response.json() as Promise<GmailSendResult>;
  }

  /**
   * Check if Gmail OAuth is configured
   */
  isConfigured(): boolean {
    return !!(config.gmail.clientId && config.gmail.clientSecret);
  }
}

export const gmailService = new GmailService();
export type { GmailOAuthTokenResponse, GmailProfile, GmailSendResult };
