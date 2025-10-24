# Intelligent Chunking System

**Last Updated:** October 24, 2025  
**Author:** Mikun Adewole  
**Status:** ✅ Implemented

---

## Overview

The Intelligent Chunking System is a token-aware text segmentation pipeline designed to optimize semantic search accuracy and prevent token limit issues when ingesting content from Slack and Notion into our vector database (Pinecone).

### Problem Statement

**Before Chunking:**

- Long Slack threads and Notion documents were embedded as single vectors
- Messages exceeding token limits caused embedding failures
- Large semantic units resulted in poor search precision
- No overlap meant context loss at chunk boundaries

**After Chunking:**

- All content intelligently split into 500-1000 token chunks
- 100-token overlap preserves context across boundaries
- Better search granularity and relevance
- Ready for hybrid search (keyword + semantic)

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                   Ingestion Pipeline                        │
│                                                             │
│  Slack/Notion API                                          │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────┐                                      │
│  │ Raw Content      │                                      │
│  │ (Messages/Blocks)│                                      │
│  └────────┬─────────┘                                      │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────┐                                      │
│  │ Chunking Service │ ◄─── tiktoken (cl100k_base)         │
│  │ (500-1000 tokens)│                                      │
│  │ (100 overlap)    │                                      │
│  └────────┬─────────┘                                      │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────┐                                      │
│  │ Chunk Array      │ [chunk0, chunk1, chunk2, ...]       │
│  └────────┬─────────┘                                      │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────┐                                      │
│  │ Embedding Service│ ◄─── OpenAI text-embedding-3-small  │
│  │ (Batch: 2048)    │                                      │
│  └────────┬─────────┘                                      │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────┐                                      │
│  │ Vector Service   │ ◄─── Pinecone (1536 dimensions)     │
│  │ (with metadata)  │                                      │
│  └──────────────────┘                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Chunking Service

### Configuration

```typescript
const CHUNK_CONFIG = {
  MIN_TOKENS: 500,
  MAX_TOKENS: 1000,
  OVERLAP_TOKENS: 100,
} as const;
```

### Algorithm

1. **Token Counting:** Uses OpenAI's `cl100k_base` tokenizer (same as GPT-3.5/4)
2. **Sliding Window:** Chunks text with overlap to preserve context
3. **Boundary Handling:** Preserves semantic units (sentences, paragraphs)

### Example

**Input:**

```
A 3000-token Slack message or Notion document
```

**Output:**

```typescript
[
  { text: "tokens 0-1000", chunkIndex: 0, totalChunks: 4 },
  { text: "tokens 900-1900", chunkIndex: 1, totalChunks: 4 }, // 100 overlap
  { text: "tokens 1800-2800", chunkIndex: 2, totalChunks: 4 }, // 100 overlap
  { text: "tokens 2700-3000", chunkIndex: 3, totalChunks: 4 }, // 100 overlap
];
```

---

## Integration Changes

### Slack Messages

**Before:**

```typescript
// One vector per message
id: "slack-C123-1234567890.123456"
metadata: {
  text: "entire message...",
  source: "slack",
  // ... other fields
}
```

**After:**

```typescript
// Multiple vectors per long message
id: "slack-C123-1234567890.123456-chunk-0"
metadata: {
  text: "chunk 0 text...",
  source: "slack",
  chunk_index: 0,
  total_chunks: 3,
  is_chunked: true,
  // ... other fields
}
```

### Notion Blocks

**Before:**

```typescript
// One vector per block
id: "notion-page123-block456"
metadata: {
  text: "entire block...",
  source: "notion",
  // ... other fields
}
```

**After:**

```typescript
// Multiple vectors per long block
id: "notion-page123-block456-chunk-0"
metadata: {
  text: "chunk 0 text...",
  source: "notion",
  chunk_index: 0,
  total_chunks: 2,
  is_chunked: true,
  // ... other fields
}
```

---

## Benefits

### 1. **Improved Search Accuracy**

