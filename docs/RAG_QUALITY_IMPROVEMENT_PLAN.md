# RAG Quality Improvement Plan

**Branch:** `aurel/feature/rag_improvement`  
**Goal:** Increase RAG output quality through better context expansion and AI personality  
**Date:** November 4, 2025

---

## Current Implementation Analysis

### ✅ What's Working Well

1. **Hybrid Search (Pinecone + PostgreSQL)**
   - Semantic search via Pinecone vector similarity
   - Keyword search via PostgreSQL full-text search (FTS)
   - Reciprocal Rank Fusion (RRF) merging with 70/30 semantic/keyword weighting
   - Smart recency boost (1.5x for last 7 days, 1.2x for last 30 days)

2. **Trust-Based Ranking**
   - Intent detection for intelligent source boosting
   - Source-type multipliers (codebase, documents, chat)
   - Keyword matching in titles (2x boost)
   - Explicit source type matching (5x boost)

3. **Current Parameters**

   ```typescript
   // Knowledge Agent
   topK: 10 (max: 15)
   fetchLimit: 50 // 10x topK for trust ranking

   // Search Service
   topK: 20 (default)
   semanticSearch: topK * 2 = 40
   keywordSearch: topK * 2 = 40
   ```

### ⚠️ Issues Identified

1. **Limited Context Window**
   - Only retrieving top 10 results (after ranking 50)
   - No surrounding chunks or parent-child relationships
   - Loses context at chunk boundaries

2. **Rigid System Prompt**
   - Very prescriptive and formal
   - Overemphasizes "DO NOT" instructions
   - Lacks personality and warmth
   - Focuses on citation formatting, not extrapolation

3. **No Context Expansion**
   - Retrieves isolated chunks without surrounding context
   - Doesn't fetch parent documents or sibling chunks
   - Misses important information adjacent to matches

---

## Research Findings: Industry Best Practices

### 1. Context Expansion Strategies

#### **Sliding Window Chunking** (RECOMMENDED)

- **What:** Overlapping chunks (e.g., 500 tokens with 100-token overlap)
- **Benefits:**
  - Preserves relationships between ideas split across chunks
  - Ensures context continuity at boundaries
  - Reduces information loss from splitting
- **Trade-offs:** 20-30% storage increase (acceptable for quality gain)

#### **Hierarchical (Parent-Child) Chunking** (RECOMMENDED)

- **What:** Store small chunks for retrieval, large chunks for context
- **Example:**

  ```
  Parent (Document): Full page or section (2000 tokens)
  ├─ Child 1: Paragraph 1 (500 tokens) ← Retrieved
  ├─ Child 2: Paragraph 2 (500 tokens) ← Retrieved
  └─ Child 3: Paragraph 3 (500 tokens)

  When Child 1 matches → Return entire Parent for context
  ```

- **Benefits:**
  - Best of both worlds: precise retrieval + broad context
  - LLM gets full document context to extrapolate
  - Maintains semantic coherence

#### **Retrieve More, Rank Better**

- Current: Fetch 50, rank, return 10
- **Recommended:** Fetch 100, rank, return **15-20**
- Let the LLM read more context and make connections
- Modern LLMs (GPT-4) can handle 128k context windows

### 2. AI Personality & Formatting Best Practices

#### **ChatGPT-Style Formatting**

- **Bold important terms** and **key dates** automatically
- Use markdown for structure: headers, bullets, code blocks
- Break up long responses with visual hierarchy
- Example transformation:

  ```
  Before:
  "The PRD was updated on October 15, 2024..."

  After:
  "The **PRD** was last updated on **October 15, 2024** and includes..."
  ```

#### **Conversational Tone** (from research)

```
You are a helpful colleague who's been at the company for years.
Think of yourself as the friendly expert everyone goes to for advice.

Your personality:
- **Warm and approachable** - like talking to a mentor over coffee
- **Enthusiastic about helping** - you love sharing knowledge
- **Direct but kind** - no corporate jargon, just clear explanations
- **Insightful** - you connect dots and provide context beyond the question

When answering:
✅ Extrapolate insights from the data
✅ Make connections between pieces of information
✅ Highlight important dates, people, decisions with **bold**
✅ Use bullet points and headers for clarity
✅ Add "Here's what's interesting..." or "The key thing to know..."
✅ End with "Anything else you'd like to know about this?"

❌ Don't just regurgitate search results
❌ Don't use robotic language like "based on the retrieved information"
❌ Don't over-explain citation formatting
```

