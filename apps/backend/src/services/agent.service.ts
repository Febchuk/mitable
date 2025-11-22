// import OpenAI from "openai"; // Unused - embeddings handled by separate service
import Groq from "groq-sdk";
// import { GoogleGenerativeAI } from "@google/generative-ai"; // Unused - commented out
import { config } from "../config";
import type { Message } from "../db/schema/conversations.schema";
import { BaseTool, ToolContext, StreamChunk, ToolDefinition } from "../tools/base.tool";
import { RespondTextTool } from "../tools/respond-text.tool";
import { SearchKnowledgeTool } from "../tools/search-knowledge.tool";
import { FindExpertTool } from "../tools/find-expert.tool";
import { GuideNextStepTool } from "../tools/guide-next-step.tool";
import { ClarifyIntentTool } from "../tools/clarify-intent.tool.js";
import { StartUIGuidanceWorkflowTool } from "../tools/start-ui-guidance-workflow.tool.js";
import { AnalyzeWorkflowScreenTool } from "../tools/analyze-workflow-screen.tool.js";
// REMOVED: RespondTextInWorkflowTool - replaced by smart wrapper utility
// REMOVED: SearchKnowledgeInWorkflowTool - replaced by smart wrapper utility
// DEPRECATED: Continuation detector only used in commented-out code (see lines 310-402)
// import { continuationDetectorService } from "./continuation-detector.service";

/**
 * System prompt that defines the agent's role and personality
 */