- **Smaller chunks = more precise matching**
- Query embeddings match specific paragraphs, not entire documents
- Reduces false positives from large, mixed-topic content

### 2. **No Token Limit Issues**

- OpenAI embedding API: 8,192 token limit per input
- Long Slack threads (10k+ tokens) now processed without errors
- Large Notion documents automatically segmented

### 3. **Context Preservation**

- **100-token overlap** prevents information loss at boundaries
- Ensures sentences/thoughts aren't cut mid-context
- Critical for understanding references like "this", "that", "the above"

### 4. **Hybrid Search Ready**

- Granular chunks work better with BM25 keyword matching
- Semantic embeddings complement keyword scores
- Enables future reranking pipelines

### 5. **Better User Experience**

- More relevant search results
- Answers cite specific paragraphs, not whole documents
- Faster retrieval (smaller vectors = faster distance calculations)

---

## Performance Considerations

### Batch Processing

**Embedding Service:**

```typescript
// Automatically batches up to 2048 chunks per API call
async embedTexts(texts: string[], chunkSize: number = 2048)
```

**Example:**

- 100 Slack messages → Average 2 chunks each → 200 total chunks
- Processed in 1 batch (200 < 2048 limit)
- ~2-3 seconds for embeddings

### Rate Limiting

**Retry Logic with Exponential Backoff:**

```typescript
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BACKOFF_MULTIPLIER: 2,
  INITIAL_DELAY_MS: 1000,
};
```

**Behavior:**

- Attempt 1 fails → wait 1s
- Attempt 2 fails → wait 2s
- Attempt 3 fails → wait 4s
- After 3 attempts → throw error

Applied to:

- OpenAI embedding API (429 errors)
- Pinecone upsert operations
- Vector queries

---

## Testing

### Unit Tests

```typescript
// apps/backend/src/services/chunking.service.test.ts

✅ Short text (< MAX_TOKENS) → Single chunk
✅ Long text (> MAX_TOKENS) → Multiple chunks
✅ Chunk overlap verification
✅ Token count validation (≤ 1000 per chunk)
✅ Metadata consistency (chunkIndex, totalChunks)
✅ Boundary handling (sentences, paragraphs)
```

### Integration Tests

**Slack Ingestion:**

```bash
# Test with long thread (5000+ tokens)
POST /api/integrations/slack/sync
```

**Notion Ingestion:**

```bash
# Test with large document (10+ pages)
POST /api/integrations/notion/sync
```

---

## Metadata Schema

### Chunk-Specific Fields

```typescript
interface ChunkMetadata {
  // New fields for chunked content
  chunk_index: number; // 0-indexed position in chunk array
  total_chunks: number; // Total chunks for parent content
  is_chunked: boolean; // True if content was split

  // Existing fields (preserved)
  text: string;
  source: "slack" | "notion";
  timestamp: number;
  organization_id: string;
  // ... source-specific fields
}
```

### Querying Chunks

**Find all chunks from same parent:**

```typescript
// Slack: Extract channel + timestamp from ID
const parentId = "slack-C123-1234567890.123456";
// Query: id startsWith "slack-C123-1234567890.123456-chunk-"

// Notion: Extract page + block from ID
const parentId = "notion-page123-block456";
// Query: id startsWith "notion-page123-block456-chunk-"
```

**Reassemble original content:**

```typescript
// Sort by chunk_index
const sortedChunks = results.sort((a, b) => a.metadata.chunk_index - b.metadata.chunk_index);

// Deduplicate overlaps (simple concatenation works due to overlap)
const fullText = sortedChunks.map((chunk) => chunk.metadata.text).join(" ");
```

---

## Configuration

### Environment Variables

```bash
# OpenAI Embedding Model
# Currently using text-embedding-3-small (1536D)
# Note: Hardcoded in config.ts, not from env var

# Pinecone Configuration
PINECONE_INDEX_NAME=mitable-vectors
# Dimension: 1536 (matches text-embedding-3-small)
```

