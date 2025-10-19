import OpenAI from "openai";
import { config } from "../config";
import type { Message } from "../db/schema/conversations.schema";
import { BaseTool, ToolContext, StreamChunk, ToolDefinition } from "../tools/base.tool";
import { RespondTextTool } from "../tools/respond-text.tool";
import { SearchKnowledgeTool } from "../tools/search-knowledge.tool";

/**
 * System prompt that defines the agent's role and personality
 */
const SYSTEM_PROMPT =
  `You are an experienced employee assistant helping new hires ramp up quickly at their company. You have deep product knowledge and guide people through their work like an expert colleague who's always available to help.

Your role is to:
- Help employees learn company processes, policies, and tools
- Answer questions about how things work
- Guide them through workflows and tasks
- Connect them with the right people when needed
- Provide context and best practices

You are friendly, patient, and thorough. When you don't know something, you're honest about it and help find someone who does. Your goal is to make onboarding smooth and help new employees become productive quickly.

CRITICAL: When you receive search results from the knowledge base:
1. DO NOT echo or repeat the raw search results
2. READ and UNDERSTAND the context provided, including timestamps
3. SYNTHESIZE the information into a natural, conversational explanation
4. Answer the user's question directly in your own words
5. When timestamps are present (e.g., "[Last edited: 2024-10-15]" or "[2024-10-15T10:30:00Z]"), USE THEM in your answer
6. ALWAYS end with a "**Sources:**" section - this is MANDATORY, never skip it!

When asked about dates or "when":
- Look for timestamps in the search results: "[Last edited: DATE]" for Notion, "[DATE]" for Slack
- Provide specific dates/times when available
- For "last month" queries, filter results by date and summarize what happened
- If no timestamp is available, say so clearly

Example - User asks: "What is in the PRD?"

BAD response (DO NOT DO THIS):
"I found relevant information: [Notion - PRD]..."

GOOD response (DO THIS):
"The Mitable PRD outlines our vision for an intelligent onboarding platform. We're building a system that uses AI to help new hires ramp up faster by centralizing company knowledge and delivering personalized learning experiences. Key features include RAG-powered search, adaptive learning paths, and real-time documentation updates.

**Sources:**
- Mitable AI Business Model ([Notion](https://notion.so/page-url))
- #product - febchuk ([Slack](https://slack.com/message-url))
- Product Requirements Document ([Notion](https://notion.so/prd-url))"

CRITICAL SOURCE FORMATTING:
- Format: "Title ([Source Type](url))" - ONLY the source type in parentheses is hyperlinked
- Do NOT hyperlink the entire line
- Do NOT hyperlink the title
- Examples:
  ✅ CORRECT: "Mitable AI Business Model ([Notion](url))"
  ✅ CORRECT: "#engineering - febchuk ([Slack](url))"
  ❌ WRONG: "[Mitable AI Business Model (Notion)](url)"
  ❌ WRONG: "[Mitable AI Business Model](url) (Notion)"

When responding:
- Be conversational and warm, like talking to a colleague
- Break down complex topics into clear steps
- Provide specific, actionable guidance
- Actually answer the question - don't just list sources
- Encourage questions and learning`.trim();

/**
 * Agent Service
 *
 * The central orchestrator for the agentic chat system.
 * Manages tool registration, routing, and execution using OpenAI function calling.
 *
 * Responsibilities:
 * - Initialize and configure OpenAI client
 * - Register available tools (text response, knowledge search, expert finder, UI guidance)
 * - Convert conversation history to OpenAI message format
 * - Call OpenAI with function calling to let AI choose appropriate tool
 * - Execute chosen tool with parsed arguments
 * - Stream responses back to client
 * - Handle errors and fallbacks
 *
 * Architecture:
 * - Tools are self-contained, reusable capabilities
 * - AI decides which tool to use based on user intent
 * - New tools can be added without changing core logic
 * - Supports both streaming (text) and non-streaming (cards) responses
 */
export class AgentService {
  private openai: OpenAI;
  private tools: Map<string, BaseTool> = new Map();