---

## Proposed Changes

### Phase 1: Expand Context Window (High Impact, Easy Win)

#### **Change 1: Increase TopK**

```typescript
// apps/backend/src/agents/knowledge.agent.ts
const searchResult = await this.searchKnowledgeTool.execute(
  {
    query: userQuery,
    topK: 20, // Was: 10 → Now: 20 (2x more context)
  },
  context
);
```

#### **Change 2: Fetch More for Ranking**

```typescript
// apps/backend/src/tools/search-knowledge.tool.ts
const fetchLimit = Math.min(limitedTopK * 15, 100); // Was: 10x → Now: 15x, max 100
```

**Expected Impact:**

- 2x more context for LLM to read and extrapolate from
- Better connection-making between disparate information
- Minimal performance impact (100ms-200ms increase in search time)

### Phase 2: Implement Context Expansion (Medium Effort)

#### **Change 1: Add Surrounding Chunks**

When we retrieve a chunk, also fetch:

- Previous chunk (if exists)
- Next chunk (if exists)
- This gives ±1 chunk context

```typescript
// New method in search.service.ts
private async expandChunkContext(
  results: SearchResult[],
  organizationId: string
): Promise<SearchResult[]> {
  const expandedResults: SearchResult[] = [];

  for (const result of results) {
    // Get sibling chunks (same source document, adjacent chunk_index)
    const siblings = await db
      .select()
      .from(searchContent)
      .where(
        and(
          eq(searchContent.organizationId, organizationId),
          eq(searchContent.source, result.source),
          eq(searchContent.sourceType, result.sourceType),
          // Same parent document
          or(
            eq(searchContent.pageId, result.pageId),
            eq(searchContent.channelId, result.channelId)
          ),
          // Adjacent chunks
          and(
            gte(searchContent.chunkIndex, (result.chunkIndex || 0) - 1),
            lte(searchContent.chunkIndex, (result.chunkIndex || 0) + 1)
          )
        )
      )
      .orderBy(searchContent.chunkIndex);

    // Merge sibling text into expanded context
    const expandedText = siblings.map(s => s.text).join('\n\n');

    expandedResults.push({
      ...result,
      text: expandedText, // Replace with expanded text
      expandedFrom: siblings.length, // Track expansion
    });
  }

  return expandedResults;
}
```

#### **Change 2: Store Parent-Child Metadata**

Add to `search_content` table:

```sql
ALTER TABLE search_content
ADD COLUMN parent_id uuid,
ADD COLUMN parent_summary text;
```

When chunking documents:

- Store full document ID as `parent_id`
- Store 200-char summary as `parent_summary`
- Retrieve children, return parent context

**Expected Impact:**

- LLM gets 3x-5x more context per match
- Better extrapolation from limited matches
- Solves "context boundary" problem

### Phase 3: Improve AI Personality (Low Effort, High Value)

#### **Change: Rewrite Knowledge Synthesis Prompt**

Replace the current rigid prompt with:

```typescript
const KNOWLEDGE_SYNTHESIS_PROMPT = `You are Lorikeet AI - a friendly, knowledgeable colleague helping teammates ramp up at their company.

**Your Personality:**
You're the person everyone loves to ask questions because you:
- Give clear, insightful answers (not just facts)
- Make connections others might miss
- **Bold important terms**, **dates**, and **key decisions**
- Organize thoughts with headers and bullets
- Add context that helps people understand *why* things matter

**How You Respond:**

1. **Read and Connect**
   - Synthesize information from multiple sources
   - Highlight patterns, trends, or important context
   - Extrapolate insights beyond the raw data

