# Vector Database Schema (Pinecone)

Complete documentation for Pinecone vector database structure, metadata schemas, and query patterns.

## Table of Contents

- [Overview](#overview)
- [Index Configuration](#index-configuration)
- [Namespace Structure](#namespace-structure)
- [Metadata Schemas](#metadata-schemas)
- [Embedding Pipeline](#embedding-pipeline)
- [Query Patterns](#query-patterns)
- [Data Lifecycle](#data-lifecycle)
- [Performance Optimization](#performance-optimization)

---

## Overview

Mitable uses Pinecone to store vector embeddings for semantic search in RAG (Retrieval-Augmented Generation) responses.

**Key Decisions:**

- **Model**: OpenAI `text-embedding-3-small` (1536 dimensions)
- **Metric**: Cosine similarity
- **Storage**: Organized by namespaces per integration type

**Architecture:**

```
PostgreSQL (Supabase)      Pinecone
     ↓                        ↓
Organizations           (metadata only)
Integrations            (metadata only)
Messages/Docs      →    Vector Embeddings + Metadata
```

---

## Index Configuration

### Pinecone Index Settings

**Index Name**: `mitable-embeddings`

**Configuration:**

```typescript
{
  name: "mitable-embeddings",
  dimension: 1536,              // OpenAI text-embedding-3-small
  metric: "cosine",             // Cosine similarity
  spec: {
    serverless: {
      cloud: "aws",
      region: "us-east-1"       // Choose closest to your users
    }
  }
}
```

### Why These Settings?

- **1536 dimensions**: Optimal balance of performance and quality for text-embedding-3-small
- **Cosine similarity**: Best for normalized embeddings (semantic meaning)
- **Serverless**: Auto-scaling, pay-per-use (ideal for MVP)

---

## Namespace Structure

Pinecone uses namespaces to logically separate different data types.

### Namespace Organization

```
mitable-embeddings (index)
├── slack-messages           # Slack channel messages
├── notion-pages             # Notion page content
├── github-issues            # GitHub issues/PRs
├── github-code              # Code snippets from repos
├── google-drive-docs        # Google Drive documents
├── expert-profiles          # Expert expertise embeddings
└── questions                # Previously asked questions (for deduplication)
```

### Namespace Naming Convention

Format: `{integration-type}-{data-type}`

Examples:

- `slack-messages`
- `notion-pages`
- `github-issues`
- `google-drive-docs`

---

## Metadata Schemas

Each vector stores metadata to identify the source document and enable filtering.

### Common Fields (All Namespaces)

```typescript
interface BaseMetadata {
  // Required
  text: string; // Original text (for display)
  source_type: string; // 'slack' | 'notion' | 'github' | 'google-drive'
  organization_id: string; // UUID from PostgreSQL
  created_at: number; // Unix timestamp

  // Optional
  author_id?: string; // User UUID who created
  author_name?: string; // Display name
  tags?: string[]; // Searchable tags
}
```

---

### 1. Slack Messages (`slack-messages`)

```typescript
interface SlackMessageMetadata extends BaseMetadata {
  source_type: "slack";

  // Slack-specific
  integration_id: string; // UUID from integrations table
  channel_id: string; // Slack channel ID (e.g., "C01ABC123")
  channel_name: string; // Display name (e.g., "#engineering")
  message_ts: string; // Slack message timestamp
  thread_ts?: string; // Thread timestamp (if in thread)
  user_id: string; // Slack user ID
  user_name: string; // Slack display name
  permalink: string; // Deep link to message

  // Content metadata
  has_attachments: boolean;
  reactions?: string[]; // Emoji reactions
  is_pinned: boolean;
}
```

**Example:**

```json
{
  "text": "To deploy the app, run npm run build then npm run start. Make sure env vars are set.",
  "source_type": "slack",
  "organization_id": "org-123",
  "integration_id": "int-456",
  "channel_id": "C01ABC123",
  "channel_name": "#engineering",
  "message_ts": "1697040000.123456",
  "user_id": "U01XYZ",
  "user_name": "Jane Doe",
  "permalink": "https://acme.slack.com/archives/C01ABC123/p1697040000123456",
  "created_at": 1697040000,
  "has_attachments": false,
  "is_pinned": true
}
```

**Vector ID Format**: `slack-{channel_id}-{message_ts}`

---

### 2. Notion Pages (`notion-pages`)

```typescript
interface NotionPageMetadata extends BaseMetadata {
  source_type: "notion";

  // Notion-specific
  integration_id: string;
  page_id: string; // Notion page UUID
  page_title: string;
  parent_id?: string; // Parent page/database ID
  parent_title?: string;
  workspace_id: string;

  // Content metadata
  page_url: string; // Notion page URL
  last_edited_time: number; // Unix timestamp
  chunk_index: number; // If page split into chunks
  total_chunks: number;
}
```

**Example:**

```json
{
  "text": "Our deployment process uses GitHub Actions. First, create a PR...",
  "source_type": "notion",
  "organization_id": "org-123",
  "integration_id": "int-789",
  "page_id": "abc-123-def",
  "page_title": "Deployment Guide",
  "parent_title": "Engineering Docs",
  "workspace_id": "workspace-xyz",
  "page_url": "https://notion.so/acme/Deployment-Guide-abc123",
  "created_at": 1697040000,
  "last_edited_time": 1697050000,
  "chunk_index": 0,
  "total_chunks": 3
}
```

**Vector ID Format**: `notion-{page_id}-chunk-{chunk_index}`

---

### 3. GitHub Issues/PRs (`github-issues`)

```typescript
interface GitHubIssueMetadata extends BaseMetadata {
  source_type: "github";

  // GitHub-specific
  integration_id: string;
  repo_full_name: string; // e.g., "acme/frontend"
  issue_number: number;
  issue_type: "issue" | "pr";
  title: string;
  state: "open" | "closed";
  labels: string[];

  // Content metadata
  html_url: string; // GitHub URL
  comments_count: number;
  created_at: number;
  updated_at: number;
  closed_at?: number;
}
```

**Example:**

```json
{
  "text": "Bug: Deployment fails when env vars missing. Solution: Add validation step...",
  "source_type": "github",
  "organization_id": "org-123",
  "integration_id": "int-999",
  "repo_full_name": "acme/backend",
  "issue_number": 42,
  "issue_type": "issue",
  "title": "Add env var validation",
  "state": "closed",
  "labels": ["bug", "deployment"],
  "html_url": "https://github.com/acme/backend/issues/42",
  "author_name": "John Smith",
  "created_at": 1697040000,
  "updated_at": 1697050000,
  "closed_at": 1697055000
}
```

**Vector ID Format**: `github-{repo_name}-{issue_type}-{number}`

---

### 4. GitHub Code Snippets (`github-code`)

```typescript
interface GitHubCodeMetadata extends BaseMetadata {
  source_type: "github";

  // GitHub-specific
  integration_id: string;
  repo_full_name: string;
  file_path: string; // e.g., "src/services/auth.ts"
  language: string; // Programming language
  branch: string;

  // Content metadata
  function_name?: string; // If specific function
  class_name?: string; // If specific class
  line_start: number;
  line_end: number;
  blob_url: string; // GitHub file URL
}
```

**Example:**

```json
{
  "text": "export async function authenticateUser(token: string) { ... }",
  "source_type": "github",
  "organization_id": "org-123",
  "integration_id": "int-999",
  "repo_full_name": "acme/backend",
  "file_path": "src/services/auth.ts",
  "language": "typescript",
  "branch": "main",
  "function_name": "authenticateUser",
  "line_start": 45,
  "line_end": 62,
  "blob_url": "https://github.com/acme/backend/blob/main/src/services/auth.ts#L45-L62",
  "created_at": 1697040000
}
```

**Vector ID Format**: `github-code-{repo_name}-{file_path_hash}-{line_start}`

---

### 5. Google Drive Documents (`google-drive-docs`)

```typescript
interface GoogleDriveDocMetadata extends BaseMetadata {
  source_type: "google-drive";

  // Google Drive-specific
  integration_id: string;
  file_id: string; // Google Drive file ID
  file_name: string;
  mime_type: string; // e.g., "application/vnd.google-apps.document"
  folder_id?: string;
  folder_name?: string;

  // Content metadata
  web_view_link: string; // Google Drive URL
  last_modified_time: number;
  chunk_index: number;
  total_chunks: number;
}
```

**Example:**

```json
{
  "text": "Onboarding checklist: 1. Set up laptop, 2. Access Slack...",
  "source_type": "google-drive",
  "organization_id": "org-123",
  "integration_id": "int-111",
  "file_id": "1abc_xyz_123",
  "file_name": "New Hire Onboarding",
  "mime_type": "application/vnd.google-apps.document",
  "folder_name": "HR Documents",
  "web_view_link": "https://docs.google.com/document/d/1abc_xyz_123/edit",
  "created_at": 1697040000,
  "last_modified_time": 1697050000,
  "chunk_index": 0,
  "total_chunks": 2
}
```

**Vector ID Format**: `gdrive-{file_id}-chunk-{chunk_index}`

---

### 6. Expert Profiles (`expert-profiles`)

Used for semantic matching of experts to questions.

```typescript
interface ExpertProfileMetadata extends BaseMetadata {
  source_type: "expert";

  // Expert-specific
  user_id: string; // UUID from users table
  expertise_areas: string[]; // ["React", "TypeScript", "Deployment"]
  confidence_scores: number[]; // [0.92, 0.88, 0.75] - matches expertise_areas

  // Performance metrics
  response_rate: number; // 0.0 to 1.0
  helpfulness_score: number; // 0.0 to 5.0
  avg_response_time_hours: number;
  total_interactions: number;
}
```

**Example:**

```json
{
  "text": "Expert in React, TypeScript, and deployment. Strong background in frontend architecture and CI/CD pipelines.",
  "source_type": "expert",
  "organization_id": "org-123",
  "user_id": "user-456",
  "author_name": "Jane Doe",
  "expertise_areas": ["React", "TypeScript", "Deployment", "CI/CD"],
  "confidence_scores": [0.92, 0.88, 0.85, 0.8],
  "response_rate": 0.95,
  "helpfulness_score": 4.7,
  "avg_response_time_hours": 2.5,
  "total_interactions": 47,
  "created_at": 1697040000
}
```

**Vector ID Format**: `expert-{user_id}`

---

### 7. Questions (`questions`)

Previously asked questions for deduplication and similar question matching.

```typescript
interface QuestionMetadata extends BaseMetadata {
  source_type: "question";

  // Question-specific
  conversation_id: string; // UUID from conversations table
  user_id: string;
  topic?: string; // Inferred topic

  // Resolution metadata
  was_resolved: boolean;
  resolution_time_seconds?: number;
  expert_id?: string; // If answered by expert
  confidence_score: number; // How confident AI was in answer
}
```

**Example:**

```json
{
  "text": "How do I deploy the backend to production?",
  "source_type": "question",
  "organization_id": "org-123",
  "user_id": "user-789",
  "conversation_id": "conv-123",
  "topic": "Deployment",
  "was_resolved": true,
  "resolution_time_seconds": 180,
  "expert_id": "user-456",
  "confidence_score": 0.85,
  "created_at": 1697040000
}
```

**Vector ID Format**: `question-{conversation_id}-{timestamp}`

---

## Embedding Pipeline

### Data Flow

```
Integration Source
    ↓
Fetch Data (slack.service.ts, notion.service.ts, etc.)
    ↓
Chunk Text (chunking.service.ts)
    ↓
Generate Embeddings (embedding.service.ts → OpenAI)
    ↓
Upsert to Pinecone (vector.service.ts)
    ↓
Store Sync Metadata (PostgreSQL sync_logs)
```

### Chunking Strategy

**Max chunk size**: 1000 characters (optimal for embeddings)

**Slack Messages:**

- No chunking (messages are already short)
- Threads: Concatenate thread messages

**Notion Pages:**

- Split by headers/sections
- Max 1000 chars per chunk
- Preserve context (overlap 100 chars)

**GitHub:**

- Issues: Chunk if >1000 chars
- Code: Split by functions/classes
- Comments: Group by thread

**Google Drive:**

- Split by paragraphs
- Max 1000 chars per chunk
- Preserve headings in metadata

---

## Query Patterns

### 1. RAG Query for Chat

Find relevant context for user question:

```typescript
// 1. Embed user's question
const questionEmbedding = await embeddingService.embedText(question);

// 2. Query Pinecone across relevant namespaces
const namespaces = ['slack-messages', 'notion-pages', 'github-issues'];
const results = [];

for (const namespace of namespaces) {
  const matches = await vectorService.queryVectors(
    questionEmbedding,
    topK: 5,
    namespace,
    filter: {
      organization_id: { $eq: userOrgId }
    }
  );
  results.push(...matches);
}

// 3. Re-rank by score
const topResults = results
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);

// 4. Format context for LLM
const context = topResults.map(r =>
  `[${r.metadata.source_type}] ${r.metadata.text}`
).join('\n\n');
```

**Response time target**: <500ms for vector query

---

### 2. Expert Matching Query

Find best expert for a question:

```typescript
// 1. Embed the question
const questionEmbedding = await embeddingService.embedText(question);

// 2. Query expert-profiles namespace
const expertMatches = await vectorService.queryVectors(
  questionEmbedding,
  topK: 20,
  namespace: 'expert-profiles',
  filter: {
    organization_id: { $eq: userOrgId },
    response_rate: { $gte: 0.7 } // Only active experts
  }
);

// 3. Combine with PostgreSQL metrics (hybrid scoring)
const rankedExperts = expertMatches.map(match => ({
  ...match,
  finalScore: (
    match.score * 0.4 +                           // Semantic similarity (40%)
    match.metadata.helpfulness_score / 5 * 0.3 +  // Performance (30%)
    match.metadata.response_rate * 0.3             // Availability (30%)
  )
})).sort((a, b) => b.finalScore - a.finalScore);

const topExpert = rankedExperts[0];
```

---

### 3. Similar Question Deduplication

Check if question was asked before:

```typescript
// 1. Embed new question
const questionEmbedding = await embeddingService.embedText(newQuestion);

// 2. Query questions namespace
const similarQuestions = await vectorService.queryVectors(
  questionEmbedding,
  topK: 3,
  namespace: 'questions',
  filter: {
    organization_id: { $eq: userOrgId },
    was_resolved: { $eq: true } // Only resolved questions
  }
);

// 3. If very similar (score > 0.9), suggest existing answer
if (similarQuestions[0].score > 0.9) {
  return {
    isDuplicate: true,
    originalQuestion: similarQuestions[0].metadata.text,
    conversationId: similarQuestions[0].metadata.conversation_id
  };
}
```

---

## Data Lifecycle

### Ingestion Schedule

| Integration  | Frequency              | Method                                  |
| ------------ | ---------------------- | --------------------------------------- |
| Slack        | 4x/day (every 6 hours) | Incremental sync                        |
| Notion       | 4x/day                 | Full re-index weekly, incremental daily |
| GitHub       | 1x/day                 | Incremental (webhooks in future)        |
| Google Drive | 1x/day                 | Incremental                             |

### Updates

**Modified documents:**

- Delete old vector: `vectorService.deleteVectors([vectorId])`
- Re-embed updated text
- Upsert new vector with same ID (overwrites)

**Deleted documents:**

- Delete from Pinecone: `vectorService.deleteVectors([vectorId])`
- Keep metadata in PostgreSQL with `deleted_at` timestamp

### Retention

- Keep all vectors (no automatic deletion)
- Manual cleanup via admin dashboard
- Archive old vectors to cheaper storage after 1 year (future)

---

## Performance Optimization

### Batching

Embed and upsert in batches:

```typescript
// Batch embed (OpenAI allows up to 2048 inputs)
const texts = messages.map((m) => m.text);
const embeddings = await embeddingService.embedTexts(texts); // Batch call

// Batch upsert (Pinecone recommends 100-1000 vectors per batch)
const vectors = embeddings.map((emb, i) => ({
  id: messages[i].id,
  values: emb,
  metadata: messages[i].metadata,
}));

await vectorService.upsertVectors(vectors, namespace);
```

### Caching

- Cache frequent queries in Redis (future)
- Cache expert profiles in memory (refresh every 5 minutes)

### Filtering

Always filter by `organization_id` for:

- Data isolation (multi-tenancy)
- Reduced search space (faster queries)

```typescript
filter: {
  organization_id: {
    $eq: userOrgId;
  }
}
```

---

## Next Steps

1. ✅ Review vector schema
2. → Set up Pinecone index
3. → Implement ingestion pipeline (Phase 2 - Issue #17)
4. → Implement RAG queries (Phase 3 - Issue #18)
5. → Test end-to-end RAG flow

---

## See Also

- [Supabase Setup Guide](./supabase_setup.md)
- [Database Schema](./database_schema.md)
- [Phase 2: Slack Ingestion](https://github.com/Febchuk/mitable/issues/17)
- [Phase 3: RAG Query System](https://github.com/Febchuk/mitable/issues/18)
