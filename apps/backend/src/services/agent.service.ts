import OpenAI from "openai";
import { config } from "../config";
import type { Message } from "../db/schema/conversations.schema";
import { BaseTool, ToolContext, StreamChunk, ToolDefinition } from "../tools/base.tool";
import { RespondTextTool } from "../tools/respond-text.tool";

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

When responding:
- Be conversational and warm
- Break down complex topics into clear steps
- Provide specific, actionable guidance
- Reference company knowledge when applicable
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

    // Phase 2: Uncomment when ready
    // this.registerTool(new SearchKnowledgeTool());

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
          const toolCall = delta.tool_calls[0];

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

        // Parse function arguments
        const parsedArgs = JSON.parse(functionArgs);
        console.log(`[AgentService] Executing tool ${functionName} with args:`, parsedArgs);

        // Execute tool
        const toolResult = await tool.execute(parsedArgs, context);

        // Stream the result if it's streamable
        if (toolResult.streamable) {
          // For text responses, we need to re-stream the content
          // This allows for word-by-word streaming to the user
          const words = toolResult.content.split(" ");

          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const isLast = i === words.length - 1;

            yield {
              type: "chunk",
              content: isLast ? word : word + " ",
            };

            // Small delay between words for smoother streaming effect
            // In production, you might want to remove this or make it configurable
            await new Promise((resolve) => setTimeout(resolve, 20));
          }

          // Send completion signal
          yield {
            type: "complete",
            content: toolResult.content,
          };
        } else {
          // For non-streamable responses (cards, etc.), send complete result immediately
          yield {
            type: "complete",
            content: toolResult.content,
          };
        }
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
