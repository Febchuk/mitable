/**
 * Notion Export Service
 *
 * Handles exporting documents from the knowledge base to Notion.
 * Converts Markdown content to Notion blocks and creates pages.
 */

import { Client } from "@notionhq/client";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { encryptionService } from "./encryption.service.js";
import type { ExportNotionResponse } from "@mitable/shared";
import type { BlockObjectRequest } from "@notionhq/client/build/src/api-endpoints.js";

interface ExportParams {
  documentId: string;
  organizationId: string;
  parentPageId?: string;
}

class NotionExportService {
  /**
   * Get Notion Client for an organization
   */
  private async getClient(organizationId: string): Promise<Client> {
    const [integration] = await db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.organizationId, organizationId),
          eq(schema.integrations.provider, "notion")
        )
      )
      .limit(1);

    if (!integration) {
      throw new Error("Notion integration not found. Please connect Notion first.");
    }

    if (!integration.accessTokenEncrypted) {
      throw new Error("No encrypted access token found");
    }

    const accessToken = encryptionService.decrypt(integration.accessTokenEncrypted);
    return new Client({ auth: accessToken });
  }

  /**
   * Export a document to Notion
   */
  async exportDocument(params: ExportParams): Promise<ExportNotionResponse> {
    const { documentId, organizationId, parentPageId } = params;

    console.log(`[NotionExport] Exporting document ${documentId} to Notion`);

    // Get document
    const [document] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId))
      .limit(1);

    if (!document) {
      throw new Error("Document not found");
    }

    // Get Notion client
    const client = await this.getClient(organizationId);

    // Convert markdown to Notion blocks
    const blocks = this.markdownToNotionBlocks(document.content);

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

    // Build page request
    const pageRequest: any = {
      properties: pageProperties,
      children: blocks,
    };

    // Set parent - either specific page or workspace root
    if (parentPageId) {
      pageRequest.parent = { page_id: parentPageId };
    } else {
      // Get workspace ID from integration
      const [integration] = await db
        .select({ metadata: schema.integrations.metadata })
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.organizationId, organizationId),
            eq(schema.integrations.provider, "notion")
          )
        )
        .limit(1);

      const workspaceId = (integration?.metadata as any)?.workspace_id;
      if (!workspaceId) {
        throw new Error("Notion workspace not found. Please reconnect Notion integration.");
      }

      // Use first accessible page as parent (Notion API limitation)
      // Try to search for any page we have access to
      const searchResponse = await client.search({
        filter: { property: "object", value: "page" },
        page_size: 1,
      });

      if (searchResponse.results.length > 0) {
        const firstPage = searchResponse.results[0] as any;
        pageRequest.parent = { page_id: firstPage.id };
      } else {
        throw new Error(
          "No accessible Notion pages found. Please share at least one page with the Mitable integration."
        );
      }
    }

    // Create page
    const page = await client.pages.create(pageRequest);

    // Get page URL
    const pageUrl = (page as any).url || `https://notion.so/${page.id.replace(/-/g, "")}`;

    // Update document with Notion sync info
    await db
      .update(schema.documents)
      .set({
        notionPageId: page.id,
        notionSyncStatus: "synced",
        notionSyncedAt: new Date(),
        notionSyncError: null,
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
   * Convert Markdown content to Notion blocks
   */
  private markdownToNotionBlocks(markdown: string): BlockObjectRequest[] {
    const blocks: BlockObjectRequest[] = [];
    const lines = markdown.split("\n");

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
  private parseInlineFormatting(
    text: string
  ): Array<{
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
