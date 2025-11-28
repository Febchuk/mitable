# GitHub Integration v1.0 - Structure-Aware Code Chunking

## Overview

The GitHub integration uses a **dual-domain architecture** to optimize for both code search and work activity tracking:

1. **Code Domain:** Semantic search over current codebase (HEAD snapshot via Tree API)
2. **Work Domain:** Metadata search over commits, PRs, issues (historical activity)

This architecture follows the enterprise RAG pattern established in Slack v2.0, adapted for code repositories.

---

## Architecture: Dual-Domain Strategy

### Why Dual-Domain?

**Problem:** Users have fundamentally different search needs:

- "How does authentication work?" → Need current code implementation
- "What did Aurel work on this week?" → Need commit metadata and activity

**Solution:** Split data into two specialized domains with different ingestion and retrieval strategies.

### Code Domain (Tree API Snapshot)

**Strategy:** Latest version only, no historical file versions

**Source:** GitHub Tree API (recursive snapshot of default branch HEAD)

**What we index:**

- Actual source code with structure-aware chunking
- Function/class/export definitions
- File roles and monorepo areas
- Config files (package.json, tsconfig.json, etc.)

**Use case:** "How does our authentication work?" or "Find the Slack sync service"

**Storage:**

- Pinecone namespace: `org-{orgId}`
- Filter: `{ source: "github", source_type: ["function", "class", "file_overview", etc.] }`
- PostgreSQL table: `search_content`

### Work Domain (Commits API)

**Strategy:** Commit metadata only (no historical file contents)

**Source:** GitHub Commits API (chronological history)

**What we index:**

- Commit messages, SHAs, timestamps
- Author names and emails
- Changed file paths and line counts
- PR descriptions, comments, reviews
- Issue descriptions, comments, labels

**Use case:** "What did Aurel work on this week?" or "Show recent database changes"

**Storage:**

- PostgreSQL tables: `github_commits`, `github_commit_files`, `github_pull_requests`, `github_issues`
- Pinecone namespace: `org-{orgId}`
- Filter: `{ source: "github", source_type: ["commit_summary", "pr_summary", "issue_summary", etc.] }`

---

## Data Model

### GitHub Repos (`github_repos`)

