import OpenAI from "openai";
import { config } from "../config";
import { BaseAgent } from "./base.agent";
import type { StreamChunk, ToolContext, TextMessage } from "../tools/base.tool";
import { SearchKnowledgeTool } from "../tools/search-knowledge.tool";
import { wrapWithWorkflowState } from "../tools/utils/workflow-wrapper";

/**
 * System prompt for knowledge synthesis
 *
 * Instructs the LLM to synthesize search results into conversational responses
 * rather than echoing raw search results.
 */
const KNOWLEDGE_SYNTHESIS_PROMPT =
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
 * Knowledge Agent
 *
 * Searches and synthesizes information from the knowledge base (Slack + Notion).
 * Uses GPT-4 Turbo for superior reasoning and synthesis capabilities.
 *
 * Responsibilities:
 * - Documentation questions
 * - Policy/process questions
 * - Historical information ("What did we discuss last month?")
 * - Company-specific information
 *
 * Tools:
 * - search_knowledge: Hybrid search (Pinecone semantic + PostgreSQL keyword)
 * - detect_intent: Classify query type (company/product/operations/technical)
 * - apply_trust_ranking: Boost relevant sources based on intent
 * - parse_temporal_keywords: Parse "last week", "yesterday", etc.
 *
 * Services Used:
 * - searchService: Hybrid search (Pinecone + PostgreSQL)
 * - intentService: Intent classification
 * - trustRankingService: Result ranking
 * - embeddingService: Generate query embeddings
 *
 * Can be Called By:
 * - Orchestrator Agent (direct user queries)
 * - Visual Guidance Agent (for knowledge-grounded workflows)
 */
export class KnowledgeAgent extends BaseAgent {
  readonly name = "knowledge";
  private openai: OpenAI;
  private searchKnowledgeTool: SearchKnowledgeTool;

  constructor() {
    super();
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.searchKnowledgeTool = new SearchKnowledgeTool();
  }

  /**
   * Execute knowledge search and synthesis
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

      // Step 1: Execute search using SearchKnowledgeTool
      const searchResult = await this.searchKnowledgeTool.execute(
        {
          query: userQuery,
          topK: 10,
        },
        context
      );

      console.log(
        `[KnowledgeAgent] Search completed: ${searchResult.sources?.length || 0} sources found`
      );

      // Step 2: Synthesize search results using OpenAI
      // Build messages array simulating tool call pattern
      const toolCallId = `call_${Date.now()}`;
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: KNOWLEDGE_SYNTHESIS_PROMPT,
        },
        {
          role: "user",
          content: userQuery,
        },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: {
                name: "search_knowledge",
                arguments: JSON.stringify({ query: userQuery, topK: 10 }),
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: toolCallId,
          content: searchResult.content,
        },
      ];

      console.log("[KnowledgeAgent] Calling OpenAI for synthesis...");

      // Step 3: Stream synthesized response from OpenAI
      const stream = await this.openai.chat.completions.create({
        model: config.openai.chatModel, // gpt-4-turbo
        messages: messages,
        temperature: config.openai.temperature,
        max_tokens: config.openai.maxTokens,
        stream: true,
      });

      let synthesizedContent = "";

      // Step 4: Stream response chunk by chunk
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          const content = delta.content;
          synthesizedContent += content;

          // Yield chunk for streaming
          yield {
            type: "chunk",
            content: content,
          };
        }

        // Check if finished
        const finishReason = chunk.choices[0]?.finish_reason;
        if (finishReason === "stop") {
          console.log("[KnowledgeAgent] Synthesis complete");
          break;
        }
      }

      // Step 5: Smart wrapper - automatically wraps if workflow state exists
      const baseMessage: TextMessage = {
        messageType: "text",
        content: synthesizedContent,
        sources: searchResult.sources,
        streamable: true,
      };

      const finalMessage = wrapWithWorkflowState(baseMessage, context, "custom_question");

      // Step 6: Yield complete chunk with sources
      yield {
        type: "complete",
        messageType: finalMessage.messageType,
        content: finalMessage.content,
        sources: "sources" in finalMessage ? finalMessage.sources : undefined,
        cardData: "cardData" in finalMessage ? finalMessage.cardData : undefined,
      };

      console.log(`[KnowledgeAgent] Response complete: ${synthesizedContent.length} chars`);
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