const SYSTEM_PROMPT =
  `You are an experienced employee assistant helping new hires ramp up quickly at their company. You have deep product knowledge and guide people through their work like an expert colleague who's always available to help.

**RESPONSE STYLE - CRITICAL:**
- Be DIRECT and FACTUAL. Just tell people what happened/exists - no fluff.
- DO NOT add interpretive commentary like "this shows dedication" or "highlights the team's focus"
- DO NOT add concluding statements about what things "indicate" or "suggest"
- Answer the question with facts, then stop. You're a colleague, not a professor analyzing their work.

Your role is to:
- Help employees learn company processes, policies, and tools
- Answer questions about how things work
- Guide them through workflows and tasks
- Connect them with the right people when needed
- Provide context and best practices

**TOOL USAGE GUIDELINES:**

VAGUE PROMPTS (with screenshot):
- User says: "How do I do this?", "Help me with this", "What should I click?"
- Use clarify_intent to analyze screen and offer specific task interpretations
- Wait for user to select which task they meant
- Then proceed with knowledge search + guidance

SPECIFIC UI TASKS (with screenshot):
- User asks: "How do I [specific task]?" or "Guide me through [task]"
- STEP 1: Use search_knowledge to find company documentation
- STEP 2: Use start_ui_guidance_workflow with search results for knowledge-grounded guidance
- IMPORTANT: ALWAYS search first, then provide guidance based on those results

When to use start_ui_guidance_workflow:
- User asks: "How do I [task]?" + screenshot present → Use this tool to START workflow
- User asks: "Show me how to..." + screenshot present → Use this tool to START workflow
- User asks: "Guide me through..." + screenshot present → Use this tool to START workflow
- User says: "step by step" or "walk me through" + screenshot present → Use this tool to START workflow
- NOTE: This tool creates the initial workflow proposal. For progressing through steps, use guide_next_step.

DURING ACTIVE WORKFLOWS:
When user selects "Type something" (option 2) from WorkflowOptions component and asks a custom question,
you'll receive their question with an auto-captured screenshot. Intelligently route based on question type:

USE analyze_workflow_screen (visual/UI issues requiring screen analysis):
- "I don't see the [element]"
- "Where is the [button/menu/field]?"
- "The screen looks different"
- "It's not showing what you described"
- "I see [X] instead of [Y]"

USE respond_with_text_in_workflow (conceptual questions about the current step):
- "Why do I need to do this step?"
- "What happens if I skip this?"
- "Can I do this differently?"
- "Is this step required?"

USE search_knowledge_in_workflow (questions about features/concepts needing documentation):
- "What is the [feature] used for?"
- "How does [concept] work?"
- "Can you explain what [term] means?"
- "What are the benefits of [feature]?"

CRITICAL: All three workflow tools (analyze_workflow_screen, respond_with_text_in_workflow, search_knowledge_in_workflow)
preserve workflow state by returning workflowPhase: "custom_question" in cardData. This keeps WorkflowOptions visible.
None of these tools progress the workflow - they only provide help while staying on the current step.

When NOT to use guidance tools:
- No screenshot available → Use respond_with_text or search_knowledge
- General information questions → Use search_knowledge only
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
 * Manages tool registration, routing, and execution using function calling.
 *
 * Model: Groq GPT-OSS 120B (131K context, 500 TPS, ~20x cheaper than GPT-4)
 * API: OpenAI-compatible (seamless migration from OpenAI)
 *
 * Responsibilities:
 * - Initialize and configure Groq client
 * - Register available tools (text response, knowledge search, expert finder, UI guidance)
 * - Convert conversation history to message format
 * - Call Groq with function calling to let AI choose appropriate tool
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
  // private openai: OpenAI; // Unused - embeddings handled by separate service
  private groq: Groq;
  // private gemini: GoogleGenerativeAI; // Unused - kept for future reference
  private tools: Map<string, BaseTool> = new Map();

  constructor() {
    // Initialize Groq client for chat completions
    this.groq = new Groq({
      apiKey: config.groq.apiKey,
    });

    // Initialize Gemini client (for cost-effective text generation)
    // this.gemini = new GoogleGenerativeAI(config.gemini.apiKey); // Unused - commented out

    // Register Phase 1 tools
    this.registerTool(new RespondTextTool());

    // Register Phase 2 tools - RAG Knowledge Search
    this.registerTool(new SearchKnowledgeTool());

    // Register Phase 3 tools - Expert Matching
    this.registerTool(new FindExpertTool());

    // Register Phase 4 tools - Visual Guidance
    this.registerTool(new GuideNextStepTool());

    // Register Phase 5 tools - Knowledge-Grounded Guidance & Workflows
    this.registerTool(new ClarifyIntentTool());
    this.registerTool(new StartUIGuidanceWorkflowTool());
    this.registerTool(new AnalyzeWorkflowScreenTool());

    // NOTE: Phase 5.1 workflow-specific tool variants removed
    // RespondTextInWorkflowTool and SearchKnowledgeInWorkflowTool replaced by smart wrapper utility
    // in the new multi-agent architecture (see: tools/utils/workflow-wrapper.ts)
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
   * Convert conversation history to Groq message format (OpenAI-compatible)
   */
  private convertToGroqMessages(
    conversationHistory: Message[]
  ): Groq.Chat.ChatCompletionMessageParam[] {
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

    // Track metadata from last tool execution (for including in final response)
    let lastToolMessageType: "text" | "workflow" | "experts" | undefined;
    let lastToolCardData: any | undefined;
    let lastToolSources: any[] | undefined;

    try {
      // Workflow detection removed - agent service is deprecated
      const shouldEnterWorkflow = false;

        console.log("[AgentService] Workflow detection:", {
          shouldEnterWorkflow,
          userMessage: userMessage.substring(0, 50),
          screenshotCount: context.screenshots?.length || 0,
        });

      /**
       * DEPRECATED: Continuation detection via natural language parsing
       *
       * This logic was replaced by the WorkflowOptions UI metadata system.
       * Previously, the system would detect words like "done", "next", "okay" and auto-trigger
       * the guide_next_step tool. This created unpredictable behavior and race conditions.
       *
       * NEW APPROACH: All workflow progression is now explicit via WorkflowOptions UI:
       * - User clicks "Move on to next step" → metadata.workflowAction = "progress_step"
       * - User clicks "Type something" → metadata.workflowAction = "custom_question"
       * - User clicks "Exit workflow" → metadata.workflowAction = "exit_workflow"
       *
       * The metadata flows through the entire stack and provides hints to OpenAI for
       * deterministic tool selection (see lines 410-436 below).
       *
       * KEPT FOR REFERENCE - MAY BE REMOVED IN FUTURE CLEANUP
       */

      // // Check for continuation signals if we have screenshot (indicates possible workflow)
      // const continuationSignal = continuationDetectorService.detectContinuation(
      //   userMessage,
      //   context.conversationHistory[context.conversationHistory.length - 1]?.content,
      //   context.screenshot
      //     ? continuationDetectorService.hashScreenshot(context.screenshot)
      //     : undefined,
      //   undefined // TODO: Track previous screenshot hash in workflow state
      // );

      // console.log("[AgentService] Continuation detection:", {
      //   isContinuation: continuationSignal.isContinuation,
      //   type: continuationSignal.type,
      //   confidence: continuationSignal.confidence,
      //   reason: continuationSignal.reason,
      // });

      // // If it's a continuation with high confidence, automatically trigger guide tool
      // if (
      //   continuationSignal.isContinuation &&
      //   continuationSignal.confidence > 0.7 &&
      //   context.screenshot
      // ) {
      //   console.log("[AgentService] Auto-triggering GuideNextStepTool for continuation");

      //   const guideTool = this.tools.get("guide_next_step");
      //   if (guideTool) {
      //     // Execute guide tool directly for continuation
      //     const toolResult = await guideTool.execute(
      //       {
      //         task: "Continue to the next step based on the screenshot",
      //       },
      //       context
      //     );

      //     // Send window trigger if present
      //     if (toolResult.triggerWindow) {
      //       yield {
      //         type: "window_trigger",
      //         windowTrigger: toolResult.triggerWindow,
      //       };
      //     }

      //     // Stream the response
      //     if (toolResult.streamable) {
      //       const words = toolResult.content.split(" ");
      //       for (let i = 0; i < words.length; i++) {
      //         const word = words[i];
      //         const isLast = i === words.length - 1;
      //         yield {
      //           type: "chunk",
      //           content: isLast ? word : word + " ",
      //         };
      //         await new Promise((resolve) => setTimeout(resolve, 20));
      //       }
      //     }

      //     yield {
      //       type: "complete",
      //       content: toolResult.content,
      //       messageType: toolResult.messageType,
      //       cardData: toolResult.cardData,
      //     };

      //     return; // Exit - continuation handled
      //   }
      // }

      // // If it's a completion signal, acknowledge and exit workflow mode
      // if (continuationSignal.type === "completion") {
      //   console.log("[AgentService] User signaled completion");

      //   yield {
      //     type: "chunk",
      //     content: "Great job! ",
      //   };
      //   await new Promise((resolve) => setTimeout(resolve, 20));

      //   yield {
      //     type: "chunk",
      //     content: "Let me know if you need help with anything else.",
      //   };

      //   yield {
      //     type: "complete",
      //     content: "Great job! Let me know if you need help with anything else.",
      //     messageType: "text",
      //     cardData: undefined,
      //   };

      //   return; // Exit - workflow completed
      // }

      // Convert conversation history to OpenAI format
      // Add current date context for temporal awareness
      const now = new Date();
      const dateStr = now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const systemPromptWithDate = `${SYSTEM_PROMPT}

