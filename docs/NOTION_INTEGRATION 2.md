# Notion Integration Documentation

**Date:** November 25, 2025  
**Status:** ✅ Complete & Enhanced  
**Author:** Mitable Team

---

## Overview

The Notion integration allows organizations to sync their Notion workspace pages into Mitable's knowledge base for AI-powered search and retrieval. Content is embedded at the **block level** for granular search precision.

### Key Features

- ✅ **OAuth 2.0 Authentication** - Secure authorization with token refresh
- ✅ **Token Encryption** - AES-256 encryption for access/refresh tokens at rest
- ✅ **Page Selection During OAuth** - Users select pages directly in Notion's UI
- ✅ **Automatic Sync** - Initial sync triggered automatically after connection
- ✅ **Structure-Aware Chunking** - Intelligent chunking that preserves code blocks, tables, and document hierarchy
- ✅ **Rich Metadata** - Section paths, chunk types, code languages for precise filtering
- ✅ **Smart Boosting** - SQL code blocks boosted 8x, tables 3x for better retrieval
- ✅ **Recursive Content Fetching** - Handles nested blocks and hierarchical content
- ✅ **Rate Limiting** - Respects Notion's 3 req/sec limit
- ✅ **Token Refresh** - Automatic token renewal when expired
- ✅ **Incremental Sync Support** - Uses `last_edited_time` for future updates

---

## Architecture

### Backend Components

#### 1. Configuration (`config.ts`)

```typescript
notion: {
  clientId: process.env.NOTION_CLIENT_ID,
  clientSecret: process.env.NOTION_CLIENT_SECRET,
  redirectUri: process.env.NOTION_REDIRECT_URI,
  apiVersion: "2022-06-28", // Notion API version
}
```

#### 2. Service Layer (`notion.service.ts`)

**Core Methods:**

```typescript
class NotionService {
  // OAuth & Authentication
  async refreshAccessToken(refreshToken: string): Promise<TokenResponse>;

  // Content Retrieval
  async searchPages(orgId: string, query?: string): Promise<NotionPage[]>;
  async getPageBlocks(orgId: string, pageId: string): Promise<NotionBlock[]>;

  // User Information
  async getUserInfo(orgId: string, userId: string): Promise<NotionUser | null>;

  // Internal Helpers
  private async getClient(organizationId: string): Promise<Client>;
  private async rateLimit(): Promise<void>;
  private async getBlockChildrenRecursive(client: Client, blockId: string): Promise<NotionBlock[]>;
  private extractBlockText(block: any): NotionBlock;
}
```

**Key Features:**

- Automatic token expiry checking and refresh
- Rate limiting (3 requests/sec with 350ms delay)
- Recursive block fetching with pagination
- Text extraction from rich_text arrays
- Handles nested content structures

#### 3. Routes (`routes/integrations.ts`)

| Method   | Endpoint                               | Description            |
| -------- | -------------------------------------- | ---------------------- |
| `POST`   | `/api/integrations/notion/oauth/start` | Initiate OAuth flow    |
| `GET`    | `/api/integrations/notion/callback`    | OAuth callback handler |
| `GET`    | `/api/integrations/notion/pages`       | List shared pages      |
| `POST`   | `/api/integrations/notion/sync`        | Trigger sync           |
| `DELETE` | `/api/integrations/notion/disconnect`  | Disconnect integration |

#### 4. Notion Chunking Service (`notion-chunking.service.ts`) 🆕

**Purpose:** Structure-aware chunking that preserves document hierarchy and code blocks.

```typescript
class NotionChunkingService {
  /**
   * Chunk Notion blocks intelligently:
   * - Parse heading hierarchy (h1/h2/h3) into sections
   * - Keep code blocks, tables, callouts intact (no splitting)
   * - Add rich metadata: section_path, chunk_type, code_language, etc.
   */
  chunkNotionBlocks(blocks: NotionBlock[], page: NotionPage): NotionChunk[];
}
```

