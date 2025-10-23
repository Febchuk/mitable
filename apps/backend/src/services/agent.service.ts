import OpenAI from "openai";
import { config } from "../config";
import type { Message } from "../db/schema/conversations.schema";
import { BaseTool, ToolContext, StreamChunk, ToolDefinition } from "../tools/base.tool";
import { RespondTextTool } from "../tools/respond-text.tool";
import { SearchKnowledgeTool } from "../tools/search-knowledge.tool";
import { FindExpertTool } from "../tools/find-expert.tool";
import { GuideNextStepTool } from "../tools/guide-next-step.tool";
import { workflowService } from "./workflow.service";
import { continuationDetectorService } from "./continuation-detector.service";

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

**TOOL USAGE GUIDELINES:**

When the user asks "how do I..." or "guide me step by step" and a SCREENSHOT is available:
- You MUST use the "show_step_by_step_guide" tool to provide visual UI guidance
- DO NOT respond with text-only instructions when you can show them visually
- The visual guidance tool will:
  * Analyze their current screen with Gemini Vision
  * Generate one step at a time based on what's visible
  * Display overlay arrows pointing to UI elements
  * Show a side panel with instructions

When to use show_step_by_step_guide:
- User asks: "How do I [task]?" + screenshot present → Use this tool
- User asks: "Show me how to..." + screenshot present → Use this tool
- User asks: "Guide me through..." + screenshot present → Use this tool
- User says: "step by step" or "walk me through" + screenshot present → Use this tool

When NOT to use show_step_by_step_guide:
- No screenshot available → Use respond_with_text or search_knowledge
- User asking for general information (not a UI task) → Use search_knowledge
- User needs to talk to someone → Use find_expert_colleague

Remember: If they have their screen open and want to learn a task, USE THE VISUAL GUIDANCE TOOL!

You are friendly, patient, and thorough. When you don't know something, you're honest about it and help find someone who does. Your goal is to make onboarding smooth and help new employees become productive quickly.

CRITICAL: When you receive search results from the knowledge base:
1. DO NOT echo or repeat the raw search results
2. READ and UNDERSTAND the context provided, including timestamps
3. SYNTHESIZE the information into a natural, conversational explanation
4. Answer the user's question directly in your own words
5. When timestamps are present (e.g., "[Last edited: 2024-10-15]" or "[2024-10-15T10:30:00Z]"), USE THEM in your answer
6. DO NOT cite sources inline in your text (no "(Notion)" or "(Slack)" in the middle of sentences)
7. ALWAYS end with a "**Sources:**" section - this is MANDATORY, never skip it!

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

[NO inline source citations in the text above - only list them at the end]