**IMPORTANT TEMPORAL CONTEXT:**
Today is ${dateStr}. When searching for or discussing information, prioritize recent content from the last few days/weeks over older content. If someone asks "what's the latest" or "this week", focus on the most recent timestamps in the search results.`;

      const messages: Groq.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPromptWithDate },
        ...this.convertToGroqMessages(context.conversationHistory),
        { role: "user", content: userMessage },
      ];

        // Inject context about screenshot availability and workflow intent
        // This critical information helps OpenAI make informed tool selection decisions
        if (context.screenshots && context.screenshots.length > 0) {
          messages.push({
            role: "system",
            content:
              "[CONTEXT] User has provided a screenshot of their current screen. Screenshot is available for visual analysis and UI guidance.",
          });
          console.log("[AgentService] Added screenshot context to messages");
        }

      // Inject metadata hints for WorkflowOptions UI interactions
      if (context.metadata?.workflowAction) {
        const { workflowAction } = context.metadata;

        if (workflowAction === "progress_step") {
          messages.push({
            role: "system",
            content:
              "[CRITICAL WORKFLOW ACTION] User clicked 'Move on to next step' button. YOU MUST call the guide_next_step tool NOW with conversationId parameter. DO NOT call any other tool. This is NOT a question - it's a direct command to progress the active workflow.",
          });
          console.log("[AgentService] Added workflow progression hint to messages");
        } else if (workflowAction === "custom_question") {
          messages.push({
            role: "system",
            content:
              "[CRITICAL WORKFLOW ACTION] User clicked 'Type something' button during active workflow. YOU MUST analyze their question and call EXACTLY ONE of these tools:\n" +
              "- If visual/UI issue ('I don't see X', 'Where is Y?') → YOU MUST call analyze_workflow_screen tool with conversationId and issue parameters\n" +
              "- If conceptual question ('Why?', 'What does X mean?') → YOU MUST call respond_with_text_in_workflow tool with conversationId and response parameters\n" +
              "- If knowledge question ('What is X?', 'How does Y work?') → YOU MUST call search_knowledge_in_workflow tool with conversationId and query parameters\n" +
              "DO NOT use the non-workflow variants (respond_with_text, search_knowledge). DO NOT call guide_next_step. You MUST preserve workflow state by using the _in_workflow tool variants.",
          });
          console.log("[AgentService] Added custom question hint to messages");
        } else if (workflowAction === "exit_workflow") {
          messages.push({
            role: "system",
            content:
              "[CRITICAL WORKFLOW ACTION] User clicked 'Exit task workflow' button. YOU MUST call the respond_with_text tool NOW to acknowledge their exit and ask if there's anything else you can help with. DO NOT call any other tool. DO NOT continue the workflow.",
          });
          console.log("[AgentService] Added workflow exit hint to messages");
        }
      }

      if (shouldEnterWorkflow) {
        messages.push({
          role: "system",
          content:
            "[INTENT DETECTED] This appears to be a task guidance request based on trigger phrases in the user message. User is asking for step-by-step help completing an action. When screenshot is available, prioritize visual guidance flow: search_knowledge → show_step_by_step_guide.",
        });
        console.log("[AgentService] Added workflow intent context to messages");
      }

      // Get tool definitions
      const tools = this.getToolDefinitions();

      console.log(`[AgentService] Processing message with ${tools.length} available tools`);

      // Determine tool_choice based on metadata (force specific tool for workflow actions)
      let toolChoice: "auto" | { type: "function"; function: { name: string } } = "auto";

      const workflowAction = context.metadata?.workflowAction;
      if (workflowAction === "progress_step") {
        // Force guide_next_step tool for "Move on to next step" button
        toolChoice = { type: "function", function: { name: "guide_next_step" } };
        console.log("[AgentService] FORCING tool_choice to guide_next_step based on metadata");
      } else if (workflowAction === "exit_workflow") {
        // Force respond_with_text tool for "Exit task workflow" button
        toolChoice = { type: "function", function: { name: "respond_with_text" } };
        console.log("[AgentService] FORCING tool_choice to respond_with_text based on metadata");
      }
      // For custom_question, leave as "auto" because we need AI to analyze the question type
      // and choose between analyze_workflow_screen, respond_with_text_in_workflow, or search_knowledge_in_workflow

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

        // Call Groq with function calling
        const response = await this.groq.chat.completions.create({
          model: config.groq.chatModel,
          messages: messages,
          tools: tools,
          tool_choice: toolChoice, // Force specific tool for workflow actions, otherwise auto
          temperature: config.groq.temperature,
          max_tokens: config.groq.maxTokens,
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

          // Store metadata from this tool result (will be included in final response)
          lastToolMessageType = toolResult.messageType;
          lastToolCardData = toolResult.cardData;
          lastToolSources = toolResult.sources;

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

          // Check if tool result suggests we should continue (e.g., "Would you like me to connect you with an expert?")
          // If the tool returns a complete answer, stream it and finish
          // If the tool result is incomplete, continue the loop for the AI to decide next step
          const isIncompleteResult =
            toolResult.content.toLowerCase().includes("would you like") ||
            toolResult.content.toLowerCase().includes("connect you with") ||
            toolResult.content.toLowerCase().includes("couldn't find");

            // Special case: If search_knowledge succeeded in a workflow context with screenshot,
            // continue the loop to allow show_step_by_step_guide to be called next
            const shouldContinueForGuidance =
              functionName === "search_knowledge" &&
              shouldEnterWorkflow &&
              context.screenshots &&
              context.screenshots.length > 0 &&
              !isIncompleteResult; // search succeeded

          console.log("[AgentService] Completion decision:", {
            isIncompleteResult,
            shouldContinueForGuidance,
            willContinueLoop: isIncompleteResult || shouldContinueForGuidance,
            contentPreview: toolResult.content.substring(0, 100) + "...",
          });

          if (!isIncompleteResult && !shouldContinueForGuidance) {
            // Complete result - stream it and finish
            console.log("[AgentService] Streaming final response:", {
              wordCount: toolResult.content.split(" ").length,
              streamable: toolResult.streamable,
            });

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

            return; // Exit the loop
          }

          // If we're continuing for guidance, add a hint to help OpenAI make the right next choice
          if (shouldContinueForGuidance) {
            console.log(
              "[AgentService] Continuing loop for UI guidance after successful knowledge search"
            );
            messages.push({
              role: "system",
              content:
                "Knowledge search completed successfully. Now use show_step_by_step_guide with these search results (from the 'sources' field) and the available screenshot to provide visual step-by-step guidance to the user.",
            });
          }

          // Continue loop - AI will decide next action based on tool result
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

          // Include metadata from last tool execution (if any)
          yield {
            type: "complete",
            content: textContent,
            messageType: lastToolMessageType || "text",
            cardData: lastToolCardData,
            sources: lastToolSources,
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
        sources: undefined,
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
}

// Export singleton instance
export const agentService = new AgentService();
