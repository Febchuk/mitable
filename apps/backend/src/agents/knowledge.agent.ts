import Groq from "groq-sdk";
import { config } from "../config";
import { BaseAgent } from "./base.agent";
import type { StreamChunk, ToolContext } from "../tools/base.tool";
import { codeRetriever } from "../retrievers/code.retriever";
import { workRetriever } from "../retrievers/work.retriever";
import { slackRetriever } from "../retrievers/slack.retriever";
import { notionRetriever } from "../retrievers/notion.retriever";
import { orgContextService } from "../services/org-context.service";

/**
 * Clean KnowledgeAgent following Groq's recommended pattern
 * 
 * Pattern from Groq docs:
 * 1. Define tools
 * 2. Simple agentic loop: while model wants tools → execute → call again
 * 3. Let LLM decide everything (query writing, which tools, when to stop)
 */
export class KnowledgeAgent extends BaseAgent {
  readonly name = "knowledge";
  private groq: Groq;

  constructor() {
    super();
    this.groq = new Groq({ apiKey: config.groq.apiKey });
  }

  /**
   * Execute knowledge search using Groq's recommended agentic pattern
   */
  async *execute(context: ToolContext): AsyncIterable<StreamChunk> {
    try {
      const lastUserMessage = context.conversationHistory
        .filter((msg) => msg.role === "user")
        .slice(-1)[0];

      if (!lastUserMessage) {
        yield { type: "error", error: "No user message found" };
        return;
      }

      console.log(`[KnowledgeAgent] Query: "${lastUserMessage.content}"`);

      // Define 5 tools - let LLM decide which to use and when
      const tools: Groq.Chat.ChatCompletionTool[] = [
        {
          type: "function",
          function: {
            name: "get_org_info",
            description:
              "Get information about the organization's connected integrations and available data sources. " +
              "Returns which tools are available (Notion, Slack, GitHub, etc.) and their details. " +
              "Use this FIRST to understand what data sources exist before searching.",
            parameters: {
              type: "object",
              properties: {},
              required: [],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "search_notion",
            description:
              "Search Notion workspace for documentation, guides, policies, processes, specs, and formal knowledge. " +
              "Returns page blocks with metadata including last_edited_time.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query for Notion docs",
                },
                topK: {
                  type: "number",
                  description: "Number of results (default: 10)",
                  default: 10,
                },
              },
              required: ["query"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "search_slack",
            description:
              "Search Slack for team discussions, decisions, context, and conversational knowledge. " +
              "Returns message threads with channel and timestamp info.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query for Slack messages",
                },
                topK: {
                  type: "number",
                  description: "Number of results (default: 10)",
                  default: 10,
                },
              },
              required: ["query"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "search_code",
            description:
              "Search GitHub codebase for implementations, functions, classes, and files. " +
              "Returns code chunks with file paths and line numbers.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query for code",
                },
                topK: {
                  type: "number",
                  description: "Number of results (default: 10)",
                  default: 10,
                },
              },
              required: ["query"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "search_work",
            description:
              "Search GitHub work items: commits, pull requests, and issues. " +
              "Returns PRs, commits, and issues with metadata.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query for PRs/commits/issues",
                },
                topK: {
                  type: "number",
                  description: "Number of results (default: 10)",
                  default: 10,
                },
              },
              required: ["query"],
            },
          },
        },
      ];

      // Build messages array from conversation history
      const messages: Groq.Chat.ChatCompletionMessageParam[] = [];

      // Add system prompt to guide multi-query decomposition and thorough research
      messages.push({
        role: "system",
        content:
          "You are a helpful AI assistant with access to search tools. " +
          "Your goal is to provide COMPREHENSIVE, DETAILED answers by gathering all relevant information.\n\n" +
          
          "For complex questions (especially about integrations, architecture, or 'how does X work'), DECOMPOSE them into sub-questions:\n" +
          "- What is the data model? (database schemas, tables, fields)\n" +
          "- What is the authentication/OAuth flow?\n" +
          "- What are the implementation details? (sync pipeline, API calls, code)\n" +
          "- What are edge cases or limitations?\n\n" +
          
          "Use MULTIPLE targeted searches to gather complete information:\n" +
          "- First, call get_org_info to see what data sources are available\n" +
          "- Then search each relevant domain with SPECIFIC queries\n" +
          "- Example: For 'How does Notion integration work?', search for:\n" +
          "  1. 'Notion integration database schema tables'\n" +
          "  2. 'Notion OAuth flow authorization'\n" +
          "  3. 'Notion sync pipeline ingestion'\n" +
          "  4. 'Notion integration implementation code'\n\n" +
          
          "Quality over speed: Take 5-8 tool calls if needed to provide a complete answer.\n" +
          "When multiple documents contain similar information, prefer the most recently edited one (check last_edited field).",
      });

      for (const msg of context.conversationHistory) {
        const msgAny = msg as any;

        // Handle tool messages
        if ("tool_call_id" in msg && msgAny.tool_call_id) {
          messages.push({
            role: "tool",
            tool_call_id: msgAny.tool_call_id,
            content: msg.content,
          });
        }
        // Handle assistant messages with tool calls
        else if (msg.role === "assistant" && "tool_calls" in msg && msgAny.tool_calls) {
          messages.push({
            role: "assistant",
            content: msg.content || null,
            tool_calls: msgAny.tool_calls,
          });
        }
        // Regular messages
        else {
          messages.push({
            role: msg.role as "system" | "user" | "assistant",
            content: msg.content,
          });
        }
      }

      // Agentic loop from Groq docs - simple and clean
      const MAX_ITERATIONS = 10;
      let iteration = 0;

      while (iteration < MAX_ITERATIONS) {
        iteration++;
        console.log(`[KnowledgeAgent] Iteration ${iteration}/${MAX_ITERATIONS}`);

        const response = await this.groq.chat.completions.create({
          model: "openai/gpt-oss-120b",
          messages: messages,
          tools: tools,
          tool_choice: "auto",
          temperature: config.groq.temperature,
        });

        const responseMessage = response.choices[0]?.message;

        // Check if LLM wants to call tools
        if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
          console.log(
            `[KnowledgeAgent] LLM called ${responseMessage.tool_calls.length} tool(s)`
          );

          // Add assistant message to history
          messages.push({
            role: "assistant",
            content: responseMessage.content || null,
            tool_calls: responseMessage.tool_calls as any,
          });

          // Execute all tool calls IN PARALLEL for speed
          const toolCallPromises = responseMessage.tool_calls.map(async (toolCall) => {
            const toolName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);

            console.log(`[KnowledgeAgent] Executing: ${toolName}(${JSON.stringify(args)})`);

            try {
              const result = await this.executeTool(toolName, args, context);

              console.log(
                `[KnowledgeAgent] Tool result: ${result.substring(0, 200)}...`
              );

              return {
                role: "tool" as const,
                tool_call_id: toolCall.id,
                content: result,
              };
            } catch (error) {
              console.error(`[KnowledgeAgent] Tool ${toolName} failed:`, error);
              return {
                role: "tool" as const,
                tool_call_id: toolCall.id,
                content: `Error: ${error instanceof Error ? error.message : "Tool execution failed"}`,
              };
            }
          });

          // Wait for all tool calls to complete in parallel
          const toolResults = await Promise.all(toolCallPromises);
          
          // Add all results to message history
          toolResults.forEach(result => messages.push(result));

          // Loop continues - call LLM again with tool results
          continue;
        }

        // No tool calls - LLM has final answer
        const finalAnswer = responseMessage?.content || "I couldn't generate an answer.";

        console.log(`[KnowledgeAgent] Final answer (${finalAnswer.length} chars)`);

        // Stream the answer to user
        yield {
          type: "chunk",
          content: finalAnswer,
        };

        yield {
          type: "complete",
          messageType: "text",
          content: finalAnswer,
        };

        return;
      }

      // Max iterations reached
      yield {
        type: "error",
        error: "Max iterations reached without completing",
      };
    } catch (error) {
      console.error("[KnowledgeAgent] Error:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Execute a tool and return formatted result
   */
  private async executeTool(
    toolName: string,
    args: any,
    context: ToolContext
  ): Promise<string> {
    const topK = args.topK || 20; // More context per targeted search for comprehensive answers

    switch (toolName) {
      case "get_org_info": {
        const orgContext = await orgContextService.getOrgContext(context.organizationId);
        return JSON.stringify(orgContext);
      }

      case "search_notion": {
        const results = await notionRetriever.retrieve(
          args.query,
          { organizationId: context.organizationId },
          { topK }
        );

        const formatted = results.pages.flatMap((page: any) =>
          page.blocks.map((block: any) => ({
            title: page.pageTitle,
            url: page.pageUrl,
            content: block.text, // Full content, not snippet
            last_edited: page.lastEditedTime,
          }))
        );

        return JSON.stringify(formatted);
      }

      case "search_slack": {
        const results = await slackRetriever.retrieve(
          args.query,
          { organizationId: context.organizationId },
          { topK }
        );

        const formatted = results.threads.flatMap((thread: any) =>
          thread.messages.map((msg: any) => ({
            channel: thread.channelName,
            user: msg.username,
            text: msg.text, // Full message
            timestamp: msg.timestamp,
          }))
        );

        return JSON.stringify(formatted);
      }

      case "search_code": {
        const results = await codeRetriever.retrieve(
          args.query,
          { organizationId: context.organizationId },
          { topK, includeTypes: ["code"] }
        );

        const formatted = results.files.flatMap((file: any) =>
          file.chunks.map((chunk: any) => ({
            file: file.path,
            lines: `${chunk.startLine}-${chunk.endLine}`,
            code: chunk.text, // Full code chunk
            repo: file.repoFullName,
          }))
        );

        return JSON.stringify(formatted);
      }

      case "search_work": {
        const results = await workRetriever.retrieve(
          args.query,
          { organizationId: context.organizationId },
          { topK }
        );

        const formatted = results.items.map((item: any) => ({
          type: item.type,
          title: item.title,
          description: item.description, // Full description
          author: item.author,
          created: item.createdAt,
        }));

        return JSON.stringify(formatted);
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}
