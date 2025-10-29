import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { llmService, type ExtractedTask } from "./llm.service.js";
import type { NotionBlock } from "./notion.service.js";

/**
 * Unit tests for LLMService
 *
 * Note: These tests mock the Gemini API to avoid actual API calls during testing.
 * The focus is on validating the service's handling of responses and edge cases.
 */

// Mock the @google/generative-ai module
jest.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn(),
      }),
    })),
  };
});

describe("LLMService", () => {
  // Sample Notion blocks that represent a typical onboarding page
  const sampleNotionBlocks: NotionBlock[] = [
    {
      id: "block-1",
      type: "heading_1",
      text: "Week 1: Getting Started",
      has_children: false,
      created_time: "2024-01-01T00:00:00.000Z",
      last_edited_time: "2024-01-01T00:00:00.000Z",
    },
    {
      id: "block-2",
      type: "paragraph",
      text: "Complete IT setup including laptop, email, and security badge (2 hours)",
      has_children: false,
      created_time: "2024-01-01T00:00:00.000Z",
      last_edited_time: "2024-01-01T00:00:00.000Z",
    },
    {
      id: "block-3",
      type: "bulleted_list_item",
      text: "Meet with your team lead to discuss goals and expectations",
      has_children: false,
      created_time: "2024-01-01T00:00:00.000Z",
      last_edited_time: "2024-01-01T00:00:00.000Z",
    },
    {
      id: "block-4",
      type: "heading_2",
      text: "Week 2: Team Integration",
      has_children: false,
      created_time: "2024-01-02T00:00:00.000Z",
      last_edited_time: "2024-01-02T00:00:00.000Z",
    },
    {
      id: "block-5",
      type: "paragraph",
      text: "Shadow a senior team member for 3 days to learn workflows",
      has_children: false,
      created_time: "2024-01-02T00:00:00.000Z",
      last_edited_time: "2024-01-02T00:00:00.000Z",
    },
  ];

  // Expected AI response for the sample blocks
  const mockAIResponse: ExtractedTask[] = [
    {
      weekNumber: 1,
      title: "Complete IT setup",
      description: "Including laptop, email, and security badge",
      timeEstimate: "2 hours",
      orderIndex: 0,
    },
    {
      weekNumber: 1,
      title: "Meet with team lead",
      description: "Discuss goals and expectations",
      timeEstimate: null,
      orderIndex: 1,
    },
    {
      weekNumber: 2,
      title: "Shadow senior team member",
      description: "Learn team workflows and processes",
      timeEstimate: "3 days",
      orderIndex: 0,
    },
  ];

  beforeEach(() => {
    // resetAllMocks provides complete test isolation by clearing:
    // - Call history (.mock.calls)
    // - Mock implementations (.mockResolvedValue, .mockReturnValue)
    // - Return values from previous tests
    // This ensures each test starts with a clean slate
    jest.resetAllMocks();
  });

  describe("extractTasksFromNotionBlocks", () => {
    describe("successful extraction", () => {
      it("should extract tasks from valid Notion blocks", async () => {
        // Mock the Gemini API to return valid JSON
        const mockGenerateContent = jest.fn<any>().mockResolvedValue({
          response: {
            text: () => JSON.stringify(mockAIResponse),
          },
        });

        // Replace the model's generateContent method
        (llmService as any).model.generateContent = mockGenerateContent;

        const result = await llmService.extractTasksFromNotionBlocks(sampleNotionBlocks);

        // Verify the AI was called with the blocks
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);

        // Verify the response structure
        expect(result).toHaveLength(3);
        expect(result[0]).toMatchObject({
          weekNumber: 1,
          title: "Complete IT setup",
          timeEstimate: "2 hours",
          orderIndex: 0,
        });
      });

      it("should filter out blocks with no text content", async () => {
        const blocksWithEmpty: NotionBlock[] = [
          ...sampleNotionBlocks,
          {
            id: "empty-1",
            type: "paragraph",
            text: "",
            has_children: false,
            created_time: "2024-01-01T00:00:00.000Z",
            last_edited_time: "2024-01-01T00:00:00.000Z",
          },
          {
            id: "empty-2",
            type: "paragraph",
            text: "   ", // Only whitespace
            has_children: false,
            created_time: "2024-01-01T00:00:00.000Z",
            last_edited_time: "2024-01-01T00:00:00.000Z",
          },
        ];

        const mockGenerateContent = jest.fn<any>().mockResolvedValue({
          response: {
            text: () => JSON.stringify(mockAIResponse),
          },
        });

        (llmService as any).model.generateContent = mockGenerateContent;

        const result = await llmService.extractTasksFromNotionBlocks(blocksWithEmpty);

        // Should still return valid tasks, empty blocks filtered out
        expect(result).toHaveLength(3);
      });
    });

    describe("edge cases", () => {
      it("should return empty array for empty input", async () => {
        const result = await llmService.extractTasksFromNotionBlocks([]);
        expect(result).toEqual([]);
      });

      it("should return empty array for blocks with only whitespace", async () => {
        const emptyBlocks: NotionBlock[] = [
          {
            id: "empty",
            type: "paragraph",
            text: "   ",
            has_children: false,
            created_time: "2024-01-01T00:00:00.000Z",
            last_edited_time: "2024-01-01T00:00:00.000Z",
          },
        ];

        const result = await llmService.extractTasksFromNotionBlocks(emptyBlocks);
        expect(result).toEqual([]);
      });

      it("should handle AI returning empty array (no tasks found)", async () => {
        const mockGenerateContent = jest.fn<any>().mockResolvedValue({
          response: {
            text: () => "[]",
          },
        });

        (llmService as any).model.generateContent = mockGenerateContent;

        const result = await llmService.extractTasksFromNotionBlocks(sampleNotionBlocks);
        expect(result).toEqual([]);
      });

      it("should throw error when AI returns tasks with missing required fields", async () => {
        // AI returns some invalid tasks (this should never happen with structured output,
        // but we test Zod validation as a safety net)
        const invalidTasks = [
          {
            weekNumber: 1,
            title: "Valid task",
            description: null,
            timeEstimate: null,
            orderIndex: 0,
          },
          {
            // Missing weekNumber - should fail validation
            title: "Invalid task 1",
            description: null,
            timeEstimate: null,
            orderIndex: 1,
          },
        ];

        const mockGenerateContent = jest.fn<any>().mockResolvedValue({
          response: {
            text: () => JSON.stringify(invalidTasks),
          },
        });

        (llmService as any).model.generateContent = mockGenerateContent;

        // Should throw because of Zod validation failure
        await expect(llmService.extractTasksFromNotionBlocks(sampleNotionBlocks)).rejects.toThrow(
          "doesn't match database schema"
        );
      });
    });

    describe("error handling", () => {
      it("should throw error when AI returns invalid JSON", async () => {
        const mockGenerateContent = jest.fn<any>().mockResolvedValue({
          response: {
            text: () => "This is not valid JSON{]",
          },
        });

        (llmService as any).model.generateContent = mockGenerateContent;

        await expect(llmService.extractTasksFromNotionBlocks(sampleNotionBlocks)).rejects.toThrow(
          "AI returned invalid JSON format"
        );
      });

      it("should throw error when AI returns non-array response", async () => {
        const mockGenerateContent = jest.fn<any>().mockResolvedValue({
          response: {
            text: () => JSON.stringify({ error: "Not an array" }),
          },
        });

        (llmService as any).model.generateContent = mockGenerateContent;

        await expect(llmService.extractTasksFromNotionBlocks(sampleNotionBlocks)).rejects.toThrow(
          "doesn't match database schema"
        );
      });

      it("should throw error when AI API fails", async () => {
        const mockGenerateContent = jest
          .fn<any>()
          .mockRejectedValue(new Error("API rate limit exceeded"));

        (llmService as any).model.generateContent = mockGenerateContent;

        await expect(llmService.extractTasksFromNotionBlocks(sampleNotionBlocks)).rejects.toThrow(
          "Failed to process Notion content with AI"
        );
      });

      it("should include original error in cause chain", async () => {
        const originalError = new Error("Network timeout");
        const mockGenerateContent = jest.fn<any>().mockRejectedValue(originalError);

        (llmService as any).model.generateContent = mockGenerateContent;

        try {
          await llmService.extractTasksFromNotionBlocks(sampleNotionBlocks);
          fail("Should have thrown an error");
        } catch (error: any) {
          expect(error.message).toBe("Failed to process Notion content with AI");
          expect(error.cause).toBe(originalError);
          expect(error.cause.message).toBe("Network timeout");
        }
      });
    });

    describe("block structure preservation", () => {
      it("should send block types to AI for context", async () => {
        const mockGenerateContent = jest.fn<any>().mockResolvedValue({
          response: {
            text: () => JSON.stringify([]),
          },
        });

        (llmService as any).model.generateContent = mockGenerateContent;

        await llmService.extractTasksFromNotionBlocks(sampleNotionBlocks);

        // Check that the prompt includes block structure
        const promptArg = mockGenerateContent.mock.calls[0][0];
        expect(promptArg).toContain("heading_1");
        expect(promptArg).toContain("paragraph");
        expect(promptArg).toContain("bulleted_list_item");
        expect(promptArg).toContain("Week 1: Getting Started");
      });

      it("should include timestamps in structured data sent to AI", async () => {
        const mockGenerateContent = jest.fn<any>().mockResolvedValue({
          response: {
            text: () => JSON.stringify([]),
          },
        });

        (llmService as any).model.generateContent = mockGenerateContent;

        await llmService.extractTasksFromNotionBlocks(sampleNotionBlocks);

        const promptArg = mockGenerateContent.mock.calls[0][0];
        expect(promptArg).toContain("created_time");
        expect(promptArg).toContain("last_edited_time");
      });
    });
  });
});
