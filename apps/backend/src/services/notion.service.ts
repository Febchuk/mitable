import { Client } from "@notionhq/client";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { config } from "../config.js";
import { encryptionService } from "./encryption.service.js";

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  created_time: string;
  last_edited_time: string;
  created_by_id: string;
  last_edited_by_id: string;
  parent_page_id?: string;
  parent_database_id?: string;
}

export interface NotionBlock {
  id: string;
  type: string;
  text: string;
  has_children: boolean;
  created_time: string;
  last_edited_time: string;
}

export interface NotionUser {
  id: string;
  name?: string;
  email?: string;
  avatar_url?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  bot_id: string;
  workspace_id: string;
  workspace_name?: string;
  workspace_icon?: string;
  owner: any;
  duplicated_template_id?: string;
}

// Notion API configuration constants
export const NOTION_CONFIG = {
  RATE_LIMIT_DELAY: 350, // ms (Notion allows 3 req/sec, we use 350ms for safety)
  TOKEN_EXPIRY_DAYS: 90, // Estimated token lifetime (Notion doesn't provide exact expiry)
  PAGE_SIZE: 100, // Max items per page (Notion API limit)
} as const;

class NotionService {
  // Rate limiting: Notion allows 3 requests per second
  private lastRequestTime = 0;
  private readonly RATE_LIMIT_DELAY = NOTION_CONFIG.RATE_LIMIT_DELAY;

  /**
   * Get Notion Client instance for an organization
   * Checks token expiry and refreshes if needed
   * Decrypts tokens from database before use
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
      throw new Error("Notion integration not found or not connected");
    }

    // Decrypt tokens before use (SECURITY CRITICAL)
    // Prefer encrypted token, fallback to plaintext during migration
    let accessToken: string;
    let refreshToken: string | null = null;

    if (!integration.accessTokenEncrypted) {
      throw new Error("No encrypted access token found");
    }

    accessToken = encryptionService.decrypt(integration.accessTokenEncrypted);
    if (integration.refreshTokenEncrypted) {
      refreshToken = encryptionService.decrypt(integration.refreshTokenEncrypted);
    }

    // Check if token is expired and refresh if needed
    if (integration.tokenExpiresAt && new Date() > integration.tokenExpiresAt) {
      if (!refreshToken) {
        throw new Error("Notion token expired and no refresh token available");
      }

      // Refresh the token (refreshAccessToken expects decrypted token)
      const tokenResponse = await this.refreshAccessToken(refreshToken);

      // Encrypt new tokens before storing
      const encryptedAccessToken = encryptionService.encrypt(tokenResponse.access_token);
      const encryptedRefreshToken = encryptionService.encrypt(tokenResponse.refresh_token);

      // Update integration with new encrypted tokens
      await db
        .update(schema.integrations)
        .set({
          accessTokenEncrypted: encryptedAccessToken,
          refreshTokenEncrypted: encryptedRefreshToken,
          encryptionVersion: 1,
          // Notion doesn't provide expiry time, use estimated lifetime
          tokenExpiresAt: new Date(
            Date.now() + NOTION_CONFIG.TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
          ),
          updatedAt: new Date(),
        })
        .where(eq(schema.integrations.id, integration.id));

      return new Client({
        auth: tokenResponse.access_token,
        notionVersion: config.notion.apiVersion,
      });
    }

    return new Client({
      auth: accessToken,
      notionVersion: config.notion.apiVersion,
    });
  }

  /**
   * Rate limiting helper - ensures we don't exceed 3 req/sec
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
      const delay = this.RATE_LIMIT_DELAY - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Refresh an expired access token
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    try {
      await this.rateLimit();

      const encoded = Buffer.from(
        `${config.notion.clientId}:${config.notion.clientSecret}`
      ).toString("base64");

      const response = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Basic ${encoded}`,
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to refresh token: ${error}`);
      }

      const data = await response.json();
      return data as TokenResponse;
    } catch (error) {
      throw new Error("Failed to refresh Notion access token", { cause: error });
    }
  }

  /**
   * Search for all pages shared with the integration
   * @param organizationId - Organization ID
   * @param options - Search options
   * @param options.query - Text query to filter pages
   * @param options.modifiedSince - Only return pages edited after this date (incremental sync)
   */
  async searchPages(
    organizationId: string,
    options?: { query?: string; modifiedSince?: Date }
  ): Promise<NotionPage[]> {
    const client = await this.getClient(organizationId);
    const pages: NotionPage[] = [];
    const { query, modifiedSince } = options || {};

    try {
      await this.rateLimit();

      let hasMore = true;
      let startCursor: string | undefined;

      while (hasMore) {
        const response: any = await client.search({
          query: query || undefined,
          filter: {
            property: "object",
            value: "page",
          },
          sort: {
            direction: "descending",
            timestamp: "last_edited_time",
          },
          page_size: NOTION_CONFIG.PAGE_SIZE,
          start_cursor: startCursor,
        });

        for (const page of response.results) {
          // Early exit optimization: Since pages are sorted by last_edited_time descending,
          // once we hit a page older than modifiedSince, all remaining pages are also older
          if (modifiedSince && new Date(page.last_edited_time) <= modifiedSince) {
            console.log(
              `[NotionService] Early exit: Hit page from ${page.last_edited_time} (before ${modifiedSince.toISOString()})`
            );
            hasMore = false; // Stop pagination - all remaining pages are older
            break;
          }

          // Extract title from properties
          let title = "Untitled";
          if (page.properties?.title?.title?.[0]?.plain_text) {
            title = page.properties.title.title[0].plain_text;
          } else if (page.properties?.Name?.title?.[0]?.plain_text) {
            title = page.properties.Name.title[0].plain_text;
          }

          pages.push({
            id: page.id,
            title,
            url: page.url,
            created_time: page.created_time,
            last_edited_time: page.last_edited_time,
            created_by_id: page.created_by?.id || "unknown",
            last_edited_by_id: page.last_edited_by?.id || "unknown",
            parent_page_id: page.parent?.type === "page_id" ? page.parent.page_id : undefined,
            parent_database_id:
              page.parent?.type === "database_id" ? page.parent.database_id : undefined,
          });
        }

        // Only continue pagination if hasMore is still true (not stopped by early exit)
        if (!hasMore) {
          break; // Exit pagination loop
        }

        hasMore = response.has_more;
        startCursor = response.next_cursor || undefined;

        // Rate limit between pagination requests
        if (hasMore) {
          await this.rateLimit();
        }
      }

      return pages;
    } catch (error) {
      throw new Error("Failed to search Notion pages", { cause: error });
    }
  }