**Key Features:**
- **Heading-aware sections** - Builds hierarchy from h1 → h2 → h3
- **Dedicated code chunks** - SQL/TypeScript/JSON blocks stay together (up to 1500 tokens)
- **Table preservation** - Tables not split mid-row
- **Section breadcrumbs** - Each chunk knows its place: `["Parent", "Child", "Grandchild"]`
- **Type classification** - Chunks tagged as `code`, `table`, `list`, `text`, `callout`, `quote`

#### 5. Ingestion Service (`ingestion.service.ts`)

```typescript
class IngestionService {
  async syncNotionPages(
    organizationId: string,
    onProgress?: (progress: IngestionProgress) => void
  ): Promise<IngestionResult>;

  private async processNotionBatch(
    blocks: any[],
    page: any,
    organizationId: string,
    workspaceId: string,
    workspaceName: string,
    botId: string
  ): Promise<void> {
    // 🆕 Uses NotionChunkingService instead of generic chunking
    const smartChunks = notionChunkingService.chunkNotionBlocks(blocks, page);
    // Generates embeddings and stores with rich metadata
  }
}
```

**Sync Process:**

1. Fetch all shared pages via Search API
2. For each page, recursively fetch all blocks
3. Filter empty blocks
4. 🆕 **Smart chunking** via NotionChunkingService
5. Process in batches of 100
6. Generate embeddings via OpenAI
7. Store in Pinecone with rich structure-aware metadata
8. Mirror in PostgreSQL for hybrid search

### Frontend Components

#### 1. NotionConnectDialog (`NotionConnectDialog.tsx`)

- Explains OAuth flow and permissions
- Opens Notion authorization in new window
- Triggers polling for connection status
- Simpler than Slack (no "invite bot" step needed)

#### 2. NotionConfigureDialog (`NotionConfigureDialog.tsx`)

- Lists currently shared pages
- "Reconnect" button to add/remove pages
- Manual sync trigger
- Shows page metadata (title, last edited)

#### 3. IntegrationsView Updates

- Added Notion state management
- OAuth polling with auto-sync on connection
- Disconnect support
- Integration card handlers

---

## Database Schema

### Integrations Table

```sql
INSERT INTO integrations (
  organizationId,
  provider,
  status,
  accessTokenEncrypted,  -- 🔐 ENCRYPTED (AES-256)
  refreshTokenEncrypted,  -- 🔐 ENCRYPTED (AES-256)
  tokenExpiresAt,
  metadata,
  lastSyncedAt,
  createdAt,
  updatedAt
) VALUES (
  'org-uuid',
  'notion',
  'connected',
  'U2FsdGVkX1...',  -- Encrypted with ENCRYPTION_KEY
  'U2FsdGVkX1...',  -- Encrypted with ENCRYPTION_KEY
  '2026-01-15T00:00:00Z',  -- Estimated 90 days from auth
  '{
    "bot_id": "abc-123",
    "workspace_id": "workspace-uuid",
    "workspace_name": "Acme Inc",
    "workspace_icon": "https://...",
    "owner": {...}
  }',
  NULL,  -- Updated after first sync
  NOW(),
  NOW()
);
```

### Sync Logs Table

```sql
INSERT INTO sync_logs (
  integrationId,
  status,
  itemsSynced,
  errorMessage,
  startedAt,
  completedAt
) VALUES (
  'integration-uuid',
  'success',
  142,  -- Number of blocks embedded
  NULL,
  '2025-10-17T14:40:00Z',
  '2025-10-17T14:40:15Z'
);
```

---

## Pinecone Vector Schema

### Vector ID Format

```
notion-{pageId}-{sectionId}-chunk-{chunkIndex}
```

Example: `notion-abc123-section-0-chunk-0`

### Metadata Structure 🆕 Enhanced