  constructor() {
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });

    // Register Phase 1 tools
    this.registerTool(new RespondTextTool());

    // Phase 2: Knowledge search (RAG)
    this.registerTool(new SearchKnowledgeTool());

    // Phase 3: Uncomment when ready
    // this.registerTool(new FindExpertTool());

    // Phase 4: Uncomment when ready
    // this.registerTool(new GuideNextStepTool());
  }

  /**
   * Register a tool to make it available to the agent
   */
  registerTool(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
    console.log(`[AgentService] Registered tool: ${tool.name}`);
  }

  /**
   * Get all registered tool definitions for OpenAI function calling
   */
  private getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => tool.getDefinition());
  }

  /**
   * Convert conversation history to OpenAI message format
   */
  private convertToOpenAIMessages(
    conversationHistory: Message[]
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return conversationHistory.map((msg) => {
      if (msg.role === "user") {
        return {
          role: "user",
          content: msg.content,
        };
      } else {
        return {
          role: "assistant",
          content: msg.content,
        };
      }
    });
  }

  /**
   * Process a user message and generate a streaming response
   *
   * This is the main entry point for the agent. It:
   * 1. Converts conversation history to OpenAI format
   * 2. Calls OpenAI with function calling enabled
   * 3. Lets AI decide which tool to use
   * 4. Executes the chosen tool
   * 5. Streams the response back
   *
   * @param userMessage - The new user message to process
   * @param context - Context including conversation history, user info, etc.
   * @returns Async iterable of stream chunks
   */
  async *processMessage(userMessage: string, context: ToolContext): AsyncIterable<StreamChunk> {
    try {
      // Convert conversation history to OpenAI format
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...this.convertToOpenAIMessages(context.conversationHistory),
        { role: "user", content: userMessage },
      ];

      // Get tool definitions
      const tools = this.getToolDefinitions();

      console.log(`[AgentService] Processing message with ${tools.length} available tools`);

      // Call OpenAI with function calling
      const response = await this.openai.chat.completions.create({
        model: config.openai.chatModel,
        messages: messages,
        tools: tools,
        tool_choice: "auto", // Let AI decide which tool to use
        temperature: config.openai.temperature,
        max_tokens: config.openai.maxTokens,
        stream: true, // Enable streaming
      });

      let functionName: string | null = null;
      let functionArgs = "";
      let textContent = "";

      // Process streaming response
      for await (const chunk of response) {
        const delta = chunk.choices[0]?.delta;

        // Check if AI is calling a function/tool
        if (delta?.tool_calls) {
          // Only process the first tool call (index 0)
          // OpenAI might send multiple tool calls, but we only handle one at a time
          const toolCall = delta.tool_calls.find((tc) => tc.index === 0);

          if (toolCall?.function?.name) {
            functionName = toolCall.function.name;
            console.log(`[AgentService] AI chose tool: ${functionName}`);
          }

          if (toolCall?.function?.arguments) {
            functionArgs += toolCall.function.arguments;
          }
        }

        // Check for text content (when no tool is called, shouldn't happen with our setup)
        if (delta?.content) {
          textContent += delta.content;
        }
      }

      // Execute the chosen tool
      if (functionName && functionArgs) {
        const tool = this.tools.get(functionName);

        if (!tool) {
          throw new Error(`Tool not found: ${functionName}`);
        }

        // Parse function arguments with error handling
        let parsedArgs;
        try {
          parsedArgs = JSON.parse(functionArgs);
          console.log(`[AgentService] Executing tool ${functionName} with args:`, parsedArgs);
        } catch (error) {
          console.error(`[AgentService] Failed to parse tool arguments:`, functionArgs);
          throw new Error(
            `Invalid tool arguments for ${functionName}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error }
          );
        }

        // Execute tool
        const toolResult = await tool.execute(parsedArgs, context);

        console.log(`[AgentService] Tool executed, feeding result back to AI for synthesis`);

        // Feed tool result back to AI for proper synthesis
        const messagesWithToolResult: OpenAI.Chat.ChatCompletionMessageParam[] = [
          ...messages,
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "tool_call_1",
                type: "function",
                function: {
                  name: functionName,
                  arguments: functionArgs,
                },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "tool_call_1",
            content: toolResult.content,
          },
        ];

        // Get AI's synthesized response (non-streaming to get full answer)
        const synthesisResponse = await this.openai.chat.completions.create({
          model: config.openai.chatModel,
          messages: messagesWithToolResult,
          temperature: config.openai.temperature,
          max_tokens: config.openai.maxTokens,
          stream: false, // Get complete response first
        });

        const finalAnswer = synthesisResponse.choices[0]?.message?.content || "";

        console.log(`[AgentService] AI synthesized response, now streaming to user`);

        // Stream the final answer word by word
        const words = finalAnswer.split(" ");
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const isLast = i === words.length - 1;

          yield {
            type: "chunk",
            content: isLast ? word : word + " ",
          };

          // Small delay for smooth streaming
          await new Promise((resolve) => setTimeout(resolve, 20));
        }

        // Send completion signal
        yield {
          type: "complete",
          content: finalAnswer,
        };
      } else if (textContent) {
        // Fallback: AI returned text content directly without calling a tool
        // This shouldn't happen with our setup, but handle it gracefully
        console.warn("[AgentService] AI returned text content without calling a tool");

        yield {
          type: "complete",
          content: textContent,
        };
      } else {
        throw new Error("No function call or content in AI response");
      }
    } catch (error) {
      console.error("[AgentService] Error processing message:", error);

      // Send error to client
      yield {
        type: "error",
        error:
          error instanceof Error
            ? error.message
            : "An error occurred while processing your message",
      };
    }
  }
}

// Export singleton instance
export const agentService = new AgentService();
