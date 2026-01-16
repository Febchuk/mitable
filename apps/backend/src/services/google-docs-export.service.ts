/**
 * Google Docs Export Service
 *
 * Handles exporting Mitable documents to Google Docs:
 * - OAuth token management (reuses Gmail tokens with Docs/Drive scopes)
 * - Document creation and update-in-place editing
 * - Markdown to Google Docs batchUpdate conversion
 * - Drive folder selection and file management
 *
 * Strategy: Update-in-place (delete all content, re-insert formatted content)
 * This is faster than Notion because Google Docs uses index-based editing,
 * not block-by-block operations.
 */

import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { encryptionService } from "./encryption.service.js";

const GOOGLE_DOCS_API_URL = "https://docs.googleapis.com/v1";
const GOOGLE_DRIVE_API_URL = "https://www.googleapis.com/drive/v3";

interface GoogleDocsRequest {
  insertText?: {
    location: { index: number };
    text: string;
  };
  updateTextStyle?: {
    range: { startIndex: number; endIndex: number };
    textStyle: {
      bold?: boolean;
      italic?: boolean;
      foregroundColor?: { color: { rgbColor: { red: number; green: number; blue: number } } };
      weightedFontFamily?: { fontFamily: string };
    };
    fields: string;
  };
  updateParagraphStyle?: {
    range: { startIndex: number; endIndex: number };
    paragraphStyle: {
      namedStyleType?: string;
    };
    fields: string;
  };
  deleteContentRange?: {
    range: { startIndex: number; endIndex: number };
  };
}

interface DriveFolder {
  id: string;
  name: string;
  mimeType: string;
}

class GoogleDocsExportService {
  /**
   * Get user's Google OAuth access token (from Gmail integration)
   */
  private async getUserAccessToken(userId: string): Promise<string> {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!user?.gmailAccessTokenEncrypted) {
      throw new Error("User has not connected Gmail/Google Workspace");
    }

    const accessToken = encryptionService.decrypt(user.gmailAccessTokenEncrypted);

    // TODO: Check token expiry and refresh if needed
    // For now, assume token is valid (Gmail service handles refresh elsewhere)

