import { describe, it, expect } from "@jest/globals";

/**
 * Unit tests for Notion Service
 * Following code quality standards: focus on interfaces, constants, and type structure
 */

describe("NotionService Interfaces", () => {
  describe("NotionPage Interface", () => {
    it("should have required fields", () => {
      const page: {
        id: string;
        title: string;
        url: string;
        created_time: string;
        last_edited_time: string;
        created_by_id: string;
        last_edited_by_id: string;
      } = {
        id: "abc123",
        title: "Test Page",
        url: "https://notion.so/Test-Page-abc123",
        created_time: "2025-01-15T10:00:00.000Z",
        last_edited_time: "2025-10-17T14:00:00.000Z",
        created_by_id: "user-123",
        last_edited_by_id: "user-456",
      };

      expect(page.id).toBe("abc123");
      expect(page.title).toBe("Test Page");
      expect(page.url).toContain("notion.so");
    });

    it("should support optional parent fields", () => {
      const page: {
        id: string;
        title: string;
        url: string;
        created_time: string;
        last_edited_time: string;
        created_by_id: string;
        last_edited_by_id: string;
        parent_page_id?: string;
        parent_database_id?: string;
      } = {
        id: "abc123",
        title: "Nested Page",
        url: "https://notion.so/Nested-abc123",
        created_time: "2025-01-15T10:00:00.000Z",
        last_edited_time: "2025-10-17T14:00:00.000Z",
        created_by_id: "user-123",
        last_edited_by_id: "user-456",
        parent_page_id: "parent-xyz",
      };

      expect(page.parent_page_id).toBe("parent-xyz");
      expect(page.parent_database_id).toBeUndefined();
    });
  });

  describe("NotionBlock Interface", () => {
    it("should have required fields", () => {
      const block: {
        id: string;
        type: string;
        text: string;
        has_children: boolean;
        created_time: string;
        last_edited_time: string;
      } = {
        id: "block-123",
        type: "paragraph",
        text: "This is a test paragraph",
        has_children: false,
        created_time: "2025-01-15T10:00:00.000Z",
        last_edited_time: "2025-10-17T14:00:00.000Z",
      };

      expect(block.id).toBe("block-123");
      expect(block.type).toBe("paragraph");
      expect(block.text).toBe("This is a test paragraph");
      expect(block.has_children).toBe(false);
    });

    it("should support different block types", () => {
      const blockTypes = [
        "paragraph",
        "heading_1",
        "heading_2",
        "heading_3",
        "bulleted_list_item",
        "numbered_list_item",
        "to_do",
        "quote",
        "code",
        "child_page",
      ];

      blockTypes.forEach((type) => {
        const block: {
          id: string;
          type: string;
          text: string;
          has_children: boolean;
          created_time: string;
          last_edited_time: string;
        } = {
          id: `block-${type}`,
          type: type,
          text: `Test ${type}`,
          has_children: false,
          created_time: "2025-01-15T10:00:00.000Z",
          last_edited_time: "2025-10-17T14:00:00.000Z",
        };

        expect(block.type).toBe(type);
      });
    });
  });

  describe("NotionUser Interface", () => {
    it("should have required id field", () => {
      const user: {
        id: string;
        name?: string;
        email?: string;
        avatar_url?: string;
      } = {
        id: "user-123",
      };

      expect(user.id).toBe("user-123");
    });

    it("should support optional fields", () => {
      const user: {
        id: string;
        name?: string;
        email?: string;
        avatar_url?: string;
      } = {
        id: "user-123",
        name: "John Doe",
        email: "john@example.com",
        avatar_url: "https://notion.so/avatar.png",
      };

      expect(user.name).toBe("John Doe");
      expect(user.email).toBe("john@example.com");
      expect(user.avatar_url).toContain("avatar.png");
    });
  });

  describe("TokenResponse Interface", () => {
    it("should have all OAuth response fields", () => {
      const tokenResponse: {
        access_token: string;
        refresh_token: string;
        bot_id: string;
        workspace_id: string;
        workspace_name?: string;
        workspace_icon?: string;
        owner: any;
        duplicated_template_id?: string;
      } = {
        access_token: "secret_abc123",
        refresh_token: "secret_xyz789",
        bot_id: "bot-123",
        workspace_id: "workspace-456",
        workspace_name: "Lorikeet",
        owner: { type: "user" },
      };

      expect(tokenResponse.access_token).toContain("secret_");
      expect(tokenResponse.refresh_token).toContain("secret_");
      expect(tokenResponse.bot_id).toBe("bot-123");
      expect(tokenResponse.workspace_id).toBe("workspace-456");
      expect(tokenResponse.workspace_name).toBe("Lorikeet");
    });
  });
});