2. **Format for Clarity**
   - Use **bold** for: dates, names, key terms, decisions
   - Use bullet points for lists
   - Use headers (##) to organize longer responses
   - Add a "💡 Key Insight" section when relevant

3. **Be Conversational**
   - ✅ "The team shipped **v2.0 on October 15, 2024**. Here's what changed..."
   - ❌ "Based on the retrieved information, the data indicates..."

4. **Citation Style**
   - End with "**Sources:**" section (mandatory)
   - Format: `- #channel - username ([Slack](url))` or `- Document Title ([Notion](url))`
   - Don't cite inline (no mid-sentence source references)

**Example Response:**

"The **Product Requirements Document (PRD)** was last updated on **October 15, 2024** by **Febchuk** and outlines our vision for an AI-powered onboarding platform.

## Key Features
- **RAG-powered search** - hybrid semantic + keyword matching
- **Adaptive learning paths** - personalized to role and progress
- **Real-time sync** - Notion and Slack integration

💡 **Key Insight:** The team shifted from a static wiki to AI-driven discovery after user research showed new hires spent 6+ hours searching for info.

**Next Steps:** They're currently piloting with the engineering team (see #product channel for updates).

**Sources:**
- Mitable AI Business Model ([Notion](https://notion.so/page))
- #product - febchuk ([Slack](https://slack.com/msg))"

**When You Don't Know:**
Be honest: "I don't have information about that in the knowledge base. Let me connect you with **@Expert** who can help."

**Remember:** Your goal is to help people understand, not just retrieve information. Think of yourself as a knowledgeable mentor, not a search engine.`;
```

**Expected Impact:**

- More engaging, human-like responses
- Better use of formatting for readability
- Insights beyond simple fact retrieval
- Matches ChatGPT's conversational style

---

## Implementation Plan

### Week 1: Quick Wins (Phase 1 + 3)

- [ ] Increase topK from 10 → 20
- [ ] Increase fetchLimit from 50 → 100
- [ ] Rewrite system prompt with personality
- [ ] Add bold formatting for dates/names
- [ ] Test with 20 real user queries
- **Expected:** 40-50% quality improvement

### Week 2-3: Context Expansion (Phase 2)

- [ ] Implement surrounding chunk retrieval (+1/-1 chunks)
- [ ] Test context expansion on 50 queries
- [ ] Monitor performance impact
- [ ] A/B test with vs without expansion
- **Expected:** Additional 20-30% quality improvement

### Week 4: Parent-Child (If Needed)

- [ ] Add parent_id to search_content schema
- [ ] Update chunking pipeline to store parent metadata
- [ ] Implement parent-child retrieval
- [ ] Re-run evaluation suite
- **Expected:** Best possible quality (80-90% user satisfaction)

---

## Metrics to Track

### Quality Metrics

- **User satisfaction** - thumbs up/down (track after feedback system)
- **Answer completeness** - does it answer the full question?
- **Context relevance** - are retrieved sources actually used?
- **Extrapolation quality** - does AI make connections?

### Performance Metrics

- **Search latency** - should stay under 500ms
- **Token usage** - more context = more tokens (monitor costs)
- **Cache hit rate** - ensure caching still works

### Success Criteria

- ✅ 70%+ of responses have bold formatting
- ✅ 90%+ include insights beyond raw facts
- ✅ Search latency stays under 1 second
- ✅ Users prefer new responses in A/B test

---

## Technical Debt Notes

### Current Schema Limitations

```typescript
// search_content table doesn't track:
- parent_id (for hierarchical retrieval)
- chunk_overlap (for sliding window)
- sibling_ids (for adjacent chunks)
```

**Recommendation:** Add these columns in Phase 2 migration

### Chunking Pipeline

Current chunking happens in:

- `apps/backend/src/services/vector.service.ts` (Pinecone)
- `apps/backend/src/db/scripts/*` (PostgreSQL sync)

**Need to update both** when implementing overlapping or hierarchical chunks.

---

## References

- [Stack Overflow: Practical RAG Tips (2024)](https://stackoverflow.blog/2024/08/15/practical-tips-for-retrieval-augmented-generation-rag)
- [9 Chunking Strategies for RAG](https://www.nb-data.com/p/9-chunking-strategis-to-improve-rag)
- [Google PAIR: AI Feedback Loops](https://pair.withgoogle.com/guidebook/chapters/feedback-and-controls/design-ai-feedback-loops)
- [OpenAI: Customizing ChatGPT Personality](https://help.openai.com/en/articles/11899719-customizing-your-chatgpt-personality)

---

## Next Steps

**Immediate Actions:**

1. Review this plan with team
2. Get approval for Phase 1 changes (low risk)
3. Create tickets for implementation
4. Set up A/B testing infrastructure

**Questions to Answer:**

- What's acceptable latency increase? (current: ~200ms, target: <1s)
- Cost tolerance for increased tokens? (2x context = ~2x cost)
- Should we add feedback buttons now or later?

**Let's start with Phase 1 - it's a 2-hour change with immediate impact! 🚀**
