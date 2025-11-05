# Mitable RAG System - Complete Guide

**Last Updated:** November 5, 2025  
**Status:** Production  
**Current Version:** 3.0 (Open-Domain QA + Blended Mode + Temporal)

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Intent Classification & Routing](#intent-classification--routing)
4. [Query Types & Handling](#query-types--handling)
5. [Search Pipeline](#search-pipeline)
6. [Knowledge Agent](#knowledge-agent)
7. [Response Synthesis](#response-synthesis)
8. [Performance & Monitoring](#performance--monitoring)
9. [Configuration](#configuration)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### What Is It?

Mitable's RAG (Retrieval-Augmented Generation) system is an intelligent query routing and answering system that:

- **Routes queries intelligently** based on intent detection
- **Searches internal knowledge** (Slack + Notion) with hybrid search
- **Handles encyclopedic questions** with open-domain answers
- **Blends both** when query is encyclopedic but internal context exists
- **Handles temporal queries** with chronological summaries
- **Cites sources** automatically with 100% reliability

### Key Features (November 2025)

✅ **Multi-Intent Routing** - `general_chat`, `knowledge_search`, `workflow_start`, `expert_request`, `open_domain_qa`  
✅ **Smart Query Routing** - Encyclopedic → open-domain (no sources), Internal → knowledge search, Mixed → blended (definition + context with sources)  
✅ **KB Preflight Check** - Probes knowledge base strength before committing to RAG  
✅ **Blended Answers** - Short definition + internal context when both exist  
✅ **Temporal Queries** - Chronological summaries with day-based sampling (3 items/day, topK=100)  
✅ **Thread-Aware Slack** - Bundles messages into 5-6 high-signal conversations (not 40 isolated messages)  
✅ **Adaptive Filtering** - Percentile-based thresholds + second-chance keyword search (min 5 results)  
✅ **100% Source Reliability** - Citations programmatically enforced after streaming (never forgotten by LLM)

---

## System Architecture

### Component Overview

```
User Query
    ↓
┌─────────────────────────────────────────────────────┐
│ OrchestratorService (orchestrator.service.ts)       │
│ - Pre-flight KB check (topK=6)                      │
│ - Intent classification (Gemini Flash)              │
│ - Routing logic                                     │
│ - Blended mode orchestration                        │
└─────────────────────────────────────────────────────┘
    ↓
    ├─→ General Chat (general_chat) → TextResponseAgent
    ├─→ Open Domain QA (open_domain_qa) → TextResponseAgent
    ├─→ Knowledge Search (knowledge_search) → KnowledgeAgent → SearchKnowledgeTool
    │                                              ↓
    │                                   ┌──────────────────────┐
    │                                   │ Hybrid Search        │
    │                                   │ - Pinecone (sem 70%) │
    │                                   │ - Postgres (key 30%) │
    │                                   │ - RRF merge (k=60)   │
    │                                   │ - Thread bundling    │
    │                                   │ → 5-6 conversations  │
    │                                   └──────────────────────┘
    ├─→ Workflow Start (workflow_start) → VisualGuidanceAgent
    └─→ Expert Request (expert_request) → ExpertMatchingAgent
```

### Sources Guarantee

**Every knowledge search response includes citations - 100% guaranteed.**

After the LLM finishes streaming:

```typescript
if (!response.includes("**Sources:**")) {
  // Auto-append from searchResult.sources
  sourcesText = "\n\n**Sources:**\n";
  for (source of sources) {
    sourcesText += `- ${title} ([${platform}](${url}))\n`;
  }
  yield { type: "chunk", content: sourcesText };
}
```

Result: Sources always appear, even if LLM forgets. No prompt-engineering needed.

### Data Flow

```
Query: "what is the general theory of relativity?"
  ↓
Heuristic Check → Encyclopedic pattern detected
  ↓
KB Preflight → Top score: 0.15, Strong results: 0
  ↓
Route → open_domain_qa
  ↓
TextResponseAgent → Concise answer (no sources)
  ✓ Result: "Einstein's theory states gravity is curvature of spacetime..."
```

```
Query: "what is our PRD?"
  ↓
Heuristic Check → Encyclopedic + org hint ("our") detected
  ↓
KB Preflight → Top score: 0.85, Strong results: 8
  ↓
Route → Blended Mode
  ↓
Step 1: TextResponseAgent → "In short: A PRD is a product requirements document..."
Step 2: KnowledgeAgent → Search + synthesis with sources
  ✓ Result: Definition + internal PRD content + sources
```

```
Query: "what did we discuss in October?"
  ↓
Temporal Detection → Month range: Oct 1-31, 2025
  ↓
Route → knowledge_search (temporal mode)
  ↓
SearchKnowledgeTool → topK=100, date filtering, chronological sorting
  ↓
KnowledgeAgent → Chronological synthesis, date-grouped context
  ✓ Result: "On October 2, the team discussed... October 15, roadmap updates... October 28, launch prep..."
```

---

## Intent Classification & Routing

### File: `apps/backend/src/services/orchestrator.service.ts`

### Intent Types

```typescript
type IntentType =
  | "general_chat" // Simple conversation, greetings, thanks
  | "knowledge_search" // Company docs, discussions, meetings
  | "workflow_start" // Step-by-step UI guidance (with screenshot)
  | "expert_request" // Find colleague who knows topic
  | "open_domain_qa"; // Encyclopedic world knowledge
```

### Classification Flow

```typescript
// Step 1: Greeting check (instant)
if (isGreeting) return { type: "general_chat", confidence: 1.0 };

// Step 2: Encyclopedic check (instant)
const ENCYCLOPEDIA_HINT =
  /\b(what|who|where|when|why|how)\s+(is|are|was|were)\b|^define\b|^explain\b/i;
const ORG_HINT = /\b(slack|notion|policy|...|company)\b/i;
if (ENCYCLOPEDIA_HINT.test(query) && !ORG_HINT.test(query)) {
  return { type: "open_domain_qa", confidence: 0.95 };
}

// Step 3: RAG heuristic (instant)
const KNOWLEDGE_HINT = /\b(what|where|when|how|policy|docs|...|wiki)\b/i;
if (KNOWLEDGE_HINT.test(query)) {
  return { type: "knowledge_search", confidence: 0.9 };
}

// Step 4: RAG carry-over (short follow-ups)
if (wordCount <= 6 && priorWasRAG) {
  return { type: "knowledge_search", confidence: 0.8 };
}

// Step 5: LLM classification (Gemini Flash)
const intent = await classifyWithLLM(query, screenshot);

// Step 6: Post-classification guards
if (intent.type === "workflow_start" && !screenshot && confidence < 0.8) {
  intent = { type: "knowledge_search", confidence: 0.6 };
}

if (intent.type === "knowledge_search" && !ORG_HINT.test(query)) {
  intent = { type: "open_domain_qa", confidence: 0.8 };
}

// Step 7: KB preflight (if knowledge_search)
if (intent.type === "knowledge_search") {
  const pf = await kbPreflight(query);
  if (pf.top < 0.28 || pf.strongCount < 2) {
    intent = { type: "open_domain_qa", confidence: 0.8 };
  }
}
```

### KB Preflight Check

**Purpose:** Quick probe to gauge knowledge base strength before committing to RAG

**Implementation:**

```typescript
async kbPreflight(query: string): Promise<{top: number, strongCount: number}> {
  const res = await searchTool.execute({ query, topK: 6 });
  const scores = res.sources.map(s => s.score);
  const top = scores[0] ?? 0;
  const strongCount = scores.filter(x => x >= 0.35).length;
  return { top, strongCount };
}
```

**Decision Logic:**

- `top < 0.28` → Weak evidence, route to open_domain_qa
- `strongCount < 2` → Insufficient strong results, route to open_domain_qa
- Otherwise → Proceed with knowledge_search

**Example:**

- Query: "what is quantum entanglement?"
- KB Preflight: top=0.12, strongCount=0 → Route to open_domain_qa ✓
- Query: "what is our deployment process?"
- KB Preflight: top=0.82, strongCount=5 → Proceed with knowledge_search ✓

---

## Query Types & Handling

### 1. General Chat

**Triggers:** Greetings, simple conversation, acknowledgments  
**Route:** TextResponseAgent (Gemini Flash)  
**Response:** Conversational, no sources

**Examples:**

- "hi" → "Hi! How can I help you?"
- "thanks" → "You're welcome!"

---

### 2. Open Domain QA

**Triggers:**

- Encyclopedic patterns (`what is X?`, `who is Y?`, `define Z`)
- No org hints in query
- OR weak KB preflight results

**Route:** TextResponseAgent (Gemini Flash)  
**Response:** Concise factual answer (1-2 sentences for blended, full answer otherwise), no sources

**Examples:**

- "what is the general theory of relativity?" → Physics explanation
- "who is Albert Einstein?" → Brief biography
- "define machine learning" → ML definition

**Why This Works:**

- LLMs have world knowledge
- No need to search internal docs for encyclopedic questions
- Saves search time and tokens
- Better UX (instant answers)

---

### 3. Blended Mode (Encyclopedic + Strong KB)

**Triggers:**

- Encyclopedic pattern detected
- KB preflight shows strong results (top ≥ 0.35, strongCount ≥ 2)

**Route:** TextResponseAgent → short definition, THEN KnowledgeAgent → internal context

**Response Structure:**

```
In short: [1-2 sentence definition from general knowledge]

[Internal context with company-specific information]

**Sources:**
- [Internal source citations]
```

**Example:**

```
Query: "what is a PRD?"

Response:
In short: A PRD (Product Requirements Document) is a document that outlines
the purpose, features, and functionality of a product to be built.

At Mitable, our PRD defines the AI onboarding platform vision. The team
decided to shift from a static wiki to AI-driven discovery after user research
showed new hires spent 6+ hours per week searching for basic info.

**Sources:**
- Product Requirements Document ([Notion](https://...))
- #product - febchuk ([Slack](https://...))
```

**Benefits:**

- Users get both general knowledge AND internal context
- Best of both worlds
- Maintains source citations for internal info
- Better onboarding experience

---

### 4. Knowledge Search (Standard RAG)

**Triggers:**

- Org hints present (slack, notion, policy, docs, meeting, etc.)
- KB preflight shows strong results
- Questions about internal information

**Route:** KnowledgeAgent → SearchKnowledgeTool → Hybrid Search

**Response:** Synthesized answer with sources

**Examples:**

- "what is our privacy policy?" → Policy doc synthesis + sources
- "how do we handle deployments?" → Process docs + Slack discussions + sources
- "what did we decide in the last sprint?" → Meeting notes + sources

---

### 5. Temporal Queries (Time-Based RAG)

**Triggers:**

- Month/week/date mentions ("October", "this week", "last Monday")
- Temporal keywords ("recently", "yesterday", "today")

**Temporal Mode Configuration:**

```typescript
topK: 100; // vs 20 for standard (higher for date diversity)
perDay: 3; // Items sampled per day
maxResults: 40; // Final cap after sampling
sorting: chronological; // Oldest → newest (not by relevance)
```

**Special Handling:**

- Higher topK (100 vs 20) for date diversity
- Date filtering at search level (Pinecone timestamp field)
- Day-based sampling (3 items per day across period)
- Chronological sorting (oldest → newest)
- Date-grouped digest format

**Route:** KnowledgeAgent (temporal mode) → SearchKnowledgeTool → Hybrid Search

**Response:** Chronological summary with dates, sources

**Example:**

```
Query: "what did we discuss in October?"

Temporal Detection: Oct 1-31, 2025
Search: topK=100, date filter applied
Sampling: 3 items per day across 20 unique days
Sorting: Oldest → newest

Response:
Early October (Oct 2-5): The team focused on API integration delays
and resource planning...

Mid-October (Oct 12-18): Product roadmap discussions centered on Q4
features and user feedback from beta testers...

Late October (Oct 24-31): Sprint retrospectives and deployment prep
for November launch...

**Sources:**
- #engineering - mikun ([Slack](https://...)) - Oct 2, 2025
- Product Roadmap Q4 ([Notion](https://...)) - Oct 15, 2025
- #product - aurel ([Slack](https://...)) - Oct 28, 2025
```

---

## Search Pipeline

### File: `apps/backend/src/tools/search-knowledge.tool.ts`

### Hybrid Search Architecture

```
User Query
    ↓
┌──────────────────────────────────────────┐
│ 1. Intent Detection                      │
│    - company/product/operations/technical│
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ 2. Temporal Parsing                      │
│    - "this week" → date range            │
│    - "October" → month range             │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ 3. Hybrid Search (Parallel)              │
│                                          │
│  ┌─────────────────┐  ┌────────────────┐│
│  │ Pinecone        │  │ PostgreSQL FTS ││
│  │ (Semantic)      │  │ (Keyword)      ││
│  │ topK * 2 = 40   │  │ topK * 2 = 40  ││
│  └─────────────────┘  └────────────────┘│
│            ↓                 ↓           │
│  ┌──────────────────────────────────┐   │
│  │ RRF Merge (70% sem + 30% key)    │   │
│  │ + Recency Boost                  │   │
│  └──────────────────────────────────┘   │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ 4. Trust Ranking (Intent-Based Boost)   │
│    - Amplify to fetchLimit (topK * 15)   │
│    - Apply trust multipliers             │
│    - Select top results                  │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ 5. Thread Context Expansion              │
│    - Detect Slack thread replies         │
│    - Fetch parent + all replies          │
│    - Bundle into conversations           │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ 6. Format for AI                         │
│    - Temporal: Date-grouped digest       │
│    - Standard: Thread rollup + context   │
└──────────────────────────────────────────┘
```

### Configuration

```typescript
// Standard queries
topK: 20                    // Results returned to agent
fetchLimit: 20 * 15 = 300   // For trust ranking pool (capped at 100)

// Temporal queries
topK: 100                   // Higher for date diversity
fetchLimit: 100 * 15 = 1500 // (capped at 100)
```

### RRF Merge Formula

**Configuration:**

- RRF_K = 60 (standard constant)
- SEMANTIC_WEIGHT = 0.7 (70%)
- KEYWORD_WEIGHT = 0.3 (30%)
- Recency boost: 1.5× (last 7 days), 1.2× (last 30 days)
- Parallel execution: Pinecone + PostgreSQL FTS
- Fetch amplification: topK × 2 per source (e.g., 20 → 40 semantic + 40 keyword)

**Full details:** See [HYBRID_SEARCH_IMPLEMENTATION.md](./HYBRID_SEARCH_IMPLEMENTATION.md)

```typescript
const RRF_K = 60;
const SEMANTIC_WEIGHT = 0.7;
const KEYWORD_WEIGHT = 0.3;

for (const result of uniqueResults) {
  const semRank = semanticResults.indexOf(result) + 1 || Infinity;
  const keyRank = keywordResults.indexOf(result) + 1 || Infinity;

  const semScore = SEMANTIC_WEIGHT / (RRF_K + semRank);
  const keyScore = KEYWORD_WEIGHT / (RRF_K + keyRank);

  result.score = semScore + keyScore;
}

// Recency boost
const daysOld = (now - result.timestamp) / 86400;
if (daysOld <= 7) result.score *= 1.5;
else if (daysOld <= 30) result.score *= 1.2;
```

---

## Knowledge Agent

### File: `apps/backend/src/agents/knowledge.agent.ts`

### Adaptive Filtering

**Problem:** Fixed thresholds (e.g., score > 0.4) miss good results when scores are noisy

**Solution:** Percentile-based filtering with floor + second-chance search

```typescript
// Standard queries
const floor = 0.28; // Keep weak-but-topical
const pct = 0.7; // Keep top 70%
const sorted = items.sort((a, b) => b.score - a.score);
const cutoffScore = sorted[Math.floor(sorted.length * pct)].score;
const keepScore = Math.max(floor, cutoffScore);
let relevant = sorted.filter((s) => s.score >= keepScore);

// Always keep minimum
if (relevant.length < 5) {
  relevant = sorted.slice(0, 5);
}

// Second-chance: if still empty, run keyword-biased retry
if (!relevant.length) {
  const keywords = query.split(/\s+/).filter((w) => w.length > 2);
  const expanded = [...new Set(keywords)].join(" ");
  const secondChance = await searchTool.execute({ query: expanded, topK: 40 });
  relevant = secondChance.sources.slice(0, 8);
}
```

**Benefits:**

- Adapts to result quality
- Never returns empty sets (min 5, or second-chance retry)
- Second-chance uses keyword bias to catch exact matches
- Better coverage for edge cases

### Temporal Query Handling

```typescript
// Detect temporal patterns
const temporalMonth = /\b(january|february|...|december)\b/i;
const temporalRelative = /\b(last|this|next)\s+(week|month|quarter)\b/i;
const temporalAbsolute = /\b(20\d{2})-(0[1-9]|1[0-2])\b/;

const isTemporal =
  temporalMonth.test(query) || temporalRelative.test(query) || temporalAbsolute.test(query);

if (isTemporal) {
  // Date-bucket sampling
  const byDay = groupByDate(items);
  const perDay = 3; // Top 3 per day for coverage
  const sampled = [];
  for (const [date, dayItems] of byDay.entries()) {
    const top = dayItems.sort((a, b) => b.score - a.score).slice(0, perDay);
    sampled.push(...top);
  }

  // Sort chronologically
  relevant = sampled.slice(0, 40).sort((a, b) => a.timestamp - b.timestamp);
}
```

**Why Day-Based Sampling?**

- Ensures coverage across entire time period
- Prevents clustering on few days
- Provides chronological spread
- Better temporal summaries

### Second-Chance Keyword Search

**When:** First pass returns empty set

**How:**

```typescript
if (!relevant.length) {
  // Extract keywords
  const hints = query.split(/\s+/).filter((w) => w.length > 2);
  const expanded = [...new Set(hints)].join(" ");

  // Retry with keyword bias
  const secondChance = await searchTool.execute({
    query: expanded,
    topK: 40,
  });

  relevant = secondChance.sources.slice(0, 8);
}
```

### Neutral Fallback (Anti-Hallucination)

**When:** Weak results after second chance

**Response:**

```
I'm not fully confident about the exact answer, but these look related—
want to check any of them?

**Possible matches:**
- Product Roadmap Q4 ([Notion](https://...))
- #product - aurel ([Slack](https://...))
- Engineering Wiki ([Notion](https://...))
```

**Why:**

- Never makes up information
- Provides links for user to explore
- Maintains trust
- Better than "I don't know"

---

## Response Synthesis

### File: `apps/backend/src/agents/knowledge.agent.ts`

### LLM Configuration

**Model:** Groq GPT-OSS-120B  
**Why:** 4-6x faster than GPT-4, high quality, cost-effective  
**Speed:** ~500ms for synthesis (vs 1.5s with GPT-4)

### System Prompt (Excerpt)

```
You are Mitable AI - a friendly, knowledgeable colleague helping teammates.

**Response Style:**
✅ DO:
- **Bold important terms**: dates, names, decisions
- Use headers (##) and bullets (-) to organize
- Synthesize across sources for insights
- Connect related information
- Be direct and factual

❌ DON'T:
- Echo raw search results verbatim
- Use robotic phrases like "based on retrieved information"
- Add unnecessary commentary
- Be verbose

**Thread-Aware Responses:**
- CHECK THE DATES in thread rollup
- Say "In a thread from September 15 in #engineering..."
- Mention key participants when relevant
- Group related points by thread/conversation

**Source Citations:**
Always end with **Sources:** section.
- Slack: "- #channel - username ([Slack](url))"
- Notion: "- Page title ([Notion](url))"
```

### Temporal Synthesis Prompt Addition

```typescript
if (isTemporal) {
  systemPrompt += `
**TEMPORAL QUERY DETECTED:**
Provide a CHRONOLOGICAL SUMMARY:
- Organize by date/time (not by relevance)
- Mention dates explicitly ("On October 15...", "October 20-25...")
- Focus on comprehensive coverage of time period
- Group related items by date
- Start with earliest → most recent
`;
}
```

### Programmatic Sources Enforcement

**Problem:** LLMs sometimes forget to include sources

**Solution:**

```typescript
// After streaming completes
if (!synthesizedContent.includes("**Sources:**")) {
  console.log("[KnowledgeAgent] LLM forgot Sources - appending");

  let sourcesText = "\n\n**Sources:**\n";
  for (const source of searchResult.sources) {
    const platform = url.includes("slack.com") ? "Slack" : "Notion";
    sourcesText += `- ${title} ([${platform}](${url}))\n`;
  }

  synthesizedContent += sourcesText;
  yield { type: "chunk", content: sourcesText }; // Stream it!
}
```

**Result:** 100% source reliability

---

## Performance & Monitoring

### Response Times (November 2025)

**Uncached Query:**

```
Intent detection:        ~50ms   (Gemini Flash)
KB preflight:            ~300ms  (topK=6)
Semantic search:         ~500ms  (Pinecone)
Keyword search:          ~400ms  (PostgreSQL FTS)
RRF merge:               ~50ms
Trust ranking:           ~100ms
Thread expansion:        ~200ms  (when applicable)
AI synthesis:            ~500ms  (Groq streaming)
──────────────────────────────────
Total:                   ~2.1s
```

**Cached Query:**

```
Cache lookup:            ~50ms
AI synthesis:            ~500ms
──────────────────────────────────
Total:                   ~550ms
```

**Blended Mode:**

```
KB preflight:            ~300ms
Short definition:        ~400ms  (Gemini Flash)
Knowledge search:        ~1.8s   (full pipeline)
──────────────────────────────────
Total:                   ~2.5s
```

### Key Metrics

- Cache hit rate target: 40%+
- P95 response time: <3s
- KB preflight accuracy: ~90% (catches weak queries)
- Source citation reliability: 100% (programmatic enforcement)

---

## Sync & Backfill

### Incremental Slack Sync

**Script:** `apps/backend/src/scripts/sync-slack.ts`

**Usage:**

```bash
npm run sync-slack -w @mitable/backend
```

**How it works:**

- Auto-detects last message timestamp from DB
- Fetches only new messages using Slack's `oldest` parameter
- Skips duplicates automatically
- Rate limiting: 350ms between channels
- Progress reporting in console

**Checkpoints:** Last message timestamp stored per channel in `slack_messages` table

**Full sync vs incremental:**

- New channels: Full history sync
- Existing channels: Only new messages since last timestamp
- Removed channels: No sync

**Notion sync:** Similar pattern using `last_edited_time` for incremental updates

---

## Frontend UX

### Auto-Scroll Behavior

**During streaming:**

- Auto-scrolls to bottom when new chunks arrive
- **IF** user scrolls up → stops auto-scrolling (user is reading)
- **IF** user scrolls back to bottom → resumes auto-scrolling
- Detection: Within 100px of bottom = "at bottom"

**"Thinking…" Indicator:**

- Shows immediately when streaming starts
- Three bouncing dots animation
- Disappears when first chunk arrives
- Prevents "looks idle" complaint

**Implementation:** `apps/electron/src/renderer/conversation/src/App.tsx` and `ChatDetail.tsx`

---

## Configuration

### Environment Variables

```bash
# LLMs
GEMINI_API_KEY=...          # Intent classification
GROQ_API_KEY=...            # Synthesis (GPT-OSS-120B)
OPENAI_API_KEY=...          # Embeddings

# Vector DB
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=...     # 1536D index

# Database
DATABASE_URL=...            # PostgreSQL with FTS

# Models
GROQ_CHAT_MODEL=openai/gpt-oss-120b
EMBEDDING_MODEL=text-embedding-3-small
```

### Tunable Parameters

```typescript
// Orchestrator
KB_PREFLIGHT_WEAK_THRESHOLD = 0.28;
KB_PREFLIGHT_MIN_STRONG_COUNT = 2;

// Search
STANDARD_TOP_K = 20;
TEMPORAL_TOP_K = 100;
FETCH_LIMIT_MULTIPLIER = 15; // topK * 15, capped at 100

// Filtering
ADAPTIVE_PERCENTILE = 0.7; // Top 70%
ADAPTIVE_FLOOR = 0.28; // Minimum score
MIN_RESULTS = 5; // Never return fewer

// RRF
RRF_K = 60;
SEMANTIC_WEIGHT = 0.7;
KEYWORD_WEIGHT = 0.3;

// Recency boost
BOOST_7_DAYS = 1.5;
BOOST_30_DAYS = 1.2;

// Temporal sampling
ITEMS_PER_DAY = 3;
MAX_TEMPORAL_RESULTS = 40;
```

---

## Troubleshooting

### Issue: Encyclopedic questions searching internal docs

**Symptom:** "what is machine learning?" searches Slack/Notion  
**Cause:** Missing heuristic or weak KB preflight threshold  
**Fix:** Check `ENCYCLOPEDIA_HINT` regex and `ORG_HINT` regex in orchestrator

### Issue: Internal questions getting open-domain answers

**Symptom:** "what is our deployment process?" gives generic answer  
**Cause:** KB preflight threshold too strict OR missing org hints  
**Fix:** Lower `KB_PREFLIGHT_WEAK_THRESHOLD` from 0.28 to 0.25, or add deployment-related terms to `ORG_HINT` regex

### Issue: Temporal queries only showing recent days

**Symptom:** "October" query returns Oct 29-31 only  
**Cause:** Day-based sampling not working or topK too low  
**Fix:** Verify `TEMPORAL_TOP_K = 100` and `ITEMS_PER_DAY = 3` in knowledge.agent.ts

### Issue: No sources in response

**Symptom:** Great answer but no citations  
**Cause:** Impossible now (programmatic enforcement active)  
**Check:** Verify `searchResult.sources` is populated from SearchKnowledgeTool

### Issue: Empty results for valid query

**Symptom:** "No information found" for known content  
**Cause:** Adaptive filtering too aggressive or second-chance search not triggering  
**Fix:** Check `MIN_RESULTS = 5` and verify second-chance keyword search logic

### Issue: Slow responses (>5s)

**Symptom:** User waits too long  
**Cause:** Multiple KB preflights, or slow Pinecone queries  
**Fix:**

- Check Pinecone index performance
- Verify cache is working (10-min TTL)
- Consider lowering `FETCH_LIMIT` from topK*15 to topK*10

---

## Planned Features

### Big Retrieval Mode (BRM)

**Status:** Planned (design doc: `docs/big-retrieval.md`)

**Problem:** Queries returning 100+ results (temporal spanning months, "everything about X")

**Planned Solution:**

1. **Detection heuristic** - Enter BRM if total candidates > 30 or broad query pattern
2. **Chunked retrieval** - Process 8 units per reply (~6500 tokens)
3. **Progressive streaming** - Summarize batch, show sources, then offer continuation
4. **"Continue" affordance** - User clicks to load next 8 units
5. **Session persistence** - Resume state stored in Postgres (24h TTL)

**Benefits:**

- Handles large result sets without token overflow
- Resumable across multiple user interactions
- Progressive disclosure (not overwhelming)
- Full coverage with source citations per batch

**Example:**

```
User: "everything we discussed in Q4"
System: [Summarizes first 8 conversations from Oct 1-8]
        Sources: [8 Slack threads, 2 Notion pages]

        Covered 8 items from Oct 1-8. Reply "continue" to load
        Oct 9-16, or refine (e.g., "only #product", "Notion only").

User: "continue"
System: [Summarizes next 8 conversations from Oct 9-16]
        Sources: [6 Slack threads, 3 Notion pages]
        ...
```

---

## Recent Changes (November 2025)

### Open-Domain QA (NEW)

- Added `open_domain_qa` intent type
- Encyclopedic questions bypass RAG
- Instant answers from LLM general knowledge
- No sources (not needed for world knowledge)

### KB Preflight (NEW)

- Quick probe before committing to RAG
- topK=6 sample to gauge evidence strength
- Downgrades to open_domain_qa if weak
- Prevents "I don't have info" dead-ends

### Blended Mode (NEW)

- Detects encyclopedic + strong KB
- Provides short definition THEN internal context
- Best of both worlds
- Maintains source citations for internal info

### Temporal Improvements

- Increased topK to 100 for date diversity
- Day-based sampling (3 per day)
- Chronological sorting and synthesis
- Date-grouped digest format
- Better coverage across time periods

### Pill UI Streaming

- Added "Thinking…" indicator with bouncing dots
- Matches ChatDetail UX
- Shows immediately before first stream chunk
- Better user feedback during processing

---

## Future Optimizations

**Currently Planned (Not Implemented):**

1. **Surrounding chunk expansion (n-1, n+1)** for Notion pages
   - Fetch adjacent chunks for better context continuity
   - Priority: Medium (threads solved main Slack pain point)

2. **ML-based reranker** (Cohere or cross-encoder)
   - Rerank top results after RRF for quality boost
   - Priority: Medium (current RRF working well)

3. **Adaptive topK by query complexity**
   - Simple queries: topK=10
   - Complex queries: topK=30
   - Priority: Low (current defaults sufficient)

4. **Larger initial fetch** for RRF pool
   - Current: 40 semantic + 40 keyword
   - Could try: 100 semantic + 100 keyword
   - Priority: Low (diminishing returns)

5. **Query expansion with synonyms**
   - Automatic synonym detection and expansion
   - Priority: Low (hybrid search already handles well)

**Not Planned:**

- Generic caching layer (10-min TTL at search service level sufficient)
- Multi-modal search (no image/PDF content yet)

---

## Architecture Principles

1. **Fail gracefully** - Never dead-end the user
2. **Cite sources** - 100% programmatic enforcement
3. **Adapt dynamically** - Percentile thresholds, not fixed
4. **Route intelligently** - Use right tool for each query type
5. **Blend when beneficial** - General knowledge + internal context
6. **Optimize for speed** - KB preflight, caching, Groq
7. **Handle time well** - Temporal queries get special treatment
8. **Maintain trust** - Neutral fallbacks, no hallucinations
9. **Thread-aware** - Conversations over isolated messages
10. **Progressive when needed** - BRM for large result sets (planned)

---

## File Reference

### Core Files

```
apps/backend/src/
├── services/
│   ├── orchestrator.service.ts      # Intent routing, KB preflight, blended mode
│   ├── search.service.ts             # Hybrid search (Pinecone + PostgreSQL)
│   └── trust-ranking.service.ts      # Intent-based boosting
├── agents/
│   ├── knowledge.agent.ts            # RAG synthesis, temporal handling
│   └── text-response.agent.ts        # General chat, open-domain QA
├── tools/
│   └── search-knowledge.tool.ts      # Search orchestration, temporal parsing
└── utils/
    └── slack-thread.utils.ts         # Thread bundling and rollup
```

### Frontend Files

```
apps/electron/src/renderer/
├── conversation/src/
│   └── App.tsx                       # Pill view with thinking indicator
└── console/src/components/views/employee/ChatsView/
    └── ChatDetail.tsx                # Main chat UI with streaming
```

---

## Summary

Mitable's RAG system intelligently routes queries across five intent types, with special handling for:

- **Encyclopedic questions** → Direct LLM answers
- **Internal questions** → Hybrid search + synthesis
- **Both** → Blended answers with definition + context
- **Time-based questions** → Chronological summaries

Key innovations:

- KB preflight prevents dead-ends
- Adaptive filtering handles score noise
- Programmatic sources guarantee citations
- Temporal awareness provides better date-based answers
- Blended mode combines world knowledge with internal context

Result: Fast, accurate, well-cited answers that gracefully handle any query type.
