# GitHub Integration Documentation

**Last Updated:** November 21, 2025  
**Status:** Production  
**Version:** 1.0

---

## Overview

The GitHub integration allows organizations to sync repositories, commits, pull requests, and issues into Mitable's knowledge base. Code is chunked and embedded for semantic search, while commits, PRs, and issues are summarized with rich metadata for discussion search.

**Key Features:**
- ✅ Repository and branch syncing
- ✅ Commit history with file changes
- ✅ Code file chunking (80 lines/chunk, 10-line overlap)
- ✅ Pull Request sync with files and comments
- ✅ Issue sync with comments and labels
- ✅ Area classification (electron-main, backend-api, etc.)
- ✅ Dual-write to Pinecone (semantic) + PostgreSQL (keyword)
- ✅ Automatic cron sync every 6 hours

---

## Architecture Flow

```
GitHub App Installation
    ↓
OAuth Callback → Save Installation ID
    ↓
Fetch Repositories → User Selects Repos
    ↓
Manual/Cron Sync Trigger
    ↓
┌─────────────────────────────────────────────┐
│  GitHub Sync Service                        │
│  ├─ Sync Commits (incremental)              │
│  ├─ Fetch File Contents (code only)         │
│  ├─ Sync Pull Requests + Files + Comments   │
│  └─ Sync Issues + Comments                  │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│  GitHub Ingestion Service                   │
│  ├─ Chunk Code (80 lines, 10 overlap)       │
│  ├─ Classify Area (by path pattern)         │
│  ├─ Summarize Commits (message + files)     │
│  ├─ Summarize PRs (title + body + comments) │
│  ├─ Summarize Issues (title + body + labels)│
│  ├─ Generate Embeddings (OpenAI)            │
│  └─ Dual-Write (Pinecone + PostgreSQL)      │
└─────────────────────────────────────────────┘
    ↓
Searchable via meta_search tool
```

---

## Database Schema

### `integrations` Table

Stores GitHub App installation credentials:

