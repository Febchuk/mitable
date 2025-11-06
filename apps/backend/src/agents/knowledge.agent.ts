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
- Provide exhaustive day-by-day breakdowns when themes would be better

**When You Receive Search Results:**
1. **READ** all the context deeply - don't skim
2. **IDENTIFY PATTERNS** - what themes emerge across multiple sources?
3. **EXTRAPOLATE INSIGHTS** - what does this tell us about what happened/what matters?
4. **SYNTHESIZE** - connect the dots, don't just list findings
5. Answer in your own words, showing you understand the bigger picture
6. Use timestamps when present: "[Last edited: 2024-10-15]" or "[2024-10-15T10:30:00Z]"
7. For date queries, provide specific dates/times when available

**You are an ANALYST who synthesizes, not a REPORTER who echoes.**

**Example Response with Personality:**

User asks: "What did we discuss in October?"

HIGH CONFIDENCE (theme extraction):
"October 2025 centered on three main areas:

**Product Development:** The team focused on PII redaction features and Slack/Notion integrations, with daily sprint planning and CI/CD workflow improvements.

**Infrastructure:** Multiple discussions around GCP platform access, deployment pipelines, and cost tracking as the product scales.

**Roadmap Planning:** Several sessions on Q4 feature prioritization and the shift from static wikis to AI-driven onboarding."

User asks: "What is in the PRD?"

"The **Product Requirements Document (PRD)** outlines our vision for an intelligent onboarding platform. We're building a system that uses AI to help new hires ramp up faster.

## Key Features
- **RAG-powered search** - combines semantic and keyword matching
- **Adaptive learning paths** - personalized to your role
- **Real-time sync** - automatically pulls from Notion and Slack

The team shifted from a static wiki to AI-driven discovery after user research showed new hires spent **6+ hours** searching for basic info each week."

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

🚨 CRITICAL: DO NOT GENERATE SOURCES 🚨
Sources will be appended programmatically after your response.
- DO NOT end your response with a "Sources:" section
- DO NOT cite sources inline like "([Slack](url))" or "according to #channel"
- DO NOT make up channel names, document titles, or URLs
- Focus ONLY on synthesizing the content - sources are handled separately

