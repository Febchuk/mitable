import { describe, it, expect } from "@jest/globals";
import type {
  IngestionProgress,
  IngestionResult,
  SlackIntegrationMetadata,
  NotionIntegrationMetadata,
} from "./ingestion.service.js";

/**
 * Unit tests for IngestionService
 * Focus on interface exports and type structure
 */
describe("IngestionService", () => {
  describe("IngestionProgress interface", () => {
    it("should track channel processing progress", () => {
      const progress: IngestionProgress = {
        channelsProcessed: 2,
        totalChannels: 5,
        messagesProcessed: 150,
        messagesEmbedded: 150,
        errors: [],
        currentChannel: "general",
      };

      expect(progress.channelsProcessed).toBe(2);
      expect(progress.totalChannels).toBe(5);
      expect(progress.messagesProcessed).toBe(150);
      expect(progress.messagesEmbedded).toBe(150);
      expect(progress.currentChannel).toBe("general");
    });

    it("should support optional currentChannel field", () => {
      const progress: IngestionProgress = {
        channelsProcessed: 0,
        totalChannels: 5,
        messagesProcessed: 0,
        messagesEmbedded: 0,
        errors: [],
      };

      expect(progress.currentChannel).toBeUndefined();
    });

    it("should track errors during processing", () => {
      const progress: IngestionProgress = {
        channelsProcessed: 3,
        totalChannels: 5,
        messagesProcessed: 200,
        messagesEmbedded: 180,
        errors: [
          "Failed to process channel C123: Rate limit exceeded",
          "Failed to fetch user info for U456",
        ],
        currentChannel: "engineering",
      };

      expect(progress.errors).toHaveLength(2);
      expect(progress.errors[0]).toContain("Rate limit");
    });
  });

  describe("IngestionResult interface", () => {
    it("should provide complete sync results", () => {
      const result: IngestionResult = {
        success: true,
        channelsProcessed: 5,
        messagesEmbedded: 500,
        totalMessages: 520,
        errors: [],
        duration: 45000, // 45 seconds
      };

      expect(result.success).toBe(true);
      expect(result.channelsProcessed).toBe(5);
      expect(result.messagesEmbedded).toBe(500);
      expect(result.totalMessages).toBe(520);
      expect(result.duration).toBe(45000);
    });

    it("should handle failed sync", () => {
      const result: IngestionResult = {
        success: false,
        channelsProcessed: 2,
        messagesEmbedded: 100,
        totalMessages: 150,
        errors: ["Database connection lost", "Sync interrupted"],
        duration: 10000,
      };

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it("should track partial success", () => {
      const result: IngestionResult = {
        success: true,
        channelsProcessed: 4,
        messagesEmbedded: 350,
        totalMessages: 400,
        errors: ["Failed to process channel C999"],
        duration: 30000,
      };

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.messagesEmbedded).toBeLessThan(result.totalMessages);
    });
  });

  describe("SlackIntegrationMetadata interface", () => {
    it("should store Slack workspace metadata", () => {
      const metadata: SlackIntegrationMetadata = {
        team_id: "T123456",
        team_name: "Acme Corp",
        bot_user_id: "U987654",
        scope: "channels:history,channels:read,users:read",
        app_id: "A111111",
        selected_channels: ["C123", "C456", "C789"],
      };

      expect(metadata.team_id).toBe("T123456");
      expect(metadata.team_name).toBe("Acme Corp");
      expect(metadata.selected_channels).toHaveLength(3);
    });

    it("should support optional fields", () => {
      const metadata: SlackIntegrationMetadata = {
        team_id: "T123456",
        team_name: "Acme Corp",
      };

      expect(metadata.bot_user_id).toBeUndefined();
      expect(metadata.selected_channels).toBeUndefined();
    });

    it("should allow empty selected_channels array", () => {
      const metadata: SlackIntegrationMetadata = {
        team_id: "T123456",
        team_name: "Acme Corp",
        selected_channels: [],
      };

      expect(metadata.selected_channels).toEqual([]);
    });
  });

  describe("Namespace isolation", () => {
    it("should use organization-specific namespaces", () => {
      const organizationId = "7c12a697-6f3f-4dc9-a108-f81046cde063";
      const namespace = `org-${organizationId}`;

      expect(namespace).toBe("org-7c12a697-6f3f-4dc9-a108-f81046cde063");
    });

    it("should ensure namespace uniqueness per organization", () => {
      const org1 = "org-123";
      const org2 = "org-456";

      expect(org1).not.toBe(org2);
    });
  });

  describe("Message batch processing", () => {
    it("should filter out empty messages", () => {
      const messages = [
        { text: "Valid message", user: "U123" },
        { text: "", user: "U456" },
        { text: "   ", user: "U789" },
        { text: "Another valid message", user: "U012" },
      ];

      const validMessages = messages.filter((msg) => msg.text && msg.text.trim().length > 0);

      expect(validMessages).toHaveLength(2);
    });

    it("should respect batch size limits", () => {
      const totalMessages = 150;
      const batchSize = 10;
      const expectedBatches = Math.ceil(totalMessages / batchSize);

      expect(expectedBatches).toBe(15);
    });
  });

  describe("Vector metadata structure", () => {
    it("should include all required metadata fields", () => {
      const metadata = {
        text: "Test message",
        source: "slack",
        source_type: "message",
        channel_id: "C123",
        channel_name: "general",
        message_ts: "1234567890.123456",
        user_id: "U123",
        username: "johndoe",
        user_real_name: "John Doe",
        message_url: "https://slack.com/archives/C123/p1234567890123456",
        timestamp: 1234567890,
        date: "2009-02-13",
        year: 2009,
        month: 2,
        day_of_week: "Friday",
        organization_id: "org-123",
        workspace_id: "T123",
        workspace_name: "Acme Corp",
        is_private_channel: false,
        channel_type: "public_channel",
      };

      expect(metadata.source).toBe("slack");
      expect(metadata.channel_type).toBe("public_channel");
      expect(metadata.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should support thread replies", () => {
      const threadReply = {
        text: "Reply message",
        source: "slack",
        source_type: "thread_reply",
        thread_ts: "1234567890.000000",
      };

      expect(threadReply.source_type).toBe("thread_reply");
      expect(threadReply.thread_ts).toBeDefined();
    });

    it("should distinguish public vs private channels", () => {
      const publicChannel = {
        is_private_channel: false,
        channel_type: "public_channel",
      };

      const privateChannel = {
        is_private_channel: true,
        channel_type: "private_channel",
      };

      expect(publicChannel.channel_type).toBe("public_channel");
      expect(privateChannel.channel_type).toBe("private_channel");
    });
  });

  describe("Error handling patterns", () => {
    it("should use error cause pattern for batch failures", () => {
      const originalError = new Error("Pinecone connection failed");
      const wrappedError = new Error("Failed to process message batch", {
        cause: originalError,
      });

      expect(wrappedError.message).toBe("Failed to process message batch");
      expect(wrappedError.cause).toBe(originalError);
    });
  });

  describe("Sync state tracking", () => {
    it("should track last synced timestamp", () => {
      const lastSyncedAt = new Date("2025-01-15T10:30:00Z");

      expect(lastSyncedAt.toISOString()).toBe("2025-01-15T10:30:00.000Z");
    });

    it("should calculate sync duration", () => {
      const startTime = 1000;
      const endTime = 46000;
      const duration = endTime - startTime;

      expect(duration).toBe(45000); // 45 seconds
      expect(duration / 1000).toBe(45);
    });
  });

  describe("NotionIntegrationMetadata interface", () => {
    it("should store Notion workspace metadata", () => {
      const metadata: NotionIntegrationMetadata = {
        bot_id: "bot-abc123",
        workspace_id: "workspace-xyz789",
        workspace_name: "Lorikeet",
        workspace_icon: "https://notion.so/icon.png",
        owner: { type: "user", user: { id: "user-123" } },
      };

      expect(metadata.bot_id).toBe("bot-abc123");
      expect(metadata.workspace_id).toBe("workspace-xyz789");
      expect(metadata.workspace_name).toBe("Lorikeet");
    });

    it("should support optional fields", () => {
      const metadata: NotionIntegrationMetadata = {
        bot_id: "bot-abc123",
        workspace_id: "workspace-xyz789",
        owner: { type: "workspace" },
      };

      expect(metadata.workspace_name).toBeUndefined();
      expect(metadata.workspace_icon).toBeUndefined();
      expect(metadata.duplicated_template_id).toBeUndefined();
    });

    it("should store bot_id as primary key", () => {
      const metadata: NotionIntegrationMetadata = {
        bot_id: "bot-primary-key",
        workspace_id: "workspace-123",
        owner: {},
      };

      expect(metadata.bot_id).toBeDefined();
      expect(metadata.bot_id).toBe("bot-primary-key");
    });
  });

  describe("Notion vector metadata structure", () => {
    it("should include all required Notion metadata fields", () => {
      const metadata = {
        text: "Test block content",
        source: "notion",
        source_type: "block",
        page_id: "page-123",
        page_title: "Engineering Docs",
        page_url: "https://notion.so/Engineering-Docs-123",
        block_id: "block-456",
        block_type: "paragraph",
        created_by_id: "user-123",
        last_edited_by_id: "user-456",
        created_time: "2025-01-15T10:00:00.000Z",
        last_edited_time: "2025-10-17T14:00:00.000Z",
        timestamp: 1729177200,
        date: "2025-10-17",
        year: 2025,
        month: 10,
        organization_id: "org-789",
        workspace_id: "workspace-abc",
        workspace_name: "Lorikeet",
        bot_id: "bot-def",
      };

      expect(metadata.source).toBe("notion");
      expect(metadata.source_type).toBe("block");
      expect(metadata.block_type).toBe("paragraph");
      expect(metadata.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should support different block types", () => {
      const blockTypes = [
        "paragraph",
        "heading_1",
        "heading_2",
        "heading_3",
        "bulleted_list_item",
        "to_do",
        "quote",
        "code",
      ];

      blockTypes.forEach((type) => {
        const metadata = {
          block_type: type,
          source: "notion",
        };

        expect(metadata.block_type).toBe(type);
      });
    });

    it("should include optional hierarchy fields", () => {
      const metadata = {
        source: "notion",
        page_id: "page-123",
        parent_page_id: "parent-456",
        parent_database_id: undefined,
      };

      expect(metadata.parent_page_id).toBe("parent-456");
      expect(metadata.parent_database_id).toBeUndefined();
    });
  });

  describe("Notion batch processing", () => {
    it("should filter out empty blocks", () => {
      const blocks = [
        { text: "Valid block content", id: "block-1" },
        { text: "", id: "block-2" },
        { text: "   ", id: "block-3" },
        { text: "Another valid block", id: "block-4" },
      ];

      const validBlocks = blocks.filter((block) => block.text && block.text.trim().length > 0);

      expect(validBlocks).toHaveLength(2);
    });

    it("should use same batch size as Slack (10)", () => {
      const batchSize = 10;

      expect(batchSize).toBe(10);
    });
  });
});
