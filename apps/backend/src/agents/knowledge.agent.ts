import Groq from "groq-sdk";
import { config } from "../config";
import { BaseAgent } from "./base.agent";
import type { StreamChunk, ToolContext, TextMessage } from "../tools/base.tool";
import { SearchKnowledgeTool } from "../tools/search-knowledge.tool";

/**
 * System prompt for knowledge synthesis
 */
const KNOWLEDGE_SYNTHESIS_PROMPT = `You are Mitable AI - a friendly, knowledgeable colleague helping teammates ramp up at their company.

**Your Personality:**
You're the person everyone loves to ask questions because you:
- Give clear, insightful answers with **bold formatting** for key terms
- Make connections others might miss
- Extrapolate insights beyond raw facts
- Organize thoughts with headers and bullets for readability

**Response Style:**
✅ DO:
- **Bold important terms**: dates, names, key decisions, important concepts
- Use headers (##) and bullets (-) to organize information
- **Extract THEMES and INSIGHTS** - synthesize, don't enumerate
- Connect related pieces of information
- Add context that helps people understand WHY things matter
- **Be concise and actionable** - answer the question in 2-4 sentences or focused bullets
- Be direct and factual - answer the question, then stop

❌ DON'T:
- Echo raw search results verbatim
- List every single item chronologically (extract themes instead)
- Use robotic phrases like "based on the retrieved information"
- Add unnecessary commentary like "this shows dedication" or "highlights the team's focus"
- Add concluding statements about what things "indicate" or "suggest"
- Be verbose or over-explain

**CRITICAL - Source Citations:**
DO NOT include a "Sources:" section in your response. Sources will be appended programmatically after your response.

When you receive search results from tools, synthesize the information naturally and provide insights.`.trim();

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
  private searchKnowledgeTool: SearchKnowledgeTool;

  constructor() {
    super();
    this.groq = new Groq({ apiKey: config.groq.apiKey });
    this.searchKnowledgeTool = new SearchKnowledgeTool();
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

      // Define search_knowledge tool for Groq
      const tools: Groq.Chat.ChatCompletionTool[] = [
        {
          type: "function",
          function: {
            name: "search_knowledge",
            description:
              "Search the company knowledge base (Slack conversations and Notion documents) for relevant information",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query to find relevant information",
                },
                topK: {
                  type: "number",
                  description: "Number of results to return (default: 40, use 100 for temporal queries)",
                  default: 40,
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

      console.log(`[KnowledgeAgent] Step 1: Asking Groq if search is needed (tool_choice: auto)...`);

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

        console.log(`[KnowledgeAgent] Search params:`, functionArgs);

        // Step 2: Execute the search tool
        const searchResult = await this.searchKnowledgeTool.execute(
          {
            query: functionArgs.query,
            topK: functionArgs.topK || 40,
          },
          context
        );

        console.log(
          `[KnowledgeAgent] Step 3: Search completed - ${searchResult.sources?.length || 0} sources found`
        );

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
        const stream = await this.groq.chat.completions.create({
          model: config.groq.chatModel,
          messages: messages,
          tools: tools, // Keep tools available for potential follow-ups
          temperature: config.groq.temperature,
          max_tokens: config.groq.maxTokens,
          stream: true,
        });

        console.log("[KnowledgeAgent] Step 5: Streaming synthesis...");

        let synthesizedContent = "";

        // Step 6: Stream the response
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;

          if (delta?.content) {
            synthesizedContent += delta.content;
            yield {
              type: "chunk",
              content: delta.content,
            };
          }

          const finishReason = chunk.choices[0]?.finish_reason;
          if (finishReason === "stop") {
            console.log("[KnowledgeAgent] Synthesis complete");
            break;
          }
        }

        // Step 7: Append sources programmatically
        if (searchResult.sources && searchResult.sources.length > 0) {
          const sourcesSection =
            "\n\n**Sources:**\n" +
            searchResult.sources
              .slice(0, 3)
              .map(
                (s: any) =>
                  `- ${s.title} ([${s.url.includes("notion") ? "Notion" : "Slack"}](${s.url}))`
              )
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

        console.log(`[KnowledgeAgent] ✅ Native tool calling complete: ${synthesizedContent.length} chars`);
        console.log(`[KnowledgeAgent] 💡 Tool results are now in conversation history for follow-ups!`);
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
    const result = await this.searchKnowledgeTool.execute(
      {
        query,
        topK: 20,
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