If you don't have enough information, just say: "I don't have information about this in the knowledge base."

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
 *
 * CONFIDENCE SYSTEM (User-Focused Responses):
 *
 * CORE PRINCIPLE: AI is an ANALYST who SYNTHESIZES, not a REPORTER who ECHOES
 * → READ deeply → IDENTIFY patterns → EXTRAPOLATE insights → SYNTHESIZE themes
 *
 * HIGH CONFIDENCE (avg score ≥ 0.45 OR 8+ results with score ≥ 0.30 OR temporal query with 5+ results):
 *   - DEEP SYNTHESIS MODE
 *   - Extract MEANING and INSIGHTS from the data
 *   - Identify patterns across multiple sources
 *   - Synthesize into 2-4 clear themes
 *   - Cap at 2-3 ultra-relevant sources (appended programmatically)
 *   - Example: "October focused heavily on product infrastructure, with extensive
 *     discussions about PII redaction across multiple formats and integration improvements"
 *   - NOT: "I found discussions about PII, integrations, and auth"
 *
 * MEDIUM CONFIDENCE (0.28 ≤ avg score < 0.45):
 *   - THOUGHTFUL SYNTHESIS with inline citations
 *   - Still synthesize and extrapolate (don't just list)
 *   - Be transparent about partial coverage
 *   - Cite sources inline as you weave insights
 *   - Cap at 5 sources
 *   - Example: "I found relevant discussions about X. In #product, Mikun outlined
 *     [insight you extracted] ([Slack](url))"
 *
 * LOW CONFIDENCE (avg score < 0.28):
 *   - Provide context with strong caveat
 *   - Show snippet from top match + other sources
 *   - Example: "Not fully confident, but #engineering mentioned: 'PII features'..."
 *   - Otherwise, suggest expert matching
 *
 * TEMPORAL QUERIES (e.g., "What did we discuss in October?"):
 *   - HIGH confidence → Theme extraction (not day-by-day)
 *   - Extract 2-4 main focus areas
 *   - Group related events under themes
 *   - Example: "Product Development: PII features... Infrastructure: GCP access..."
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

      console.log(
        `[KnowledgeAgent] Temporal query detected: ${quickTemporalCheck} (fetching ${quickTemporalCheck ? 100 : 40} results)`
      );

      // Step 1: Search knowledge base (or use cached preflight results from orchestrator)
      let searchResult;

      // Check if orchestrator cached a preflight search for us
      const cachedPreflight = (context as any).kbPreflightCache;
      if (cachedPreflight?.results && !quickTemporalCheck) {
        // Reuse orchestrator's preflight results for simple queries
        console.log(
          `[KnowledgeAgent] Using cached preflight results (${cachedPreflight.results.sources?.length || 0} sources)`
        );
        searchResult = cachedPreflight.results;
      } else {
        // Do full search
        searchResult = await this.searchKnowledgeTool.execute(
          {
            query: userQuery,
            topK: quickTemporalCheck ? 100 : 40, // FIX E: Increased from 20 to 40 for better grouping
          },
          context
        );
      }

      console.log(
        `[KnowledgeAgent] Search completed: ${searchResult.sources?.length || 0} sources found`
      );

      // Safety check: Ensure we have content to work with
      if (!searchResult.content || searchResult.content.trim().length === 0) {
        console.warn("[KnowledgeAgent] Search returned no content");
        yield {
          type: "chunk",
          content: "I couldn't find any information about that in the knowledge base.",
        };
        yield {
          type: "complete",
          messageType: "text",
          content: "I couldn't find any information about that in the knowledge base.",
        };
        return;
      }

      // Detect if this is a temporal query (from search tool metadata OR our quick check)
      const isTemporal = Boolean(searchResult.metadata?.isTemporal) || quickTemporalCheck;
      console.log(`[KnowledgeAgent] Temporal query detected: ${isTemporal}`);

      // Detect if user wants summary vs details
      const wantsDetails =
        /\b(details?|full|raw|show (all|thread|messages|pages)|expand|break ?down)\b/i.test(
          userQuery
        );
      const SUMMARY_MODE = !wantsDetails;
      console.log(`[KnowledgeAgent] Mode: ${SUMMARY_MODE ? "SUMMARY" : "DETAILS"}`);

      // Response mode will be determined after unit selection
      let mode: "internal_summary" | "blended" | "general_with_disclosure" = "internal_summary";

      // (1) Build working set
      // Use raw structured results (with full metadata) for unit normalization
      // Fall back to sources only if structured results unavailable
      const structured = (searchResult.metadata as any)?.results as any[] | undefined;
      const items = (
        (structured && structured.length > 0 ? structured : searchResult.sources || []) as any[]
      ).map((s: any, i: number) => ({
        ...s,
        score: Number.isFinite(s.score) ? s.score : 0,
        _rank: i,
      }));

      // (2) UNIT NORMALIZATION - Group by thread/page for summary mode
      type Unit = {
        id: string;
        source: "Slack" | "Notion";
        title: string;
        snippet: string;
        permalink: string;
        score: number;
        timestamp?: number;
        channel_name?: string;
        items: typeof items;
      };

      let units: Unit[] = [];

      if (SUMMARY_MODE) {
        console.log(`[KnowledgeAgent] Normalizing ${items.length} items into units...`);

        // DEBUG: Log first item structure to see what fields we have
        if (items.length > 0) {
          console.log(`[KnowledgeAgent] First item fields:`, Object.keys(items[0]));
          console.log(
            `[KnowledgeAgent] First item sample:`,
            JSON.stringify(items[0]).slice(0, 300)
          );
        }

        // Group Slack by thread (parent ts + channel), Notion by page ID
        const slackThreads = new Map<string, typeof items>();
        const notionPages = new Map<string, typeof items>();

        for (const item of items) {
          // FIXED: Use actual field names from search results (messageUrl, pageUrl)
          const url =
            item.messageUrl || item.pageUrl || item.url || item.permalink || item.link || "";

          // FIX C: Improved URL detection for Slack and Notion
          const isSlack = /(^|\.)(slack\.com)\b/.test(url);
          const isNotion = /notion\.(so|site)\b/.test(url);

          if (isSlack) {
            // FIXED: Use camelCase field names (channelName, threadTs)
            const threadKey = `${item.channelId || item.channelName || "unknown"}_${item.threadTs || item.messageTs || item.id}`;
            if (!slackThreads.has(threadKey)) slackThreads.set(threadKey, []);
            slackThreads.get(threadKey)!.push(item);
          } else if (isNotion) {
            // Group by page ID
            const pageKey = item.page_id || item.id || url;
            if (!notionPages.has(pageKey)) notionPages.set(pageKey, []);
            notionPages.get(pageKey)!.push(item);
          } else {
            // Unknown source - treat as individual unit
            units.push({
              id: item.id || `unknown_${units.length}`,
              source: "Slack",
              title: item.title || item.name || "Unknown",
              snippet: (item.snippet || item.text || item.content || "").slice(0, 200),
              permalink: url,
              score: item.score,
              timestamp: item.timestamp,
              items: [item],
            });
          }
        }

        // Convert Slack threads to units
        for (const [threadKey, threadItems] of slackThreads) {
          const firstItem = threadItems[0];
          const avgScore = threadItems.reduce((sum, i) => sum + i.score, 0) / threadItems.length;

          units.push({
            id: threadKey,
            source: "Slack",
            title:
              firstItem.title || firstItem.name || `#${firstItem.channelName || "channel"} thread`,
            snippet: (firstItem.snippet || firstItem.text || firstItem.content || "").slice(0, 200),
            permalink:
              firstItem.messageUrl || firstItem.url || firstItem.permalink || firstItem.link || "#",
            score: Math.max(avgScore, ...threadItems.map((i) => i.score)), // Use max score from thread
            timestamp: firstItem.timestamp,
            channel_name: firstItem.channelName,
            items: threadItems,
          });
        }

        // Convert Notion pages to units
        for (const [pageKey, pageItems] of notionPages) {
          const firstItem = pageItems[0];
          const avgScore = pageItems.reduce((sum, i) => sum + i.score, 0) / pageItems.length;

          units.push({
            id: pageKey,
            source: "Notion",
            title: firstItem.pageTitle || firstItem.title || firstItem.name || "Notion Page",
            snippet: (firstItem.snippet || firstItem.text || firstItem.content || "").slice(0, 200),
            permalink:
              firstItem.pageUrl || firstItem.url || firstItem.permalink || firstItem.link || "#",
            score: Math.max(avgScore, ...pageItems.map((i) => i.score)),
            timestamp: firstItem.timestamp,
            items: pageItems,
          });
        }

        console.log(
          `[KnowledgeAgent] Created ${units.length} units (${slackThreads.size} Slack threads, ${notionPages.size} Notion pages)`
        );
      }

      let relevant: typeof items;
      let sorted: typeof items;
      let summaryUnits: Unit[] = []; // CRITICAL FIX: Declare outside block so it's accessible later

      if (SUMMARY_MODE && units.length > 0) {
        // SUMMARY MODE: Select top N diverse units for LLM review
        // We send MORE units (12 instead of 5) and let the AI decide what's relevant
        // Semantic scores are often too weak/noisy to fully trust, so we give the LLM
        // a broader context and let it use semantic understanding to pick what matters
        console.log(`[KnowledgeAgent] Summary mode - selecting top units for LLM review...`);

        // Helper: Build summary units (top N, deduplicated)
        const buildSummaryUnits = (unitList: Unit[], max = 12): Unit[] => {
          const seen = new Set<string>();
          return unitList
            .slice()
            .sort((a, b) => b.score - a.score)
            .filter((u) => {
              const key = u.permalink;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .slice(0, max);
        };

        summaryUnits = buildSummaryUnits(units, 12); // Send more units, let AI decide relevance

        // FIX A: Second-chance search if too thin (<2 units)
        if (summaryUnits.length < 2) {
          console.log(
            `[KnowledgeAgent] Too few units (${summaryUnits.length}), trying second-chance keyword search...`
          );

          try {
            const fallbackQuery = userQuery.replace(/[^\w\s-]/g, " ");
            const fallback = await this.searchKnowledgeTool.execute(
              { query: fallbackQuery, topK: 60 },
              context
            );

            if (fallback.sources && fallback.sources.length > 0) {
              // Rebuild units from fallback
              const fbItems = (fallback.sources as any[]).map((s: any, i: number) => ({
                ...s,
                score: Number.isFinite(s.score) ? s.score : 0,
                _rank: i,
              }));

              // Re-normalize (same logic as before)
              const fbUnits: Unit[] = [];
              const fbSlackThreads = new Map<string, typeof fbItems>();
              const fbNotionPages = new Map<string, typeof fbItems>();

              for (const item of fbItems) {
                // FIXED: Use actual field names (messageUrl, pageUrl, channelName, threadTs)
                const url =
                  item.messageUrl || item.pageUrl || item.url || item.permalink || item.link || "";
                const isSlack = /(^|\.)(slack\.com)\b/.test(url);
                const isNotion = /notion\.(so|site)\b/.test(url);

                if (isSlack) {
                  const threadKey = `${item.channelId || item.channelName || "unknown"}_${item.threadTs || item.messageTs || item.id}`;
                  if (!fbSlackThreads.has(threadKey)) fbSlackThreads.set(threadKey, []);
                  fbSlackThreads.get(threadKey)!.push(item);
                } else if (isNotion) {
                  const pageKey = item.page_id || item.id || url;
                  if (!fbNotionPages.has(pageKey)) fbNotionPages.set(pageKey, []);
                  fbNotionPages.get(pageKey)!.push(item);
                }
              }

              // Build units from fallback threads/pages
              for (const [threadKey, threadItems] of fbSlackThreads) {
                const firstItem = threadItems[0];
                const avgScore =
                  threadItems.reduce((sum, it) => sum + it.score, 0) / threadItems.length;
                fbUnits.push({
                  id: threadKey,
                  source: "Slack",
                  title: firstItem.title || firstItem.name || "Slack Thread",
                  snippet: (firstItem.snippet || firstItem.text || firstItem.content || "").slice(
                    0,
                    200
                  ),
                  permalink:
                    firstItem.messageUrl ||
                    firstItem.url ||
                    firstItem.permalink ||
                    firstItem.link ||
                    "#",
                  score: Math.max(avgScore, ...threadItems.map((i) => i.score)),
                  timestamp: firstItem.timestamp,
                  channel_name: firstItem.channelName,
                  items: threadItems,
                });
              }

              for (const [pageKey, pageItems] of fbNotionPages) {
                const firstItem = pageItems[0];
                const avgScore =
                  pageItems.reduce((sum, it) => sum + it.score, 0) / pageItems.length;
                fbUnits.push({
                  id: pageKey,
                  source: "Notion",
                  title: firstItem.pageTitle || firstItem.title || firstItem.name || "Notion Page",
                  snippet: (firstItem.snippet || firstItem.text || firstItem.content || "").slice(
                    0,
                    200
                  ),
                  permalink:
                    firstItem.pageUrl ||
                    firstItem.url ||
                    firstItem.permalink ||
                    firstItem.link ||
                    "#",
                  score: Math.max(avgScore, ...pageItems.map((i) => i.score)),
                  timestamp: firstItem.timestamp,
                  items: pageItems,
                });
              }

              const fbSummary = buildSummaryUnits(fbUnits, 12);

              if (fbSummary.length > summaryUnits.length) {
                console.log(
                  `[KnowledgeAgent] Second-chance found ${fbSummary.length} units (better than ${summaryUnits.length}), using fallback`
                );
                searchResult = fallback;
                units = fbUnits;
                summaryUnits = fbSummary;
              }
            }
          } catch (err) {
            console.warn("[KnowledgeAgent] Second-chance search failed:", err);
          }
        }

        console.log(`[KnowledgeAgent] Selected ${summaryUnits.length} units for summary`);
        console.log(`[Units] total=${units.length}, summaryUnits=${summaryUnits.length}`);
        if (summaryUnits.length > 0) {
          console.table(
            summaryUnits.map((u) => ({
              src: u.source,
              score: u.score.toFixed(3),
              ch: u.channel_name || "N/A",
              url: u.permalink.slice(0, 60),
            }))
          );
        }

        // RESPONSE MODE DETECTION (FIX D: Unit count only, no score thresholds)
        // Always search first, then decide how to present based on evidence strength
        if (summaryUnits.length >= 2) {
          mode = "internal_summary";
          console.log(`[KnowledgeAgent] Mode: INTERNAL_SUMMARY (${summaryUnits.length} units)`);
        } else if (summaryUnits.length === 1) {
          mode = "blended";
          console.log(
            `[KnowledgeAgent] Mode: BLENDED (1 unit, score: ${summaryUnits[0].score.toFixed(3)})`
          );
        } else {
          mode = "general_with_disclosure";
          console.log(`[KnowledgeAgent] Mode: GENERAL_WITH_DISCLOSURE (0 units)`);
        }

        // GENERAL_WITH_DISCLOSURE: Searched but found little/nothing - provide general answer with disclosure
        if (mode === "general_with_disclosure") {
          const possibleMatches = summaryUnits.slice(0, 2);

          // Build search disclosure
          let searchDisclosure = "I searched our internal knowledge base (Slack and Notion) ";
          if (possibleMatches.length > 0) {
            const topics = possibleMatches.map((u) => `#${u.channel_name || u.source}`).join(", ");
            searchDisclosure += `and found some loosely related discussions in ${topics}, but no direct documentation on this topic.`;
          } else {
            searchDisclosure += "but didn't find any internal documentation on this topic.";
          }

          // Provide general answer with disclosure + expert handoff
          const generalWithDisclosurePrompt = `You are Mitable AI's assistant. 

IMPORTANT: Start your response with this EXACT disclosure:
"${searchDisclosure}"

Then provide a concise, helpful general answer about: "${userQuery}"

End with: "Would you like me to connect you with someone from the team who might know more?"

Format:
1. Disclosure (required, use exact text above)
2. General answer (2-3 paragraphs, factual and helpful)
3. Expert handoff offer (required)

Be helpful but honest about the knowledge gap.`;

          try {
            const stream = await this.groq.chat.completions.create({
              model: config.groq.chatModel,
              messages: [
                { role: "system", content: generalWithDisclosurePrompt },
                { role: "user", content: userQuery },
              ],
              temperature: 0.3,
              max_tokens: 500,
              stream: true,
              tool_choice: "none" as any, // CRITICAL: Prevent model from calling tools
            });

            let generalAnswer = "";
            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                generalAnswer += content;
                yield { type: "chunk", content };
              }
            }

            // Append any loosely related sources if we have them
            if (possibleMatches.length > 0) {
              const sourceSection =
                "\n\n**Loosely related discussions:**\n" +
                possibleMatches
                  .map((u) => `- ${u.title} ([${u.source}](${u.permalink}))`)
                  .join("\n");
              generalAnswer += sourceSection;
              yield { type: "chunk", content: sourceSection };
            }

            yield { type: "complete", messageType: "text", content: generalAnswer };
            return;
          } catch (error) {
            console.error("[KnowledgeAgent] General-with-disclosure failed:", error);
            // Fall through to normal path
          }
        }

        // Build relevant from selected units' items (cap to prevent token overflow)
        relevant = summaryUnits.flatMap((u) => u.items.slice(0, 3)); // Max 3 items per unit

        // Build compact rollup for LLM context
        const rollup = [
          "[SUMMARY ROLLUP - Key Sources]",
          ...summaryUnits.map((u) => {
            const date = u.timestamp ? new Date(u.timestamp * 1000).toISOString().slice(0, 10) : "";
            return `• (${u.source}) ${u.title}${date ? " — " + date : ""}\n  ${u.snippet}`;
          }),
          "[/SUMMARY ROLLUP]",
          "",
        ].join("\n");

        // Build minimal context (just snippets, not full content) to prevent token overflow
        const minimalContext = summaryUnits
          .map((u) => {
            const date = u.timestamp ? new Date(u.timestamp * 1000).toISOString().slice(0, 10) : "";
            return `[${u.source}] ${u.title}${date ? ` (${date})` : ""}\n${u.snippet}\n`;
          })
          .join("\n---\n\n");

        // Replace search content with compact version
        searchResult.content = rollup + "\n\n" + minimalContext;

        // Update sources to reflect selected units (DEDUPED)
        const seenUrls = new Set<string>();
        searchResult.sources = summaryUnits
          .filter((u) => {
            if (seenUrls.has(u.permalink)) return false;
            seenUrls.add(u.permalink);
            return true;
          })
          .map((u) => ({
            title: u.source === "Slack" ? `#${u.channel_name || "channel"} — ${u.title}` : u.title,
            url: u.permalink,
            snippet: u.snippet,
            score: u.score,
          }));
      } else if (isTemporal) {
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

      // (3) CONFIDENCE SCORING - User-focused response strategy
      // Calculate average relevance score to determine confidence level
      const avgScore =
        relevant.length > 0
          ? relevant.reduce((sum, r) => sum + (r.score || 0), 0) / relevant.length
          : 0;

      // Adjust confidence based on mode and evidence
      let confidence: "high" | "medium" | "low";

      if (SUMMARY_MODE && units.length > 0) {
        // In summary mode with units, be more confident (we selected top units already)
        // Don't block summaries that have evidence
        const hasHighConfidenceUnits = units.some((u) => u.score >= 0.6);
        const hasManyUnits = units.length >= 3;
        const hasDecentEvidence = units.length >= 2;

        if (hasHighConfidenceUnits || hasManyUnits) {
          confidence = "high";
        } else if (hasDecentEvidence || avgScore >= 0.35) {
          confidence = "high"; // Still high in summary mode if we have 2+ units
        } else {
          confidence = "medium";
        }
      } else {
        // Original confidence logic for details mode
        const hasStrongEvidence = relevant.length >= 8 && avgScore >= 0.3;
        const hasTemporalEvidence = isTemporal && relevant.length >= 5 && avgScore >= 0.28;

        if (avgScore >= 0.45 || hasStrongEvidence || hasTemporalEvidence) {
          confidence = "high";
        } else if (avgScore >= 0.28) {
          confidence = "medium";
        } else {
          confidence = "low";
        }
      }

      console.log(
        `[KnowledgeAgent] Confidence: ${confidence} (avg score: ${avgScore.toFixed(3)}, items: ${relevant.length}, units: ${units.length}, mode: ${SUMMARY_MODE ? "SUMMARY" : "DETAILS"})`
      );

      // FIX F: Don't let low confidence block summaries when we have units
      if (confidence === "low" && SUMMARY_MODE && units.length > 0) {
        console.log(
          "[KnowledgeAgent] Low confidence but have units in SUMMARY mode - upgrading to medium"
        );
        confidence = "medium";
      }

      // LOW CONFIDENCE: Provide context with caveat instead of just links
      if (confidence === "low") {
        console.warn("[KnowledgeAgent] Low confidence - providing cautious response");

        // Build contextual response with sources
        const possibleMatches = (searchResult.sources || []).slice(0, 5);

        if (possibleMatches.length > 0) {
          // Extract some context from the sources
          const contextSnippets = possibleMatches
            .map((s: any, i: number) => {
              const title = s.title || "Untitled";
              const snippet = s.snippet || "";
              const url = s.url || "#";
              const platform = url.includes("slack.com")
                ? "Slack"
                : url.includes("notion.so")
                  ? "Notion"
                  : "Source";

              // Show first snippet with more detail, rest as links
              if (i === 0 && snippet) {
                return `**${title}** mentioned: "${snippet}" ([${platform}](${url}))`;
              }
              return `- ${title} ([${platform}](${url}))`;
            })
            .join("\n");

          const neutralContent = [
            "I'm not fully confident about the exact answer, but I found some related discussions:",
            "",
            contextSnippets,
          ].join("\n");

          yield {
            type: "chunk",
            content: neutralContent,
          };

          yield {
            type: "complete",
            messageType: "text",
            content: neutralContent,
            sources: possibleMatches,
          };

          return; // Stop here; no full synthesis
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

      // (4) Validate meaningful context exists before synthesis
      // Even if confidence score is high, check if we actually have content
      const hasValidSources = searchResult.sources && searchResult.sources.length > 0;
      const hasValidContent = searchResult.content && searchResult.content.trim().length > 100;

      if (!hasValidSources || !hasValidContent) {
        console.log("[KnowledgeAgent] No meaningful context found despite confidence score");

        // Extract the main topic from the query for a natural response
        const topicMatch = userQuery.match(/about (?:the )?([\w\s-]+?)(?:\?|$)/i);
        const topic = topicMatch ? topicMatch[1].trim() : "that topic";

        const noInfoResponse = `I don't have any information about ${topic} in the knowledge base.\n\nWould you like me to connect you with a colleague who might know more?`;

        yield {
          type: "chunk",
          content: noInfoResponse,
        };

        yield {
          type: "complete",
          messageType: "text",
          content: noInfoResponse,
        };

        return;
      }

      // (5) Initial source cap based on confidence level
      // High confidence: up to 5 candidates (will be quality-filtered later)
      // Medium confidence: up to 5 sources (uses inline citations)
      // Note: Final source count determined by quality filtering, not hard limits
      const maxSources = confidence === "high" ? 5 : 5;

      if (searchResult.sources && searchResult.sources.length > maxSources) {
        searchResult.sources = searchResult.sources.slice(0, maxSources);
      }
      console.log(
        `[KnowledgeAgent] Confidence: ${confidence}, initial source candidates: ${searchResult.sources?.length || 0}`
      );

      // Extract actual year from the data for temporal queries
      let dataYear: number | undefined;
      if (isTemporal && relevant.length > 0) {
        const firstTimestamp = relevant[0].timestamp || 0;
        if (firstTimestamp > 0) {
          dataYear = new Date(firstTimestamp * 1000).getFullYear();
          console.log(`[KnowledgeAgent] Data year detected: ${dataYear}`);
        }
      }

      // Step 2: Synthesize search results using Groq

      // Get current date context for LLM
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentDate = now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Adjust system prompt for temporal queries
      let systemPrompt = KNOWLEDGE_SYNTHESIS_PROMPT;
      systemPrompt += `\n\n**CURRENT DATE CONTEXT:** Today is ${currentDate}. Always assume recent time references (like "October" in November) refer to THIS YEAR (${currentYear}), not previous years.`;

      // RESPONSE STRATEGY: Mode-based prompts (ChatGPT's approach)
      if (mode === "internal_summary") {
        // INTERNAL_SUMMARY MODE: Strong evidence - full synthesis from internal docs
        systemPrompt += `\n\n**INTERNAL SUMMARY MODE - SYNTHESIZE FROM WORKSPACE:**

**Your task:** Read the context provided, identify what's ACTUALLY relevant to the query, and synthesize into 3-5 concise points.

**IMPORTANT:** You're seeing multiple sources/threads. Some may not be relevant. Focus ONLY on content that directly answers the question. Use your semantic understanding to filter out noise.

**Format:**
[Opening insight sentence]

Key points:
- **Theme 1**: [synthesis]
- **Theme 2**: [synthesis]
- **Theme 3**: [synthesis]

**Example themes:**
- **UI/UX**: Accordion workflow separated from chat, fixing rendering bugs
- **Performance**: Switched to Grok model, delivering 2-3× faster responses
- **RAG improvements**: Ongoing work on search and backend enhancements for production rollout

**CRITICAL:** DO NOT include a "Sources" section. Sources will be appended programmatically. Focus ONLY on synthesis.`;
      } else if (mode === "blended") {
        // BLENDED MODE: Some evidence - general answer + workspace context
        systemPrompt += `\n\n**BLENDED MODE - GENERAL + WORKSPACE CONTEXT:**

You have SOME internal evidence but not comprehensive coverage.

**Response format:**
1. Start with a brief general answer (2-4 sentences) about the topic
2. Then add: "In our workspace, I found..."
3. 1-2 bullets highlighting what WAS found internally

**Example:**
Deploying a new version typically follows a CI/CD workflow: merge to main, run tests, build artifacts, deploy to staging, then production with monitoring.

In our workspace, I found:
- Discussion of our current deployment using Helm charts and Kubernetes manifests
- Mention of smoke-testing procedures before production rollout

**CRITICAL:** DO NOT include a "Sources" section. Sources will be appended programmatically.`;
      } else if (SUMMARY_MODE) {
        // Fallback summary mode (shouldn't hit this with mode detection)
        systemPrompt += `\n\n**SUMMARY MODE - SHORT & INSIGHTFUL:**
**CRITICAL:** DO NOT include sources. They will be appended programmatically.`;
      } else if (confidence === "medium") {
        systemPrompt += `\n\n**MEDIUM CONFIDENCE - THOUGHTFUL SYNTHESIS:**
You have some relevant information but not complete coverage.

**Still SYNTHESIZE, don't just list:**
1. Read the context and identify what you CAN say confidently
2. Provide insights, not just quotes
3. Be transparent about gaps in your knowledge
4. Start with a brief caveat about partial information

Format: "I found some relevant discussions about X. Here's what I can tell you..."

NOT: "I found some discussions. Here's what was mentioned: [quotes]"

- Be honest about limitations
- Synthesize what you found
- Show you're thinking, not just echoing
- Remember: Sources will be appended automatically - don't include them`;
      }

      // TEMPORAL QUERY HANDLING - THEME EXTRACTION
      if (isTemporal && dataYear) {
        if (confidence === "high") {
          systemPrompt += `\n\n**TEMPORAL QUERY - THEME EXTRACTION MODE:**
The user asked about a time period (${dataYear}). DO NOT give a day-by-day breakdown.

Instead, extract 2-4 MAIN THEMES:
1. Identify the PRIMARY FOCUS AREAS from the discussions
2. Write 1-2 sentences per theme
3. Group related events under each theme
4. Example format:
   "October ${dataYear} centered on three main areas:
   
   **Product Development:** The team focused on PII redaction features and Slack integrations, with daily sprint planning.
   
   **Infrastructure:** Discussions around GCP platform access and deployment workflows.
   
   **Roadmap Planning:** Multiple sessions on Q4 feature prioritization."

**CRITICAL: Use ${dataYear} in all dates, not ${dataYear - 1}.**`;
        } else {
          systemPrompt += `\n\n**TEMPORAL QUERY DETECTED:**
The user is asking about what happened during a specific time period (${dataYear}). 
- Use ${dataYear} in all dates
- Organize by themes if possible, or chronologically if needed
- Keep it concise`;
        }
      } else if (isTemporal) {
        systemPrompt += `\n\n**TEMPORAL QUERY DETECTED:**
The user is asking about what happened during a specific time period.
${confidence === "high" ? "Extract main themes rather than listing every event." : "Provide what you found organized by time."}`;
      }

      // SIMPLIFIED: Just pass the search results as context, no tool call simulation
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
          role: "user",
          content: `Search results:\n\n${searchResult.content}`,
        },
      ];

      console.log("[KnowledgeAgent] Calling Groq for synthesis...");
      console.log(
        `[KnowledgeAgent] Strategy: ${confidence.toUpperCase()} confidence, ${isTemporal ? "TEMPORAL" : "NON-TEMPORAL"} query`
      );
      console.log(`[KnowledgeAgent] Context length: ${searchResult.content?.length || 0} chars`);
      console.log(
        `[KnowledgeAgent] Sources being used: ${searchResult.sources?.length || 0} (capped from search results)`
      );
      console.log(`[KnowledgeAgent] Message count: ${messages.length}`);

      let synthesizedContent = "";

      try {
        // Step 3: Stream synthesized response from Groq
        const stream = await this.groq.chat.completions.create({
          model: config.groq.chatModel, // openai/gpt-oss-120b
          messages: messages,
          temperature: config.groq.temperature,
          max_tokens: config.groq.maxTokens,
          stream: true,
          tool_choice: "none" as any, // CRITICAL: Prevent model from calling tools during synthesis
        });

        console.log("[KnowledgeAgent] Groq stream created successfully");

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
      } catch (groqError) {
        console.error("[KnowledgeAgent] Groq synthesis error:", groqError);
        console.log("[KnowledgeAgent] Attempting fallback with simplified prompt...");

        // RETRY with ultra-simple fallback prompt (no preamble, just bullets)
        try {
          const fallbackPrompt =
            "Return 3-5 bullet points summarizing the key information. No preamble, no sources. Format:\n- Point 1\n- Point 2\n- Point 3";
          // SIMPLIFIED: Just pass minimal search results as context
          const fallbackMessages: Groq.Chat.ChatCompletionMessageParam[] = [
            {
              role: "system",
              content: fallbackPrompt,
            },
            {
              role: "user",
              content: userQuery,
            },
            {
              role: "user",
              content: `Search results:\n\n${searchResult.content.slice(0, 2000)}`,
            },
          ];

          const fallbackStream = await this.groq.chat.completions.create({
            model: config.groq.chatModel,
            messages: fallbackMessages,
            temperature: 0.3,
            max_tokens: 500, // Much shorter
            stream: true,
            tool_choice: "none" as any, // CRITICAL: Prevent model from calling tools during fallback
          });

          for await (const chunk of fallbackStream) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
              synthesizedContent += delta.content;
              yield { type: "chunk", content: delta.content };
            }
          }

          console.log("[KnowledgeAgent] Fallback synthesis succeeded");
        } catch (fallbackError) {
          console.error("[KnowledgeAgent] Fallback also failed:", fallbackError);
          const errorMsg =
            "I found relevant information but encountered an issue summarizing it. Please try rephrasing your question or ask for specific details.";
          synthesizedContent = errorMsg;
          yield { type: "chunk", content: errorMsg };
        }
      }

      // Safety check: If no content was streamed, yield fallback
      if (!synthesizedContent || synthesizedContent.trim().length === 0) {
        console.warn("[KnowledgeAgent] No content received from Groq, using fallback");
        const fallback =
          "I found some information, but encountered an issue summarizing it. Please try rephrasing your question.";
        synthesizedContent = fallback;
        yield {
          type: "chunk",
          content: fallback,
        };
      }

      // Step 5: ALWAYS append sources programmatically (don't let LLM generate them)
      // Summary mode: Always append (max 3 sources)
      // Non-summary HIGH confidence: Append sources
      // MEDIUM confidence: Skip (uses inline citations)
      if (SUMMARY_MODE || confidence === "high") {
        console.log(
          `[KnowledgeAgent] Filtering sources by relevance: ${searchResult.sources?.length || 0} candidates`
        );

        if (searchResult.sources && searchResult.sources.length > 0) {
          // DYNAMIC SOURCE FILTERING: Only include highly relevant sources
          // Instead of blindly taking first 3, filter by score/relevance

          // Filter 1: Remove sources with snippet that match low-quality patterns
          const qualityFiltered = searchResult.sources.filter((source: any) => {
            const snippet = (source.snippet || "").toLowerCase();
            const title = (source.title || "").toLowerCase();
            const url = (source.url || "").toLowerCase();

            // Skip generic link shares (common in #cool-resources, #random, etc.)
            const isLikelyLinkShare =
              (snippet.includes("http") && snippet.length < 100) ||
              snippet.match(/^(check out|found this|interesting|fyi|sharing)/i) ||
              title.includes("cool-resources") ||
              title.includes("random");

            // If query asks about "mentioned", "discussed", "said", etc.,
            // deprioritize Notion docs (user wants conversations, not documentation)
            const queryWantsDiscussions =
              /\b(mentioned|discussed|said|talked about|brought up|blockers?)\b/i.test(userQuery);
            const isNotionDoc = url.includes("notion.so") || url.includes("notion.site");
            const shouldDeprioritizeNotion = queryWantsDiscussions && isNotionDoc;

            return !isLikelyLinkShare && !shouldDeprioritizeNotion;
          });

          // Filter 2: If we have scores in metadata, use them
          // Take top sources by relevance, but cap at 3 max
          const maxSources = 3;
          const minSourcesToShow = 1; // Always show at least 1 source

          // Take best available sources (already ranked by search)
          const sourcesToShow = qualityFiltered.slice(0, maxSources);

          // Ensure we have at least 1 source (fallback to original if filters too aggressive)
          const finalSources =
            sourcesToShow.length > 0
              ? sourcesToShow
              : searchResult.sources.slice(0, minSourcesToShow);

          console.log(
            `[KnowledgeAgent] Source filtering: ${searchResult.sources.length} → ${qualityFiltered.length} quality → ${finalSources.length} final`
          );

          let sourcesText = "\n\n**Sources:**\n";

          // Format sources according to exact specification
          for (const source of finalSources) {
            const title = source.title || "Unknown";
            const url = source.url || "#";

            // Determine platform from title or URL
            let platform = "Slack";
            if (url.includes("notion.so")) {
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
        console.log(
          `[KnowledgeAgent] Skipping programmatic sources (${confidence} confidence uses inline citations)`
        );
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