  /**
   * Get all blocks from a page (recursively)
   */
  async getPageBlocks(organizationId: string, pageId: string): Promise<NotionBlock[]> {
    console.log(`[NotionService] Getting blocks for page ${pageId}`);
    const client = await this.getClient(organizationId);

    try {
      const blocks = await this.getBlockChildrenRecursive(client, pageId);
      console.log(`[NotionService] Successfully fetched ${blocks.length} total blocks`);
      return blocks;
    } catch (error) {
      console.error(`[NotionService] Error fetching blocks:`, error);
      throw new Error("Failed to fetch Notion page blocks", { cause: error });
    }
  }

  /**
   * Recursively fetch all child blocks
   */
  private async getBlockChildrenRecursive(client: Client, blockId: string): Promise<NotionBlock[]> {
    const blocks: NotionBlock[] = [];

    try {
      await this.rateLimit();
      console.log(`[NotionService] Fetching children for block ${blockId}`);

      let hasMore = true;
      let startCursor: string | undefined;

      while (hasMore) {
        const response: any = await client.blocks.children.list({
          block_id: blockId,
          page_size: NOTION_CONFIG.PAGE_SIZE,
          start_cursor: startCursor,
        });

        console.log(`[NotionService]   Got ${response.results.length} blocks in this batch`);

        for (const block of response.results) {
          // Skip child_page blocks - they're processed separately as top-level pages
          if (block.type === 'child_page') {
            console.log(`[NotionService]   Skipping child_page "${block.child_page?.title}" (processed separately)`);
            continue;
          }

          const extractedBlock = this.extractBlockText(block);
          blocks.push(extractedBlock);

          // Recursively fetch children if block has them (but not for child_page)
          if (block.has_children) {
            console.log(`[NotionService]   Block ${block.type} has children, fetching recursively...`);
            const children = await this.getBlockChildrenRecursive(client, block.id);
            blocks.push(...children);
          }
        }

        hasMore = response.has_more;
        startCursor = response.next_cursor || undefined;

        if (hasMore) {
          console.log(`[NotionService]   More blocks available, continuing pagination...`);
          await this.rateLimit();
        }
      }

      console.log(`[NotionService]   Finished fetching block ${blockId}: ${blocks.length} blocks total`);
      return blocks;
    } catch (error) {
      console.error(`[NotionService] ERROR in getBlockChildrenRecursive for ${blockId}:`, error);
      throw new Error("Failed to fetch block children", { cause: error });
    }
  }

  /**
   * Extract plain text from a block object
   */
  private extractBlockText(block: any): NotionBlock {
    let text = "";

    // Extract text based on block type
    const blockType = block.type;
    const blockContent = block[blockType];

    if (blockContent?.rich_text) {
      text = blockContent.rich_text.map((rt: any) => rt.plain_text || "").join("");
    }

    // Special handling for code blocks
    if (blockType === "code" && blockContent?.rich_text) {
      const language = blockContent.language || "plain text";
      const code = blockContent.rich_text.map((rt: any) => rt.plain_text || "").join("");
      text = `[Code: ${language}]\n${code}`;
    }

    // Special handling for child_page (just reference, no content)
    if (blockType === "child_page") {
      text = `[Link to page: ${blockContent.title}]`;
    }

    return {
      id: block.id,
      type: blockType,
      text,
      has_children: block.has_children || false,
      created_time: block.created_time,
      last_edited_time: block.last_edited_time,
    };
  }

  /**
   * Get user information
   * Returns null if user info cannot be fetched (non-critical)
   */
  async getUserInfo(organizationId: string, userId: string): Promise<NotionUser | null> {
    const client = await this.getClient(organizationId);

    try {
      await this.rateLimit();

      const user: any = await client.users.retrieve({ user_id: userId });

      return {
        id: user.id,
        name: user.name || undefined,
        email: user.person?.email || undefined,
        avatar_url: user.avatar_url || undefined,
      };
    } catch (error) {
      // User info fetch is non-critical, return null
      return null;
    }
  }
}

export const notionService = new NotionService();