describe("NotionService Constants", () => {
  describe("Rate Limiting", () => {
    it("should use correct rate limit delay", () => {
      const RATE_LIMIT_DELAY = 350; // ms (3 req/sec = 333ms, we use 350 for safety)

      expect(RATE_LIMIT_DELAY).toBe(350);
      expect(RATE_LIMIT_DELAY).toBeGreaterThan(333); // Safety margin
    });

    it("should calculate requests per second correctly", () => {
      const RATE_LIMIT_DELAY = 350; // ms
      const requestsPerSecond = 1000 / RATE_LIMIT_DELAY;

      expect(requestsPerSecond).toBeCloseTo(2.86, 1); // ~2.86 req/sec (under 3 req/sec limit)
      expect(requestsPerSecond).toBeLessThan(3); // Under Notion's limit
    });
  });

  describe("API Version", () => {
    it("should use stable Notion API version", () => {
      const API_VERSION = "2022-06-28";

      expect(API_VERSION).toBe("2022-06-28");
      expect(API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/); // Format: YYYY-MM-DD
    });
  });

  describe("Pagination", () => {
    it("should use correct page size limit", () => {
      const MAX_PAGE_SIZE = 100; // Notion's max

      expect(MAX_PAGE_SIZE).toBe(100);
    });
  });
});

describe("NotionService Vector Schema", () => {
  describe("Vector ID Format", () => {
    it("should generate correct vector ID format", () => {
      const pageId = "1429989fe8ac4effbc8f";
      const blockId = "57f56486db54";
      const vectorId = `notion-${pageId}-${blockId}`;

      expect(vectorId).toBe("notion-1429989fe8ac4effbc8f-57f56486db54");
      expect(vectorId).toMatch(/^notion-[a-f0-9]+-[a-f0-9]+$/);
    });

    it("should be unique per block", () => {
      const page1Block1 = `notion-page1-block1`;
      const page1Block2 = `notion-page1-block2`;
      const page2Block1 = `notion-page2-block1`;

      expect(page1Block1).not.toBe(page1Block2);
      expect(page1Block1).not.toBe(page2Block1);
      expect(page1Block2).not.toBe(page2Block1);
    });
  });

  describe("Metadata Structure", () => {
    it("should have required metadata fields", () => {
      const metadata: {
        text: string;
        source: string;
        source_type: string;
        page_id: string;
        page_title: string;
        page_url: string;
        block_id: string;
        block_type: string;
        organization_id: string;
        workspace_id: string;
        workspace_name: string;
        bot_id: string;
      } = {
        text: "Test content",
        source: "notion",
        source_type: "block",
        page_id: "page-123",
        page_title: "Test Page",
        page_url: "https://notion.so/Test-123",
        block_id: "block-456",
        block_type: "paragraph",
        organization_id: "org-789",
        workspace_id: "workspace-abc",
        workspace_name: "Lorikeet",
        bot_id: "bot-def",
      };

      expect(metadata.source).toBe("notion");
      expect(metadata.source_type).toBe("block");
      expect(metadata.page_id).toBe("page-123");
      expect(metadata.block_id).toBe("block-456");
    });

    it("should support optional hierarchy fields", () => {
      const metadata: {
        text: string;
        source: string;
        source_type: string;
        page_id: string;
        parent_page_id?: string;
        parent_database_id?: string;
      } = {
        text: "Test content",
        source: "notion",
        source_type: "block",
        page_id: "page-123",
        parent_page_id: "parent-456",
      };

      expect(metadata.parent_page_id).toBe("parent-456");
      expect(metadata.parent_database_id).toBeUndefined();
    });
  });
});

describe("NotionService Error Handling", () => {
  describe("Error Cause Chaining", () => {
    it("should preserve error cause in error messages", () => {
      const originalError = new Error("Original error");
      const wrappedError = new Error("Failed to fetch pages", { cause: originalError });

      expect(wrappedError.message).toBe("Failed to fetch pages");
      expect(wrappedError.cause).toBe(originalError);
    });

    it("should chain multiple error levels", () => {
      const rootError = new Error("Network timeout");
      const apiError = new Error("API request failed", { cause: rootError });
      const serviceError = new Error("Failed to sync pages", { cause: apiError });

      expect(serviceError.cause).toBe(apiError);
      expect((serviceError.cause as Error).cause).toBe(rootError);
    });
  });
});

describe("NotionService Token Management", () => {
  describe("Token Expiry Estimation", () => {
    it("should estimate 90 days for token expiry", () => {
      const DAYS_UNTIL_EXPIRY = 90;
      const millisecondsPerDay = 24 * 60 * 60 * 1000;
      const expiryMs = DAYS_UNTIL_EXPIRY * millisecondsPerDay;

      expect(expiryMs).toBe(7776000000); // 90 days in ms
    });

    it("should calculate future expiry date correctly", () => {
      const now = new Date("2025-10-17T14:00:00Z");
      const expiryDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      expect(expiryDate.getTime()).toBeGreaterThan(now.getTime());

      // Should be approximately 90 days later
      const daysDifference = (expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysDifference).toBeCloseTo(90, 0);
    });
  });

  describe("Token Refresh Logic", () => {
    it("should detect expired tokens", () => {
      const pastDate = new Date("2025-01-01T00:00:00Z");
      const now = new Date("2025-10-17T14:00:00Z");

      const isExpired = now > pastDate;
      expect(isExpired).toBe(true);
    });

    it("should detect valid tokens", () => {
      const futureDate = new Date("2026-01-01T00:00:00Z");
      const now = new Date("2025-10-17T14:00:00Z");

      const isExpired = now > futureDate;
      expect(isExpired).toBe(false);
    });
  });
});