```typescript
{
  id: uuid,
  integrationId: uuid (FK → integrations.id),
  githubRepoId: number, // GitHub's repo ID
  owner: string,
  name: string,
  fullName: string, // e.g., "Febchuk/mitable"
  defaultBranch: string, // e.g., "main"
  visibility: string, // "public" | "private"
  isPrivate: boolean,
  isSelected: boolean, // User toggles which repos to sync
  lastSyncedAt: timestamp,
  lastIndexedCommitSha: string, // Tracks HEAD SHA for code snapshot
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### GitHub Commits (`github_commits`)

```typescript
{
  id: uuid,
  repoId: uuid (FK → github_repos.id),
  sha: string,
  authorName: string,
  authorEmail: string,
  committedAt: timestamp,
  message: string,
  parentSha: string,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### GitHub Commit Files (`github_commit_files`)

```typescript
{
  id: uuid,
  commitId: uuid (FK → github_commits.id),
  repoId: uuid (FK → github_repos.id),
  path: string,
  status: string, // "added" | "modified" | "removed"
  additions: number,
  deletions: number
  // NOTE: No content field - Work domain only tracks metadata
}
```

### GitHub Pull Requests (`github_pull_requests`)

```typescript
{
  id: uuid,
  repoId: uuid (FK → github_repos.id),
  number: number,
  title: string,
  body: string,
  state: string, // "open" | "closed" | "merged"
  authorLogin: string,
  createdAtGithub: timestamp,
  mergedAt: timestamp,
  updatedAtGithub: timestamp
}
```

### GitHub Issues (`github_issues`)

```typescript
{
  id: uuid,
  repoId: uuid (FK → github_repos.id),
  number: number,
  title: string,
  body: string,
  state: string, // "open" | "closed"
  authorLogin: string,
  createdAtGithub: timestamp,
  closedAtGithub: timestamp,
  updatedAtGithub: timestamp
}
```

### Search Content (`search_content`)

```typescript
{
  id: uuid,
  organizationId: uuid,
  source: "github", // All GitHub content
  sourceType: string, // "function" | "class" | "config" | "commit_summary" | etc.
  text: text,
  textVector: tsvector, // PostgreSQL FTS

  // GitHub-specific fields
  repoId: uuid,
  repoFullName: string,
  filePath: string,
  fileName: string,
  language: string,
  fileRole: string,
  commitSha: string,
  // ... (see search_content.schema.ts for full schema)

  timestamp: number,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

---

## Chunking Strategy: Structure-Aware, Not Arbitrary

### Philosophy

**The unit of meaning in code is:** Repo → File → Functions/Classes → Lines

**Not:** "1000 tokens"

When you ask "How does authentication work?", you want the `authenticate()` function, not a random 1000-token slice that cuts off mid-function.

### Implementation

**Parser:** Babel (primary) + TypeScript API (fallback)

**Chunk Types:**

1. **`file_overview`** - Path, exports, role, language (deterministic metadata)
2. **`function`** - Individual function definitions
3. **`class`** - Class definitions with methods
4. **`method`** - Class methods (when class too large)
5. **`config`** - Config objects (webpack, tsconfig, etc.)
6. **`type`** - Type/interface definitions
7. **`migration`** - Database migrations
8. **`file_segment`** - Fallback for unparseable files

**Target Size:** 500-600 tokens per chunk (semantic boundaries), max 800 tokens

### File Role Auto-Detection

Detected from path patterns:

```typescript
{
  service: /\/(services|service)\//,
  controller: /\/(controllers|controller|routes|route)\//,
  component: /\/(components|component)\//,
  schema: /\/(schema|schemas|models|model)\//,
  config: /\/(config|configs|configuration)\//,
  test: /\.(test|spec)\.(ts|tsx|js|jsx)$/,
  types: /\/(types|type|interfaces|interface)\/|\.d\.ts$/,
  migration: /\/(migrations|migrate)\//,
  util: /\/(utils|util|helpers|helper|lib)\//
}
```

### Area Auto-Detection (Monorepo-Aware)

```typescript
{
  'electron-main': /apps\/electron\/src\/main/,
  'electron-renderer': /apps\/electron\/src\/renderer/,
  'backend-api': /apps\/backend\/src\/(routes|controllers)/,
  'backend-services': /apps\/backend\/src\/services/,
  'backend-db': /apps\/backend\/src\/db/,
  'frontend-ui': /apps\/frontend\/src\/(components|pages)/,
  'shared-types': /packages\/shared/
}
```

### Smart Skip Patterns

**Never index:**

- Dependencies: `node_modules/`, `vendor/`
- Build artifacts: `dist/`, `build/`, `.next/`, `coverage/`
- Minified: `*.min.js`, `*.min.css`
- Lock files: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
- Source maps: `*.map`
- Environment: `.env`, `.env.local`, `.env.production` (except `.env.example`)
- Generated: `*.generated.ts`, `*-generated.js`
- Binaries: images, videos, fonts, PDFs, archives
- OS files: `.DS_Store`, `Thumbs.db`
- IDE files: `.vscode/`, `.idea/`, `.vs/`
- Drizzle snapshots: `/migrations/meta/*.json` (auto-generated, massive)

**Explicitly allow (config files):**

- `package.json`
- `tsconfig.json`, `tsconfig.*.json`
- `.eslintrc.json`
- `.prettierrc.json`

### Supported Languages (Phase 1)

- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`, `.mjs`, `.cjs`)
- Config files (`.json`, `.yaml`, `.toml`, `.md`)

**Future (Phase 2):** Python, Go, Rust, Java, Kotlin, C#, Ruby, PHP via Tree-sitter

---

## Metadata Schema

### Code Domain Metadata

```typescript
{
  // Source identification
  source: "github",
  source_type: "function", // or "class", "file_overview", "config", etc.
  repo_name: "Febchuk/mitable",
  repo_id: "uuid",
  default_branch: "main",

  // File identification
  file_path: "apps/backend/src/services/slack.service.ts",
  file_name: "slack.service.ts",
  file_extension: ".ts",
  file_role: "service", // auto-detected
  area: "backend-services", // auto-detected
  language: "typescript",

  // Chunk metadata
  chunk_type: "function" | "class" | "file_overview" | "config" | "type",
  start_line: 95,
  end_line: 125,
  token_count: 450,

  // Symbol metadata
  function_name: "fetchChannelMessages",
  class_name: "SlackService",
  exports: ["SlackService", "slackService"],
  is_exported: true,
  is_test_file: false,
  is_generated: false,

  // Chunking metadata
  chunk_index: 2,
  total_chunks: 5,
  segment_index: 0, // If symbol split into segments
  segment_count: 1
}
```

### Work Domain Metadata

```typescript
{
  // Source identification
  source: "github",
  source_type: "commit_summary", // or "pr_summary", "issue_summary", etc.
  repo_name: "Febchuk/mitable",
  repo_id: "uuid",

  // Commit metadata
  chunk_type: "commit_summary",
  commit_sha: "a1b2c3d",
  author_name: "Aurel Febe",
  author_email: "aurel@example.com",
  committed_at: "2025-11-27T20:15:00Z",
  message: "feat(knowledge-agent): add temporal filtering + sources display",

  // File changes
  files_changed: [
    "apps/backend/src/agents/knowledge.agent.ts",
    "apps/backend/src/services/orchestrator.service.ts"
  ],
  additions: 118,
  deletions: 137
}
```

---

## Sync Strategy

### Initial Sync (First Integration)

**Commits:** Last 50 only (prevents massive data load)

- Configurable via `INITIAL_SYNC_LIMIT` constant
- Saves commits to `github_commits` + `github_commit_files`

**Code:** Full Tree API snapshot of default branch HEAD

- Recursive fetch of entire repo structure
- Filters code files via extensions + skip patterns
- Chunks with `github-chunking.service.ts`
- Embeds and dual-writes to Pinecone + PostgreSQL

**Why limit commits?** If you've had 1000 commits, Mitable remembers commit messages as far back as N-50, but you'll have your current main branch fully indexed. This keeps data manageable for a small team.

### Incremental Sync (Follow-Up)

**Commits:** Only fetch `since: lastSyncedAt`

- Uses GitHub API `since` parameter
- Only fetches new commits since last sync

**Code:** Intelligent incremental update via `incrementalUpdate()`

- Compares `lastIndexedCommitSha` with current HEAD
- Only re-processes changed/added files from recent commits
- Deletes chunks for removed files
- Upsert strategy: existing chunks updated with deterministic IDs

**PRs & Issues:** Synced on every run

- Fetches all PRs (open + closed)
- Fetches all issues (open + closed)
- Upserts to `github_pull_requests` and `github_issues`

### Sync Flow Diagram

```
User clicks "Sync Now"
       ↓
Metadata Sync (github-sync.service.ts)
       ↓
1. Fetch commits (50 first, incremental after)
       ↓
2. Save to github_commits + github_commit_files
       ↓
3. Fetch PRs (all states)
       ↓
4. Save to github_pull_requests
       ↓
5. Fetch issues (all states)
       ↓
6. Save to github_issues
       ↓
Code Ingestion (github-ingestion.service.ts)
       ↓
7. Get Tree API snapshot (recursive)
       ↓
8. Filter code files (extensions + skip patterns)
       ↓
9. Chunk files (github-chunking.service.ts)
       ↓
10. Embed chunks (OpenAI text-embedding-3-small)
       ↓
11. Dual-write to Pinecone + PostgreSQL
       ↓
12. Update lastSyncedAt + lastIndexedCommitSha
```

---

## OAuth & Installation Flow

### GitHub App Setup

1. Create GitHub App in your organization
2. Set permissions:
   - **Repository contents:** Read-only
   - **Metadata:** Read-only
   - **Pull requests:** Read-only
   - **Issues:** Read-only
   - **Commit statuses:** Read-only

3. Generate private key
4. Note App ID, Client ID, Client Secret

### Environment Variables

```env
GITHUB_APP_ID=your_app_id
GITHUB_APP_CLIENT_ID=your_client_id
GITHUB_APP_CLIENT_SECRET=your_client_secret
GITHUB_APP_SLUG=mitable-ai
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_APP_REDIRECT_URI=https://your-domain.com/api/integrations/github/callback
```

### OAuth Flow

1. User clicks "Connect to GitHub" in Mitable
2. Backend generates installation URL: `/api/integrations/github/install/start`
3. User redirects to GitHub App installation page
4. User selects repositories to install on
5. GitHub redirects to callback: `/api/integrations/github/callback?installation_id=...&setup_action=install`
6. Backend:
   - Saves `installationId` to `integrations.metadata`
   - Fetches repos via Installation Octokit
   - Saves repos to `github_repos` with `isSelected: true`
   - Sets integration status to "connected"
7. User sees repos in admin panel
8. User clicks "Sync Now" to trigger initial sync

---

## Retrieval: Hybrid Search

### Code Retriever (`code.retriever.ts`)

**Strategy:** 70% semantic + 30% keyword (RRF)

**Filters:**

- `source: "github"`
- `source_type: ["function", "class", "file_overview", etc.]`
- `repo_id: [selected repos]` (optional)
- `file_role: [service|component|schema]` (optional)
- `area: [backend-api|frontend-ui]` (optional)

**Boosting:**

- Recency: 1.5x for files modified in last 7 days, 1.2x for last 30 days
- File role: 1.3x for matching role (e.g., "service" query boosts services)
- Exports: 1.2x for exported symbols

**Use case:** "How does authentication work?" → Returns `auth.service.ts` functions

### Work Retriever (`work.retriever.ts`)

**Strategy:** 70% semantic + 30% keyword (RRF)

**Filters:**

- `source: "github"`
- `source_type: ["commit_summary", "pr_summary", "issue_summary", etc.]`
- `repo_id: [selected repos]` (optional)
- `author_name: "Aurel Febe"` (optional)
- `committed_at: { $gte: dateFrom, $lte: dateTo }` (optional, via temporal-parser)

**Boosting:**

- Recency: 2.0x for commits in last 7 days, 1.5x for last 30 days
- Author: 1.5x for specific author matches

**Use case:** "What did Aurel work on this week?" → Returns recent commits by Aurel

---

## Performance & Limits

### Sync Performance

**First sync (example: Mitable repo):**

- Commits: 50 (limited)
- Files: ~200 code files
- Chunks: ~800 chunks
- Embeddings: ~800 API calls
- Duration: ~3-5 minutes

**Incremental sync:**

- Commits: 5-10 new commits
- Files: ~20 changed files
- Chunks: ~50 new/updated chunks
- Duration: ~30-60 seconds

### Rate Limits

**GitHub API:**

- Installation: 5000 requests/hour
- Tree API: Recursive, counts as 1 request per tree level
- Commits API: Paginated (100 per page)

**OpenAI Embeddings:**

- 3000 requests/minute (tier 1)
- Batch in groups of 100 to stay under limit

### Storage Estimates

**Code domain (per 1000 files):**

- Pinecone: ~4000 vectors (4 chunks per file avg)
- PostgreSQL: ~4000 rows in `search_content`
- Storage: ~50 MB in Pinecone, ~100 MB in PostgreSQL

**Work domain (per 1000 commits):**

- PostgreSQL: ~1000 rows in `github_commits`, ~5000 rows in `github_commit_files`
- Pinecone: ~1000 vectors
- Storage: ~10 MB in Pinecone, ~50 MB in PostgreSQL

---

## Key Services

### `github.service.ts`

- GitHub App client wrapper
- Octokit instance management
- Installation token generation

### `github-sync.service.ts`

- Orchestrates work domain sync
- Fetches commits, PRs, issues
- Saves metadata to PostgreSQL
- Respects 50-commit initial limit

### `github-code-snapshot.service.ts`

- Fetches Tree API snapshot
- Filters code files
- Fetches blob contents
- Coordinates chunking + embedding

### `github-chunking.service.ts`

- **Core chunking logic**
- Babel + TypeScript AST parsing
- Function/class extraction
- File role + area detection
- Smart skip patterns

### `github-ingestion.service.ts`

- Orchestrates code domain sync
- Coordinates snapshot + chunking
- Dual-write to Pinecone + PostgreSQL
- Updates sync logs

### `code.retriever.ts`

- Hybrid search for code files
- Semantic + keyword fusion
- File role/area filtering
- Recency boosting

### `work.retriever.ts`

- Hybrid search for commits/PRs/issues
- Author filtering
- Temporal filtering (date ranges)
- Recency boosting

---

## Scripts

### `inspect-github-data.ts`

```bash
npm run inspect-github --workspace=apps/backend
```

Shows:

- Repos synced
- Commit count
- PR count
- Issue count
- Code chunks count
- Sample chunks

### `clean-github-data.ts`

```bash
npm run clean-github --workspace=apps/backend
```

**DANGER:** Deletes ALL GitHub data:

- PostgreSQL: `github_repos`, `github_commits`, `github_commit_files`, `github_pull_requests`, `github_issues`, integrations (GitHub only), `search_content` (GitHub chunks)
- Pinecone: All vectors with `source='github'`

Use when you need to completely reset and re-sync.

---

## Migration Guide

### Run Migrations

```bash
# Add code metadata columns
npm run migrate:0012 --workspace=apps/backend

# Add GitHub tables (repos, commits, PRs, issues)
npm run migrate:0013 --workspace=apps/backend
```

### Initial Setup

1. Create GitHub App (see OAuth & Installation Flow)
2. Set environment variables
3. Run migrations
4. Restart backend
5. Connect GitHub in admin panel
6. Select repos
7. Click "Sync Now"

---

## Architecture Pattern (Follows Slack v2.0)

This integration replicates the domain-specific retrieval pattern established in Slack v2.0:

1. **Dedicated Chunking Service:** Structure-aware parsing via Babel + TypeScript API
2. **Domain-Specific Scoring:** Code recency boosting, file role/area filtering
3. **Specialized Retrievers:** Independent code vs. work retrievers with appropriate context
4. **Unified Search Interface:** Consistent API for knowledge agent orchestration

**Key Difference:** Dual-domain split (Code vs. Work) optimizes storage and relevance for code repositories.

**Next:** Notion integration will follow this same pattern with block-hierarchy chunking.

---

## Future Enhancements

### Phase 2: Multi-Language Support

- Python (`.py`)
- Go (`.go`)
- Rust (`.rs`)
- Java (`.java`)
- Kotlin (`.kt`)
- C# (`.cs`)
- Ruby (`.rb`)
- PHP (`.php`)

**Implementation:** Tree-sitter parsers (requires Node 20+)

### Phase 3: Advanced Features

- Branch comparison ("What changed between main and feature/X?")
- Code review summarization
- Dependency graph analysis
- Test coverage mapping
- Code quality metrics

---

## Troubleshooting

### "GitHub integration not found"

- Check that integration exists in `integrations` table
- Verify `provider = 'github'`
- Check `status = 'connected'`

### "Installation ID missing"

- Reconnect GitHub integration
- Check `integrations.metadata.installationId` is set

### "No repos selected"

- Verify `github_repos.isSelected = true` for at least one repo
- Re-sync to fetch repos if empty

### "Rate limit exceeded"

- GitHub: Wait 1 hour for rate limit reset
- OpenAI: Reduce batch size or wait for tier upgrade

### "Chunks not appearing in search"

- Check Pinecone namespace: `org-{orgId}`
- Verify embeddings were created
- Check `search_content` table has rows with `source = 'github'`
- Run `inspect-github-data.ts` to debug

---

## References

- [Slack Integration v2.0](./SLACK_INTEGRATION.md) - Established enterprise RAG pattern
- [Enterprise RAG Best Practices](https://www.toloka.ai/blog/agentic-rag-systems) - Multi-query decomposition, domain-specific retrieval
- [GitHub API Documentation](https://docs.github.com/en/rest) - Tree API, Commits API, Installation API
- [Babel Parser](https://babeljs.io/docs/babel-parser) - JavaScript/TypeScript AST parsing
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API) - TypeScript AST parsing