```typescript
{
  // Core fields
  text: string,                    // Extracted plain text
  source: "notion",
  source_type: "block",

  // Page identification
  page_id: string,
  page_title: string,
  page_url: string,                // Notion URL

  // Block-level details
  block_id: string,                // Primary block ID
  block_type: string,              // paragraph, heading_1, etc.

  // 🆕 STRUCTURE-AWARE METADATA (Migration 0010)
  section_path: string,            // JSON: ["Parent Section", "Child Section"]
  section_title: string,           // Current section title
  section_id: string,              // Unique section identifier
  heading_level?: number,          // 1, 2, or 3 (if under a heading)

  chunk_type: string,              // "code" | "table" | "list" | "text" | "callout" | "quote"
  has_code: boolean,               // True if chunk contains code
  has_table: boolean,              // True if chunk contains table
  has_list: boolean,               // True if chunk contains list
  code_language?: string,          // "sql" | "typescript" | "json" | etc.

  chunk_index: number,             // Position in document
  total_chunks: number,            // Total chunks for this page
  is_chunked: boolean,             // True if page was split

  // Authorship
  created_by_id: string,
  last_edited_by_id: string,

  // Timestamps
  created_time: string,            // ISO format
  last_edited_time: string,
  timestamp: number,               // Unix timestamp

  // Date filters
  date: string,                    // YYYY-MM-DD
  year: number,
  month: number,

  // Organization context
  organization_id: string,
  workspace_id: string,
  workspace_name: string,
  bot_id: string,

  // Hierarchy (optional)
  parent_page_id?: string,
  parent_database_id?: string,
}
```

### Example Vector (SQL Code Block) 🆕

```json
{
  "id": "notion-1429989fe8ac-section-2-chunk-0",
  "values": [0.123, -0.456, ...],  // 1536 dimensions
  "metadata": {
    "text": "INSERT INTO integrations (organizationId, provider, status, accessTokenEncrypted...",
    "source": "notion",
    "source_type": "block",
    "page_id": "1429989fe8ac4effbc8f57f56486db54",
    "page_title": "NOTION_INTEGRATION 2",
    "page_url": "https://notion.so/NOTION_INTEGRATION-2-142998...",
    "block_id": "4effbc8f57f564",
    "block_type": "code",
    
    // 🆕 Structure-aware metadata
    "section_path": "[\"Database Schema\",\"Integrations Table\"]",
    "section_title": "Integrations Table",
    "section_id": "section-2",
    "heading_level": 2,
    
    "chunk_type": "code",
    "has_code": true,
    "has_table": false,
    "has_list": false,
    "code_language": "sql",
    
    "chunk_index": 0,
    "total_chunks": 1,
    "is_chunked": false,
    
    "created_time": "2025-01-15T10:30:00.000Z",
    "last_edited_time": "2025-11-25T14:20:00.000Z",
    "timestamp": 1732545600,
    "date": "2025-11-25",
    "year": 2025,
    "month": 11,
    "organization_id": "2690a3e8-4d61-43ba-9f68-6de4916ffc77",
    "workspace_id": "workspace-abc123",
    "workspace_name": "Lorikeet",
    "bot_id": "bot-xyz789"
  }
}
```

---

## OAuth Flow

### Step-by-Step Process

```
1. User clicks "Connect to Notion" in Mitable
   ↓
2. Frontend calls POST /api/integrations/notion/oauth/start
   ↓
3. Backend generates authorization URL with:
   - client_id
   - redirect_uri
   - state (organizationId for security)
   ↓
4. User is redirected to Notion
   - Selects workspace
   - Chooses pages to share ← KEY DIFFERENCE FROM SLACK
   - Clicks "Allow access"
   ↓
5. Notion redirects to /callback with authorization code
   ↓
6. Backend exchanges code for tokens:
   POST https://api.notion.com/v1/oauth/token
   - Uses HTTP Basic Auth (client_id:client_secret)
   - Receives: access_token, refresh_token, bot_id, workspace info
   ↓
7. Backend stores integration in database
   ↓
8. Success page shown to user (auto-closes)
   ↓
9. Frontend polling detects connection
   ↓
10. Auto-triggers initial sync
```

