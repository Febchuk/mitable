/**
 * Notion Export Service
 *
 * Handles exporting documents from the knowledge base to Notion.
 * Converts Markdown content to Notion blocks and creates pages.
 */

import { Client } from "@notionhq/client";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { encryptionService } from "./encryption.service.js";
import type { ExportNotionResponse } from "@mitable/shared";
import type { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints.js";

interface ExportParams {
  documentId: string;
  userId: string;
  parentPageId?: string;
}

class NotionExportService {
  /**
   * Get Notion Client for a user
   * Uses the user's personal Notion OAuth token for exports
   */
  private async getClient(userId: string): Promise<Client> {
    const [user] = await db
      .select({
        notionAccessTokenEncrypted: schema.users.notionAccessTokenEncrypted,
        notionTokenExpiresAt: schema.users.notionTokenExpiresAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    if (!user.notionAccessTokenEncrypted) {
      throw new Error(
        "Notion not connected. Please connect your Notion account in settings before exporting."
      );
    }

    // Check if token is expired
    if (user.notionTokenExpiresAt && new Date(user.notionTokenExpiresAt) < new Date()) {
      throw new Error("Notion token expired. Please reconnect your Notion account in settings.");
    }

    const accessToken = encryptionService.decrypt(user.notionAccessTokenEncrypted);
    return new Client({ auth: accessToken });
  }

  /**
   * Export a document to Notion using user's personal workspace
   */
  async exportDocument(params: ExportParams): Promise<ExportNotionResponse> {
    const { documentId, userId, parentPageId } = params;

    console.log(`[NotionExport] Exporting document ${documentId} to Notion`);

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

    // Get Notion client using user's token
    const client = await this.getClient(userId);

    // Convert markdown to Notion blocks
    const blocks = this.markdownToNotionBlocks(document.content);

    // Add metadata callout at the top
    const metadataBlock: BlockObjectRequest = {
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: {
              content: `📝 Author: ${authorDisplayName}\n⏰ Last Updated: ${new Date(document.updatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}\n📅 Created: ${new Date(document.createdAt).toLocaleString("en-US", { dateStyle: "medium" })}`,
            },
          },
        ],
        icon: { type: "emoji", emoji: "ℹ️" },
        color: "gray_background",
      },
    };

    // Prepend metadata block to content
    const blocksWithMetadata = [metadataBlock, ...blocks];

    // Create page properties
    const pageProperties: any = {
      title: {
        title: [
          {
            type: "text",
            text: { content: document.title },
          },
        ],
      },
    };

    let page: any;
    let pageUrl = "";

    // Check if document is already synced to Notion
    if (document.notionPageId) {
      console.log(`[NotionExport] Re-exporting - archiving old page: ${document.notionPageId}`);

      try {
        // Archive the old page (much faster than deleting blocks one by one)
        await client.pages.update({
          page_id: document.notionPageId,
          archived: true,
        });

        console.log(`[NotionExport] Old page archived, creating new page with latest content`);
        // Clear the page ID so we create a new page
        document.notionPageId = null;
      } catch (error) {
        console.error(`[NotionExport] Failed to archive old page:`, error);
        // If archive fails, just create new page anyway
        document.notionPageId = null;
      }
    }

    // Create new page if no existing page or update failed
    if (!document.notionPageId) {
      const pageRequest: any = {
        properties: pageProperties,
        children: blocksWithMetadata,
      };

      // Set parent - either specific page or search for accessible page
      if (parentPageId) {
        pageRequest.parent = { page_id: parentPageId };
      } else {
        // User selected pages during OAuth - search for any accessible page
        const searchResponse = await client.search({
          filter: { property: "object", value: "page" },
          page_size: 1,
        });

        if (searchResponse.results.length > 0) {
          const firstPage = searchResponse.results[0] as any;
          pageRequest.parent = { page_id: firstPage.id };
        } else {
          throw new Error(
            "No accessible Notion pages found. Please reconnect your Notion account and select pages to share."
          );
        }
      }

      console.log(`[NotionExport] Creating new Notion page`);
      page = await client.pages.create(pageRequest);
      pageUrl = (page as any).url || `https://notion.so/${page.id.replace(/-/g, "")}`;
    }

    // Update document with Notion sync info and set status to published
    await db
      .update(schema.documents)
      .set({
        notionPageId: page.id,
        notionSyncStatus: "synced",
        notionSyncedAt: new Date(),
        notionSyncError: null,
        status: "published", // Auto-publish when exported
        updatedAt: new Date(),
      })
      .where(eq(schema.documents.id, documentId));

    console.log(`[NotionExport] Document exported to Notion page: ${page.id}`);

    return {
      success: true,
      notionPageId: page.id,
      notionPageUrl: pageUrl,
    };
  }

  /**
   * Strip HTML tags and convert to plain text
   */
  private stripHtml(html: string): string {
    // Remove HTML tags but preserve content
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, "") // Remove style tags and content
      .replace(/<script[^>]*>.*?<\/script>/gi, "") // Remove script tags and content
      .replace(/<[^>]+>/g, "") // Remove all HTML tags
      .replace(/&nbsp;/g, " ") // Convert HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  /**
   * Convert Markdown content to Notion blocks
   */
  private markdownToNotionBlocks(markdown: string): BlockObjectRequest[] {
    // Strip HTML tags first (Plate editor stores content as HTML)
    const cleanContent = this.stripHtml(markdown);

    const blocks: BlockObjectRequest[] = [];
    const lines = cleanContent.split("\n");

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Skip empty lines
      if (!line.trim()) {
        i++;
        continue;
      }

      // Heading 1
      if (line.startsWith("# ")) {
        blocks.push({
          object: "block",
          type: "heading_1",
          heading_1: {
            rich_text: this.parseInlineFormatting(line.slice(2)),
          },
        });
        i++;
        continue;
      }

      // Heading 2
      if (line.startsWith("## ")) {
        blocks.push({
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: this.parseInlineFormatting(line.slice(3)),
          },
        });
        i++;
        continue;
      }

      // Heading 3
      if (line.startsWith("### ")) {
        blocks.push({
          object: "block",
          type: "heading_3",
          heading_3: {
            rich_text: this.parseInlineFormatting(line.slice(4)),
          },
        });
        i++;
        continue;
      }

      // Code block
      if (line.startsWith("```")) {
        const language = line.slice(3).trim() || "plain text";
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // Skip closing ```

        blocks.push({
          object: "block",
          type: "code",
          code: {
            rich_text: [{ type: "text", text: { content: codeLines.join("\n") } }],
            language: this.mapLanguage(language),
          },
        });
        continue;
      }

      // Blockquote
      if (line.startsWith("> ")) {
        blocks.push({
          object: "block",
          type: "quote",
          quote: {
            rich_text: this.parseInlineFormatting(line.slice(2)),
          },
        });
        i++;
        continue;
      }

      // Divider
      if (line.trim() === "---" || line.trim() === "***") {
        blocks.push({
          object: "block",
          type: "divider",
          divider: {},
        });
        i++;
        continue;
      }

      // Numbered list
      if (/^\d+\.\s/.test(line)) {
        const text = line.replace(/^\d+\.\s/, "");
        blocks.push({
          object: "block",
          type: "numbered_list_item",
          numbered_list_item: {
            rich_text: this.parseInlineFormatting(text),
          },
        });
        i++;
        continue;
      }

      // Bullet list
      if (line.startsWith("- ") || line.startsWith("* ")) {
        blocks.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: this.parseInlineFormatting(line.slice(2)),
          },
        });
        i++;
        continue;
      }

      // Checkbox / To-do
      if (line.startsWith("- [ ] ") || line.startsWith("- [x] ")) {
        const checked = line.startsWith("- [x] ");
        const text = line.slice(6);
        blocks.push({
          object: "block",
          type: "to_do",
          to_do: {
            rich_text: this.parseInlineFormatting(text),
            checked,
          },
        });
        i++;
        continue;
      }

      // Regular paragraph
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: this.parseInlineFormatting(line),
        },
      });
      i++;
    }

    return blocks;
  }

  /**
   * Parse inline formatting (bold, italic, code, links)
   */
  private parseInlineFormatting(text: string): Array<{
    type: "text";
    text: { content: string; link?: { url: string } };
    annotations?: {
      bold?: boolean;
      italic?: boolean;
      code?: boolean;
      strikethrough?: boolean;
    };
  }> {
    const result: Array<{
      type: "text";
      text: { content: string; link?: { url: string } };
      annotations?: {
        bold?: boolean;
        italic?: boolean;
        code?: boolean;
        strikethrough?: boolean;
      };
    }> = [];

    // Simple parsing - handle bold, italic, code, and links
    // More complex nested formatting would require a proper parser

    // Find all formatted segments
    const segments: Array<{
      start: number;
      end: number;
      content: string;
      annotation?: string;
      link?: string;
    }> = [];

    // Find bold
    let match;
    const boldRegex = /\*\*(.+?)\*\*/g;
    while ((match = boldRegex.exec(text)) !== null) {
      segments.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        annotation: "bold",
      });
    }

    // Find inline code
    const codeRegex = /`([^`]+)`/g;
    while ((match = codeRegex.exec(text)) !== null) {
      segments.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        annotation: "code",
      });
    }

    // Find links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    while ((match = linkRegex.exec(text)) !== null) {
      segments.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1],
        link: match[2],
      });
    }

    // Sort segments by start position
    segments.sort((a, b) => a.start - b.start);

    // Build result, filling gaps with plain text
    let currentPos = 0;
    for (const segment of segments) {
      // Skip overlapping segments
      if (segment.start < currentPos) continue;

      // Add plain text before this segment
      if (segment.start > currentPos) {
        const plainText = text.slice(currentPos, segment.start);
        if (plainText) {
          result.push({
            type: "text",
            text: { content: plainText },
          });
        }
      }

      // Add formatted segment
      if (segment.link) {
        result.push({
          type: "text",
          text: { content: segment.content, link: { url: segment.link } },
        });
      } else {
        result.push({
          type: "text",
          text: { content: segment.content },
          annotations: {
            [segment.annotation!]: true,
          } as any,
        });
      }

      currentPos = segment.end;
    }

    // Add remaining plain text
    if (currentPos < text.length) {
      result.push({
        type: "text",
        text: { content: text.slice(currentPos) },
      });
    }

    // If no formatting found, return plain text
    if (result.length === 0) {
      result.push({
        type: "text",
        text: { content: text },
      });
    }

    return result;
  }

  /**
   * Map common language names to Notion's supported languages
   */
  private mapLanguage(lang: string): any {
    const mapping: Record<string, string> = {
      js: "javascript",
      ts: "typescript",
      py: "python",
      rb: "ruby",
      sh: "bash",
      shell: "bash",
      yml: "yaml",
      md: "markdown",
      "": "plain text",
    };

    return mapping[lang.toLowerCase()] || lang.toLowerCase();
  }
}

// Export singleton
export const notionExportService = new NotionExportService();
