import Groq from "groq-sdk";
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
  `You are Mitable AI - a friendly, knowledgeable colleague helping teammates ramp up at their company.

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
- Synthesize across sources to provide insights
- Connect related pieces of information
- Add context that helps people understand WHY things matter
- Be direct and factual - answer the question, then stop

❌ DON'T:
- Echo raw search results verbatim
- Use robotic phrases like "based on the retrieved information"
- Add unnecessary commentary like "this shows dedication" or "highlights the team's focus"
- Add concluding statements about what things "indicate" or "suggest"
- Be verbose or over-explain

**When You Receive Search Results:**
1. READ and UNDERSTAND the context, including timestamps
2. SYNTHESIZE into a natural, conversational explanation
3. Answer directly in your own words
4. Use timestamps when present: "[Last edited: 2024-10-15]" or "[2024-10-15T10:30:00Z]"
5. For date queries, provide specific dates/times when available
6. DO NOT cite sources inline - save for **Sources:** section at the end

**Example Response with Personality:**

User asks: "What is in the PRD?"

"The **Product Requirements Document (PRD)** outlines our vision for an intelligent onboarding platform. We're building a system that uses AI to help new hires ramp up faster.

## Key Features
- **RAG-powered search** - combines semantic and keyword matching
- **Adaptive learning paths** - personalized to your role
- **Real-time sync** - automatically pulls from Notion and Slack

The team shifted from a static wiki to AI-driven discovery after user research showed new hires spent **6+ hours** searching for basic info each week.

**Sources:**
- Mitable AI Business Model ([Notion](https://notion.so/page-url))
- #product - febchuk ([Slack](https://slack.com/message-url))
- Product Requirements Document ([Notion](https://notion.so/prd-url))"

**Thread-Aware Responses:**

When Slack content appears in your context, you'll see a [THREAD ROLLUP - Slack Conversations Found] section at the top listing conversations with:
- Thread title, channel, **human-readable date** (e.g., "September 15, 2024"), participants, and link
- This is followed by the actual conversation threads (Parent → Replies)

IMPORTANT: Reference threads naturally in your answers:
- CHECK THE DATES in the thread rollup - they show when discussions happened
- Say "In a thread from September 15 in #engineering..." instead of "Someone said..."
- If asked about a time period (e.g., "September"), look for threads with matching dates
- Mention key participants when relevant
- Group related points by thread/conversation
- The rollup section shows you the conversation structure—use it to synthesize across threads!

**Source Citations:**

IMPORTANT: Always end your response with a **Sources:** section.
- Do NOT cite sources inline in your text
- For Slack: "- #channel - username ([Slack](url))"
- For Notion: "- Page title ([Notion](url))"
- Example: "- #engineering - mikun.adewole ([Slack](url))"

If you forget the **Sources:** section, it will be added automatically, but try to include it yourself.

When you don't know something, be honest: "I don't have information about that in the knowledge base."

Your goal: Help people understand, not just retrieve information. Think mentor, not search engine.`.trim();