### Authorization URL Format

```
https://api.notion.com/v1/oauth/authorize?
  client_id=abc123&
  response_type=code&
  owner=user&
  redirect_uri=http://localhost:3000/api/integrations/notion/callback&
  state=2690a3e8-4d61-43ba-9f68-6de4916ffc77
```

### Token Exchange Request

```bash
POST https://api.notion.com/v1/oauth/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "abc123def456",
  "redirect_uri": "http://localhost:3000/api/integrations/notion/callback"
}
```

### Token Response

```json
{
  "access_token": "secret_abc123...",
  "refresh_token": "secret_xyz789...",
  "bot_id": "bot-abc123",
  "workspace_id": "workspace-uuid",
  "workspace_name": "Lorikeet",
  "workspace_icon": "https://...",
  "owner": {
    "type": "user",
    "user": {
      "id": "user-123",
      "name": "John Doe"
    }
  },
  "duplicated_template_id": null
}
```

---

## Sync Process

### Flow Diagram

```
Start Sync
  ↓
Get Integration from DB
  ↓
Search All Shared Pages (POST /v1/search)
  ↓
For Each Page:
  ↓
  Get Page Blocks (GET /v1/blocks/{page_id}/children)
  ↓
  Recursively Fetch Nested Blocks
  ↓
  Extract Plain Text from Rich Text
  ↓
  Filter Empty Blocks
  ↓
  Batch Blocks (10 at a time)
    ↓
    Generate Embeddings (OpenAI)
    ↓
    Store in Pinecone (org-{orgId} namespace)
    ↓
    Update Progress
  ↓
Update Sync Log
  ↓
Update lastSyncedAt
  ↓
Return Result
```

### Rate Limiting

Notion API limit: **3 requests per second**

Implementation:

```typescript
private readonly RATE_LIMIT_DELAY = 350; // ms

private async rateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - this.lastRequestTime;

  if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
    const delay = this.RATE_LIMIT_DELAY - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  this.lastRequestTime = Date.now();
}
```

### Block Types Handled

| Block Type                            | Extraction Method          |
| ------------------------------------- | -------------------------- |
| `paragraph`                           | Extract from `rich_text`   |
| `heading_1`, `heading_2`, `heading_3` | Extract from `rich_text`   |
| `bulleted_list_item`                  | Extract from `rich_text`   |
| `numbered_list_item`                  | Extract from `rich_text`   |
| `to_do`                               | Extract from `rich_text`   |
| `quote`                               | Extract from `rich_text`   |
| `code`                                | Extract + prepend language |
| `child_page`                          | Extract title as reference |
| `unsupported`                         | Skip                       |

---

## Token Refresh

### When Tokens Expire

Notion doesn't document exact expiry time, so we estimate **90 days** and check before each request.

### Refresh Process

```typescript
// Check expiry before API call
if (integration.tokenExpiresAt && new Date() > integration.tokenExpiresAt) {
  // Refresh token
  const tokenResponse = await this.refreshAccessToken(integration.refreshToken);

  // Update DB with new tokens
  await db.update(integrations).set({
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    tokenExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  });
}
```

### Refresh Request

```bash
POST https://api.notion.com/v1/oauth/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "secret_xyz789..."
}
```

---

## Key Differences from Slack

| Feature                   | Slack                        | Notion                      |
| ------------------------- | ---------------------------- | --------------------------- |
| **Permission Model**      | Bot invited to channels      | Pages selected during OAuth |
| **Configuration Dialog**  | Required (channel selection) | Optional (manage pages)     |
| **Content Structure**     | Flat messages                | Hierarchical blocks         |
| **Embedding Granularity** | Per message                  | Per block                   |
| **Token Lifecycle**       | Never expires                | Expires (needs refresh)     |
| **Rate Limit**            | ~50-100 req/sec              | 3 req/sec (strict)          |
| **Sync Trigger**          | Manual after config          | Auto after OAuth            |

---

