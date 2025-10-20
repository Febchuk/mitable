/**
 * LLM Service for AI-powered content extraction
 *
 * Uses Gemini's structured output to extract tasks from Notion blocks.
 * Schema derived from database for type safety and compatibility.
 */

import { GoogleGenerativeAI, Schema } from "@google/generative-ai";
import { config } from "../config.js";
import type { NotionBlock } from "./notion.service.js";
import { toGeminiSchema } from "../utils/gemini-schema.js";
import { z } from "zod";

// Manually create Zod schema matching Drizzle table fields
// drizzle-zod's .omit() creates broken schemas that zodToJsonSchema can't parse
const TaskSchema = z.object({
  weekNumber: z.number().int().min(1),
  title: z.string().min(1).max(255),
  description: z.string().nullable(),
  timeEstimate: z.string().max(50).nullable(),
  orderIndex: z.number().int().min(0),
});

const ExtractedTasksArraySchema = z.array(TaskSchema);

// @ts-ignore - drizzle-zod type complexity
export type ExtractedTask = z.infer<typeof TaskSchema>;

/**
 * LLM Service for extracting tasks from Notion content
 */
class LLMService {
  private genAI: GoogleGenerativeAI;
  private model;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);

    // Convert Drizzle-generated Zod schema to Gemini-compatible JSON Schema
    const geminiSchema = toGeminiSchema(ExtractedTasksArraySchema);

    this.model = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: geminiSchema
      },
    });
  }

  /**
   * Extract tasks from Notion blocks using AI
   *
   * This method sends the full block structure (including types like heading_1, paragraph, etc.)
   * to Gemini AI, which intelligently extracts tasks based on content patterns.
   *
   * @param blocks - Array of Notion blocks with text and metadata
   * @returns Array of extracted tasks with week numbers, titles, descriptions, and time estimates
   * @throws Error if AI processing fails or returns invalid JSON
   *
   * @example
   * const blocks = [
   *   { type: "heading_1", text: "Week 1: Onboarding", ... },
   *   { type: "paragraph", text: "Complete IT setup (2 hours)", ... }
   * ];
   * const tasks = await llmService.extractTasksFromNotionBlocks(blocks);
   * // Returns: [{ weekNumber: 1, title: "Complete IT setup", timeEstimate: "2 hours", ... }]
   */
  async extractTasksFromNotionBlocks(blocks: NotionBlock[]): Promise<ExtractedTask[]> {
    // Handle empty input - no blocks means no tasks
    if (!blocks || blocks.length === 0) {
      return [];
    }

    // Filter out blocks with no meaningful text content
    const validBlocks = blocks.filter((block) => block.text && block.text.trim().length > 0);

    if (validBlocks.length === 0) {
      return [];
    }

    // Prepare structured block data for the AI
    // We preserve the block type because it gives important context:
    // - heading_1/heading_2/heading_3: Usually indicate week/section separators
    // - paragraph: Often contains task descriptions
    // - bulleted_list_item/numbered_list_item: Typically task items
    // - to_do: Explicit task items with checkboxes
    const structuredContent = validBlocks.map((block) => ({
      type: block.type, // Block type provides structural context
      text: block.text, // The actual content
      created_time: block.created_time, // When this block was created
      last_edited_time: block.last_edited_time, // Last modification time
    }));

    // Build the prompt for Gemini
    // This prompt is carefully crafted to:
    // 1. Explain the task and provide clear instructions
    // 2. Show the AI the block structure with types
    // 3. Define extraction rules and patterns to look for
    // 4. Specify the exact JSON schema we expect back
    const prompt = `You are analyzing onboarding documentation from Notion to extract structured tasks for new employees.

NOTION BLOCK STRUCTURE:
${JSON.stringify(structuredContent, null, 2)}

EXTRACTION INSTRUCTIONS:

1. **Week Number Detection:**
   - Look for headings (heading_1, heading_2, heading_3) that indicate weeks
   - Common patterns: "Week 1", "First Week", "Week One", "Day 1-5"
   - If no explicit week is mentioned, infer from document structure
   - Default to week 1 if unclear

2. **Task Identification:**
   - paragraph and bulleted_list_item blocks typically contain tasks
   - Look for action verbs: "Complete", "Review", "Meet", "Setup", "Learn"
   - Tasks are concrete action items, not general descriptions

3. **Title Extraction:**
   - Create concise, action-oriented titles (max 60 characters)
   - Remove time estimates from title (put in timeEstimate field)
   - Example: "Complete IT setup and security training" not "Complete IT setup (2 hours)"

4. **Description Extraction:**
   - Extract supporting details, context, or additional instructions
   - If a task has sub-items or clarifying info, include it here
   - Leave null if no additional context exists

5. **Time Estimate Extraction:**
   - Look for durations in parentheses or nearby text: "(2 hours)", "1 day", "by Friday"
   - Common patterns: "X hours", "X days", "X minutes", "by [day/date]"
   - Preserve original format (e.g., "2 hours" not "120 minutes")
   - Leave null if no time estimate is found

6. **Order Index:**
   - Tasks should be numbered sequentially within each week
   - Start from 0 for the first task in each week
   - Preserve document order

IMPORTANT RULES:
- Only extract actual tasks (action items), not section headers or general descriptions
- Be conservative: When in doubt, don't create a task
- Maintain chronological order from the document
- Return an empty array [] if no clear tasks are found

OUTPUT FORMAT:
Return a valid JSON array following this exact schema:

[
  {
    "weekNumber": 1,
    "title": "Complete IT setup",
    "description": "Get laptop, access badges, and accounts configured. Contact IT at help@company.com if issues.",
    "timeEstimate": "2 hours",
    "orderIndex": 0
  },
  {
    "weekNumber": 1,
    "title": "Meet with team lead",
    "description": null,
    "timeEstimate": "by Friday",
    "orderIndex": 1
  }
]

NOW EXTRACT TASKS FROM THE NOTION BLOCKS:`;

    console.log("\n📤 Sending prompt to Gemini:");
    console.log("Prompt length:", prompt.length, "characters");
    console.log("First 500 chars:", prompt.substring(0, 500));
    console.log("Last 200 chars:", prompt.substring(prompt.length - 200));

    try {
      console.log("\n🤖 Calling Gemini API...");
      const result = await this.model.generateContent(prompt);
      console.log("✓ Gemini API responded successfully");

      const response = result.response;
      const text = response.text();

      console.log("\n📥 Gemini response:");
      console.log("Response length:", text.length, "characters");
      console.log("Raw response:", text);

      // Parse JSON - Gemini guarantees valid JSON matching our schema
      console.log("\n🔍 Parsing JSON response...");
      const parsed = JSON.parse(text);
      console.log("✓ JSON parsed successfully");
      console.log("Parsed object type:", Array.isArray(parsed) ? `Array(${parsed.length})` : typeof parsed);

      // Validate with Zod as safety net
      console.log("\n🔍 Validating with Zod schema...");
      const validatedTasks = ExtractedTasksArraySchema.parse(parsed);
      console.log("✓ Zod validation passed");

      console.log(
        `\n✅ LLM extracted ${validatedTasks.length} tasks from ${validBlocks.length} Notion blocks`
      );

      return validatedTasks;
    } catch (error) {
      console.error("\n❌ Error in LLM extraction:");

      // Handle Zod validation errors
      if (error instanceof z.ZodError) {
        console.error("Schema validation failed:", JSON.stringify(error.errors, null, 2));
        throw new Error(
          "AI returned data that doesn't match database schema. Please try again."
        );
      }

      // Handle JSON parsing errors
      if (error instanceof SyntaxError) {
        console.error("Failed to parse AI response as JSON:", error.message);
        throw new Error(
          "AI returned invalid JSON format. Please try again or simplify your Notion page."
        );
      }

      // Handle other errors (API failures, network issues, etc.)
      console.error("Failed to extract tasks from Notion blocks:");
      console.error("Error type:", error?.constructor?.name);
      console.error("Error message:", error instanceof Error ? error.message : String(error));
      console.error("Full error:", error);

      throw new Error(
        "Failed to process Notion content with AI. " +
        (error instanceof Error ? error.message : "Unknown error occurred")
      );
    }
  }
}

// Export singleton instance for use across the application
export const llmService = new LLMService();
