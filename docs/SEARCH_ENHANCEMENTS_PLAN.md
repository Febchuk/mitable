# Search Enhancements Plan

**Branch:** `feature/search-enhancements`  
**Owner:** Aurel Npounengnong  
**Status:** In Progress  
**Date:** October 25, 2025

---

## Goal

Enhance hybrid search with caching, metrics tracking, REST API endpoints, and comprehensive tests to improve performance, observability, and maintainability.

---

## Enhancements Overview

### 1. Caching Layer ⚡

**Goal:** Reduce search latency for common queries from 2s → <100ms

**Approach:**

- Use **node-cache** for in-memory 10-minute TTL cache
- Cache key: `search:{orgId}:{queryHash}:{filters}`
- Automatic TTL expiration
- Track cache hit rate

**Note:** Using in-memory cache (node-cache) instead of Redis to avoid external dependencies for now. Can migrate to Redis later if needed for multi-instance scaling.

**Files:**

- `apps/backend/src/services/cache.service.ts` (new)
- `apps/backend/src/services/search.service.ts` (modify)

---

### 2. Search Metrics 📊

**Goal:** Observability for internal debugging (console logs only)

**What to Log:**

- Cache HIT/MISS
- Search time (cached vs uncached)
- Result counts (semantic/keyword/total)
- No-results queries

**Approach:**

- Structured console logging (not database)
- Format: `[SearchService] Cache HIT - Query: "..." - Time: 95ms - Results: 10`
- Easy to grep logs for patterns

**Files:**

- `apps/backend/src/services/search.service.ts` (modify - add logging)

---

### 3. REST API Routes 🌐

**Goal:** Expose search via REST for future web/mobile clients

**Endpoints:**

- `POST /api/search` - Hybrid search
- `GET /api/search/history` - User's recent searches
- `GET /api/search/metrics` - Admin metrics dashboard
- `DELETE /api/search/cache` - Admin cache invalidation

**Files:**

- `apps/backend/src/routes/search.ts` (new)
- `apps/backend/src/app.ts` (register routes)

---

### 4. Unit Tests 🧪

**Goal:** Ensure correctness and prevent regressions

**Test Coverage:**

- RRF merge algorithm
- Recency boosting calculations
- Temporal parsing (calendar weeks)
- Date filtering
- Cache key generation
- Metrics recording

**Files:**

- `apps/backend/src/services/__tests__/search.service.test.ts` (new)
- `apps/backend/src/services/__tests__/cache.service.test.ts` (new)
- `apps/backend/src/tools/__tests__/search-knowledge.tool.test.ts` (new)

---

## Implementation Order

### Phase 1: Caching + Logging (Primary - Linear Ticket)

**Why:** Main requirement from Linear ticket, biggest performance win

1. Install `node-cache` package
2. Create cache service (in-memory)
3. Integrate into search service
4. Add structured console logging (cache hit/miss, timing)

**Success Criteria:**

- [ ] Cache hit reduces latency <100ms (target: 500ms → <100ms)
- [ ] Uncached queries < 2s
- [ ] Logs clearly show: `Cache HIT - 95ms` vs `Cache MISS - 1850ms`
- [ ] Cache improves repeat query performance by >80%

---

### Phase 3: Tests (Day 3)

**Why third:** Protect completed work

1. Test search service core logic
2. Test RRF merge
3. Test temporal parsing
4. Test cache service

**Success Criteria:**

- [ ] > 80% code coverage
- [ ] All edge cases tested
- [ ] Tests run in CI

---

### Phase 4: API Routes (Day 4)

**Why last:** Optional for current use case

1. Create search routes
2. Add authentication middleware
3. Add rate limiting
4. Document with Swagger

**Success Criteria:**

- [ ] REST endpoints work
- [ ] Proper auth/validation
- [ ] Swagger docs complete

---

## Technical Details

### Cache Service Architecture

```typescript
interface CacheService {
  get(key: string): Promise<any | null>;
  set(key: string, value: any, ttl: number): Promise<void>;
  invalidate(pattern: string): Promise<void>;
  getStats(): Promise<CacheStats>;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
}
```

**Cache Key Strategy:**

```typescript
const cacheKey = `search:${orgId}:${hash(query)}:${hash(filters)}`;
```

**Invalidation Strategy:**

- On new data ingestion: `invalidate('search:${orgId}:*')`
- Manual: Admin endpoint to clear all/specific org

---

### Metrics Schema

```sql
CREATE TABLE search_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID,

  -- Query details
  query TEXT NOT NULL,
  filters JSONB,

  -- Performance
  search_time_ms INTEGER NOT NULL,
  cache_hit BOOLEAN NOT NULL DEFAULT false,

  -- Results
  total_results INTEGER NOT NULL,
  semantic_results INTEGER NOT NULL,
  keyword_results INTEGER NOT NULL,

  -- Quality
  has_results BOOLEAN NOT NULL,
  clicked_result_id TEXT, -- If user clicked a result

  -- Timestamps
  searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Indexes
  INDEX idx_search_metrics_org (organization_id),
  INDEX idx_search_metrics_time (searched_at),
  INDEX idx_search_metrics_no_results (has_results) WHERE has_results = false
);
```

