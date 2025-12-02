import Groq from "groq-sdk";
import { config } from "../config";
import { BaseAgent } from "./base.agent";
import type { StreamChunk, ToolContext, Source } from "../tools/base.tool";
import { codeRetriever } from "../retrievers/code.retriever.js";
import { workRetriever } from "../retrievers/work.retriever.js";
import { slackRetriever } from "../retrievers/slack.retriever";
import { notionRetriever } from "../retrievers/notion.retriever.js";
import { TemporalQueryParser } from "../utils/temporal-parser";
import { memoryService } from "../services/memory.service.js";
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
        {
          type: "function",
          function: {
            name: "search_notion",
            description:
              "Search Notion workspace for documentation, guides, policies, processes, database schemas, and formal knowledge. " +
              "Use this for 'what is documented about X', 'policies/procedures for Y', or 'database schema' questions. " +
              "Returns page blocks with section hierarchy and metadata. " +
              "NOTE: Prefer search_code over search_notion when actual implementation details exist in code - code is more authoritative.",
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
              "Search GitHub codebase for implementations, functions, classes, types, and files. " +
              "Use this for 'where/what/how is X implemented' questions. " +
              "Returns code chunks with file paths, line numbers, and function/class names.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description:
                    "Search query for code (e.g., 'Notion sync implementation', 'authentication functions')",
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
        // view_code tool - Fetch actual code from GitHub (ephemeral)
        {
          type: "function",
          function: {
            name: "view_code",
            description:
              "Fetch actual code from GitHub. Use after search_code when you need implementation details. " +
              "Can fetch: (1) specific function/class lines, (2) entire file, or (3) multiple related files (up to 4). " +
              "IMPORTANT: Use repoFullName from search_code results. Code is NOT persisted (ephemeral).",
            parameters: {
              type: "object",
              properties: {
                repoFullName: {
                  type: "string",
                  description:
                    "Repository name from search_code results (e.g., 'owner/repo'). Optional if org has only 1 repo.",
                },
                filePath: {
                  type: "string",
                  description:
                    "Single file path (Mode 1). Omit startLine/endLine to fetch entire file.",
                },
                startLine: {
                  type: "number",
                  description: "Optional: Start line for specific function/class",
                },
                endLine: {
                  type: "number",
                  description: "Optional: End line for specific function/class",
                },
                functionName: {
                  type: "string",
                  description: "Optional: Function/class name for context",
                },
                files: {
                  type: "array",
                  description:
                    "Multiple files (Mode 2, max 4). Use this to understand a feature across files.",
                  items: {
                    type: "object",
                    properties: {
                      filePath: { type: "string" },
                      startLine: { type: "number", description: "Optional" },
                      endLine: { type: "number", description: "Optional" },
                    },
                    required: ["filePath"],
                  },
                },
              },
              required: [],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "search_work",
            description:
              "Search GitHub work items: commits, pull requests, and issues. " +
              "Use this for 'when/why/who decided' questions about changes, features, or discussions. " +
              "Returns PRs, commits, and issues with metadata, labels, and timestamps.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description:
                    "Search query for PRs/commits/issues (e.g., 'recent PR about Slack', 'bug fixes last week')",
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

      // Get conversation memory (summary + recent turns)
      console.log(`[KnowledgeAgent] Loading conversation memory...`);
      const memory = await memoryService.getConversationMemory(context.conversationId);
      console.log(
        `[KnowledgeAgent] Memory loaded: ${memory.conversationSummary ? `${memory.estimatedTokens} tokens (summary + ${memory.recentTurns.length} recent turns)` : `${memory.recentTurns.length} recent turns (no summary yet)`}`
      );

      // Build messages array from memory (not full history)
      const messages: Groq.Chat.ChatCompletionMessageParam[] = [];
      const ephemeralMessageIds = new Set<string>(); // Track ephemeral tool results

      // Add system prompt to guide multi-query decomposition and thorough research
      messages.push({
        role: "system",
        content:
          "You are a helpful AI assistant with access to search tools. " +
          "Your goal is to provide COMPREHENSIVE, DETAILED answers by gathering all relevant information.\n\n" +
          "🚫 CRITICAL FORMATTING RULE - NEVER USE TABLES:\n" +
          "- NEVER EVER use markdown tables (anything with pipes | )\n" +
          "- NEVER format data in rows and columns with | symbols\n" +
          "- If you need to show structured data, use bullet points or numbered lists instead\n\n" +
          "Example - DO NOT do this:\n" +
          "| Layer | Responsibility | Implementation |\n" +
          "|-------|----------------|----------------|\n" +
          "| Agent | Routing | agent.service.ts |\n\n" +
          "Instead, DO this:\n" +
          "## Architecture Layers\n" +
          "- **Agent Layer**: Handles routing decisions\n" +
          "  - Implementation: `agent.service.ts`\n" +
          "- **Service Layer**: Core business logic\n" +
          "  - Implementation: `guideGeneration.service.ts`\n\n" +
          "Use headers (##, ###), bullet points (-), and numbered lists (1., 2., 3.) ONLY.\n\n" +
          "BREVITY GUIDELINES - Match detail level to question specificity:\n" +
          '- **Vague/broad questions** ("What is X?", "How does Y work?"): Provide concise 2-4 paragraph overview with key points. Don\'t deep-dive unless asked.\n' +
          '- **Specific questions** ("What parameters does X function take?", "How do I configure Y?"): Provide focused, detailed answer to exact question.\n' +
          "- **Timeline/status questions**: 2-8 sentence executive summary unless user asks for details.\n" +
          "- **Rule of thumb**: Simple question = Simple answer. Complex question = Detailed answer.\n" +
          "- Avoid making 5+ tool calls for vague questions - get core answer first, user can ask follow-ups.\n\n" +
          "For complex questions (especially about integrations, architecture, or 'how does X work'), DECOMPOSE them into sub-questions:\n" +
          "- What is the data model? (database schemas, tables, fields)\n" +
          "- What is the authentication/OAuth flow?\n" +
          "- What are the implementation details? (sync pipeline, API calls, code)\n" +
          "- What are edge cases or limitations?\n\n" +
          "Use MULTIPLE targeted searches to gather complete information:\n" +
          "- Search each relevant domain with SPECIFIC queries\n" +
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
          "REMEMBER: You MUST include the **Sources:** heading before the list!\n\n" +
          "AVAILABLE TOOLS (use ONLY these):\n" +
          "1. search_code - Search code files (returns metadata only: file paths, function names, line numbers)\n" +
          "2. view_code - Fetch actual code from a specific file (use after search_code)\n" +
          "3. search_notion - Search Notion documentation and specs\n" +
          "4. search_slack - Search Slack messages\n" +
          "5. search_work - Search GitHub PRs, commits, issues\n\n" +
          "DO NOT invent or hallucinate other tool names like 'repo_browser', 'open_file', 'get_org_info', etc. They don't exist.\n\n" +
          "DOMAIN PRIORITY & WEIGHTING:\n" +
          "Each search result includes a _domain_weight field indicating authority:\n" +
          "- CODE: weight=2.0 (HIGHEST authority - current source of truth)\n" +
          "- NOTION: weight=1.0 (Documentation - may be outdated)\n" +
          "- SLACK: weight=0.8 (Discussions - context and decisions)\n" +
          "- WORK: weight=0.6 (Timeline - historical context)\n\n" +
          "When synthesizing answers with conflicting information:\n" +
          "1. ALWAYS prioritize CODE (2x weight) - it's the current state\n" +
          "2. If Slack discusses new feature but code hasn't implemented it, say:\n" +
          "   'Slack discussed X, but codebase currently has Y. Notion docs may be outdated.'\n" +
          "3. Suggest updating docs when you detect staleness\n" +
          "4. Use weighted synthesis: (code_confidence * 2.0 + notion_confidence * 1.0 + slack_confidence * 0.8)\n\n" +
          "CODE SEARCH WORKFLOW:\n" +
          "1. Start with search_code to find relevant files and functions (metadata only)\n" +
          "2. If metadata isn't enough, call view_code on specific functions you identified\n" +
          "3. view_code supports TWO MODES:\n" +
          "   - Single file: {repo_full_name, file_path, start_line, end_line}\n" +
          "   - Multi-file (PREFERRED for features): {files: [{filePath, startLine, endLine}, ...]} - UP TO 4 FILES\n" +
          "4. USE MULTI-FILE MODE when a feature spans multiple files (routes + services + schemas)\n" +
          "5. DO NOT call view_code multiple times for related files - batch them!\n" +
          "6. DO NOT try to call search_code without a 'query' parameter - it's required\n" +
          "7. DO NOT hallucinate implementation details - use view_code if you need them\n\n" +
          "Example (Single file):\n" +
          'search_code({"query": "authentication"})\n' +
          "→ Found: AuthService.authenticateUser (lines 45-89)\n" +
          'view_code({"repoFullName": "Npounengnong/mitableai", "filePath": "apps/backend/src/services/auth.service.ts", "startLine": 45, "endLine": 89})\n' +
          "→ Now you have the actual code\n\n" +
          "Example (Multi-file - BETTER):\n" +
          'search_code({"query": "slack integration"})\n' +
          "→ Found: integrations.ts (routes), slack.service.ts, slack-sync.ts\n" +
          'view_code({"files": [{"filePath": "apps/backend/src/routes/integrations.ts", "startLine": 80, "endLine": 120}, {"filePath": "apps/backend/src/services/slack.service.ts"}, {"filePath": "apps/backend/src/scripts/sync-slack.ts", "startLine": 1, "endLine": 100}]})\n' +
          "→ Now you see the complete integration flow",
      });

      // Add conversation summary if exists
      if (memory.conversationSummary) {
        messages.push({
          role: "system",
          content: `Previous conversation summary:\n${memory.conversationSummary}`,
        });
        console.log(
          `[KnowledgeAgent] Added conversation summary (${memory.summaryUpToTurn} turns summarized)`
        );
      }

      // Add recent turns from memory (already filtered to last N exchanges)
      for (const msg of memory.recentTurns) {
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
      const MAX_ITERATIONS = 15;
      let iteration = 0;

      while (iteration < MAX_ITERATIONS) {
        iteration++;
        console.log(`[KnowledgeAgent] Iteration ${iteration}/${MAX_ITERATIONS}`);

        let response;
        try {
          response = await this.groq.chat.completions.create({
            model: config.groq.chatModel,
            messages: messages,
            tools: tools,
            tool_choice: "auto",
            temperature: config.groq.temperature,
          });
        } catch (error: any) {
          // Handle tool hallucination errors (e.g., LLM tries to call non-existent tools)
          if (error?.status === 400 && error?.error?.code === "tool_use_failed") {
            console.warn(
              `[KnowledgeAgent] Tool hallucination detected:`,
              error.error.failed_generation
            );

            // Extract what the LLM tried to call
            const failedTool = error.error.failed_generation;

            // Add error message to guide LLM to correct tools
            messages.push({
              role: "system",
              content:
                `ERROR: You tried to call a tool that doesn't exist: ${failedTool}\n\n` +
                `Available tools are:\n` +
                `- search_code: Search code files (metadata only)\n` +
                `- view_code: Fetch actual code from a specific file\n` +
                `- search_slack: Search Slack messages\n` +
                `- search_work: Search GitHub PRs, commits, issues\n\n` +
                `If you need to view a specific file, use view_code with parameters:\n` +
                `- repoFullName: string (e.g., "owner/repo") - from search results\n` +
                `- filePath: string (e.g., "apps/backend/src/...")\n` +
                `- startLine: number (optional)\n` +
                `- endLine: number (optional)\n\n` +
                `Please retry with the correct tool.`,
            });

            // Continue to next iteration to let LLM retry
            continue;
          }

          // Re-throw other errors
          throw error;
        }

        const responseMessage = response.choices[0]?.message;

        // Check if LLM wants to call tools
        if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
          console.log(`[KnowledgeAgent] LLM called ${responseMessage.tool_calls.length} tool(s)`);

          // Check if we're on last iteration - if so, we won't be able to process results
          if (iteration === MAX_ITERATIONS) {
            console.warn(
              `[KnowledgeAgent] Tools called on final iteration - cannot process results`
            );
            yield {
              type: "complete",
              messageType: "text",
              content:
                "I found relevant information but ran out of processing time. Please try asking your question in a more specific way, or break it into smaller questions.",
              sources: undefined,
            };
            return;
          }

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

              // Check if result is ephemeral (shouldn't be persisted)
              let isEphemeral = false;
              try {
                const parsed = JSON.parse(result);
                isEphemeral = parsed._ephemeral === true;
                if (isEphemeral) {
                  console.log(
                    `[KnowledgeAgent] Tool ${toolName} marked as ephemeral (not persisted)`
                  );
                  ephemeralMessageIds.add(toolCall.id); // Track separately
                }
              } catch {
                // Not JSON or no _ephemeral flag - treat as normal
              }

              return {
                role: "tool" as const,
                tool_call_id: toolCall.id,
                content: result,
                // NO custom properties - Groq doesn't support them!
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

          // Add all results to message history (including ephemeral for THIS iteration)
          // Note: Ephemeral results will be filtered out before saving to DB
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

        // Update conversation memory with new Q&A pair
        console.log(`[KnowledgeAgent] Updating conversation memory...`);
        await memoryService.updateConversationMemory(context.conversationId);
        console.log(`[KnowledgeAgent] Memory updated successfully`);

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

      case "search_notion": {
        const results = await notionRetriever.retrieve(
          args.query,
          { organizationId: context.organizationId },
          { topK }
        );

        const formatted = results.pages.flatMap((page: any) =>
          page.blocks.map((block: any) => ({
            page_title: page.pageTitle,
            page_url: page.pageUrl,
            content: block.text, // Full content
            section_path: block.sectionPath ? block.sectionPath.join(" → ") : undefined,
            chunk_type: block.chunkType,
            has_code: block.hasCode,
            code_language: block.codeLanguage,
            last_edited: page.lastEditedTime,
          }))
        );

        return JSON.stringify({
          docs: formatted,
          _domain: "notion",
          _domain_weight: 1.0,
          _note: "Documentation source - may be outdated. Verify against code.",
        });
      }

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
        response._domain = "slack";
        response._domain_weight = 0.8;
        response._note = "Discussion context - check if implemented in code.";

        return JSON.stringify(response);
      }

      case "search_code": {
        const results = await codeRetriever.retrieve(
          args.query,
          { organizationId: context.organizationId },
          { topK }
        );

        const formatted = results.chunks.map((chunk: any) => ({
          file: chunk.path,
          fileName: chunk.fileName,
          repo: chunk.repoFullName,
          lines: `${chunk.startLine}-${chunk.endLine}`,
          code: chunk.text, // Full code chunk
          language: chunk.language,
          role: chunk.fileRole,
          area: chunk.area,
          functionName: chunk.functionName,
          className: chunk.className,
          isExported: chunk.isExported,
        }));

        // Add metadata about truncation
        const response: any = { code: formatted };
        if (results.truncated) {
          response._meta = {
            truncated: true,
            estimatedTokens: results.estimatedTokens,
            note: "Results were truncated to fit token budget. Use more specific queries if needed.",
          };
        }
        response._domain = "code";
        response._domain_weight = 2.0;
        response._note = "Current implementation - most authoritative source.";

        return JSON.stringify(response);
      }

      case "search_work": {
        const results = await workRetriever.retrieve(
          args.query,
          { organizationId: context.organizationId },
          { topK }
        );

        const formatted = results.chunks.map((chunk: any) => ({
          type: chunk.chunkType, // commit_summary | pr_summary | issue_summary | pr_comments | issue_comments
          repo: chunk.repoFullName,
          content: chunk.text, // Full description/summary
          author: chunk.author,
          date: chunk.committedAt,
          area: chunk.area,
          labels: chunk.labels,
          state: chunk.state,
          isMerged: chunk.isMerged,
        }));

        // Add metadata about truncation
        const response: any = { work: formatted };
        if (results.truncated) {
          response._meta = {
            truncated: true,
            estimatedTokens: results.estimatedTokens,
            note: "Results were truncated to fit token budget. Use more specific queries or date filters if needed.",
          };
        }
        response._domain = "work";
        response._domain_weight = 0.6;
        response._note = "Historical context - PRs, commits, issues.";

        return JSON.stringify(response);
      }

      case "view_code": {
        const { ViewCodeTool } = await import("../tools/view-code.tool.js");
        const viewCodeTool = new ViewCodeTool();
        const result = await viewCodeTool.execute(args, {
          organizationId: context.organizationId,
        });
        return JSON.stringify(result); // Includes _ephemeral flag
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}
