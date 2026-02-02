/**
 * Document Generation Agent
 *
 * RLM-based document generation using tool-calling loop.
 * The agent examines session data programmatically via tools,
 * then recursively builds the document section by section.
 */

import Groq from "groq-sdk";
import { config } from "../../config.js";
import type { DocType } from "@mitable/shared";
import type { DocumentGenerationEnvironment } from "./environment.js";
import {
  DOCUMENT_GENERATION_TOOLS,
  executeToolCall,
  type ToolCall,
  type ToolResult,
} from "./tools.js";

const MAX_TOOL_ITERATIONS = 30;
const MODEL = "openai/gpt-oss-120b"; // Groq GPT-OSS 120B

interface GenerationStep {
  type: "tool_call" | "content" | "complete";
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  content?: string;
}

export class DocumentGenerationAgent {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: config.groq.apiKey });
  }

  /**
   * Generate document using RLM pattern
   * Yields progress steps for streaming
   */
  async *generateDocument(
    docType: DocType,
    userPrompt: string,
    environment: DocumentGenerationEnvironment
  ): AsyncGenerator<GenerationStep, string, unknown> {
    console.log(`[DocGenAgent] Starting RLM generation for ${docType}`);
    console.log(`[DocGenAgent] Environment: ${environment.sessionIds.length} sessions`);

    const messages: any[] = [
      {
        role: "system",
        content: this.buildSystemPrompt(docType, userPrompt, environment),
      },
    ];

    let iterations = 0;
    let finalDocument = "";

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;
      console.log(`[DocGenAgent] Iteration ${iterations}/${MAX_TOOL_ITERATIONS}`);

      // Call LLM with tools
      const completion = await this.groq.chat.completions.create({
        model: MODEL,
        messages,
        tools: DOCUMENT_GENERATION_TOOLS as any,
        tool_choice: iterations === 1 ? "auto" : "auto", // Let model decide when to stop
        temperature: 0.4,
        max_tokens: 4000,
      });

      const message = completion.choices[0].message;

      // Check if LLM wants to call tools
      if (message.tool_calls && message.tool_calls.length > 0) {
        console.log(`[DocGenAgent] LLM called ${message.tool_calls.length} tools`);

        // Add assistant message with tool calls
        messages.push(message);

        // Execute all tool calls
        const toolResults: ToolResult[] = [];
        for (const toolCall of message.tool_calls) {
          console.log(`[DocGenAgent] Executing: ${toolCall.function.name}`);
          const result = await executeToolCall(toolCall as ToolCall, environment);
          toolResults.push(result);
        }

        // Add tool results to messages
        messages.push(...toolResults);

        // Yield progress
        yield {
          type: "tool_call",
          toolCalls: message.tool_calls as ToolCall[],
          toolResults,
        };

        continue; // Next iteration
      }

      // LLM returned content (no more tool calls)
      if (message.content) {
        console.log(`[DocGenAgent] LLM returned content (${message.content.length} chars)`);
        finalDocument = message.content;

        yield {
          type: "content",
          content: message.content,
        };

        break; // Done
      }

      // Safety: if no tool calls and no content, something went wrong
      console.log(`[DocGenAgent] Warning: No tool calls or content in iteration ${iterations}`);
      break;
    }

    if (iterations >= MAX_TOOL_ITERATIONS) {
      console.log(`[DocGenAgent] Reached max iterations (${MAX_TOOL_ITERATIONS})`);
    }

    yield {
      type: "complete",
    };

    return finalDocument;
  }

  /**
   * Build system prompt that instructs the LLM on how to use tools
   */
  private buildSystemPrompt(
    docType: DocType,
    userPrompt: string,
    environment: DocumentGenerationEnvironment
  ): string {
    const docTypeInstructions = this.getDocTypeInstructions(docType);

    return `You are an expert document generation agent. Your task is to create a ${docType} document based on the user's work sessions.

**User Request:**
"${userPrompt}"

**Available Session Data:**
- ${environment.sessionIds.length} sessions in scope
${environment.dateRange ? `- Date range: ${environment.dateRange.start.toLocaleDateString()} to ${environment.dateRange.end.toLocaleDateString()}` : ""}

**Your Process:**
1. **Examine the data** - Use tools to explore sessions, timelines, summaries, and time breakdowns
2. **Identify key information** - Find accomplishments, activities, blockers, time spent on different tasks
3. **Structure the document** - Organize findings according to the ${docType} format
4. **Generate content** - Create the complete document in Markdown format

**Available Tools:**
- get_sessions_overview: Get high-level overview of all sessions
- get_session_timeline: Get detailed timeline for a specific session
- get_session_summary: Get narrative summary for a session
- get_time_breakdown: Get application usage breakdown
- get_top_applications: Get top apps by time spent
- filter_sessions_by_priority: Filter sessions by priority (high/medium/low)

**Document Type Guidance:**
${docTypeInstructions}

**Output Format:**
- Use Markdown formatting (headings, lists, tables, code blocks)
- Include specific details from the session data
- Use proper structure for ${docType} documents
- Be concise but comprehensive

**Important:**
- Call tools to gather data BEFORE generating content
- Use multiple tool calls to get a complete picture
- Base your document ONLY on actual session data (no hallucination)
- When you have enough information, generate the complete document

Begin by examining the session data using the available tools.`;
  }

  /**
   * Get specific instructions for each document type
   */
  private getDocTypeInstructions(docType: DocType): string {
    switch (docType) {
      case "how-to":
        return `A how-to guide should:
- Start with a clear title describing what will be accomplished
- Include prerequisites if needed
- Present step-by-step instructions
- Include specific examples from the session data
- End with success criteria or next steps`;

      case "knowledge-article":
        return `A knowledge article should:
- Start with an overview/introduction
- Organize information into logical sections
- Include practical examples from session activities
- Use tables or lists for clarity
- End with related topics or resources`;

      case "troubleshooting":
        return `A troubleshooting guide should:
- Start with the problem statement
- List symptoms observed
- Present potential causes
- Provide diagnostic steps
- Give solution steps for each cause
- Include prevention tips`;

      default:
        return `Follow best practices for ${docType} documents.`;
    }
  }
}

export const documentGenerationAgent = new DocumentGenerationAgent();