## Environment Variables

```bash
# Required for OAuth
NOTION_CLIENT_ID=your-client-id-from-notion
NOTION_CLIENT_SECRET=your-client-secret-from-notion
NOTION_REDIRECT_URI=http://localhost:3000/api/integrations/notion/callback

# Development vs Production
# Dev:  http://localhost:3000/api/integrations/notion/callback
# Prod: https://your-domain.com/api/integrations/notion/callback
```

---

## Setup Instructions

### 1. Create Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click "New integration"
3. Set **Type** to "Public"
4. Fill out:
   - Name: "Mitable"
   - Logo: Upload logo
   - Description: "AI-powered knowledge search"
5. Set **Redirect URI**: `http://localhost:3000/api/integrations/notion/callback`
6. Select **Capabilities**:
   - ✅ Read content
   - ✅ Read comments
   - ✅ Read user information with email address
7. Copy **Client ID** and **Client Secret**

### 2. Configure Environment

```bash
# apps/backend/.env
NOTION_CLIENT_ID=your-client-id
NOTION_CLIENT_SECRET=your-client-secret
NOTION_REDIRECT_URI=http://localhost:3000/api/integrations/notion/callback
```

### 3. Start Application

```bash
# Start backend + frontend
npm run dev:admin:windows
```

### 4. Connect Notion

1. Navigate to Integrations page
2. Find Notion card
3. Click "Connect to Notion"
4. Authorize and select pages in Notion
5. Return to app (auto-syncs)

---

## Troubleshooting

### "Missing or invalid redirect_uri"

**Cause:** Redirect URI in Notion dashboard doesn't match `.env`

**Fix:** Update Notion integration settings to match `NOTION_REDIRECT_URI` exactly

### "Notion integration not found"

**Cause:** Integration not stored in database

**Fix:** Check OAuth callback completed successfully. Check `integrations` table.

### "No pages shared with integration"

**Cause:** User didn't select any pages during OAuth

**Fix:** Reconnect and select pages in Notion's authorization UI

### Rate limit errors

**Cause:** Exceeding 3 req/sec

**Fix:** Rate limiting is automatic. If errors persist, increase `RATE_LIMIT_DELAY`.

### Token expired errors

**Cause:** Access token expired and refresh failed

**Fix:** Reconnect integration. Check `refreshToken` exists in DB.

---

## API Reference

### Notion API Endpoints Used

| Endpoint                             | Purpose                       |
| ------------------------------------ | ----------------------------- |
| `POST /v1/oauth/authorize`           | Initiate OAuth                |
| `POST /v1/oauth/token`               | Exchange code / Refresh token |
| `POST /v1/search`                    | List shared pages/databases   |
| `GET /v1/pages/{page_id}`            | Get page properties           |
| `GET /v1/blocks/{block_id}/children` | Get page blocks               |
| `GET /v1/users/{user_id}`            | Get user info                 |

### SDK Used

```json
{
  "@notionhq/client": "^2.2.15"
}
```

**Official Docs:** https://developers.notion.com/

---

## Performance Characteristics

### Sync Performance

| Metric             | Value                            |
| ------------------ | -------------------------------- |
| **Rate Limit**     | 3 req/sec                        |
| **Batch Size**     | 10 blocks                        |
| **Embedding Time** | ~1-2 sec per batch               |
| **Pages/Hour**     | ~500-1000 (depends on page size) |

### Example Sync Times

| Content                               | Blocks | Time         |
| ------------------------------------- | ------ | ------------ |
| Small page (5 blocks)                 | 5      | ~3 seconds   |
| Medium page (50 blocks)               | 50     | ~15 seconds  |
| Large page (200 blocks)               | 200    | ~60 seconds  |
| Multiple pages (10 pages, 500 blocks) | 500    | ~3-5 minutes |

---

## Recent Enhancements (November 2025)

### ✅ Completed