/**
 * Knowledge Agent
 *
 * Searches and synthesizes information from the knowledge base (Slack + Notion).
 * Uses Groq (GPT-OSS-120B) for fast, high-quality reasoning and synthesis.
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
  private groq: Groq;
  private searchKnowledgeTool: SearchKnowledgeTool;

  constructor() {
    super();
    this.groq = new Groq({ apiKey: config.groq.apiKey });
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

      // Step 1: Detect if temporal query first (need to check before search)
      const temporalMonth =
        /\b(?:in|during|throughout)?\s*(january|february|march|april|may|june|july|august|september|october|november|december)\b(?:\s+(\d{4}))?/i;
      const temporalRelative = /\b(last|this|next)\s+(week|month|quarter|year)\b/i;
      const temporalAbsolute = /\b(20\d{2})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?\b/;
      const temporalAnchors = /\b(today|yesterday|recently)\b/i;

      const quickTemporalCheck =
        temporalMonth.test(userQuery) ||
        temporalRelative.test(userQuery) ||
        temporalAbsolute.test(userQuery) ||
        temporalAnchors.test(userQuery);

      // Step 1: Execute search - fetch more results for temporal queries
      let searchResult = await this.searchKnowledgeTool.execute(
        {
          query: userQuery,
          topK: quickTemporalCheck ? 100 : 20, // Fetch 100 for temporal to ensure date diversity
        },
        context
      );

      console.log(
        `[KnowledgeAgent] Search completed: ${searchResult.sources?.length || 0} sources found`
      );

      // Detect if this is a temporal query (from search tool metadata OR our quick check)
      const isTemporal = Boolean(searchResult.metadata?.isTemporal) || quickTemporalCheck;

      console.log(`[KnowledgeAgent] Temporal query detected: ${isTemporal}`);

      // (1) Build working set
      // Prefer raw structured results (with timestamps) for temporal queries
      const structured = (searchResult.metadata as any)?.results as any[] | undefined;
      const items = (
        (isTemporal && structured?.length ? structured : searchResult.sources || []) as any[]
      ).map((s: any, i: number) => ({
        ...s,
        score: Number.isFinite(s.score) ? s.score : 0,
        _rank: i,
      }));

      let relevant: typeof items;
      let sorted: typeof items;

      if (isTemporal) {
        // TEMPORAL QUERY: Prioritize chronological coverage over semantic relevance
        console.log("[KnowledgeAgent] Temporal query - using chronological sorting");

        // Note: SearchKnowledgeTool already applied date filters at the search level
        // No need to filter again here - just organize by date for sampling
        console.log(`[KnowledgeAgent] Working with ${items.length} items from search`);

        // Group by date and sample evenly across dates for coverage
        const byDay = new Map<string, typeof items>();
        for (const s of items) {
          const ts = (s.timestamp || 0) * 1000; // Convert to ms
          const dateKey = new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
          if (!byDay.has(dateKey)) byDay.set(dateKey, []);
          byDay.get(dateKey)!.push(s);
        }

        // Sample top items per day to ensure spread across the whole period
        let perDay = 3; // Take top 3 items per day by score
        const sampled: typeof items = [];
        [...byDay.keys()].sort().forEach((dateKey) => {
          const dayItems = byDay.get(dateKey)!.sort((a, b) => b.score - a.score);
          sampled.push(...dayItems.slice(0, perDay));
        });

        // If day coverage is too narrow (e.g., <= 3 unique days), widen sampling by taking more per later days
        if (byDay.size <= 3 && items.length > 0) {
          perDay = 5;
          const widened: typeof items = [];
          [...byDay.keys()].sort().forEach((dateKey) => {
            const dayItems = byDay.get(dateKey)!.sort((a, b) => b.score - a.score);
            widened.push(...dayItems.slice(0, perDay));
          });
          if (widened.length > sampled.length) {
            sampled.length = 0; // replace
            sampled.push(...widened);
          }
        }

        // Cap to reasonable max (40 items) to control token usage
        relevant = sampled.slice(0, 40);

        // Sort oldest→newest for chronological summary
        relevant.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        // Debug: show coverage span
        if (relevant.length > 0) {
          const span = relevant.reduce((acc, s) => {
            const t = s.timestamp || 0;
            acc.min = Math.min(acc.min ?? t, t);
            acc.max = Math.max(acc.max ?? 0, t);
            return acc;
          }, {} as any);
          console.log(
            `[KnowledgeAgent] Temporal coverage: ${new Date(span.min * 1000).toISOString()} → ${new Date(span.max * 1000).toISOString()} with ${relevant.length} items across ${byDay.size} days`
          );
        } else {
          console.log(`[KnowledgeAgent] No results after temporal filtering`);
        }
      } else {
        // NON-TEMPORAL: Use semantic relevance ranking
        const floor = 0.28; // Keep weak-but-topical
        const pct = 0.7; // Keep down to 70th percentile
        sorted = items.slice().sort((a, b) => b.score - a.score);
        const cutoffScore = sorted.length ? sorted[Math.floor(sorted.length * pct)].score : 0;
        const keepScore = Math.max(floor, cutoffScore);
        relevant = sorted.filter((s) => s.score >= keepScore);

        // Always pass through a minimum (prevents empty sets when scores are noisy)
        if (relevant.length < Math.min(5, sorted.length)) {
          relevant = sorted.slice(0, Math.min(5, sorted.length));
        }
      }

      // (2) Second-chance retrieval if first pass is empty
      if (!relevant.length) {
        console.log("[KnowledgeAgent] First pass empty - trying second-chance keyword search");

        // Crude keyword bias: strip to nouns/proper words & months
        const hints = userQuery
          .replace(/[^\w\s-]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 2);
        const expanded = [...new Set(hints)].slice(0, 10).join(" ");

        const secondChanceResult = await this.searchKnowledgeTool.execute(
          { query: expanded, topK: 40 },
          context
        );

        const scItems = (secondChanceResult.sources || []).map((s: any, i: number) => ({
          ...s,
          score: Number(s.score) || 0,
          _rank: i,
        }));

        relevant = scItems.sort((a, b) => b.score - a.score).slice(0, 8);

        console.log(`[KnowledgeAgent] Second-chance found: ${relevant.length} items`);

        if (relevant.length > 0) {
          // Update searchResult with second-chance results
          searchResult = secondChanceResult;
        }
      }

      // (3) Neutral fallback when still uncertain (links only, no claims)
      const weak = !relevant.length || (relevant[0].score < 0.22 && relevant.length < 3);

      if (weak) {
        console.warn("[KnowledgeAgent] Abstaining after 2 passes - showing neutral fallback");

        // Build neutral "possible matches" list
        const possibleMatches = (searchResult.sources || []).slice(0, 5);

        if (possibleMatches.length > 0) {
          const lines = possibleMatches
            .map((s: any) => {
              const url = s.url || "#";
              const platform = url.includes("slack.com")
                ? "Slack"
                : url.includes("notion.so")
                  ? "Notion"
                  : "Source";
              const title = s.title || s.name || "Untitled";
              return `- ${title} ([${platform}](${url}))`;
            })
            .join("\n");

          const neutralContent = [
            "I'm not fully confident about the exact answer, but these look related—want to check any of them?",
            "",
            "**Possible matches:**",
            lines,
          ].join("\n");

          yield {
            type: "chunk",
            content: neutralContent,
          };

          yield {
            type: "complete",
            messageType: "text",
            content: neutralContent,
          };

          return; // Stop here; no synthesis
        }

        // No matches at all - offer expert matching
        console.log("[KnowledgeAgent] No matches at all - offering expert matching");

        yield {
          type: "chunk",
          content:
            "I couldn't find any information about that in the knowledge base.\n\nWould you like me to find a colleague who might know? I can search for team members with relevant expertise.",
        };

        yield {
          type: "complete",
          messageType: "text",
          content:
            "I couldn't find any information about that in the knowledge base.\n\nWould you like me to find a colleague who might know? I can search for team members with relevant expertise.",
        };

        return;
      }

      // (4) Update searchResult to only include relevant sources for synthesis
      searchResult.sources = relevant;
      console.log(`[KnowledgeAgent] Proceeding to synthesis with ${relevant.length} sources`);

      // Step 2: Synthesize search results using Groq
      // Build messages array simulating tool call pattern
      const toolCallId = `call_${Date.now()}`;

      // Adjust system prompt for temporal queries
      let systemPrompt = KNOWLEDGE_SYNTHESIS_PROMPT;

      if (isTemporal) {
        systemPrompt += `\n\n**IMPORTANT - TEMPORAL QUERY DETECTED:**
The user is asking about what happened during a specific time period. Provide a CHRONOLOGICAL SUMMARY:
- Organize by date/time (not by relevance or topic)
- Mention dates explicitly (e.g., "On October 15...", "October 20-25...")
- Focus on comprehensive coverage of the time period
- Include all significant discussions/events from the period
- Group related items by date, not by semantic similarity
- Start with the earliest events and move to most recent (or vice versa if makes more sense)`;
      }

      const messages: Groq.Chat.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: systemPrompt,
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

      console.log("[KnowledgeAgent] Calling Groq for synthesis...");

      // Step 3: Stream synthesized response from Groq
      const stream = await this.groq.chat.completions.create({
        model: config.groq.chatModel, // openai/gpt-oss-120b
        messages: messages,
        temperature: config.groq.temperature,
        max_tokens: config.groq.maxTokens,
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

      // Step 5: Enforce Sources section (programmatically append if LLM forgot)
      const hasSourcesSection =
        synthesizedContent.includes("**Sources:**") ||
        synthesizedContent.includes("Sources:") ||
        synthesizedContent.toLowerCase().includes("sources:");

      if (!hasSourcesSection) {
        console.log("[KnowledgeAgent] LLM forgot Sources section - appending programmatically");
        console.log(
          `[KnowledgeAgent] Sources to append: ${searchResult.sources?.length || 0} items`
        );

        let sourcesText = "\n\n**Sources:**\n";

        // Format sources according to exact specification
        if (searchResult.sources && searchResult.sources.length > 0) {
          for (const source of searchResult.sources) {
            const title = source.title || "Unknown";
            const url = source.url || "#";

            // Determine platform from title or URL
            let platform = "Source";
            if (url.includes("slack.com")) {
              platform = "Slack";
            } else if (url.includes("notion.so")) {
              platform = "Notion";
            }

            // Format: "- Title ([Platform](url))"
            sourcesText += `- ${title} ([${platform}](${url}))\n`;
          }

          synthesizedContent += sourcesText.trimEnd();

          // Stream the appended sources
          yield {
            type: "chunk",
            content: sourcesText.trimEnd(),
          };
        } else {
          console.warn("[KnowledgeAgent] No sources available to append");
        }
      } else {
        console.log("[KnowledgeAgent] LLM included Sources section - no need to append");
      }

      // Step 6: Smart wrapper - automatically wraps if workflow state exists
      const baseMessage: TextMessage = {
        messageType: "text",
        content: synthesizedContent,
        sources: searchResult.sources,
        streamable: true,
      };

      const finalMessage = wrapWithWorkflowState(baseMessage, context, "custom_question");

      // Step 7: Yield complete chunk with sources
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
