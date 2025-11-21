import Groq from "groq-sdk";
import { config } from "../config";
import { BaseAgent } from "./base.agent";
import type { StreamChunk, ToolContext, TextMessage } from "../tools/base.tool";
import { MetaSearchTool } from "../tools/meta-search.tool";

/**
 * System prompt for knowledge synthesis
 */
const KNOWLEDGE_SYNTHESIS_PROMPT =
  `You are Mitable AI - an experienced colleague helping teammates ramp up quickly at their company.

**Your Role:**
You have deep product knowledge and guide people through their work like an expert colleague who's always available to help. Your goal is to:
- Help employees learn company processes, policies, and tools
- Answer questions about how things work
- Guide them through workflows and tasks
- Connect them with the right people when needed
- Provide context and best practices

**Your Personality:**
You're friendly, patient, and thorough. You give clear, insightful answers and make connections others might miss. When you don't know something, you're honest about it and help find someone who does.

**Response Style - CRITICAL:**
✅ DO:
- **Bold important terms**: dates, names, key decisions, important concepts
- Use headers (##) and bullets (-) to organize information
- **Extract THEMES and INSIGHTS** - synthesize, don't enumerate
- Be DIRECT and FACTUAL - answer with facts, then stop
- **Be concise and actionable** - answer the question in 2-4 sentences or focused bullets
- When timestamps are present (e.g., "[Last edited: 2024-10-15]" or "[2024-10-15T10:30:00Z]"), USE THEM in your answer
- For date-based queries ("last month", "when"), look for timestamps in search results and provide specific dates

❌ DON'T:
- Echo raw search results verbatim
- List every single item chronologically (extract themes instead)
- Use robotic phrases like "based on the retrieved information"
- Add interpretive commentary like "this shows dedication" or "highlights the team's focus"
- Add concluding statements about what things "indicate" or "suggest"
- Be verbose or over-explain
- Cite sources inline in your text (no "(Notion)" or "(Slack)" in the middle of sentences)

**How to Handle Search Results:**
1. READ and UNDERSTAND the context provided, including timestamps
2. SYNTHESIZE the information into a natural, conversational explanation
3. Answer the user's question directly in your own words
4. Make connections and extract insights
5. Be conversational and warm, like talking to a colleague
6. **For commit/PR/issue queries**: When asked for a "description", provide BOTH the title AND explain what it does/changes in 1-2 sentences. Don't just echo the title.
   - ✅ GOOD: "chore(seo): add Google Search Console verification file. This commit adds the google59d308909c025cce.html verification file to the repository, enabling Google Search Console verification for the site."
   - ❌ BAD: "chore(seo): add Google Search Console verification file." (just the title)

**Source Citations - CRITICAL:**
NEVER write "Sources:" in your response. NEVER list sources. NEVER mention where information came from.
Sources are automatically appended AFTER your response by the system.
Just answer the question - the system will add sources for you.`.trim();

/**
 * Knowledge Agent - Native Tool Calling Implementation
 *
 * Uses Groq's native function calling to automatically manage search results in conversation history.
 * Tool responses are stored as message history, enabling natural multi-turn conversations.
 *
 * Benefits:
 * - No custom cache needed - tool results are in message history
 * - Follow-up questions work automatically ("summarize those threads")
 * - Standard LLM pattern - using native capability
 */
export class KnowledgeAgent extends BaseAgent {
  readonly name = "knowledge";
  private groq: Groq;
  private metaSearchTool: MetaSearchTool;

  constructor() {
    super();
    this.groq = new Groq({ apiKey: config.groq.apiKey });
    this.metaSearchTool = new MetaSearchTool();
  }