- [x] **Token Encryption** - AES-256 encryption for access/refresh tokens
- [x] **Structure-Aware Chunking** - Intelligent chunking via NotionChunkingService
- [x] **Rich Metadata** - Section paths, chunk types, code languages
- [x] **Smart Retrieval Boosting** - SQL 8x, tables 3x, code 5x
- [x] **Database Schema Updates** - Migration 0010 adds new metadata columns
- [x] **Hybrid Search** - PostgreSQL + Pinecone with RRF merging

### Retrieval Improvements 🆕

The new NotionRetriever applies intelligent boosting:

```typescript
// SQL code blocks: 8x boost (schema queries)
if (block.codeLanguage === 'sql') {
  score = score * 8.0;
}

// Other code blocks: 5x boost
if (block.chunkType === 'code' || block.hasCode) {
  score = score * 5.0;
}

// Tables: 3x boost
if (block.chunkType === 'table' || block.hasTable) {
  score = score * 3.0;
}
```

**Result:** Technical queries like "What are the table schemas?" now surface SQL INSERT statements first, not generic headings.

## Future Enhancements

### Planned Features

- [ ] **Incremental Sync** - Only sync changed pages using `last_edited_time`
- [ ] **Comment Sync** - Embed page/inline comments
- [ ] **Database Properties** - Extract structured data from databases
- [ ] **Webhook Support** - Real-time updates when pages change
- [ ] **Selective Sync** - Let users choose specific pages to sync
- [ ] **Sync Scheduling** - Automatic periodic syncs (Railway cron)

### Code Improvements

- [ ] Add unit tests for `notion-chunking.service.ts`
- [ ] Add integration tests for OAuth flow
- [ ] Improve error messages
- [ ] Add retry logic for failed API calls
- [ ] Optimize batch sizes based on content
- [ ] Implement encryption key rotation

---

## Testing

### Manual Testing Checklist

- [ ] OAuth flow completes successfully
- [ ] Tokens stored correctly in database
- [ ] Pages list fetched correctly
- [ ] Sync embeds blocks in Pinecone
- [ ] Reconnect updates page access
- [ ] Disconnect removes tokens
- [ ] Token refresh works when expired
- [ ] Rate limiting prevents throttling
- [ ] Error handling works correctly
- [ ] Sync logs created properly

### Test Accounts

Use Notion's free plan for testing. Create test pages with various block types.

---

## Security Considerations

### Token Storage 🔐

- **✅ IMPLEMENTED:** Tokens encrypted at rest using AES-256-CBC
- **Storage:** `accessTokenEncrypted` and `refreshTokenEncrypted` columns
- **Encryption Key:** `ENCRYPTION_KEY` environment variable (32-byte key)
- **Algorithm:** AES-256 with random IV per encryption
- **Access:** Decrypted only when needed for API calls
- **Future:** Rotate encryption keys periodically

### OAuth State Parameter

- Uses `organizationId` to prevent CSRF attacks
- Validated in callback handler

### API Rate Limiting

- Prevents abuse and API throttling
- 350ms delay between requests

### Data Isolation

- Each organization gets isolated Pinecone namespace
- No cross-organization data leakage

---

## Monitoring & Logging

### Key Metrics to Track

- OAuth success/failure rate
- Sync duration and throughput
- API error rates
- Token refresh failures
- Rate limit violations

### Log Examples

```
✅ Notion connected for organization: abc123 (Lorikeet)
🔄 Starting Notion sync for organization: Lorikeet
✅ Sync completed: 3 pages, 142 blocks, 15.2s
❌ Sync failed: Rate limit exceeded
```

---

## References

- [Notion API Documentation](https://developers.notion.com/)
- [Notion SDK for JavaScript](https://github.com/makenotion/notion-sdk-js)
- [OAuth 2.0 Specification](https://oauth.net/2/)
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
- [Pinecone Documentation](https://docs.pinecone.io/)

---

**Last Updated:** November 25, 2025  
**Version:** 2.0.0  
**Status:** Production Ready ✅  
**Major Update:** Structure-aware chunking + token encryption