```typescript
{
  id: string (UUID)
  organizationId: string (FK to organizations)
  provider: 'github'
  status: 'connected' | 'pending'
  accessTokenEncrypted: string (encrypted placeholder)
  metadata: {
    installationId: number         // GitHub App Installation ID
    setupAction: string
    selectedRepoIds: number[]      // GitHub repo IDs
  }
  lastSyncedAt: timestamp | null
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Security Note:**
- GitHub uses App Installation model, NOT OAuth tokens
- `accessTokenEncrypted` stores an encrypted placeholder (schema requirement)
- Actual access tokens are generated on-demand via `@octokit/app` (short-lived, never stored)
- This is MORE secure than Slack/Notion's long-lived OAuth tokens

### `github_repos` Table

Stores repository metadata:

```typescript
{
  id: string (UUID)
  integrationId: string (FK to integrations)
  githubRepoId: number               // GitHub's repo ID
  owner: string                      // e.g., "mitable"
  name: string                       // e.g., "mitable"
  fullName: string                   // e.g., "mitable/mitable"
  defaultBranch: string              // e.g., "main"
  visibility: string                 // "public" | "private"
  isPrivate: boolean
  isSelected: boolean                // User-selected for sync
  lastSyncedAt: timestamp | null
  createdAt: timestamp
  updatedAt: timestamp
}
```

### `github_commits` Table

Stores commit history:

```typescript
{
  id: string (UUID)
  repoId: string (FK to github_repos)
  sha: string                        // Commit SHA
  authorName: string
  authorEmail: string
  committedAt: timestamp
  message: string (max 4000 chars)
  parentSha: string | null
  createdAt: timestamp
  updatedAt: timestamp
  UNIQUE (repoId, sha)
}
```

### `github_commit_files` Table

Stores files changed in each commit:

```typescript
{
  id: string (UUID)
  commitId: string (FK to github_commits)
  repoId: string (FK to github_repos)
  path: string (max 2000 chars)
  status: string                     // "added" | "modified" | "removed"
  additions: number
  deletions: number
  content: text | null               // Full file content (for code search)
  createdAt: timestamp
  updatedAt: timestamp
  UNIQUE (commitId, path)
}
```

**Key Points:**
- `content` stores full file text for code chunking
- Only code files are fetched (< 500KB, not binary)
- Filtered by extension (.ts, .js, .py, etc.)

### `github_pull_requests` Table

Stores pull request metadata:

```typescript
{
  id: string (UUID)
  repoId: string (FK to github_repos)
  number: number                     // PR number
  title: string (max 500 chars)
  body: text | null
  authorLogin: string
  state: string                      // "open" | "closed"
  isMerged: boolean
  mergedAt: timestamp | null
  baseBranch: string
  headBranch: string
  headSha: string
  createdAtGithub: timestamp
  updatedAtGithub: timestamp
  createdAt: timestamp
  updatedAt: timestamp
  UNIQUE (repoId, number)
}
```

### `github_pull_request_files` Table

Files changed in each PR:

```typescript
{
  id: string (UUID)
  pullRequestId: string (FK to github_pull_requests)
  path: string (max 2000 chars)
}
```

### `github_pull_request_comments` Table

Comments on PRs (both review and issue comments):

```typescript
{
  id: string (UUID)
  pullRequestId: string (FK to github_pull_requests)
  authorLogin: string
  body: text
  commentType: string                // "issue_comment" | "review"
  createdAtGithub: timestamp
  updatedAtGithub: timestamp | null
  createdAt: timestamp
  updatedAt: timestamp
}
```

### `github_issues` Table

Stores issue metadata:

```typescript
{
  id: string (UUID)
  repoId: string (FK to github_repos)
  number: number                     // Issue number
  title: string (max 500 chars)
  body: text | null
  authorLogin: string
  assigneeLogin: string | null
  state: string                      // "open" | "closed"
  labels: text                       // JSON array
  isPullRequest: boolean             // GitHub API returns PRs as issues
  createdAtGithub: timestamp
  updatedAtGithub: timestamp
  closedAtGithub: timestamp | null
  createdAt: timestamp
  updatedAt: timestamp
  UNIQUE (repoId, number)
}
```

### `github_issue_comments` Table

Comments on issues:

```typescript
{
  id: string (UUID)
  issueId: string (FK to github_issues)
  authorLogin: string
  body: text
  createdAtGithub: timestamp
  updatedAtGithub: timestamp | null
  createdAt: timestamp
  updatedAt: timestamp
}
```

---

## Code Chunking Strategy

### Chunk Size
- **80 lines per chunk** (optimized for code readability)
- **10-line overlap** (preserves context at boundaries)
- Larger than Slack/Notion (500-1000 tokens) because code needs more context

### Area Classification

Files are automatically classified by path:

```typescript
const areaPatterns = {
  'electron-main': /apps\/electron\/src\/main/,
  'electron-renderer': /apps\/electron\/src\/renderer/,
  'backend-api': /apps\/backend\/src\/(routes|controllers)/,
  'backend-services': /apps\/backend\/src\/services/,
  'frontend-ui': /apps\/frontend\/src\/(components|pages)/,
  'database': /apps\/backend\/src\/db/,
  'shared-types': /packages\/shared-types/,
};
```

**Benefits:**
- Filter searches by code area (e.g., "find in electron-main only")
- Better context for LLM synthesis
- Easier debugging and navigation

### Code Chunk Metadata

Each code chunk is embedded with:

```typescript
{
  // Pinecone + PostgreSQL
  org_id: string,
  source: "github",
  type: "code",
  
  // File context
  repo_id: string,
  repo_full_name: string,
  path: string,
  file_name: string,
  language: string,                  // "typescript" | "python" | etc.
  start_line: number,
  end_line: number,
  
  // Git context
  commit_sha: string,
  author: string,
  committed_at: string,
  default_branch: string,
  
  // Chunking metadata
  chunk_index: number,
  total_chunks: number,
  is_chunked: boolean,
  
  // Area classification
  area?: string,                     // "electron-main" | "backend-api" | etc.
}
```

---

## Commit Summaries

Each commit is summarized with:

```typescript
{
  // Pinecone + PostgreSQL
  org_id: string,
  source: "github",
  type: "commit",
  
  // Commit context
  repo_id: string,
  repo_full_name: string,
  commit_sha: string,
  author: string,
  committed_at: string,
  message: string,
  
  // Affected context
  paths: string[],                   // Files changed
  main_areas: string[],              // Areas affected
}
```

**Embedded Text Format:**
```
Commit: Add tray hide-to-tray behavior

Author: Aurel Npounengnong
Date: 2025-11-20T15:30:00Z
Affects: apps/electron/src/main/tray.ts, apps/electron/src/main/main.ts...
```

---

## PR & Issue Summaries

### PR Summary

```typescript
{
  type: "pr",
  pr_number: number,
  pr_title: string,
  author: string,
  state: "open" | "closed",
  is_merged: boolean,
  merged_at?: string,
  created_at: string,
  
  touched_paths: string[],           // Files in PR
  main_areas: string[],              // Areas affected
}
```

**Embedded Text Format:**
```
PR #123: Add tray hide-to-tray behavior

Author: Aurel
State: merged
Merged: 2025-11-20T18:00:00Z

Description:
Implements hide-to-tray functionality on Windows instead of quitting.
Adds tray icon tooltip and click handler.

Comments:
- John: "Should we also add this for Mac?"
- Aurel: "Good idea, will add in follow-up PR"

Affects: apps/electron/src/main/tray.ts, apps/electron/src/main/main.ts
```

### Issue Summary

```typescript
{
  type: "issue",
  issue_number: number,
  issue_title: string,
  author: string,
  assignee?: string,
  state: "open" | "closed",
  labels: string[],                  // ["bug", "high-priority"]
  created_at: string,
  closed_at?: string,
}
```

---

## Sync Process

### Manual Sync

User clicks "Sync" button in UI:

```
POST /api/integrations/github/sync
    ↓
github-sync.service.syncIntegration()
    ↓