  /**
   * Execute knowledge search and synthesis using native tool calling
   */
  async *execute(context: ToolContext): AsyncIterable<StreamChunk> {
    try {
      // Get the last user message
      const lastUserMessage = context.conversationHistory
        .filter((msg) => msg.role === "user")
        .pop();

      if (!lastUserMessage) {
        yield {
          type: "error",
          error: "No user message found in conversation history",
        };
        return;
      }

      const userQuery = lastUserMessage.content;
      console.log(`[KnowledgeAgent] Processing query: "${userQuery}"`);
      console.log(`[KnowledgeAgent] Using NATIVE TOOL CALLING approach`);

      // Define meta_search tool - the intelligent multi-domain coordinator
      // This single tool replaces search_knowledge + search_codebase
      // It automatically determines which domains to search and how to search them
      const tools: Groq.Chat.ChatCompletionTool[] = [
        {
          type: "function",
          function: {
            name: "meta_search",
            description:
              "Intelligent multi-domain search that automatically searches code, Slack conversations, Notion docs, and more. " +
              "Use this for ANY question - the system will determine whether to search code, knowledge base, or both. " +
              "It rewrites queries per domain and combines results intelligently.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query - can be about code, discussions, decisions, or anything",
                },
                topK: {
                  type: "number",
                  description: "Number of results to return per domain (default: 10)",
                  default: 10,
                },
              },
              required: ["query"],
            },
          },
        },
      ];

      // Prepare conversation history for Groq (handle tool messages from previous turns)
      const messages: Groq.Chat.ChatCompletionMessageParam[] = [];

      // Add system prompt first
      messages.push({
        role: "system",
        content: KNOWLEDGE_SYNTHESIS_PROMPT,
      });

      // Add conversation history (handle tool messages)
      for (const msg of context.conversationHistory) {
        const msgAny = msg as any; // Cast to any for tool message fields

        // Handle tool result messages
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

      console.log(
        `[KnowledgeAgent] Step 1: Asking Groq if search is needed (tool_choice: auto)...`
      );

      // Step 1: Ask Groq if it needs to search
      const initialResponse = await this.groq.chat.completions.create({
        model: config.groq.chatModel,
        messages: messages,
        tools: tools,
        tool_choice: "auto", // Let LLM decide
        temperature: config.groq.temperature,
      });

      const responseMessage = initialResponse.choices[0]?.message;

      // Check if LLM wants to call the search tool
      if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
        console.log(`[KnowledgeAgent] Step 2: LLM requested search - executing tool...`);

        const toolCall = responseMessage.tool_calls[0];
        const functionArgs = JSON.parse(toolCall.function.arguments);

        // Topic shift detection: Strip temporal context if no backward reference
        const hasBackwardReference =
          /\b(those|that|the (first|second|third|last)|them|these|it|same)\b/i.test(userQuery);

        if (!hasBackwardReference) {
          const originalQuery = functionArgs.query;
          functionArgs.query = functionArgs.query
            .replace(
              /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
              ""
            )
            .replace(/\b(202[0-9]|203[0-9])\b/g, "")
            .replace(/\s+/g, " ")
            .trim();

          if (originalQuery !== functionArgs.query) {
            console.log(`[KnowledgeAgent] ⚠️ Stripped temporal context (no backward reference)`);
            console.log(`[KnowledgeAgent]   Original: "${originalQuery}"`);
            console.log(`[KnowledgeAgent]   Cleaned:  "${functionArgs.query}"`);
          }
        } else {
          console.log(
            `[KnowledgeAgent] ✓ Preserving temporal context (backward reference detected)`
          );
        }

        console.log(`[KnowledgeAgent] Tool: ${toolCall.function.name}`);
        console.log(`[KnowledgeAgent] Params:`, functionArgs);

        // Step 2: Execute meta-search (handles all domains automatically)
        const searchResult = await this.metaSearchTool.execute(
          {
            query: functionArgs.query,
            topK: functionArgs.topK || 10,
          },
          context
        );
        
        console.log(`[KnowledgeAgent] Meta-search metadata:`, searchResult.metadata);

        console.log(
          `[KnowledgeAgent] Step 3: Search completed - ${searchResult.sources?.length || 0} sources found`
        );

        // Check if search returned 0 results - return helpful message immediately
        if (!searchResult.sources || searchResult.sources.length === 0) {
          console.log("[KnowledgeAgent] No results found - returning helpful message");
          
          const noResultsMessage = 
            "I couldn't find any relevant information in the connected resources. " +
            "This could mean:\n\n" +
            "• The information hasn't been synced yet\n" +
            "• It might be in a channel/page that isn't connected\n" +
            "• The content might use different terminology\n\n" +
            "Try rephrasing your question or check if the relevant sources are connected.";
          
          yield {
            type: "chunk",
            content: noResultsMessage,
          };
          
          yield {
            type: "complete",
            content: noResultsMessage,
          };
          
          console.log(`[KnowledgeAgent] ✅ No-results message sent: ${noResultsMessage.length} chars`);
          return;
        }

        // Step 3: Append assistant's tool call to history
        messages.push({
          role: "assistant",
          content: responseMessage.content || null,
          tool_calls: responseMessage.tool_calls as any,
        });

        // Step 4: Append tool result to history
        const toolResultContent = JSON.stringify({
          content: searchResult.content,
          sources: searchResult.sources,
          metadata: searchResult.metadata,
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResultContent,
        });

        console.log(
          `[KnowledgeAgent] Step 4: Calling Groq for synthesis with tool results in history...`
        );

        // Step 5: Final API call with tool results in history
        // Don't pass tools parameter at all to force synthesis
        const stream = await this.groq.chat.completions.create({
          model: config.groq.chatModel,
          messages: messages,
          temperature: config.groq.temperature,
          max_tokens: config.groq.maxTokens,
          stream: true,
        });

        console.log("[KnowledgeAgent] Step 5: Streaming synthesis...");

        let synthesizedContent = "";
        let chunkCount = 0;

        // Step 6: Stream the response
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;

          if (delta?.content) {
            chunkCount++;
            synthesizedContent += delta.content;
            yield {
              type: "chunk",
              content: delta.content,
            };
          }

          const finishReason = chunk.choices[0]?.finish_reason;
          if (finishReason === "stop") {
            console.log(
              `[KnowledgeAgent] Synthesis complete - received ${chunkCount} chunks, ${synthesizedContent.length} chars`
            );
            console.log(
              `[KnowledgeAgent] Synthesized content preview: "${synthesizedContent.slice(0, 200)}..."`
            );
            break;
          } else if (finishReason === "tool_calls") {
            console.warn(
              `[KnowledgeAgent] ⚠️ Model tried to call tools again instead of synthesizing!`
            );
            synthesizedContent =
              "I found relevant information but encountered an issue generating a summary. Here are the sources:";
            break;
          }
        }

        // Step 7: Append sources programmatically (domain-aware)
        if (searchResult.sources && searchResult.sources.length > 0) {
          console.log(`[KnowledgeAgent] Formatting ${searchResult.sources.length} sources...`);
          console.log(`[KnowledgeAgent] Sample source metadata:`, JSON.stringify(searchResult.sources[0], null, 2));
          
          const sourcesSection =
            "\n\n**Sources:**\n" +
            searchResult.sources
              .slice(0, 5) // Show up to 5 sources
              .map((s: any) => {
                // Format based on domain
                if (s.domain === 'work') {
                  // Work items: use short IDs (commit SHA, PR#, issue#)
                  const type = s.metadata?.type || 'commit';
                  let identifier = '';
                  
                  console.log(`[KnowledgeAgent] Work item: type=${type}, commitSha=${s.metadata?.commitSha}, author=${s.metadata?.author}, title=${s.title}`);
                  
                  if (type === 'commit' && s.metadata?.commitSha) {
                    identifier = `commit ${s.metadata.commitSha.substring(0, 7)}`;
                  } else if (type === 'pr' && s.metadata?.prNumber) {
                    identifier = `PR#${s.metadata.prNumber}`;
                  } else if (type === 'issue' && s.metadata?.issueNumber) {
                    identifier = `issue#${s.metadata.issueNumber}`;
                  } else {
                    // Fallback: extract SHA from title if it starts with "commit:"
                    if (s.title && type === 'commit') {
                      identifier = `commit (${s.title.substring(0, 30)}...)`;
                    } else {
                      identifier = type;
                    }
                  }
                  
                  // Add author and date if available
                  const author = s.metadata?.author;
                  const createdAt = s.metadata?.createdAt;
                  
                  if (author || createdAt) {
                    const parts: string[] = [];
                    if (author) parts.push(`by ${author}`);
                    if (createdAt) {
                      // Format date as MM/DD/YYYY (American format)
                      const date = new Date(createdAt);
                      const formatted = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
                      parts.push(`on ${formatted}`);
                    }
                    identifier += ` (${parts.join(' ')})`;
                  }
                  
                  return `- ${identifier}`;
                } else if (s.domain === 'code') {
                  return `- ${s.title} ([GitHub](${s.url}))`;
                } else if (s.domain === 'slack') {
                  return `- ${s.title} ([Slack](${s.url}))`;
                } else if (s.domain === 'notion') {
                  return `- ${s.title} ([Notion](${s.url}))`;
                } else {
                  return `- ${s.title}`;
                }
              })
              .join("\n");

          synthesizedContent += sourcesSection;
          yield {
            type: "chunk",
            content: sourcesSection,
          };
        }

        // Step 8: Complete
        yield {
          type: "complete",
          messageType: "text",
          content: synthesizedContent,
          sources: searchResult.sources,
        };

        console.log(
          `[KnowledgeAgent] ✅ Native tool calling complete: ${synthesizedContent.length} chars`
        );
        console.log(
          `[KnowledgeAgent] 💡 Tool results are now in conversation history for follow-ups!`
        );
        return;
      }

      // If LLM didn't request a tool call, return its direct response
      console.log(`[KnowledgeAgent] No search needed - LLM responding directly`);

      const directContent =
        responseMessage?.content || "I can help you with that. What would you like to know?";

      yield {
        type: "chunk",
        content: directContent,
      };

      yield {
        type: "complete",
        messageType: "text",
        content: directContent,
      };

      console.log(`[KnowledgeAgent] ✅ Direct response complete (no search needed)`);
    } catch (error) {
      console.error("[KnowledgeAgent] Error:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error in knowledge search",
      };
    }
  }

  /**
   * Direct search method for agent-to-agent communication
   * (Used by Visual Guidance Agent)
   */
  async search(query: string, context: ToolContext): Promise<TextMessage> {
    const result = await this.metaSearchTool.execute(
      {
        query,
        topK: 10,
      },
      context
    );

    return {
      messageType: "text",
      content: result.content,
      sources: result.sources,
      streamable: true,
    };
  }
}