**Sources:**
- Mitable AI Business Model ([Notion](https://notion.so/page-url))
- #product - febchuk ([Slack](https://slack.com/message-url))
- Product Requirements Document ([Notion](https://notion.so/prd-url))"

CRITICAL SOURCE FORMATTING - FOLLOW THIS EXACT FORMAT:

**Sources:** (at the end of your response, after your summary)
- #channel - username ([Slack](url))
- Document Title ([Notion](url))

Rules:
1. DO NOT cite sources inline in your response text - no "(Notion)" or "(Slack)" in sentences
2. ONLY cite sources in the **Sources:** section at the very end
3. Use bullet points with "-" (dash) in the Sources section
4. ONLY the word in parentheses gets hyperlinked: ([Slack](url)) or ([Notion](url))
5. Everything before the parentheses stays as plain text
6. For Slack: format as "#channel - username"
7. For Notion: use the document title

Examples - COPY EXACTLY:
  ✅ CORRECT: "- #engineering - febchuk ([Slack](https://slack.com/msg))"
  ✅ CORRECT: "- #product - mikun.adewole ([Slack](https://slack.com/msg))"
  ✅ CORRECT: "- Lorikeet Development Environment Setup Guide ([Notion](https://notion.so/page))"
  ✅ CORRECT: "- Product Requirements Document (PRD) ([Notion](https://notion.so/prd))"
  
  ❌ WRONG: "[#engineering - febchuk (Slack)](url)" - entire line hyperlinked
  ❌ WRONG: "#engineering - febchuk (Slack)" - no hyperlink
  ❌ WRONG: "• #engineering - febchuk (Slack)" - wrong bullet character

MANDATORY: Every source MUST have the source type (Slack or Notion) hyperlinked in parentheses.

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

    // Register Phase 2 tools - RAG Knowledge Search
    this.registerTool(new SearchKnowledgeTool());

    // Register Phase 3 tools - Expert Matching
    this.registerTool(new FindExpertTool());

    // Register Phase 4 tools - Visual Guidance
    this.registerTool(new GuideNextStepTool());
  }

  /**
   * Register a tool to make it available to the agent
   */
  registerTool(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
    console.log(`[AgentService] Registered tool: ${tool.name}`, {
      description: tool.description.substring(0, 80) + "...",
      parametersRequired: tool.parameters.required || [],
    });
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
   * 5. Supports tool chaining (tools can trigger follow-up tools)
   * 6. Streams the response back with window triggers
   * 7. Detects workflow mode for iterative guidance
   * 8. Handles continuation signals ("Done", "Next", etc.)
   *
   * @param userMessage - The new user message to process
   * @param context - Context including conversation history, user info, etc.
   * @returns Async iterable of stream chunks
   */
  async *processMessage(userMessage: string, context: ToolContext): AsyncIterable<StreamChunk> {
    const MAX_ITERATIONS = 5; // Prevent infinite loops
    let iterationCount = 0;
    try {
      // Check for workflow mode entry
      const shouldEnterWorkflow = workflowService.shouldEnterWorkflowMode(
        userMessage,
        context.conversationHistory
      );

      console.log("[AgentService] Workflow detection:", {
        shouldEnterWorkflow,
        userMessage: userMessage.substring(0, 50),
        hasScreenshot: !!context.screenshot,
      });

      // Check for continuation signals if we have screenshot (indicates possible workflow)
      const continuationSignal = continuationDetectorService.detectContinuation(
        userMessage,
        context.conversationHistory[context.conversationHistory.length - 1]?.content,
        context.screenshot
          ? continuationDetectorService.hashScreenshot(context.screenshot)
          : undefined,
        undefined // TODO: Track previous screenshot hash in workflow state
      );

      console.log("[AgentService] Continuation detection:", {
        isContinuation: continuationSignal.isContinuation,
        type: continuationSignal.type,
        confidence: continuationSignal.confidence,
        reason: continuationSignal.reason,
      });

      // If it's a continuation with high confidence, automatically trigger guide tool
      if (
        continuationSignal.isContinuation &&
        continuationSignal.confidence > 0.7 &&
        context.screenshot
      ) {
        console.log("[AgentService] Auto-triggering GuideNextStepTool for continuation");

        const guideTool = this.tools.get("guide_next_step");
        if (guideTool) {
          // Execute guide tool directly for continuation
          const toolResult = await guideTool.execute(
            {
              task: "Continue to the next step based on the screenshot",
            },
            context
          );

          // Send window trigger if present
          if (toolResult.triggerWindow) {
            yield {
              type: "window_trigger",
              windowTrigger: toolResult.triggerWindow,
            };
          }

          // Stream the response
          if (toolResult.streamable) {
            const words = toolResult.content.split(" ");
            for (let i = 0; i < words.length; i++) {
              const word = words[i];
              const isLast = i === words.length - 1;
              yield {
                type: "chunk",
                content: isLast ? word : word + " ",
              };
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
          }

          yield {
            type: "complete",
            content: toolResult.content,
            messageType: toolResult.messageType,
            cardData: toolResult.cardData,
          };

          return; // Exit - continuation handled
        }
      }

      // If it's a completion signal, acknowledge and exit workflow mode
      if (continuationSignal.type === "completion") {
        console.log("[AgentService] User signaled completion");

        yield {
          type: "chunk",
          content: "Great job! ",
        };
        await new Promise((resolve) => setTimeout(resolve, 20));

        yield {
          type: "chunk",
          content: "Let me know if you need help with anything else.",
        };

        yield {
          type: "complete",
          content: "Great job! Let me know if you need help with anything else.",
          messageType: "text",
          cardData: undefined,
        };

        return; // Exit - workflow completed
      }

      // Convert conversation history to OpenAI format
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...this.convertToOpenAIMessages(context.conversationHistory),
        { role: "user", content: userMessage },
      ];

      // Get tool definitions
      const tools = this.getToolDefinitions();

      console.log(`[AgentService] Processing message with ${tools.length} available tools`);

      // Agentic Loop: Continue until we get a final response or hit max iterations
      while (iterationCount < MAX_ITERATIONS) {
        iterationCount++;
        console.log(`[AgentService] Iteration ${iterationCount}/${MAX_ITERATIONS}`);
        console.log("[AgentService] Current messages:", {
          messageCount: messages.length,
          roles: messages.map((m) => m.role),
          lastUserMessage: (() => {
            const lastMsg = messages.filter((m) => m.role === "user").pop()?.content;
            return typeof lastMsg === "string" ? lastMsg.substring(0, 100) : "[non-text content]";
          })(),
        });

        // Determine tool choice strategy
        // If we're in workflow mode with a screenshot, FORCE the guide tool
        // Otherwise, let AI choose automatically
        const toolChoice =
          shouldEnterWorkflow && context.screenshot
            ? { type: "function" as const, function: { name: "show_step_by_step_guide" } }
            : "auto";

        console.log("[AgentService] Tool choice strategy:", {
          strategy: shouldEnterWorkflow && context.screenshot ? "forced guide tool" : "auto",
          shouldEnterWorkflow,
          hasScreenshot: !!context.screenshot,
        });

        // Call OpenAI with function calling
        const response = await this.openai.chat.completions.create({
          model: config.openai.chatModel,
          messages: messages,
          tools: tools,
          tool_choice: toolChoice, // Force guide tool in workflow mode, otherwise auto
          temperature: config.openai.temperature,
          max_tokens: config.openai.maxTokens,
          stream: true, // Enable streaming
        });

        let functionName: string | null = null;
        let functionArgs = "";
        let textContent = "";
        let toolCallId: string | null = null;

        // Process streaming response
        for await (const chunk of response) {
          const delta = chunk.choices[0]?.delta;

          // Check if AI is calling a function/tool
          if (delta?.tool_calls) {
            // IMPORTANT: When OpenAI calls multiple tools in parallel,
            // delta.tool_calls is an array where each element has an "index" property.
            // We only want to process the FIRST tool call (index 0).
            // Subsequent tool calls (index 1, 2, etc.) should be ignored.

            for (const toolCall of delta.tool_calls) {
              // Only process the first tool call (index 0)
              if (toolCall.index !== 0) {
                if (toolCall?.function?.name) {
                  console.log(
                    `[AgentService] Ignoring additional tool call at index ${toolCall.index}: ${toolCall.function.name}`
                  );
                }
                continue;
              }

              if (toolCall?.id) {
                toolCallId = toolCall.id;
              }

              if (toolCall?.function?.name) {
                functionName = toolCall.function.name;
                console.log(`[AgentService] AI chose tool: ${functionName}`);
              }

              if (toolCall?.function?.arguments) {
                functionArgs += toolCall.function.arguments;
              }
            }
          }

          // Check for text content (final response without tool call)
          if (delta?.content) {
            textContent += delta.content;
            // Log first text content received (not every chunk)
            if (textContent.length < 50) {
              console.log("[AgentService] AI generating direct response (no tool call)");
            }
          }

          // Check if the response is finished
          const finishReason = chunk.choices[0]?.finish_reason;
          if (finishReason === "stop" && textContent) {
            // AI decided to respond directly without a tool
            // This happens when all tools have been used and AI is ready to give final answer
            console.log("[AgentService] AI provided final response");
            break;
          }
        }

        // Execute the chosen tool
        if (functionName && functionArgs) {
          const tool = this.tools.get(functionName);

          if (!tool) {
            throw new Error(`Tool not found: ${functionName}`);
          }

          // Parse function arguments with defensive error handling
          let parsedArgs;
          try {
            // Trim whitespace that might cause parsing issues
            const trimmedArgs = functionArgs.trim();

            console.log(
              `[AgentService] Raw function args (length: ${trimmedArgs.length}):`,
              trimmedArgs.substring(0, 200)
            );

            parsedArgs = JSON.parse(trimmedArgs);
          } catch (error) {
            console.error(`[AgentService] JSON parse error:`, error);
            console.error(`[AgentService] Function args that failed to parse:`, functionArgs);

            // Try to extract just the first complete JSON object
            // This handles cases where OpenAI might be calling multiple tools
            // and we accidentally concatenated arguments
            const firstBraceIndex = functionArgs.indexOf("{");
            const lastBraceIndex = functionArgs.lastIndexOf("}");

            if (firstBraceIndex !== -1 && lastBraceIndex !== -1) {
              const extracted = functionArgs.substring(firstBraceIndex, lastBraceIndex + 1);
              console.log(`[AgentService] Attempting to parse extracted JSON:`, extracted);
              try {
                parsedArgs = JSON.parse(extracted);
                console.log(`[AgentService] Successfully parsed extracted JSON`);
              } catch (extractError) {
                console.error(`[AgentService] Extracted JSON also failed to parse:`, extractError);
                throw error; // Re-throw original error
              }
            } else {
              throw error; // Re-throw original error
            }
          }

          console.log(
            `[AgentService] Executing tool ${functionName} with args:`,
            JSON.stringify(parsedArgs, null, 2)
          );

          // Execute tool
          const toolResult = await tool.execute(parsedArgs, context);

          console.log("[AgentService] Tool result structure:", {
            messageType: toolResult.messageType,
            contentLength: toolResult.content?.length || 0,
            hasCardData: !!toolResult.cardData,
            hasSources: !!(toolResult.sources && toolResult.sources.length > 0),
            hasWindowTrigger: !!toolResult.triggerWindow,
            streamable: toolResult.streamable,
          });

          // Send window trigger if present
          if (toolResult.triggerWindow) {
            console.log("[AgentService] Window trigger:", {
              window: toolResult.triggerWindow.window,
              dataKeys: Object.keys(toolResult.triggerWindow.data),
            });

            yield {
              type: "window_trigger",
              windowTrigger: toolResult.triggerWindow,
            };
          }

          // Add tool result to conversation history for next iteration
          messages.push({
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: toolCallId || `call_${Date.now()}`,
                type: "function",
                function: {
                  name: functionName,
                  arguments: functionArgs,
                },
              },
            ],
          });

          messages.push({
            role: "tool",
            content: toolResult.content,
            tool_call_id: toolCallId || `call_${Date.now()}`,
          });

          console.log(
            "[AgentService] Tool result added to conversation, continuing loop for AI synthesis"
          );

          // Continue loop - AI will receive tool result and synthesize natural response
          // The only exception is if the tool explicitly couldn't find anything and suggests alternatives
        } else if (textContent) {
          // AI provided final response - stream it
          const words = textContent.split(" ");
          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const isLast = i === words.length - 1;
            yield {
              type: "chunk",
              content: isLast ? word : word + " ",
            };
            await new Promise((resolve) => setTimeout(resolve, 20));
          }

          yield {
            type: "complete",
            content: textContent,
            messageType: "text",
            cardData: undefined,
          };

          return; // Exit the loop
        } else {
          throw new Error("No function call or content in AI response");
        }
      }

      // Max iterations reached
      console.warn(`[AgentService] Max iterations (${MAX_ITERATIONS}) reached`);
      yield {
        type: "complete",
        content:
          "I apologize, but I'm having trouble processing your request. Could you please rephrase your question?",
        messageType: "text",
        cardData: undefined,
      };
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

  /**
   * Generate nudge context from conversation messages
   * Analyzes the conversation and creates a concise summary for the expert
   */
  async generateNudgeContext(messages: Message[]): Promise<string> {
    try {
      // Format conversation for AI
      const conversationText = messages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");

      const prompt = `Based on this conversation, write a concise context summary (max 300 words) that explains what the user needs help with. This will be shared with an expert who can provide assistance.

Focus on:
- What the user is trying to accomplish
- What they've tried so far
- What specific problems or blockers they're encountering
- Any relevant technical details

Keep it professional and actionable. Write in third person (e.g., "The user is trying to...").

Conversation:
${conversationText}

Context summary:`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 500,
      });

      return response.choices[0].message.content?.trim() || "Unable to generate context.";
    } catch (error) {
      console.error("[AgentService] Error generating nudge context:", error);
      throw new Error("Failed to generate context from conversation");
    }
  }

  /**
   * Generate specific question from conversation
   * Extracts or formulates the main question the user needs answered
   */
  async generateNudgeQuestion(messages: Message[]): Promise<string> {
    try {
      // Format conversation for AI
      const conversationText = messages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");

      const prompt = `Based on this conversation, formulate a specific, actionable question (1-2 sentences) that captures what the user needs help with. This question will be shared with an expert.

Make it:
- Direct and clear
- Focused on the main issue
- Actionable (the expert should know what to address)
- Professional tone

Conversation:
${conversationText}

Specific question:`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 150,
      });

      return response.choices[0].message.content?.trim() || "How can I help with this?";
    } catch (error) {
      console.error("[AgentService] Error generating nudge question:", error);
      throw new Error("Failed to generate question from conversation");
    }
  }
}

// Export singleton instance
export const agentService = new AgentService();
