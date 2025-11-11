# Groq Migration Plan for RAG Pipeline

**Objective:** Migrate entire RAG chat pipeline to Groq (GPT-OSS-120B) while keeping embeddings on OpenAI  
**Model:** `openai/gpt-oss-120b` (Groq's fastest model)  
**Context Window:** 131,072 tokens (131K - more than GPT-4 Turbo's 128K)  
**Rate Limits:** Check your [Groq Console](https://console.groq.com/settings/limits) for exact limits  
**Goal:** Reduce latency, increase throughput, minimize code changes  
**Date:** November 4, 2025

---

## Current State Analysis

### Services Using AI Models

| Service                                  | Current Model                   | Purpose                        | Should Migrate?               |
| ---------------------------------------- | ------------------------------- | ------------------------------ | ----------------------------- |
| **embedding.service.ts**                 | OpenAI `text-embedding-3-small` | Vector embeddings for Pinecone | ❌ NO (required for Pinecone) |
| **intent.service.ts**                    | OpenAI `gpt-4o-mini`            | Intent classification          | ✅ YES → Groq                 |
| **knowledge.agent.ts**                   | OpenAI `gpt-4-turbo`            | RAG synthesis + response       | ✅ YES → Groq                 |
| **agent.service.ts** (main orchestrator) | Groq `gpt-oss-120b`             | Tool routing, orchestration    | ✅ ALREADY GROQ               |

### Why Keep OpenAI for Embeddings?

- Pinecone index is configured for **1536 dimensions** (OpenAI's `text-embedding-3-small`)
- Changing embedding model requires **recreating entire Pinecone index** (expensive)
- Groq doesn't offer embedding models (chat completions only)
- **Decision:** Keep embeddings on OpenAI, migrate everything else to Groq

---

## Context Window & Rate Limit Analysis

### GPT-OSS-120B Specifications

- **Context Window:** 131,072 tokens (131K input + output combined)
- **Max Output Tokens:** 33,000 tokens (configurable)
- **Active Parameters:** 5.1B per token (120B total via MoE)
- **Throughput:** ~1,065 tokens/sec on Groq

### Rate Limits (Organization-Level)

Rate limits vary by plan. Check your exact limits at: https://console.groq.com/settings/limits

**Typical Free Tier Limits:**

- RPM (Requests Per Minute): ~30-50 requests/min
- TPM (Tokens Per Minute): ~14,400-30,000 tokens/min
- RPD (Requests Per Day): ~14,400 requests/day
- TPD (Tokens Per Day): ~1M+ tokens/day

**Note:** Cached tokens don't count towards limits (see [prompt caching](https://console.groq.com/docs/prompt-caching))

### Our Token Usage Estimate

**Per RAG Query (with 20 results):**

```
System Prompt:        ~1,200 tokens (new prompt with personality)
User Query:           ~50 tokens (average)
Search Results:       ~8,000 tokens (20 results × ~400 tokens each)
Context Total:        ~9,250 tokens INPUT

AI Response:          ~500 tokens OUTPUT (average, can be up to 2,000)

Total Per Query:      ~9,750 tokens
```

**Safely Within Limits:**

- ✅ Context: 9,750 tokens << 131,072 token limit (using only 7.4%)
- ✅ With 30 TPM limit: ~3 queries/minute
- ✅ With 14,400 TPD limit: ~1,475 queries/day
- ✅ Typical usage: 50-200 queries/day (well under limit)

**If We Hit Rate Limits:**

1. Groq returns `429 Too Many Requests` with `retry-after` header
2. Implement exponential backoff (already in agent.service.ts)
3. Fallback to OpenAI if persistent (can add this)
4. Request higher limits: https://groq.com/self-serve-support

### Config Adjustments Needed

Update `config.ts` to set conservative token limits:

```typescript
groq: {
  apiKey: (process.env.GROQ_API_KEY || "").trim(),
  chatModel: (process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b").trim(),
  maxTokens: parseInt(process.env.GROQ_MAX_TOKENS || "8000", 10), // Was: 8000
  temperature: parseFloat(process.env.GROQ_TEMPERATURE || "0.7"),
}
```

**Recommendation:** Keep `maxTokens: 8000` - this is safe and allows room for:

- Large context (9K tokens input)
- Long responses (up to 8K tokens output)
- Still well under 131K total limit

---

## Migration Strategy

### Phase 1: Intent Service (Low Risk)

**File:** `apps/backend/src/services/intent.service.ts`  
**Current:** OpenAI `gpt-4o-mini` (fast classification)  
**New:** Groq `openai/gpt-oss-120b` (even faster, free tier)

**Changes:**

```typescript
// Before
import OpenAI from "openai";
this.openai = new OpenAI({ apiKey: config.openai.apiKey });
const response = await this.openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages,
  temperature: 0.3,
  response_format: { type: "json_object" },
});

// After
import Groq from "groq-sdk";
this.groq = new Groq({ apiKey: config.groq.apiKey });
const response = await this.groq.chat.completions.create({
  model: config.groq.chatModel, // "openai/gpt-oss-120b"
  messages,
  temperature: 0.3,
  response_format: { type: "json_object" },
});
```

**Benefits:**

- Faster intent detection (Groq's inference is 10x faster)
- Lower cost (Groq has generous free tier)
- No impact on quality (classification is simple task)

**Risk Level:** 🟢 LOW (intent detection is not user-facing, easy to rollback)

---

### Phase 2: Knowledge Agent (Medium Risk)

**File:** `apps/backend/src/agents/knowledge.agent.ts`  
**Current:** OpenAI `gpt-4-turbo` (synthesis + streaming)  
**New:** Groq `openai/gpt-oss-120b` (synthesis + streaming)

**Changes:**

```typescript
// Before (line 1, 126, 131-132)
import OpenAI from "openai";

export class KnowledgeAgent extends BaseAgent {
  private openai: OpenAI;

  constructor() {
    super();
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
  }

// After
import Groq from "groq-sdk";

export class KnowledgeAgent extends BaseAgent {
  private groq: Groq;

  constructor() {
    super();
    this.groq = new Groq({ apiKey: config.groq.apiKey });
  }
```

```typescript
// Before (line 205-211)
const stream = await this.openai.chat.completions.create({
  model: config.openai.chatModel, // gpt-4-turbo
  messages: messages,
  temperature: config.openai.temperature,
  max_tokens: config.openai.maxTokens,
  stream: true,
});

// After
const stream = await this.groq.chat.completions.create({
  model: config.groq.chatModel, // "openai/gpt-oss-120b"
  messages: messages,
  temperature: config.groq.temperature,
  max_tokens: config.groq.maxTokens,
  stream: true,
});
```

**Benefits:**

- **10x faster streaming** (Groq's optimized inference)
- Lower latency for users (responses appear faster)
- Cost savings (Groq cheaper than GPT-4)
- Can handle more concurrent users

**Risk Level:** 🟡 MEDIUM (user-facing, but streaming API is compatible)

---

## Updated System Prompt Strategy

### Keep Citation Format (95% of current prompt)

**Your concern:** "I wanted to display the sources exactly that way"

**Solution:** Keep the **entire citation section** exactly as is, but add personality to the **synthesis section**:

```typescript
const KNOWLEDGE_SYNTHESIS_PROMPT = `You are Lorikeet AI - a friendly, knowledgeable colleague helping teammates ramp up at their company.

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

❌ DON'T:
- Echo raw search results verbatim
- Use robotic phrases like "based on the retrieved information"
- Add unnecessary commentary like "this shows dedication"
- Over-explain or be verbose

**CRITICAL CITATION FORMATTING - NEVER CHANGE THIS:**

When responding:
1. DO NOT cite sources inline in your response text - no "(Notion)" or "(Slack)" in sentences
2. ONLY cite sources in the **Sources:** section at the very end
3. Use bullet points with "-" (dash) in the Sources section
4. ONLY the word in parentheses gets hyperlinked: ([Slack](url)) or ([Notion](url))
5. Everything before the parentheses stays as plain text
6. For Slack: format as "#channel - username"
7. For Notion: use the document title

**Sources Format - COPY EXACTLY:**
```

**Sources:**

- #engineering - febchuk ([Slack](https://slack.com/msg))
- #product - mikun.adewole ([Slack](https://slack.com/msg))
- Lorikeet Development Environment Setup Guide ([Notion](https://notion.so/page))
- Product Requirements Document (PRD) ([Notion](https://notion.so/prd))

```

✅ CORRECT Examples:
- "- #engineering - febchuk ([Slack](https://slack.com/msg))"
- "- Product Requirements Document (PRD) ([Notion](https://notion.so/prd))"

❌ WRONG Examples:
- "[#engineering - febchuk (Slack)](url)" - entire line hyperlinked
- "#engineering - febchuk (Slack)" - no hyperlink
- "• #engineering - febchuk (Slack)" - wrong bullet character

MANDATORY: Every source MUST have the source type (Slack or Notion) hyperlinked in parentheses.

**Example Response with Personality + Perfect Citations:**

"The **Product Requirements Document (PRD)** was last updated on **October 15, 2024** by **Febchuk**.

## Key Features
- **RAG-powered search** - combines semantic and keyword matching
- **Adaptive learning paths** - personalized to your role
- **Real-time sync** - automatically pulls from Notion and Slack

The team shifted from a static wiki to AI-driven discovery after user research showed new hires spent **6+ hours** searching for basic info each week.

**Sources:**
- Mitable AI Business Model ([Notion](https://notion.so/page))
- #product - febchuk ([Slack](https://slack.com/msg))
- Product Requirements Document ([Notion](https://notion.so/prd))"

When you don't know something, be honest: "I don't have information about that in the knowledge base."

Your goal: Help people understand, not just retrieve information. Think mentor, not search engine.`;
```

**Key Changes:**

1. ✅ Added personality at the top (warm, insightful)
2. ✅ Instructions for bold formatting, headers, bullets
3. ✅ Emphasis on extrapolation and insight
4. ✅ **KEPT 100% of citation formatting rules** (untouched)
5. ✅ Example shows personality + perfect citation format

---

## Implementation Steps

### Step 1: Update Intent Service

```bash
# File: apps/backend/src/services/intent.service.ts
```

**Code Changes:**

1. Import Groq SDK instead of OpenAI
2. Initialize Groq client in constructor
3. Change model to `config.groq.chatModel`
4. Keep all other logic identical

**Testing:**

- Run 20 test queries
- Verify intent classification accuracy matches OpenAI
- Check response time improvement

### Step 2: Update Knowledge Agent

```bash
# File: apps/backend/src/agents/knowledge.agent.ts
```

**Code Changes:**

1. Import Groq SDK instead of OpenAI
2. Initialize Groq client in constructor
3. Update streaming call to use Groq
4. Replace system prompt with new version (personality + citations)
5. Increase `topK` from 10 → 20 (more context for better extrapolation)

**Testing:**

- Test with 50 real user queries
- Verify citation format is EXACTLY the same
- Check that bold formatting appears
- Verify streaming works smoothly
- Monitor response quality vs GPT-4

### Step 3: Update Search Tool TopK

```bash
# File: apps/backend/src/tools/search-knowledge.tool.ts
```

**Code Changes:**

```typescript
// Line 59: Update default topK
topK: {
  type: "number",
  description: "Number of results to return (default: 20, max: 25)", // Was: default: 10, max: 15
  default: 20, // Was: 10
},

// Line 80: Update limitedTopK max
const limitedTopK = Math.min(Math.max(topK, 1), 25); // Was: 15

// Line 84: Update fetchLimit
const fetchLimit = Math.min(limitedTopK * 15, 100); // Was: 10x
```

**Testing:**

- Verify search returns more results
- Check that ranking still works
- Monitor search latency (should stay under 1s)

### Step 4: Update Knowledge Agent TopK Call

```bash
# File: apps/backend/src/agents/knowledge.agent.ts
```

**Code Changes:**

```typescript
// Line 157-163: Update topK parameter
const searchResult = await this.searchKnowledgeTool.execute(
  {
    query: userQuery,
    topK: 20, // Was: 10
  },
  context
);
```

---

## Configuration Updates

### `.env` File

```bash
# Groq Configuration (already exists)
GROQ_API_KEY=your_groq_api_key
GROQ_CHAT_MODEL=openai/gpt-oss-120b
GROQ_MAX_TOKENS=8000
GROQ_TEMPERATURE=0.7

# OpenAI Configuration (keep for embeddings)
OPENAI_API_KEY=your_openai_api_key
OPENAI_CHAT_MODEL=gpt-4-turbo-preview  # Not used anymore
OPENAI_MAX_TOKENS=2000  # Not used anymore
OPENAI_TEMPERATURE=0.7  # Not used anymore
```

**Note:** OpenAI is ONLY used for embeddings now (embedding.service.ts)

---

## Performance Expectations

### Before (OpenAI)

- Intent detection: ~500ms
- Knowledge synthesis: ~2-3s (streaming)
- Total response time: ~3-4s

### After (Groq)

- Intent detection: **~50ms** (10x faster)
- Knowledge synthesis: **~300ms-500ms** (6x faster)
- Total response time: **~500ms-1s** (4x faster)

### Cost Comparison

- OpenAI GPT-4 Turbo: $10 per 1M tokens (input), $30 per 1M tokens (output)
- Groq GPT-OSS-120B: **FREE** tier (generous limits), then $0.89/$0.89 per 1M tokens
- **Savings:** ~90% cost reduction

---

## Rollback Plan

If Groq quality is not acceptable:

### Quick Rollback (5 minutes)

```typescript
// intent.service.ts - change back
import Groq from "groq-sdk"; // → import OpenAI from "openai";
this.groq = new Groq(...); // → this.openai = new OpenAI(...);
model: config.groq.chatModel // → model: "gpt-4o-mini"

// knowledge.agent.ts - change back
import Groq from "groq-sdk"; // → import OpenAI from "openai";
this.groq = new Groq(...); // → this.openai = new OpenAI(...);
model: config.groq.chatModel // → model: config.openai.chatModel
```

### Git Strategy

```bash
# Create feature branch for easy rollback
git checkout -b aurel/feature/groq_migration

# Commit in small steps
1. Update intent service
2. Update knowledge agent
3. Update system prompt
4. Update topK parameters

# Can cherry-pick or revert individual commits if needed
```

---

## Testing Checklist

### Functionality Tests

- [ ] Intent classification still accurate (test 20 queries)
- [ ] RAG responses include sources in EXACT format
- [ ] Bold formatting appears for dates/names/terms
- [ ] Headers and bullets used for organization
- [ ] Streaming works smoothly
- [ ] No citation format regressions

### Quality Tests

- [ ] Responses show personality (warm, insightful)
- [ ] AI extrapolates beyond raw facts
- [ ] Connections made between sources
- [ ] Context from 20 results used effectively
- [ ] No robotic language ("based on retrieved information")

### Performance Tests

- [ ] Response time under 1 second
- [ ] Streaming starts within 200ms
- [ ] Search latency stays under 500ms
- [ ] Can handle 10 concurrent users

### Edge Cases

- [ ] No search results → graceful fallback
- [ ] Partial results → still provides value
- [ ] Long queries → handles well
- [ ] Multiple sources → proper synthesis

---

## Risk Mitigation

### Risk 1: Citation Format Breaking

**Mitigation:** Keep 100% of citation rules in prompt, add examples, test thoroughly

### Risk 2: Quality Regression

**Mitigation:**

- Test with 50 real queries before deploying
- Compare side-by-side with GPT-4 responses
- Have rollback ready (5-minute revert)

### Risk 3: Groq Rate Limits

**Mitigation:**

- Monitor usage vs free tier limits
- Add retry logic with exponential backoff
- Keep OpenAI as fallback if Groq errors

---

## Success Metrics

### Must Have (Go/No-Go)

- ✅ Citation format **100% identical** to current
- ✅ Response quality acceptable (70%+ user satisfaction)
- ✅ No increase in error rate

### Nice to Have

- ✅ Response time 2x-4x faster
- ✅ Bold formatting in 70%+ responses
- ✅ Cost reduction 80%+
- ✅ Users notice quality improvement

---

## Timeline

### Day 1: Intent Service Migration

- **Morning:** Code changes + testing (2 hours)
- **Afternoon:** Deploy + monitor (2 hours)
- **Success Criteria:** Intent detection working, no errors

### Day 2: Knowledge Agent Migration

- **Morning:** Code changes (system prompt + Groq SDK) (3 hours)
- **Afternoon:** Testing with 50 queries (3 hours)
- **Success Criteria:** Citations perfect, personality shows, quality acceptable

### Day 3: TopK Expansion

- **Morning:** Update topK parameters (1 hour)
- **Afternoon:** A/B test 10 results vs 20 results (3 hours)
- **Success Criteria:** More context improves quality

### Day 4: Final Testing + Deploy

- **Morning:** End-to-end testing (2 hours)
- **Afternoon:** Production deploy + monitoring (2 hours)
- **Success Criteria:** All metrics green

---

## Next Steps

**Immediate Actions:**

1. Review this plan
2. Get approval for Groq migration
3. Test Groq API key is working
4. Create feature branch
5. Start with Intent Service (low risk)

**Questions to Answer:**

- Is Groq API key configured and working?
- What's acceptable latency? (<1s seems good)
- Should we A/B test before full rollout?
- Who approves production deploy?

**Ready to implement? Let's start with Phase 1 (Intent Service) - it's a 30-minute change! 🚀**
