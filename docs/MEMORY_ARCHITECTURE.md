# Memory Architecture v2.0 - Conversation Summarization

## Overview

Token-aware conversation memory system using incremental Groq summarization to maintain long-term conversation context without context explosion.

## Architecture Components

### 1. **MemoryService** (`services/memory.service.ts`)

Separate subsystem that manages conversation memory independently from agent logic.

**Key Methods:**

- `getConversationMemory(conversationId)` - Returns summary + recent turns
- `updateConversationMemory(conversationId)` - Incrementally summarizes as needed

### 2. **Database Schema** (Migration 0011)

```sql
ALTER TABLE conversations
ADD COLUMN conversation_summary TEXT,
ADD COLUMN summary_up_to_turn INTEGER DEFAULT 0;
```

- `conversation_summary`: Incrementally-built summary of older turns
- `summary_up_to_turn`: Tracks which messages were last summarized

### 3. **Memory Configuration**

```typescript
const MEMORY_CONFIG = {
  VERBATIM_TURNS: 3, // Keep last 3 exchanges verbatim (6 messages)
  SUMMARY_TRIGGER_TOKENS: 8000, // Summarize when context > this (trigger early)
  SUMMARY_TRIGGER_TURNS: 8, // Or when turns > this (whichever first)
  MAX_SUMMARY_TOKENS: 10000, // Cap summary size (detailed summaries!)
  SUMMARY_BLOAT_THRESHOLD: 15000, // Re-summarize if summary exceeds (very high)
  SUMMARIZATION_MODEL: "llama-3.1-8b-instant", // Cheapest/fastest Groq model
  TEMPERATURE: 0.3, // Lower for consistency
};
```

**Strategy:** Trigger summarization **early** (every 4 exchanges) but allow **large, detailed summaries** (up to 10K tokens). This preserves maximum information while preventing context explosion. With the 131K token context window, we can afford to keep summaries detailed!

## How It Works

### Flow Diagram

```
User sends message
    ↓
Check conversation length
    ↓
Calculate tokens (verbatim + summary)
    ↓
If tokens > 8K OR turns > 8:
    ↓
    Fetch unsummarized turns
    ↓
    Call Groq to summarize (1-2 sec)
    ↓
    Append to existing summary (incremental!)
    ↓
    Update DB: conversation_summary, summary_up_to_turn
    ↓
Build prompt: [System] + [Summary] + [Last 3 turns] + [Current query]
    ↓
Send to agent LLM
```

### Incremental Summarization Example

**Turn 1-2:** No summary yet, send verbatim

```
User: How does Notion integration work?
Assistant: [searches Notion docs, explains OAuth flow...]
```

**Turn 3-7:** Still send all verbatim (under 8K token budget)

**Turn 8+:** Summarize turns 1-5, keep 6-8 verbatim

```
SUMMARY: "User asked about Notion integration. Agent explained OAuth flow
with token refresh, database schema (notion_pages, notion_blocks tables),
and sync pipeline using incremental timestamps."

VERBATIM (Turn 4):
User: What about error handling?
Assistant: [explains retry logic...]

VERBATIM (Turn 5):
User: How do I test this locally?
Assistant: [explains setup...]

VERBATIM (Turn 6 - current):
User: Can you show me the sync code?
```

## Privacy & Security Alignment

### What Gets Summarized:

- ✅ **User questions** (natural language)
- ✅ **What was learned** from tools (high-level descriptions)
- ✅ **Decisions made** (preferences, choices)
- ✅ **Important context** (constraints, requirements)

### What Doesn't Get Summarized:

- ❌ **Raw code** from `view_code` tool
- ❌ **Full search results** from Slack/Notion/GitHub
- ❌ **PII or sensitive data**
- ❌ **Tool output payloads**

### Tool Call Transformation:

**Instead of:**

```
TOOL(view_code): [3000 lines of code...]
```

**Summary uses:**

```
"viewed authenticateUser function in auth.service.ts"
```

**Instead of:**

```
TOOL(search_slack): [20 full message objects with user IDs, timestamps, etc.]
```

**Summary uses:**

```
"searched Slack for 'GitHub auth errors' (12 messages about token mismatch and rate limits)"
```

## Token Budget Management

### Triggers:

- **Primary:** Context size > 8,000 tokens
- **Secondary:** Turn count > 8 exchanges

### Guards:

1. **Summary bloat protection:** If summary > 3000 tokens, re-summarize entire conversation
2. **Max summary size:** Groq call uses `max_tokens: 2000`
3. **Verbatim window:** Always keep last 3 turns to maintain coherence

### Benefits:

- ✅ **Predictable token usage:** Summary (~500-1000 tokens) + Last 3 turns (~2000 tokens) = ~3000 tokens max
- ✅ **Scales indefinitely:** 50-turn conversation uses same tokens as 10-turn conversation
- ✅ **No context explosion:** Tool results not included in summary

## Integration with Agent Loop

### Before (Context Explosion):

```typescript
// Sent ENTIRE conversation history every time
const messages = [systemPrompt, ...allConversationMessages];
// Result: 50-turn conversation = 50K+ tokens → failures
```

### After (Memory-Aware):

```typescript
const memory = await memoryService.getConversationMemory(conversationId);
const messages = [
  systemPrompt,
  ...(memory.conversationSummary
    ? [{ role: "system", content: `Previous: ${memory.conversationSummary}` }]
    : []),
  ...memory.recentTurns, // Last 3 exchanges
];
// Result: 50-turn conversation = ~3K tokens → scalable
```

### Agent Update Points:

1. **Start of conversation turn:** Call `getConversationMemory()`
2. **End of conversation turn:** Call `updateConversationMemory()`

## Performance Characteristics

### Groq Summarization Speed:

- **Model:** llama-3.1-8b-instant
- **Cost:** $0.05/1M input tokens, $0.08/1M output tokens (10-12x cheaper than gpt-oss-120b)
- **Average latency:** 1-2 seconds
- **When triggered:** After 4 exchanges (8 messages) or 8K tokens - triggers early!
- **User impact:** Negligible (happens async after response sent)

### Storage:

- **Summary size:** ~2000-5000 tokens (8-20 KB), capped at 10,000 tokens
- **Growth rate:** Linear at first, then logarithmic (preserves detail!)
- **Re-compression:** Only triggered if summary exceeds 15,000 tokens

## Implementation Checklist

- [x] Create `MemoryService`
- [x] Add DB migration (conversation_summary fields)
- [x] Update schema (conversations table)
- [x] Token counting helper
- [x] Incremental summarization logic
- [x] Summary bloat prevention
- [x] Privacy-aware tool call formatting
- [ ] Integrate with KnowledgeAgent
- [ ] Run migration in production
- [ ] Test with 20+ turn conversations
- [ ] Monitor Groq API costs
- [ ] Add telemetry (summary trigger frequency, token savings)

## Next Steps

1. **Integrate into agent loop** (update `knowledge.agent.ts`)
2. **Run database migration** (0011_add_conversation_summary.sql)
3. **Test with multi-turn conversations**
4. **Monitor and tune** token thresholds based on real usage

## Future Enhancements

### Phase 2: External Long-Term Memory

- Store key facts separately (vector store or KV store)
- Retrieve when relevant (not always in prompt)
- Examples: "User prefers TypeScript", "Project uses Pinecone"

### Phase 3: Hierarchical Summarization

- Every 20 turns, re-summarize entire conversation into "super-summary"
- Prevents summary drift over very long sessions (100+ turns)

### Phase 4: Memory Retrieval

- Semantic search over past conversation summaries
- "Remember when we discussed X?" → retrieve relevant summary chunk
