# Big Retrieval Mode (BRM) — Design Outline

Status: Proposed (v1 scoped)  
Owner: Aurel  
Last Updated: 2025-11-05

## Goals

- Handle queries that return large result sets (Slack + Notion) without blowing token/rate limits.
- Produce readable, resumable answers with accurate, per-part sources.
- Generalize beyond temporal queries; works for any broad search.

## v1 Scope (Agreed)

- Storage: Postgres table with 24h TTL
- Entry heuristic: enter BRM if
  - total candidate units > 30, or
  - semantic candidates ≥ 80 across multiple sources, or
  - user asks for broad result (e.g., “everything about”, “all updates”, “recap the month”)
- Per-reply budget: up to 8 units per reply, ~6500 tokens target

## Key Concepts

- Unit: smallest meaningful item to summarize
  - Slack: a thread (parent + top replies)
  - Notion: a page (or top sections if page is very long)
- Stamp (QueryStamp): stable hash of (orgId, normalized query, filters)
- Session: progress + cursors so we can resume on "continue"

## Data Model (Postgres)

Table: big_retrieval_sessions

- id uuid PK
- conversation_id uuid
- stamp text UNIQUE
- org_id uuid
- query text
- filters jsonb
- cursors jsonb
- next_unit text
- processed_units text[] default []
- collected_sources jsonb default []
- created_at timestamptz default now()
- expires_at timestamptz (created_at + interval '24 hours')
  Indexes: (stamp), (conversation_id), (expires_at)
  Cleanup: delete where now() > expires_at

## Stamp Builder

- Input: orgId, query (trimmed/lowercased), filters (sources, channels, notionSpaces, time)
- Output: sha1(JSON.stringify(sorted-fields))

## Flow (Per Request)

1. Initial Retrieval

- Run hybrid search (existing). Compute stats (candidate units, sources span).
- If shouldEnterBRM(stats) is true → BRM loop, else normal path.

2. BRM Loop (per reply)

- MAX_UNITS_PER_REPLY = 8; TOKENS_TARGET ≈ 6500.
- Get or create session by stamp.
- getNextUnits(session, max): deterministic page over current candidates (stable sort; skip processedUnits).
- For each unit:
  - packUnit(unit):
    - Slack: parent + top 5 replies (+ users, permalink)
    - Notion: page title + top 2–3 blocks
  - summarizeUnit(packed): short factual summary; return part-scoped sources
  - Append to synthesized output, accumulate sources
  - Mark unit as processed, advance nextUnit
  - Stop if token target exceeded
- Persist session (offsets + processedUnits + collected_sources)
- If more units remain: append affordance — "Covered 8 items. Reply continue to load more, or refine filters (e.g., only #product, last week, Notion only)."

3. Resume

- If user replies "continue", load session by stamp and resume loop.

## Heuristics & Ordering

- Temporal queries: order units chronological (oldest → newest)
- Non-temporal: trust/semantic ordering
- Enforce cross-part dedupe using processedUnits

## Safety Rails

- Unit guard: summarize only if unit has ≥ K tokens; otherwise list neutrally with link
- Evidence threshold per part: if < M tokens, return neutral list of links
- Per-part Sources only (no global list) to avoid hallucinations

## Rate Limits (v1)

- v1: page over already fetched candidate pool deterministically (no provider cursors yet)
- v2: add Slack channel cursors + Notion next_cursor; early stop on 429 and persist state

## Metrics (v1)

- units_processed, tokens_emitted, coverage_span, time_per_unit, rate_limit_hits

## v2 Enhancements (Later)

- Provider cursors + backoff across Slack/Notion
- Topic clustering of units before summarization
- Better packing strategies per source (e.g., Notion sectioning)
- Cross-session LRU for processedUnits to avoid unbounded growth

## Integration Points

- KnowledgeAgent: decides BRM entry; runs BRM loop; formats output; handles "continue"
- SearchKnowledgeTool: expose candidate units (threads/pages) and timestamps in metadata to support deterministic paging
- Orchestrator: detect "continue" intent and route to KnowledgeAgent resume with same stamp

## Open Questions

- Exact K/M thresholds for unit guard/evidence (tune with logs)
- How to present cluster headings (if clustering is added in v2)

## Next Steps

- Add DB migration for big_retrieval_sessions (24h TTL cleanup)
- Implement big-retrieval.service.ts (stamp, CRUD, getNextUnits, packUnit, summarizeUnit)
- Wire BRM entry/resume in KnowledgeAgent + Orchestrator
- Add basic metrics + logs