1. Fetch repos (with installation_id)
2. For each selected repo:
   - Sync commits (incremental from lastSyncedAt)
   - Fetch file contents (code only, < 500KB)
   - Sync PRs (all states)
   - Sync Issues (filter out PRs)
3. Call github-ingestion.service.ingestRepoData()
   - Chunk code
   - Summarize commits/PRs/issues
   - Generate embeddings
   - Dual-write to Pinecone + PostgreSQL
4. Update lastSyncedAt
```

### Automatic Cron Sync

Runs every 6 hours via Railway cron:

```bash
npm run sync-integrations
```

**Script:** `apps/backend/src/scripts/sync-integrations.ts`

**Process:**
1. Sync Slack integrations
2. Sync Notion integrations
3. Sync GitHub integrations
4. Log results and exit

---

## Ingestion Performance

### Batch Processing

Code chunks are embedded in batches to avoid OpenAI token limits:

```typescript
const BATCH_SIZE = 100;  // ~100 chunks per batch

for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
  const batch = allChunks.slice(i, i + BATCH_SIZE);
  const embeddings = await embeddingService.embedTexts(texts);
  await vectorService.upsertVectors(vectors, namespace);
  await dualWriteToPostgres(batch, organizationId, "github");
}
```

**Typical Performance:**
- 582 code chunks: ~30 seconds
- 14 commit summaries: ~3 seconds
- Total ingestion: ~35-40 seconds

### Rate Limiting

GitHub API:
- 5000 requests/hour for authenticated apps
- Uses pagination (100 items per page)
- No explicit rate limiting in code (GitHub SDK handles it)

OpenAI API:
- Batch size limited to prevent token overflow
- Text-embedding-3-small: 8192 max tokens per request
- 100 chunks ≈ 8000 tokens (safe)

---

## Search Integration

GitHub data is searchable via the new **meta_search** system:

### Code Search

```typescript
// User query: "Where is the tray logic?"

meta_search classifies → code domain
    ↓
Rewrite query: "tray createTray system tray icon"
    ↓
code_retriever:
  - Semantic search (Pinecone)
  - Keyword search (PostgreSQL FTS)
  - Boost exact matches (file names, function names)
  - Group by file
    ↓
Result: apps/electron/src/main/tray.ts (lines 45-78, 120-145)
```

### Discussion Search

```typescript
// User query: "What did we discuss about the tray feature?"

meta_search classifies → knowledge domain
    ↓
searchService (Slack/Notion)
    ↓
Result: #product-team thread + PR #123 comments
```

### Hybrid Search

```typescript
// User query: "How does authentication work?"

meta_search classifies → code + knowledge
    ↓
Parallel search:
  - code_retriever → AuthService.ts, auth.middleware.ts
  - searchService → #security-team discussion
    ↓
LLM synthesizes:
"Auth uses JWT tokens (src/auth/AuthService.ts).
 Team decided on 7-day expiry (#security-team, Oct 10)."
```

---

## Configuration

### Environment Variables

```bash
# GitHub App credentials
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_APP_REDIRECT_URI=http://localhost:3001/api/integrations/github/callback
```

### Sync Frequency

Configured in `integrations` table:
```typescript
syncFrequency: "6 hours"
```

Cron expression: `0 */6 * * *` (every 6 hours at minute 0)

---

## Troubleshooting

### "No file contents found"

**Cause:** File content not fetched during sync

**Fix:** Re-run sync or use backfill script (deprecated)

### "Integration status stuck on 'pending'"

**Cause:** Sync failed but didn't update status

**Solution:** Status now persists as "connected" even if sync fails (fixed in latest version)

### "Code search returns no results"

**Checks:**
1. Verify namespace: `org-{organizationId}` (not `{organizationId}-github`)
2. Check Pinecone metadata: `source: "github"`, `type: "code"`
3. Confirm embeddings were generated (check logs)
4. Test semantic search directly via Pinecone console

### "Sync takes too long"

**Causes:**
- Large repository (1000+ files)
- Many commits (100+ new commits)
- OpenAI API slow

**Optimization:**
- Batch size: 100 chunks (optimal)
- Parallel PR/issue fetching (already implemented)
- Skip binary files (already filtered)

---

## Future Enhancements

- [ ] Branch-specific search (search in feature branches)
- [ ] Diff-level embeddings (embed code changes, not full files)
- [ ] PR review comments (separate from issue comments)
- [ ] Commit graph analysis (find related commits)
- [ ] Code ownership detection (CODEOWNERS file)
- [ ] Real-time webhook updates (instead of cron)
- [ ] Multi-repo cross-search ("find similar code across repos")

---

## Related Documentation

- [RAG System v5.0](./RAG_SYSTEM_V5.md) - Meta-search architecture
- [Slack Integration](./SLACK_INTEGRATION.md)
- [Notion Integration](./NOTION_INTEGRATION.md)
- [Token Encryption](./TOKEN_ENCRYPTION_GUIDE.md)
- [Railway Cron Setup](./RAILWAY_CRON_SETUP.md)