---

### REST API Design

#### `POST /api/search`

**Request:**

```json
{
  "query": "what is the team working on?",
  "filters": {
    "source": "slack",
    "channels": ["C123", "C456"],
    "dateFrom": "2025-10-20",
    "dateTo": "2025-10-27"
  },
  "topK": 10
}
```

**Response:**

```json
{
  "results": [...],
  "totalResults": 10,
  "searchTime": 150,
  "cached": true,
  "metadata": {
    "semanticResults": 8,
    "keywordResults": 2
  }
}
```

---

## Configuration

### Redis Setup

**Environment Variables:**

```bash
REDIS_URL=redis://localhost:6379
REDIS_TTL=600  # 10 minutes
```

**Docker Compose (for local dev):**

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

---

## Testing Strategy

### Unit Tests

**Search Service:**

- RRF merge with various input combinations
- Recency boost calculations
- Score normalization
- Error handling

**Cache Service:**

- Get/set operations
- TTL expiration
- Pattern-based invalidation
- Stats tracking

**Temporal Parsing:**

- "this week" → correct Monday-Sunday
- "last week" → previous Monday-Sunday
- Edge cases (year boundaries, DST, etc.)

### Integration Tests

**End-to-End Search:**

- Query → cache miss → DB → cache set → response
- Query → cache hit → response
- Query with filters
- Query with no results

---

## Performance Targets

### Before Enhancements

- Uncached search: ~2000ms
- No cache
- No metrics
- No tests

### After Enhancements

- Cached search: <100ms (95% faster)
- Cache hit rate: >40%
- Metrics tracked: 100% of searches
- Test coverage: >80%

---

## Monitoring & Alerting

### Key Metrics to Monitor

- Search latency p95 > 3s → Alert
- Cache hit rate < 30% → Warning
- No-result queries > 20% → Warning
- Search errors > 1% → Alert

### Dashboard Queries

**Search Performance:**

```sql
SELECT
  DATE_TRUNC('hour', searched_at) as hour,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY search_time_ms) as p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY search_time_ms) as p95,
  AVG(search_time_ms) as avg_ms
FROM search_metrics
WHERE searched_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;
```

**Cache Hit Rate:**

```sql
SELECT
  COUNT(*) FILTER (WHERE cache_hit) as hits,
  COUNT(*) FILTER (WHERE NOT cache_hit) as misses,
  ROUND(100.0 * COUNT(*) FILTER (WHERE cache_hit) / COUNT(*), 2) as hit_rate
FROM search_metrics
WHERE searched_at > NOW() - INTERVAL '1 hour';
```

**No-Result Queries:**

```sql
SELECT query, COUNT(*) as count
FROM search_metrics
WHERE has_results = false
  AND searched_at > NOW() - INTERVAL '7 days'
GROUP BY query
ORDER BY count DESC
LIMIT 20;
```

---

## Rollout Plan

### Stage 1: Metrics Only

- Deploy metrics without cache/API
- Collect baseline data for 2-3 days
- Validate tracking works

### Stage 2: Cache

- Add Redis to production
- Enable caching
- Monitor cache hit rate and latency improvement

### Stage 3: Tests

- Add to CI pipeline
- Run on every PR

### Stage 4: API (Optional)

- Deploy behind feature flag
- Gradual rollout

---

## Success Criteria

### Phase 1: Metrics ✅

- [ ] All searches tracked in DB
- [ ] Dashboard shows latency trends
- [ ] No-result queries identifiable

### Phase 2: Caching ✅

- [ ] Cache hit rate >40%
- [ ] Cached searches <100ms
- [ ] Proper invalidation on data changes

### Phase 3: Tests ✅

- [ ] > 80% code coverage
- [ ] All critical paths tested
- [ ] Tests pass in CI

### Phase 4: API ✅

- [ ] REST endpoints functional
- [ ] Auth/rate limiting working
- [ ] Swagger docs complete

---

## Future Considerations

### Advanced Caching

- Multi-level cache (memory → Redis → DB)
- Cache warming for popular queries
- Semantic cache (similar queries → same results)

### Advanced Metrics

- User feedback on result quality
- Click-through rate tracking
- Search abandonment rate

### Advanced Features

- Query suggestions/autocomplete
- Search result highlighting
- Federated search across orgs

---

## References

- Redis Caching Best Practices: https://redis.io/docs/manual/client-side-caching/
- Search Quality Metrics: https://www.algolia.com/doc/guides/managing-results/optimize-search-results/
- Jest Testing Guide: https://jestjs.io/docs/getting-started
