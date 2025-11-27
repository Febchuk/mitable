import Groq from "groq-sdk";
import { config } from "../config";
import { BaseAgent } from "./base.agent";
import type { StreamChunk, ToolContext, Source } from "../tools/base.tool";
// import { codeRetriever } from "../retrievers/code.retriever";
// import { workRetriever } from "../retrievers/work.retriever";
import { slackRetriever } from "../retrievers/slack.retriever";
import { TemporalQueryParser } from "../utils/temporal-parser";
// import { notionRetriever } from "../retrievers/notion.retriever";
// import { orgContextService } from "../services/org-context.service";

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
  private temporalParser: TemporalQueryParser;

  constructor() {
    super();
    this.groq = new Groq({ apiKey: config.groq.apiKey });
    this.temporalParser = new TemporalQueryParser();
  }

  /**
   * Parse sources from LLM response
   * Extracts **Sources:** section and structures it
   */
  private parseSources(content: string): { cleanContent: string; sources: Source[] } {
    // Try to find **Sources:** header first
    const sourcesMatch = content.match(/\*\*Sources:\*\*([\s\S]*?)$/i);
    let cleanContent = content;
    let sourcesText = "";

    if (sourcesMatch) {
      // Found header - use everything after it
      cleanContent = content.substring(0, sourcesMatch.index).trim();
      sourcesText = sourcesMatch[1];
    } else {
      // No header - check if there are source-like lines at the end
      const lines = content.split("\n");
      let firstSourceLineIndex = -1;

      // Find first line that looks like a source (starts with - and has [Slack] or [Notion])
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith("-") && /\[(Slack|Notion|GitHub)\]/.test(line)) {
          firstSourceLineIndex = i;
        } else if (line && firstSourceLineIndex !== -1) {
          // Found non-source line, stop
          break;
        }
      }

      if (firstSourceLineIndex !== -1) {
        cleanContent = lines.slice(0, firstSourceLineIndex).join("\n").trim();
        sourcesText = lines.slice(firstSourceLineIndex).join("\n");
      }
    }

    const sources: Source[] = [];

    // Parse each source line: - Title ([Type](url))
    const sourceLines = sourcesText.split("\n").filter((line) => line.trim().startsWith("-"));

    for (const line of sourceLines) {
      // Match: - Title ([Slack](url)) or - Title ([Notion](url))
      const match = line.match(/-\s*(.+?)\s*\(\[(Slack|Notion|GitHub)\]\(([^)]+)\)\)/);

      if (match) {
        const [, title, type, url] = match;
        sources.push({
          title: title.trim(),
          url: url.trim(),
          snippet: `From ${type}`, // Type indicator
        });
      }
    }

    return { cleanContent, sources };
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

      // Define tools - Slack-focused for now
      const tools: Groq.Chat.ChatCompletionTool[] = [
        // TODO: Re-enable after Slack chunking is complete
        // {
        //   type: "function",
        //   function: {
        //     name: "get_org_info",
        //     description:
        //       "Get information about the organization's connected integrations and available data sources. " +
        //       "Returns which tools are available (Notion, Slack, GitHub, etc.) and their details. " +
        //       "Use this FIRST to understand what data sources exist before searching.",
        //     parameters: {
        //       type: "object",
        //       properties: {},
        //       required: [],
        //     },
        //   },
        // },
        // {
        //   type: "function",
        //   function: {
        //     name: "search_notion",
        //     description:
        //       "Search Notion workspace for documentation, guides, policies, processes, specs, and formal knowledge. " +
        //       "Returns page blocks with metadata including last_edited_time.",
        //     parameters: {
        //       type: "object",
        //       properties: {
        //         query: {
        //           type: "string",
        //           description: "Search query for Notion docs",
        //         },
        //         topK: {
        //           type: "number",
        //           description: "Number of results (default: 10)",
        //           default: 10,
        //         },
        //       },
        //       required: ["query"],
        //     },
        //   },
        // },
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
        // TODO: Re-enable after Slack chunking is complete
        // {
        //   type: "function",
        //   function: {
        //     name: "search_code",
        //     description:
        //       "Search GitHub codebase for implementations, functions, classes, and files. " +
        //       "Returns code chunks with file paths and line numbers.",
        //     parameters: {
        //       type: "object",
        //       properties: {
        //         query: {
        //           type: "string",
        //           description: "Search query for code",
        //         },
        //         topK: {
        //           type: "number",
        //           description: "Number of results (default: 10)",
        //           default: 10,
        //         },
        //       },
        //       required: ["query"],
        //     },
        //   },
        // },
        // {
        //   type: "function",
        //   function: {
        //     name: "search_work",
        //     description:
        //       "Search GitHub work items: commits, pull requests, and issues. " +
        //       "Returns PRs, commits, and issues with metadata.",
        //     parameters: {
        //       type: "object",
        //       properties: {
        //         query: {
        //           type: "string",
        //           description: "Search query for PRs/commits/issues",
        //         },
        //         topK: {
        //           type: "number",
        //           description: "Number of results (default: 10)",
        //           default: 10,
        //         },
        //       },
        //       required: ["query"],
        //     },
        //   },
        // },
      ];

      // Build messages array from conversation history
      const messages: Groq.Chat.ChatCompletionMessageParam[] = [];

      // Add system prompt to guide multi-query decomposition and thorough research
      messages.push({
        role: "system",
        content:
          "You are a helpful AI assistant with access to search tools. " +
          "Your goal is to provide COMPREHENSIVE, DETAILED answers by gathering all relevant information.\n\n" +
          "BREVITY GUIDELINES:\n" +
          "- For timeline/status questions (what happened this week, what did we discuss, current status): " +
          "provide a 2-8 sentence executive summary unless user explicitly asks for details.\n" +
          "- For technical/architectural questions: provide complete answers with all necessary context.\n" +
          "- Always prioritize clarity and usefulness over verbosity.\n\n" +
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
          "When multiple documents contain similar information, prefer the most recently edited one (check last_edited field).\n\n" +
          "CRITICAL SOURCE FORMATTING - ALWAYS INCLUDE SOURCES:\n" +
          "1. DO NOT cite sources inline in your response text - no '(Notion)' or '(Slack)' in sentences\n" +
          "2. ALWAYS end with a **Sources:** section heading - this is MANDATORY\n" +
          "3. After your answer, add a blank line, then EXACTLY this heading: **Sources:**\n" +
          "4. Format each source on its own line starting with a dash:\n\n" +
          "**Sources:**\n" +
          "- #channel - username ([Slack](url))\n" +
          "- Document Title ([Notion](url))\n\n" +
          "Examples:\n" +
          "  ✅ CORRECT: '- #engineering - febe.chukwuma ([Slack](https://slack.com/msg))'\n" +
          "  ✅ CORRECT: '- Product Requirements Document ([Notion](https://notion.so/page))'\n" +
          "  ❌ WRONG: 'According to the Slack discussion...' - no inline citations\n" +
          "  ❌ WRONG: Sources without **Sources:** heading - MUST include heading\n" +
          "  ❌ WRONG: No sources section at end - MANDATORY\n\n" +
          "REMEMBER: You MUST include the **Sources:** heading before the list!",
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
          model: config.groq.chatModel,
          messages: messages,
          tools: tools,
          tool_choice: "auto",
          temperature: config.groq.temperature,
        });

        const responseMessage = response.choices[0]?.message;

        // Check if LLM wants to call tools
        if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
          console.log(`[KnowledgeAgent] LLM called ${responseMessage.tool_calls.length} tool(s)`);

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

              console.log(`[KnowledgeAgent] Tool result: ${result.substring(0, 200)}...`);

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
          toolResults.forEach((result) => messages.push(result));

          // Loop continues - call LLM again with tool results
          continue;
        }

        // No tool calls - LLM has final answer
        const finalAnswer = responseMessage?.content || "I couldn't generate an answer.";

        console.log(`[KnowledgeAgent] Final answer (${finalAnswer.length} chars)`);
        console.log(`[KnowledgeAgent] Raw LLM response:\n${finalAnswer.substring(0, 500)}...`);

        // Parse sources from response
        const { cleanContent, sources } = this.parseSources(finalAnswer);

        console.log(`[KnowledgeAgent] Parsed ${sources.length} sources`);
        if (sources.length === 0 && finalAnswer.toLowerCase().includes("source")) {
          console.log(
            `[KnowledgeAgent] WARNING: Response mentions 'source' but parsing found 0. Checking format...`
          );
          console.log(
            `[KnowledgeAgent] Last 300 chars:\n${finalAnswer.substring(finalAnswer.length - 300)}`
          );
        }

        // Stream the clean answer (without sources section) to user
        yield {
          type: "chunk",
          content: cleanContent,
        };

        yield {
          type: "complete",
          messageType: "text",
          content: cleanContent,
          sources: sources.length > 0 ? sources : undefined,
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
   * Search company knowledge base and return raw results
   * Used by other agents (like VisualGuidanceAgent) that need raw sources for their own synthesis
   */
  async search(query: string, context: ToolContext): Promise<{ sources: any[] }> {
    // Call slack retriever directly for raw results
    const results = await slackRetriever.retrieve(
      query,
      { organizationId: context.organizationId },
      { topK: 20 }
    );

    // Format results similar to old search format
    const sources = results.threads.flatMap((thread: any) =>
      thread.messages.map((msg: any) => ({
        channel: thread.channelName,
        user: msg.username,
        text: msg.text,
        timestamp: msg.timestamp,
        source: "slack",
      }))
    );

    return { sources };
  }

  /**
   * Execute a specific tool and return its result as a string
   */
  private async executeTool(toolName: string, args: any, context: ToolContext): Promise<string> {
    const topK = args.topK || 20; // More context per targeted search for comprehensive answers

    switch (toolName) {
      // TODO: Re-enable after Slack chunking is complete
      // case "get_org_info": {
      //   const orgContext = await orgContextService.getOrgContext(context.organizationId);
      //   return JSON.stringify(orgContext);
      // }

      // case "search_notion": {
      //   const results = await notionRetriever.retrieve(
      //     args.query,
      //     { organizationId: context.organizationId },
      //     { topK }
      //   );

      //   const formatted = results.pages.flatMap((page: any) =>
      //     page.blocks.map((block: any) => ({
      //       title: page.pageTitle,
      //       url: page.pageUrl,
      //       content: block.text, // Full content, not snippet
      //       last_edited: page.lastEditedTime,
      //     }))
      //   );

      //   return JSON.stringify(formatted);
      // }

      case "search_slack": {
        // Parse temporal expressions from query
        const temporalRange = this.temporalParser.parse(args.query);

        const retrievalContext: any = { organizationId: context.organizationId };
        if (temporalRange?.dateFrom) {
          retrievalContext.dateFrom = temporalRange.dateFrom;
          console.log(
            `[KnowledgeAgent] Temporal filter: dateFrom = ${temporalRange.dateFrom.toISOString()}`
          );
        }
        if (temporalRange?.dateTo) {
          retrievalContext.dateTo = temporalRange.dateTo;
          console.log(
            `[KnowledgeAgent] Temporal filter: dateTo = ${temporalRange.dateTo.toISOString()}`
          );
        }

        const results = await slackRetriever.retrieve(args.query, retrievalContext, { topK });

        const formatted = results.threads.flatMap((thread: any) =>
          thread.messages.map((msg: any) => ({
            channel: thread.channelName,
            user: msg.username,
            text: msg.text, // Full message
            timestamp: msg.timestamp,
          }))
        );

        // Add metadata about truncation
        const response: any = { messages: formatted };
        if (results.truncated) {
          response._meta = {
            truncated: true,
            estimatedTokens: results.estimatedTokens,
            note: "Results were truncated to fit token budget. You can request more specific searches or filter by time/channel if needed.",
          };
        }

        return JSON.stringify(response);
      }

      // TODO: Re-enable after Slack chunking is complete
      // case "search_code": {
      //   const results = await codeRetriever.retrieve(
      //     args.query,
      //     { organizationId: context.organizationId },
      //     { topK, includeTypes: ["code"] }
      //   );

      //   const formatted = results.files.flatMap((file: any) =>
      //     file.chunks.map((chunk: any) => ({
      //       file: file.path,
      //       lines: `${chunk.startLine}-${chunk.endLine}`,
      //       code: chunk.text, // Full code chunk
      //       repo: file.repoFullName,
      //     }))
      //   );

      //   return JSON.stringify(formatted);
      // }

      // case "search_work": {
      //   const results = await workRetriever.retrieve(
      //     args.query,
      //     { organizationId: context.organizationId },
      //     { topK }
      //   );

      //   const formatted = results.items.map((item: any) => ({
      //     type: item.type,
      //     title: item.title,
      //     description: item.description, // Full description
      //     author: item.author,
      //     created: item.createdAt,
      //   }));

      //   return JSON.stringify(formatted);
      // }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}