    return accessToken;
  }

  /**
   * List user's Drive folders for selection
   */
  async listFolders(userId: string): Promise<DriveFolder[]> {
    const accessToken = await this.getUserAccessToken(userId);

    const response = await fetch(
      `${GOOGLE_DRIVE_API_URL}/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&orderBy=name&pageSize=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list Drive folders: ${await response.text()}`);
    }

    const data = (await response.json()) as { files?: DriveFolder[] };
    return data.files || [];
  }

  /**
   * Create a new Google Doc in specified folder
   */
  private async createDocument(
    accessToken: string,
    title: string,
    folderId?: string
  ): Promise<string> {
    // Create blank document
    const createResponse = await fetch(`${GOOGLE_DOCS_API_URL}/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create Google Doc: ${await createResponse.text()}`);
    }

    const doc = (await createResponse.json()) as { documentId: string };
    const documentId = doc.documentId;

    // Move to folder if specified
    if (folderId) {
      await fetch(`${GOOGLE_DRIVE_API_URL}/files/${documentId}?addParents=${folderId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    }

    return documentId;
  }

  /**
   * Convert markdown to Google Docs batchUpdate requests
   * Handles: headings, bold, italic, code, lists, line breaks
   */
  private markdownToGoogleDocsRequests(markdown: string): GoogleDocsRequest[] {
    const requests: GoogleDocsRequest[] = [];
    let currentIndex = 1; // Google Docs uses 1-based indexing

    const lines = markdown.split("\n");

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) {
        requests.push({
          insertText: {
            location: { index: currentIndex },
            text: "\n",
          },
        });
        currentIndex += 1;
        continue;
      }

      // Heading detection
      const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        const cleanText = this.stripMarkdownFormatting(text);

        const startIndex = currentIndex;
        const textLength = cleanText.length;

        // Insert heading text
        requests.push({
          insertText: {
            location: { index: currentIndex },
            text: cleanText + "\n",
          },
        });

        // Apply heading style
        const namedStyle = `HEADING_${level}`;
        requests.push({
          updateParagraphStyle: {
            range: { startIndex, endIndex: startIndex + textLength },
            paragraphStyle: { namedStyleType: namedStyle },
            fields: "namedStyleType",
          },
        });

        currentIndex += textLength + 1;
        continue;
      }

      // List detection (bullet or numbered)
      const bulletMatch = trimmedLine.match(/^[*-]\s+(.+)$/);
      const numberedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);

      if (bulletMatch || numberedMatch) {
        const listText = bulletMatch ? bulletMatch[1] : numberedMatch![1];
        const cleanText = this.stripMarkdownFormatting(listText);
        const prefix = bulletMatch ? "• " : "1. ";

        requests.push({
          insertText: {
            location: { index: currentIndex },
            text: prefix + cleanText + "\n",
          },
        });

        currentIndex += prefix.length + cleanText.length + 1;
        continue;
      }

      // Code block detection
      if (trimmedLine.startsWith("```")) {
        // Skip code fence markers for now (MVP)
        continue;
      }

      // Regular paragraph with inline formatting
      const cleanText = this.stripMarkdownFormatting(trimmedLine);
      const startIndex = currentIndex;

      requests.push({
        insertText: {
          location: { index: currentIndex },
          text: cleanText + "\n",
        },
      });

      // Apply inline formatting (bold, italic, code)
      const inlineRequests = this.applyInlineFormatting(trimmedLine, startIndex);
      requests.push(...inlineRequests);

      currentIndex += cleanText.length + 1;
    }

    return requests;
  }

  /**
   * Strip markdown formatting to get plain text length
   */
  private stripMarkdownFormatting(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, "$1") // Bold
      .replace(/\*(.+?)\*/g, "$1") // Italic
      .replace(/__(.+?)__/g, "$1") // Bold (underscore)
      .replace(/_(.+?)_/g, "$1") // Italic (underscore)
      .replace(/`(.+?)`/g, "$1") // Inline code
      .replace(/\[(.+?)\]\(.+?\)/g, "$1"); // Links
  }

  /**
   * Apply inline formatting (bold, italic, code) to text ranges
   */
  private applyInlineFormatting(text: string, baseIndex: number): GoogleDocsRequest[] {
    const requests: GoogleDocsRequest[] = [];

    // Bold: **text** or __text__
    const boldRegex = /(\*\*|__)(.+?)\1/g;
    let match;
    let offset = 0;

    while ((match = boldRegex.exec(text)) !== null) {
      const matchText = match[2];
      const matchStart = match.index;

      // Calculate actual index (accounting for previous markdown removal)
      const actualStart = baseIndex + matchStart - offset;
      const actualEnd = actualStart + matchText.length;

      requests.push({
        updateTextStyle: {
          range: { startIndex: actualStart, endIndex: actualEnd },
          textStyle: { bold: true },
          fields: "bold",
        },
      });

      offset += match[0].length - matchText.length;
    }

    // Italic: *text* or _text_ (single)
    const italicRegex = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g;
    offset = 0;

    while ((match = italicRegex.exec(text)) !== null) {
      const matchText = match[1] || match[2];
      const matchStart = match.index;

      const actualStart = baseIndex + matchStart - offset;
      const actualEnd = actualStart + matchText.length;

      requests.push({
        updateTextStyle: {
          range: { startIndex: actualStart, endIndex: actualEnd },
          textStyle: { italic: true },
          fields: "italic",
        },
      });

      offset += match[0].length - matchText.length;
    }

    // Code: `text`
    const codeRegex = /`(.+?)`/g;
    offset = 0;

    while ((match = codeRegex.exec(text)) !== null) {
      const matchText = match[1];
      const matchStart = match.index;

      const actualStart = baseIndex + matchStart - offset;
      const actualEnd = actualStart + matchText.length;

      requests.push({
        updateTextStyle: {
          range: { startIndex: actualStart, endIndex: actualEnd },
          textStyle: {
            weightedFontFamily: { fontFamily: "Courier New" },
            foregroundColor: {
              color: {
                rgbColor: { red: 0.8, green: 0.2, blue: 0.2 },
              },
            },
          },
          fields: "weightedFontFamily,foregroundColor",
        },
      });

      offset += match[0].length - matchText.length;
    }

    return requests;
  }

  /**
   * Delete existing Google Doc from Drive
   */
  private async deleteDocument(accessToken: string, googleDocsId: string): Promise<void> {
    try {
      await fetch(`${GOOGLE_DRIVE_API_URL}/files/${googleDocsId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      console.log(`Deleted old Google Doc: ${googleDocsId}`);
    } catch (error) {
      console.error("Error deleting Google Doc (continuing anyway):", error);
      // Don't throw - if delete fails, we'll just create a new doc
    }
  }

  /**
   * Export document to Google Docs
   * Strategy: Delete old doc (if exists) and create fresh one with latest content
   * This matches Notion's behavior and ensures title/content are always in sync
   */
  async exportDocument(
    documentId: string,
    userId: string,
    folderId?: string
  ): Promise<{ documentUrl: string; googleDocsId: string }> {
    const accessToken = await this.getUserAccessToken(userId);

    // Get document with author info
    const [documentWithAuthor] = await db
      .select({
        document: schema.documents,
        authorName: schema.users.firstName,
        authorLastName: schema.users.lastName,
        authorEmail: schema.users.email,
      })
      .from(schema.documents)
      .leftJoin(schema.users, eq(schema.documents.createdBy, schema.users.id))
      .where(eq(schema.documents.id, documentId))
      .limit(1);

    if (!documentWithAuthor) {
      throw new Error("Document not found");
    }

    const document = documentWithAuthor.document;
    const authorDisplayName =
      [documentWithAuthor.authorName, documentWithAuthor.authorLastName]
        .filter(Boolean)
        .join(" ") ||
      documentWithAuthor.authorEmail ||
      "Unknown";

    // Delete old doc if it exists (like Notion strategy)
    if (document.googleDocsId) {
      await this.deleteDocument(accessToken, document.googleDocsId);
    }

    // Always create fresh document with current title and content
    const googleDocsId = await this.createDocument(accessToken, document.title, folderId);

    // Prepare metadata section
    const metadata = [
      `📝 Author: ${authorDisplayName}`,
      `⏰ Last Updated: ${new Date(document.updatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`,
      `📅 Created: ${new Date(document.createdAt).toLocaleString("en-US", { dateStyle: "medium" })}`,
      "", // Empty line separator
      "---", // Horizontal rule
      "", // Empty line after separator
    ].join("\n");

    // Add content to fresh document
    await this.updateDocumentContent(accessToken, googleDocsId, metadata + document.content);

    // Save new Google Docs ID to database
    await db
      .update(schema.documents)
      .set({
        googleDocsId,
        googleDocsFolderId: folderId || null,
        googleDocsSyncStatus: "pending",
      })
      .where(eq(schema.documents.id, documentId));

    // Update sync status
    await db
      .update(schema.documents)
      .set({
        googleDocsSyncStatus: "synced",
        googleDocsSyncedAt: new Date(),
        googleDocsSyncError: null,
        status: "published", // Auto-publish on export
      })
      .where(eq(schema.documents.id, documentId));

    console.log(`✅ [Google Docs Export] Document ${documentId} exported with ID: ${googleDocsId}`);

    const documentUrl = `https://docs.google.com/document/d/${googleDocsId}/edit`;
    return { documentUrl, googleDocsId };
  }

  /**
   * Update Google Doc content in place
   * Strategy: Delete all content except title, then insert new formatted content
   */
  private async updateDocumentContent(
    accessToken: string,
    googleDocsId: string,
    markdown: string
  ): Promise<void> {
    // Get current document to find content length
    const getResponse = await fetch(`${GOOGLE_DOCS_API_URL}/documents/${googleDocsId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!getResponse.ok) {
      throw new Error(`Failed to get Google Doc: ${await getResponse.text()}`);
    }

    const doc = (await getResponse.json()) as {
      body: { content: Array<{ endIndex: number }> };
    };
    const endIndex = doc.body.content[doc.body.content.length - 1].endIndex;

    // Build batchUpdate request
    const requests: GoogleDocsRequest[] = [];

    // Step 1: Delete all content (except first char which is title)
    if (endIndex > 2) {
      requests.push({
        deleteContentRange: {
          range: { startIndex: 1, endIndex: endIndex - 1 },
        },
      });
    }

    // Step 2: Convert markdown to formatted requests
    const contentRequests = this.markdownToGoogleDocsRequests(markdown);
    requests.push(...contentRequests);

    // Execute batchUpdate
    const batchResponse = await fetch(
      `${GOOGLE_DOCS_API_URL}/documents/${googleDocsId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      }
    );

    if (!batchResponse.ok) {
      throw new Error(`Failed to update Google Doc: ${await batchResponse.text()}`);
    }
  }

  /**
   * Disconnect Google Docs integration for a document
   */
  async disconnectDocument(documentId: string): Promise<void> {
    await db
      .update(schema.documents)
      .set({
        googleDocsId: null,
        googleDocsFolderId: null,
        googleDocsSyncStatus: null,
        googleDocsSyncedAt: null,
        googleDocsSyncError: null,
      })
      .where(eq(schema.documents.id, documentId));
  }
}

export const googleDocsExportService = new GoogleDocsExportService();
