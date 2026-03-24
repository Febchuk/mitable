/**
 * Agent Skills Service
 *
 * Provides executable skills for the AI agent (Layer 2).
 * Each skill wraps a Google Workspace API or local operation
 * and handles auth resolution, token refresh, and error mapping.
 *
 * Skills:
 * - checkGoogleAuth: verify user has valid Google OAuth tokens
 * - sendEmail: send via Gmail API
 * - createDriveFolder: create a folder in Google Drive
 * - uploadToDrive: upload a file to Google Drive
 * - generateDocument: create a Word (.docx) document from content
 */

import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { encryptionService } from "./encryption.service.js";
import { gmailService } from "./gmail.service.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ module: "AgentSkills" });

const GOOGLE_DRIVE_API_URL = "https://www.googleapis.com/drive/v3";
const ONE_HOUR_MS = 60 * 60 * 1000;

// ─── Token Resolution ──────────────────────────────────────────────────

async function resolveGmailAccessToken(
  userId: string
): Promise<{ token: string; email: string | null } | null> {
  const [user] = await db
    .select({
      gmailAccessTokenEncrypted: schema.users.gmailAccessTokenEncrypted,
      gmailRefreshTokenEncrypted: schema.users.gmailRefreshTokenEncrypted,
      gmailTokenExpiresAt: schema.users.gmailTokenExpiresAt,
      gmailUserEmail: schema.users.gmailUserEmail,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user?.gmailAccessTokenEncrypted) return null;

  const isExpiredOrSoon =
    user.gmailTokenExpiresAt &&
    new Date(user.gmailTokenExpiresAt).getTime() < Date.now() + ONE_HOUR_MS;

  if (isExpiredOrSoon && user.gmailRefreshTokenEncrypted) {
    try {
      const refreshToken = encryptionService.decrypt(user.gmailRefreshTokenEncrypted);
      const newTokenData = await gmailService.refreshToken(refreshToken);
      const tokenExpiresAt = new Date(Date.now() + newTokenData.expires_in * 1000);

      await db
        .update(schema.users)
        .set({
          gmailAccessTokenEncrypted: encryptionService.encrypt(newTokenData.access_token),
          gmailRefreshTokenEncrypted: newTokenData.refresh_token
            ? encryptionService.encrypt(newTokenData.refresh_token)
            : user.gmailRefreshTokenEncrypted,
          gmailTokenExpiresAt: tokenExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));

      return { token: newTokenData.access_token, email: user.gmailUserEmail };
    } catch (err) {
      logger.error({ userId, error: String(err) }, "Gmail token refresh failed");
      return null;
    }
  }

  return {
    token: encryptionService.decrypt(user.gmailAccessTokenEncrypted),
    email: user.gmailUserEmail,
  };
}

// ─── Skill Implementations ─────────────────────────────────────────────

export interface GoogleAuthStatus {
  connected: boolean;
  email: string | null;
  needsReconnect: boolean;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  attachment?: { fileName: string; mimeType: string; content: Buffer };
}

export interface CreateDriveFolderParams {
  name: string;
  parentFolderId?: string;
}

export interface UploadToDriveParams {
  fileName: string;
  mimeType: string;
  content: Buffer;
  folderId?: string;
}

class AgentSkillsService {
  /**
   * Check if the user has valid Google OAuth tokens.
   * Returns auth status so the agent can prompt for OAuth if needed.
   */
  async checkGoogleAuth(userId: string): Promise<GoogleAuthStatus> {
    const resolved = await resolveGmailAccessToken(userId);

    if (!resolved) {
      const [user] = await db
        .select({ gmailAccessTokenEncrypted: schema.users.gmailAccessTokenEncrypted })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      return {
        connected: false,
        email: null,
        needsReconnect: !!user?.gmailAccessTokenEncrypted,
      };
    }

    return {
      connected: true,
      email: resolved.email,
      needsReconnect: false,
    };
  }

  /**
   * Send an email via Gmail API.
   * Requires Google OAuth to be connected.
   */
  async sendEmail(
    userId: string,
    params: SendEmailParams
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const resolved = await resolveGmailAccessToken(userId);
    if (!resolved) {
      return { success: false, error: "GOOGLE_AUTH_REQUIRED" };
    }

    try {
      const [user] = await db
        .select({ firstName: schema.users.firstName, lastName: schema.users.lastName })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      const fromName =
        user?.firstName && user?.lastName
          ? `${user.firstName} ${user.lastName}`
          : user?.firstName || undefined;

      const result = await gmailService.sendEmailWithAttachment(
        resolved.token,
        params.to,
        params.subject,
        params.body,
        fromName,
        params.attachment
      );

      logger.info({ userId, to: params.to, messageId: result.id }, "Email sent via agent skill");

      return { success: true, messageId: result.id };
    } catch (err) {
      logger.error({ userId, error: String(err) }, "Failed to send email");
      return { success: false, error: String(err) };
    }
  }

  /**
   * Create a folder in Google Drive.
   */
  async createDriveFolder(
    userId: string,
    params: CreateDriveFolderParams
  ): Promise<{ success: boolean; folderId?: string; folderUrl?: string; error?: string }> {
    const resolved = await resolveGmailAccessToken(userId);
    if (!resolved) {
      return { success: false, error: "GOOGLE_AUTH_REQUIRED" };
    }

    try {
      const metadata: Record<string, unknown> = {
        name: params.name,
        mimeType: "application/vnd.google-apps.folder",
      };

      if (params.parentFolderId) {
        metadata.parents = [params.parentFolderId];
      }

      const response = await fetch(`${GOOGLE_DRIVE_API_URL}/files`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resolved.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Drive API error: ${errorText}`);
      }

      const folder = (await response.json()) as { id: string; name: string };

      logger.info(
        { userId, folderId: folder.id, name: params.name },
        "Drive folder created via agent skill"
      );

      return {
        success: true,
        folderId: folder.id,
        folderUrl: `https://drive.google.com/drive/folders/${folder.id}`,
      };
    } catch (err) {
      logger.error({ userId, error: String(err) }, "Failed to create Drive folder");
      return { success: false, error: String(err) };
    }
  }

  /**
   * Upload a file to Google Drive.
   */
  async uploadToDrive(
    userId: string,
    params: UploadToDriveParams
  ): Promise<{ success: boolean; fileId?: string; fileUrl?: string; error?: string }> {
    const resolved = await resolveGmailAccessToken(userId);
    if (!resolved) {
      return { success: false, error: "GOOGLE_AUTH_REQUIRED" };
    }

    try {
      const metadata: Record<string, unknown> = {
        name: params.fileName,
        mimeType: params.mimeType,
      };

      if (params.folderId) {
        metadata.parents = [params.folderId];
      }

      // Multipart upload: metadata + file content
      const boundary = "mitable_upload_boundary";
      const metadataPart = JSON.stringify(metadata);
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n`
        ),
        Buffer.from(`--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`),
        params.content,
        Buffer.from(`\r\n--${boundary}--`),
      ]);

      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resolved.token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Drive upload error: ${errorText}`);
      }

      const file = (await response.json()) as { id: string; name: string };

      logger.info(
        { userId, fileId: file.id, fileName: params.fileName },
        "File uploaded to Drive via agent skill"
      );

      return {
        success: true,
        fileId: file.id,
        fileUrl: `https://drive.google.com/file/d/${file.id}/view`,
      };
    } catch (err) {
      logger.error({ userId, error: String(err) }, "Failed to upload to Drive");
      return { success: false, error: String(err) };
    }
  }

  /**
   * List folders in Google Drive (for folder selection).
   */
  async listDriveFolders(
    userId: string
  ): Promise<{ success: boolean; folders?: Array<{ id: string; name: string }>; error?: string }> {
    const resolved = await resolveGmailAccessToken(userId);
    if (!resolved) {
      return { success: false, error: "GOOGLE_AUTH_REQUIRED" };
    }

    try {
      const response = await fetch(
        `${GOOGLE_DRIVE_API_URL}/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&orderBy=name&pageSize=100`,
        {
          headers: { Authorization: `Bearer ${resolved.token}` },
        }
      );

      if (!response.ok) {
        throw new Error(`Drive API error: ${await response.text()}`);
      }

      const data = (await response.json()) as { files?: Array<{ id: string; name: string }> };
      return { success: true, folders: data.files || [] };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * Create a Google Doc via the Docs API (requires Google OAuth).
   */
  async createGoogleDoc(
    userId: string,
    title: string,
    content: string,
    folderId?: string
  ): Promise<{
    success: boolean;
    googleDocsUrl?: string;
    error?: string;
  }> {
    const resolved = await resolveGmailAccessToken(userId);
    if (!resolved) {
      return { success: false, error: "GOOGLE_AUTH_REQUIRED" };
    }

    try {
      const createResponse = await fetch("https://docs.googleapis.com/v1/documents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resolved.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      });

      if (!createResponse.ok) {
        throw new Error(`Docs API error: ${await createResponse.text()}`);
      }

      const doc = (await createResponse.json()) as { documentId: string };

      if (folderId) {
        await fetch(`${GOOGLE_DRIVE_API_URL}/files/${doc.documentId}?addParents=${folderId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${resolved.token}` },
        });
      }

      // Insert content as plain text (simple approach for agent use)
      if (content) {
        await fetch(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resolved.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [
              {
                insertText: {
                  location: { index: 1 },
                  text: content,
                },
              },
            ],
          }),
        });
      }

      return {
        success: true,
        googleDocsUrl: `https://docs.google.com/document/d/${doc.documentId}/edit`,
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}

export const agentSkillsService = new AgentSkillsService();