### Embedding Model Selection

**Current:** `text-embedding-3-small` (1536 dimensions)

**Why this model:**

- ✅ **Cost effective:** $0.02 per 1M tokens (vs $0.13 for 3-large)
- ✅ **Fast:** Quicker embedding generation
- ✅ **Sufficient accuracy:** OpenAI benchmarks show only 3-5% difference vs 3-large
- ✅ **No migration needed:** Matches existing Pinecone index

**When to upgrade to text-embedding-3-large (3072D):**

- Search quality is insufficient in production testing
- Budget allows for 6.5x cost increase
- Willing to recreate Pinecone index (requires full re-ingestion of all data)
- Need maximum possible accuracy

**Migration steps** (if upgrading to 3-large):

1. Create new Pinecone index with 3072 dimensions
2. Update `config.ts`: `embeddingModel: "text-embedding-3-large"`
3. Update `config.ts`: `vectorDimensions: 3072`
4. Re-ingest all Slack and Notion data
5. Update index name in environment variables
6. Delete old 1536D index

### Adjusting Chunk Size

To modify chunking behavior, edit `chunking.service.ts`:

```typescript
const CHUNK_CONFIG = {
  MIN_TOKENS: 500, // Decrease for more granular search
  MAX_TOKENS: 1000, // Increase to reduce chunk count
  OVERLAP_TOKENS: 100, // Increase to preserve more context
};
```

**Tradeoffs:**

- **Smaller chunks:** Better precision, more vectors, higher costs
- **Larger chunks:** Faster ingestion, fewer vectors, less precision
- **More overlap:** Better context, more duplication, higher costs

---

## Future Enhancements

### 1. **Semantic Boundary Detection**

- Use NLP to detect topic shifts
- Chunk at paragraph/section boundaries
- Preserve logical document structure

### 2. **Dynamic Chunk Sizing**

- Adjust chunk size based on content type
- Slack messages: 300-500 tokens
- Notion documents: 700-1000 tokens
- Code blocks: preserve full functions

### 3. **Hierarchical Chunking**

- Parent chunks (1000 tokens)
- Child chunks (250 tokens)
- Enable multi-level retrieval

### 4. **Metadata Enrichment**

- Extract keywords from each chunk
- Generate summaries
- Store chunk embeddings + keyword scores for hybrid search

---

## Troubleshooting

### Issue: Chunks too small/large

**Solution:** Adjust `CHUNK_CONFIG` in `chunking.service.ts`

### Issue: Poor search results after chunking

**Possible causes:**

- Overlap too small (increase `OVERLAP_TOKENS`)
- Chunks splitting mid-sentence (enable boundary detection)
- Need hybrid search (combine with keyword matching)

### Issue: Rate limit errors during ingestion

**Solution:** Already handled by retry logic, but if persistent:

- Reduce batch size in `embedding.service.ts` (default: 2048)
- Add delays between batches
- Check OpenAI API rate limits

---

## References

- **Chunking Service:** `apps/backend/src/services/chunking.service.ts`
- **Ingestion Service:** `apps/backend/src/services/ingestion.service.ts`
- **Embedding Service:** `apps/backend/src/services/embedding.service.ts`
- **Vector Service:** `apps/backend/src/services/vector.service.ts`
- **Tests:** `apps/backend/src/services/chunking.service.test.ts`

---

## Summary

| Metric                  | Before               | After                   |
| ----------------------- | -------------------- | ----------------------- |
| **Max Content Size**    | ~8k tokens           | Unlimited               |
| **Search Precision**    | Low (whole docs)     | High (paragraphs)       |
| **Context Loss**        | High (at boundaries) | Low (100-token overlap) |
| **Rate Limit Handling** | None                 | Exponential backoff     |
| **Hybrid Search Ready** | No                   | Yes                     |
| **Vector Count**        | ~1 per message/block | ~1-5 per message/block  |

**Result:** Better search accuracy, no token limit errors, ready for hybrid search optimization.
