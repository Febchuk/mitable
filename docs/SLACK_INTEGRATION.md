# Slack Integration Documentation

## Overview

The Slack integration allows organizations to sync Slack messages into Mitable's knowledge base with **thread-aware, structure-preserving chunking**. Messages are intelligently grouped by conversation threads, enriched with real user names, and dual-written to both Pinecone (semantic search) and PostgreSQL (keyword search).

### Key Features (v2.0):

- **Thread-Aware Chunking:** Groups messages by `thread_ts` for conversation context
- **Real Name Attribution:** Fetches and caches user real names (e.g., "Aurel Febe" not "U05ABC123")
- **Smart Chunk Types:** Separates code blocks, logs, and conversation windows
- **Rich Metadata:** Authors, reactions, mentions, has_code, code_language, thread hierarchy
- **Dual-Write Architecture:** Pinecone for semantic + PostgreSQL for keyword search
- **Performance Optimized:** User info caching reduces API calls by 97%

## Architecture Flow

```
User → OAuth Flow → Slack API → Backend → SlackChunkingService
                                    ↓
                        User Info Cache (in-memory)
                                    ↓
                    Thread-Aware Smart Chunking
                                    ↓
            Dual-Write: Pinecone + PostgreSQL (search_content)
```

## Database Schema

### `integrations` Table

Stores connection credentials and metadata for each integration:

```typescript
{
  id: string (UUID)
  organizationId: string (FK to organizations)
  provider: 'slack' | 'notion' | 'github' | 'google-drive'
  status: 'connected' | 'disconnected'
  accessTokenEncrypted: string (AES-256 encrypted bot token - xoxb-...)
  refreshTokenEncrypted: string | null (for providers with refresh tokens)
  metadata: {
    team_id: string
    team_name: string
    bot_user_id: string
    scope: string
    app_id: string
  }
  syncFrequency: string ('6 hours')
  lastSyncedAt: timestamp | null
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Key Points:**

- `accessTokenEncrypted` stores encrypted bot token (AES-256-GCM via `encryptionService`)
- Tokens decrypted at runtime in sync scripts (never stored in plaintext)
- `status` is only "connected" if `accessTokenEncrypted` exists
- One integration per (organizationId, provider) combination

### `search_content` Table

Unified table storing all searchable content (Slack, Notion, GitHub) with structure-aware metadata:

```typescript
{
  // Core fields
  id: string (Vector ID: "slack-{channelId}-{ts}-chunk-{index}")
  organizationId: string
  source: 'slack' | 'notion' | 'github'
  sourceType: 'message' | 'page' | 'code'
  text: string (chunk content)
  textVector: tsvector (for PostgreSQL FTS)

  // Slack-specific metadata (v2.0 - Migration 0011)
  channelId: string
  channelName: string
  userId: string | null
  username: string | null

  // Thread structure
  threadId: string | null (thread_ts)
  isThreadRoot: boolean
  messageIds: string[] (all message IDs in this chunk)

  // Content classification
  chunkType: 'thread_summary' | 'message_window' | 'code' | 'log' | 'text'
  authors: string[] (real names, e.g., ["Aurel Febe", "Febe Mikun"])
  mentionedUsers: string[] (user IDs mentioned in @mentions)
  hasCode: boolean
  codeLanguage: string | null ('sql', 'typescript', 'python', etc.)
  hasLinks: boolean
  hasAttachments: boolean
  hasReactions: boolean
  reactionSummary: jsonb | null ({ "👍": 5, "✅": 3 })

  // Temporal
  timestamp: bigint (Unix seconds)
  date: string (ISO date)
  createdAt: timestamp
  updatedAt: timestamp

  // Chunk metadata
  chunkIndex: integer
  totalChunks: integer
  isChunked: boolean
}
```

**Key Points:**

- Replaces old `slack_messages` table with unified `search_content`
- **Thread-aware:** Groups messages by `thread_id`, preserves hierarchy
- **Real names:** `authors` array contains actual names (not user IDs)
- **Rich metadata:** Enables filtering by code, reactions, attachments, etc.
- **Dual-indexed:** `textVector` for FTS, embeddings in Pinecone
- **Chunk types:** Different strategies for conversations vs. code vs. logs

---

## Backend Architecture

### File Structure

```
apps/backend/src/
├── routes/
│   ├── integrations.ts              # Slack OAuth and integration endpoints
│   └── admin.ts                     # Admin endpoints (list integrations)
├── services/
│   ├── slack.service.ts             # Slack API client wrapper
│   ├── slack-chunking.service.ts    # Thread-aware chunking logic (v2.0)
│   ├── ingestion.service.ts         # Message fetching, user enrichment, dual-write
│   ├── vector.service.ts            # Pinecone embedding operations
│   └── embedding.service.ts         # OpenAI embedding generation
├── scripts/
│   ├── sync-slack.ts                # Manual sync script
│   └── run-migration-0011.ts        # Slack metadata migration
├── db/
│   ├── migrations/
│   │   └── 0011_add_slack_structure_metadata.sql  # v2.0 schema changes
│   └── schema/
│       ├── integrations.schema.ts   # Integration table
│       └── search-content.schema.ts # Unified search table
└── retrievers/
    └── slack.retriever.ts           # Hybrid search + thread expansion
```

---

## Key Backend Files

### 1. `routes/integrations.ts`

**Responsibilities:**

- OAuth flow (start + callback)
- Connect/disconnect endpoints
- Channel listing
- Channel configuration
- Sync trigger

**Key Endpoints:**

#### `POST /api/integrations/slack/oauth/start`

- **Auth Required:** Yes (JWT)
- **Purpose:** Generate Slack OAuth URL
- **Flow:**
  1. Extract `organizationId` from authenticated user
  2. Generate OAuth URL with organization as `state` parameter
  3. Return `authUrl` to frontend
- **Returns:** `{ authUrl: string }`

#### `GET /api/integrations/slack/callback`

- **Auth Required:** No (public callback from Slack)
- **Purpose:** Handle OAuth redirect from Slack
- **Flow:**
  1. Receive `code` and `state` (organizationId) from Slack
  2. Exchange code for access token via Slack API
  3. Store integration in database with `status='connected'`
  4. Display success page that auto-closes
- **Returns:** HTML page

#### `GET /api/integrations/slack/channels`

- **Auth Required:** Yes (JWT)
- **Purpose:** List available Slack channels
- **Flow:**
  1. Find integration for user's organization
  2. Use bot token to call Slack's `conversations.list`
  3. Return both public and private channels
- **Returns:** `{ channels: SlackChannel[] }`

#### `POST /api/integrations/slack/configure`

- **Auth Required:** Yes (JWT)
- **Purpose:** Save selected channels for sync
- **Body:** `{ selectedChannels: string[] }`
- **Flow:**
  1. Validate user's organization has Slack connected
  2. Update integration metadata with selected channels
- **Returns:** `{ success: true }`

#### `POST /api/integrations/slack/sync`

- **Auth Required:** Yes (JWT)
- **Purpose:** Trigger message sync from selected channels
- **Flow:**
  1. Get integration with selected channels
  2. Call `ingestionService.ingestSlackMessages()`
  3. For each channel:
     - Fetch messages (incremental if lastSyncedAt exists)
     - Store in `slack_messages` table
     - Embed into Pinecone
  4. Update `lastSyncedAt` timestamp
- **Returns:** `{ success: true, messagesEmbedded: number }`

#### `DELETE /api/integrations/slack/disconnect`

- **Auth Required:** Yes (JWT)
- **Purpose:** Disconnect Slack integration
- **Flow:**
  1. Find integration for user's organization
  2. Set `status='disconnected'`
  3. Clear `accessToken` and `refreshToken`
  4. Clear metadata
- **Returns:** `{ success: true }`

---

### 2. `services/slack.service.ts`

**Purpose:** Wrapper around `@slack/web-api` SDK

**Key Methods:**

```typescript
class SlackService {
  // List all channels (public + private) the bot is in
  async getChannels(accessToken: string): Promise<SlackChannel[]>;

  // Fetch messages from a channel (with pagination)
  async getChannelMessages(
    accessToken: string,
    channelId: string,
    oldest?: string // For incremental sync
  ): Promise<SlackMessage[]>;

  // Get user info for attribution
  async getUserInfo(accessToken: string, userId: string): Promise<SlackUser>;
}
```

**Implementation Details:**

- Uses Slack SDK `WebClient`
- Handles pagination automatically
- Returns normalized data structures
- Includes error handling for rate limits
- **New in v2.0:** `getUserInfo()` fetches real names (e.g., "Aurel Febe")

---

### 3. `services/slack-chunking.service.ts` (v2.0)

**Purpose:** Thread-aware, structure-preserving chunking for Slack messages

**Chunking Strategy:**

```typescript
class SlackChunkingService {
  /**
   * Chunk Slack messages by conversation structure (not token count)
   *
   * Strategy:
   * 1. Group messages by thread_ts (conversation context)
   * 2. Create sliding window chunks (2-3 messages per chunk)
   * 3. Extract dedicated code/log blocks
   * 4. Preserve thread hierarchy and user attribution
   */
  chunkSlackMessages(
    messages: SlackMessage[],
    channel: { id: string; name: string },
    workspace: { id: string; name: string }
  ): SlackChunk[];
}
```

**Chunk Types:**

1. **Message Window** (`message_window`)
   - 2-3 message sliding window
   - Preserves conversation flow
   - Format:

     ```
     [Mitable AI • #engineering • 2025-11-25 • Thread]

     Aurel Febe [10:30 AM]: How do we handle OAuth refresh?
     Febe Mikun [10:31 AM]: We use notionService.refreshToken()
     Aurel Febe [10:32 AM]: Perfect, thanks!
     ```

2. **Code Chunks** (`code`)
   - Extracted from ` ```lang ` blocks
   - Includes context from parent message
   - Format:

     ````
     [Code from #engineering]

     ```sql
     SELECT * FROM integrations WHERE provider = 'notion';
     ````

     Context: @aurel shared this query for debugging OAuth tokens

     ```

     ```

3. **Log Chunks** (`log`)
   - Extracted from error/stack traces
   - Grouped separately for better retrieval

**Rich Metadata per Chunk:**

```typescript
{
  chunk_type: 'message_window' | 'code' | 'log',
  authors: ['Aurel Febe', 'Febe Mikun'],  // Real names
  mentioned_users: ['U05ABC123'],          // User IDs from @mentions
  has_code: boolean,
  code_language: 'sql' | 'typescript' | 'python' | null,
  has_links: boolean,
  has_attachments: boolean,
  has_reactions: boolean,
  reaction_summary: { '👍': 5, '✅': 3 },
  thread_id: '1732027394.123456',
  is_thread_root: boolean,
  message_ids: ['1732027394.123456', ...],
}
```

---

### 4. `services/ingestion.service.ts` (Updated for v2.0)

**Purpose:** Orchestrate Slack sync with user enrichment and dual-write

**Key Method:**

```typescript
async syncSlackMessages(
  organizationId: string,
  onProgress?: (progress: IngestionProgress) => void
): Promise<IngestionResult>
```

**Flow (v2.0):**

1. **Fetch Messages**
   - Get integration and selected channels
   - Determine sync mode (full vs. incremental)
   - For each channel:
     - Call `slackService.fetchChannelMessages()`
     - Paginate with cursor

2. **Enrich with User Info** (NEW)
   - **User info cache:** In-memory Map<userId, userInfo>
   - For each message batch:
     - Check cache first
     - If not cached, call `slackService.getUserInfo()`
     - Store: `{ name: "aurel", real_name: "Aurel Febe" }`
   - **Performance:** Reduces API calls by ~97% (8 calls vs. 514)

3. **Thread-Aware Chunking** (NEW)
   - Pass enriched messages to `slackChunkingService.chunkSlackMessages()`
   - Returns smart chunks with rich metadata
   - Example: 514 messages → 475 chunks

4. **Dual-Write** (NEW)
   - **Pinecone:** Store embeddings with metadata
     - Namespace: `org-{organizationId}`
     - Vector ID: `slack-{channelId}-{ts}-chunk-{index}`
   - **PostgreSQL:** Store in `search_content` table
     - Full-text search via `textVector` (tsvector)
     - Rich Slack metadata for filtering

5. **Return Results**
   - `messagesEmbedded`: Chunk count (not raw message count)
   - `totalMessages`: Raw message count
   - `channelsProcessed`, `errors`, `duration`

---

### 4. `services/vector.service.ts`

**Purpose:** Interact with Pinecone for vector embeddings

**Key Methods:**

```typescript
class VectorService {
  // Embed a batch of Slack messages
  async embedSlackMessages(organizationId: string, messages: SlackMessage[]): Promise<void>;

  // Generate embedding for text
  private async generateEmbedding(text: string): Promise<number[]>;

  // Upsert vectors to Pinecone
  private async upsertVectors(namespace: string, vectors: PineconeVector[]): Promise<void>;
}
```

**Implementation:**

- Uses OpenAI's `text-embedding-3-small` model
- Batches embeddings for efficiency
- Stores in namespace: `${organizationId}-slack`
- Vector metadata includes:
  - `type: 'slack_message'`
  - `channelName`
  - `userName`
  - `timestamp`
  - `messageText` (first 500 chars)

---

## Frontend Architecture

### File Structure

```
apps/electron/src/renderer/console/src/
├── components/views/admin/IntegrationsView/
│   ├── index.tsx                          # Main integrations list
│   └── components/
│       ├── IntegrationCard.tsx            # Integration card UI
│       ├── SlackConnectDialog.tsx         # OAuth dialog
│       └── SlackConfigureDialog.tsx       # Channel selection
├── context/
│   └── AdminContext.tsx                   # Admin state management
└── services/
    ├── adminService.ts                    # Integration API calls
    └── authService.ts                     # JWT token management
```

---

## Key Frontend Files

### 1. `IntegrationsView/index.tsx`

**Responsibilities:**

- Display all integrations (connected + available)
- Handle connect/disconnect actions
- Trigger OAuth flow
- Poll for connection status
- Auto-open configure dialog after OAuth

**Key Functions:**

```typescript
// Opens OAuth dialog
const handleSlackConnect = () => setSlackDialogOpen(true);

// Starts polling after OAuth window opens
const handleSlackOAuthStarted = () => {
  // Poll every 1 second for up to 2 minutes
  // Check if Slack status changed to "connected"
  // Auto-open configure dialog when connected
};

// Handles disconnect with confirmation
const handleDisconnect = async (id: string) => {
  // Show confirmation modal
  // Call DELETE /api/integrations/slack/disconnect
  // Refresh integration status
};
```

---

### 2. `SlackConnectDialog.tsx`

**Purpose:** Initiate Slack OAuth flow

**UI Flow:**

1. Show integration benefits
2. List required permissions
3. Explain what happens next
4. "Connect to Slack" button

**On Connect:**

```typescript
const handleConnect = async () => {
  // Get auth token
  const token = authService.getAccessToken()

  // Call POST /api/integrations/slack/oauth/start
  const { authUrl } = await fetch(...)

  // Open OAuth URL in new window
  window.open(authUrl, "_blank")

  // Close dialog and trigger polling
  onConnect()
}
```

---

### 3. `SlackConfigureDialog.tsx`

**Purpose:** Select channels and trigger sync

**UI Flow:**

1. **Invite Prompt Screen** (Step 1)
   - Show instructions to run `/invite @Mitable` in Slack
   - Explain bot can only see channels it's invited to
   - "Continue to Channel Selection" button

2. **Channel Selection Screen** (Step 2)
   - Fetch and display all available channels
   - Checkbox list (public + private)
   - "Select All" option
   - "Save & Sync" button

**On Save:**

```typescript
const handleSave = async () => {
  // Save selected channels
  await fetch("/api/integrations/slack/configure", {
    body: { selectedChannels },
  });

  // Trigger initial sync
  await fetch("/api/integrations/slack/sync", { method: "POST" });

  // Show success message with embedded count
  alert(`✅ Synced ${result.messagesEmbedded} messages`);
};
```

---

### 4. `AdminContext.tsx`

**Purpose:** Manage admin state and API calls

**Key State:**

```typescript
const [integrations, setIntegrations] = useState<Integration[]>([]);

// Fetches all integrations for organization
const fetchAdminData = async () => {
  const data = await fetchIntegrations();
  setIntegrations(data);
};

// Refreshes integration list
const refetchData = () => fetchAdminData();
```

**Note:** `connectIntegration` and `disconnectIntegration` no longer modify local state—they rely on backend as source of truth.

---

## OAuth Flow (Detailed)

### Step-by-Step Process:

1. **User Clicks "Connect to Slack"**
   - `SlackConnectDialog` opens
   - User sees integration info

2. **User Clicks "Connect to Slack" Button**
   - Frontend calls `POST /api/integrations/slack/oauth/start`
   - Backend generates OAuth URL with `organizationId` as state
   - Frontend opens URL in new browser window

3. **User Authorizes in Slack**
   - Slack shows permission consent screen
   - User selects workspace and clicks "Allow"

4. **Slack Redirects to Callback**
   - Slack redirects to: `http://localhost:3000/api/integrations/slack/callback?code=xxx&state=orgId`
   - Backend exchanges `code` for access token
   - Backend stores integration with `status='connected'`
   - Backend shows success page that auto-closes after 1 second

5. **Frontend Detects Connection**
   - Polling interval (every 1 second) calls `refetchData()`
   - Finds Slack integration with `status='connected'`
   - Auto-opens `SlackConfigureDialog`

6. **User Configures Channels**
   - Sees invite instructions
   - Clicks "Continue"
   - Selects channels to sync
   - Clicks "Save & Sync"

7. **Messages Sync (v2.0)**
   - Backend fetches messages from selected channels
   - Enriches with user real names (cached)
   - Thread-aware chunking via `SlackChunkingService`
   - Dual-write to Pinecone + PostgreSQL `search_content`
   - Returns chunk count (not raw message count)

---

## Scripts & Migration (v2.0)

### Manual Sync Script

**Run manually:**

```bash
npm run sync-slack --workspace=@mitable/backend
```

**What it does:**

1. Initializes vectorService
2. Decrypts Slack token
3. Calls `ingestionService.syncSlackMessages()`
4. Shows progress and final stats

**Output:**

```
🚀 Starting Slack sync with thread-aware chunking
📦 Organization: 9647bdeb-418e-48ba-9da9-17b5f01e2d23
🔄 Sync Mode: full (first sync)

📱 [1/5] engineering
   📊 Batch complete: +94 chunks (total: 94)
📱 [2/5] product
   📊 Batch complete: +43 chunks (total: 137)

👥 User cache: 8 unique users fetched

✅ Sync Complete!
Channels processed: 5
Messages embedded: 475
Total messages: 514
Duration: 125.8s
```

### Migration 0011

**Run once to add v2.0 metadata columns:**

```bash
npm run migrate:0011 --workspace=@mitable/backend
```

**What it adds to `search_content` table:**

- `thread_id`, `is_thread_root`, `message_ids[]`
- `chunk_type`, `authors[]`, `mentioned_users[]`
- `has_code`, `code_language`, `has_links`, `has_attachments`
- `has_reactions`, `reaction_summary` (jsonb)
- Indexes for efficient filtering

---

## Environment Variables

Required in `apps/backend/.env`:

```bash
# Slack App Credentials
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
SLACK_REDIRECT_URI=http://localhost:3000/api/integrations/slack/callback

# Pinecone
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=mitable-knowledge

# OpenAI (for embeddings)
OPENAI_API_KEY=your_openai_api_key

# Database
DATABASE_URL=postgresql://...

# Auth
JWT_SECRET=your_jwt_secret

# Encryption (v2.0)
ENCRYPTION_KEY=your_32_byte_hex_encryption_key  # For encrypting OAuth tokens
```

---

## Slack App Configuration

### Required OAuth Scopes:

**Bot Token Scopes:**

- `channels:history` - Read messages from public channels
- `channels:read` - View basic channel info
- `groups:history` - Read messages from private channels
- `groups:read` - View basic private channel info
- `users:read` - Get user names for attribution
- `im:history` - (Optional) Read DM history
- `mpim:history` - (Optional) Read group DM history

### Redirect URLs:

- `http://localhost:3000/api/integrations/slack/callback` (development)
- `https://your-production-domain.com/api/integrations/slack/callback` (production)

### Event Subscriptions:

(Future: for real-time message sync)

- `message.channels`
- `message.groups`

---

## Pinecone Schema

### Namespace Format:

```
{organizationId}-slack
```

Example: `7c12a697-6f3f-4dc9-a108-f81046cde063-slack`

### Vector Schema:

```typescript
{
  id: string                    // Slack message timestamp (unique)
  values: number[]              // 1536-dim embedding from OpenAI
  metadata: {
    type: 'slack_message'
    organizationId: string
    channelName: string
    userName: string
    timestamp: string           // ISO date
    messageText: string         // First 500 chars
  }
}
```

---

## Sync Behavior

### Initial Sync:

- Fetches **all messages** from selected channels
- Goes back as far as channel history allows
- Typical: ~1000 messages per channel

### Incremental Sync:

- Uses `lastSyncedAt` timestamp from integration
- Only fetches messages **newer than** last sync
- Avoids re-processing existing messages

### Sync Frequency:

- Manual: User clicks "Sync Now" in dropdown
- Automatic: (Future) Run every 6 hours via cron job

---

## Testing the Integration

### 1. Connect Slack

```bash
# Start backend
npm run dev:backend

# Start admin console
npm run dev:admin:windows

# Navigate to Integrations tab
# Click "Connect to Slack"
# Authorize workspace
# Configure dialog should auto-open
```

### 2. Invite Bot to Channels

In Slack:

```
/invite @Mitable
```

### 3. Select Channels & Sync

- Click "Continue to Channel Selection"
- Select channels (bot must be invited first)
- Click "Save & Sync"
- Wait for success message

### 4. Verify in Database

```sql
-- Check integration
SELECT * FROM integrations WHERE provider = 'slack';

-- Check messages
SELECT COUNT(*) FROM slack_messages;
SELECT * FROM slack_messages LIMIT 10;
```

### 5. Verify in Pinecone

- Go to Pinecone console
- Check index: `mitable-knowledge`
- Look for namespace: `{organizationId}-slack`
- Verify vector count

---

## Disconnect Flow

### User Action:

1. Click dropdown on Slack integration card
2. Select "Disconnect"
3. Confirm in dialog

### Backend Action:

```typescript
// DELETE /api/integrations/slack/disconnect
UPDATE integrations
SET
  status = 'disconnected',
  access_token = NULL,
  refresh_token = NULL,
  last_synced_at = NULL,
  metadata = '{}'
WHERE organization_id = ? AND provider = 'slack'
```

### Result:

- Integration shows as "disconnected" in UI
- Token cleared (can't sync anymore)
- Messages remain in database and Pinecone
- Can reconnect anytime with fresh OAuth

---

## Security Considerations

### Authentication:

- All endpoints (except OAuth callback) require JWT auth
- `requireAuth` middleware validates token
- Extracts `userId` and verifies user belongs to organization

### Authorization:

- Actions scoped to user's organization
- Can't access other organizations' integrations
- Pinecone namespaces isolate data per org

### Token Storage (v2.0):

- **Encrypted at rest:** All tokens encrypted using AES-256-GCM
- Stored as `accessTokenEncrypted` / `refreshTokenEncrypted` in database
- **Encryption service:** `encryptionService.encrypt()` / `decrypt()`
- **Runtime decryption:** Tokens decrypted only when needed (during sync)
- Never exposed to frontend or logs
- Cleared on disconnect
- **Environment variable:** `ENCRYPTION_KEY` (32-byte hex string)

### OAuth State:

- `state` parameter carries `organizationId`
- Prevents CSRF attacks
- Validates state matches user's org

---

## Future Enhancements

### Real-time Sync

- Use Slack Events API
- Webhook listener for new messages
- Auto-embed as messages arrive

### Message Updates

- Handle edited messages
- Update embeddings when content changes
- Track message deletion

### Advanced Features

- Thread context in embeddings
- File/attachment indexing
- Reaction-based importance scoring
- Channel privacy indicators in search results

### Performance

- Batch processing for large channels
- Background job queue
- Rate limit handling
- Caching frequently accessed data

---

## Troubleshooting

### OAuth fails with "Invalid redirect_uri"

- Check `SLACK_REDIRECT_URI` matches Slack app settings
- Ensure no trailing slash
- Verify callback URL is registered

### "Failed to fetch channels"

- Check bot token is valid
- Verify bot is installed in workspace
- Ensure user has connected Slack

### No messages synced

- Bot must be invited to channels first
- Run `/invite @Mitable` in Slack
- Check selected channels list

### Messages not searchable

- Verify Pinecone API key is correct
- Check namespace format: `{orgId}-slack`
- Confirm OpenAI API key for embeddings

### Integration shows "connected" but shouldn't

- Check `access_token` field in database
- Run disconnect endpoint
- Clear seed data if testing

---

## File Summary

| File                            | Purpose                | Key Exports             |
| ------------------------------- | ---------------------- | ----------------------- |
| `routes/integrations.ts`        | OAuth & sync endpoints | Express router          |
| `services/slack.service.ts`     | Slack API wrapper      | `SlackService` class    |
| `services/ingestion.service.ts` | Message processing     | `ingestSlackMessages()` |
| `services/vector.service.ts`    | Pinecone operations    | `embedSlackMessages()`  |
| `SlackConnectDialog.tsx`        | OAuth UI               | React component         |
| `SlackConfigureDialog.tsx`      | Channel selection UI   | React component         |
| `AdminContext.tsx`              | Admin state            | Context provider        |

---

## API Endpoints Summary

| Method | Endpoint                              | Auth | Purpose                |
| ------ | ------------------------------------- | ---- | ---------------------- |
| POST   | `/api/integrations/slack/oauth/start` | ✅   | Get OAuth URL          |
| GET    | `/api/integrations/slack/callback`    | ❌   | OAuth redirect handler |
| GET    | `/api/integrations/slack/channels`    | ✅   | List channels          |
| POST   | `/api/integrations/slack/configure`   | ✅   | Save channel selection |
| POST   | `/api/integrations/slack/sync`        | ✅   | Trigger message sync   |
| DELETE | `/api/integrations/slack/disconnect`  | ✅   | Disconnect integration |
| GET    | `/api/admin/integrations`             | ✅   | List all integrations  |

---

## Database Tables Summary (v2.0)

| Table            | Records       | Purpose                                      |
| ---------------- | ------------- | -------------------------------------------- |
| `integrations`   | 1 per org     | Store OAuth tokens and config                |
| `search_content` | Many (chunks) | Unified search table (Slack, Notion, GitHub) |
| Pinecone         | Many (chunks) | Semantic search vectors                      |

**Note:** `slack_messages` table is deprecated in v2.0. Use `search_content` instead.

---

## Performance Metrics (v2.0)

### User Info Caching

**Problem (v1.0):**

- Called `users.info` API for every message
- 514 messages = 514 API calls
- Massive timeout spam from Slack API
- Sync time: ~5 minutes

**Solution (v2.0):**

- In-memory cache at sync level
- Only fetch each unique user once
- 514 messages, 8 unique users = 8 API calls
- **97% reduction in API calls**
- Sync time: ~2 minutes (**57% faster**)

**Example:**

```
Before: 514 messages → 514 users.info calls → 291s
After:  514 messages → 8 users.info calls → 126s
```

### Thread-Aware Chunking

**Chunking Efficiency:**

- 514 raw messages → 475 smart chunks
- Preserves conversation context
- Separates code/logs for better retrieval
- Enriched metadata enables filtering

**Chunk Distribution Example:**

- Message windows: 420 chunks
- Code blocks: 45 chunks
- Log chunks: 10 chunks

---

## v2.0 Changes Summary

### What Changed

| Feature        | v1.0                            | v2.0                                            |
| -------------- | ------------------------------- | ----------------------------------------------- |
| Chunking       | Token-based (500-1000)          | Thread-aware (conversation structure)           |
| User Names     | Username only                   | Real names + username (cached)                  |
| Storage        | Single table (`slack_messages`) | Unified table (`search_content`)                |
| Search         | Pinecone only                   | Dual-write (Pinecone + PostgreSQL FTS)          |
| Metadata       | Basic (channel, user, ts)       | Rich (authors, chunk_type, has_code, reactions) |
| Code Handling  | Inline with text                | Extracted as separate chunks                    |
| Thread Context | Individual messages             | Full thread with parent + replies               |
| API Calls      | Per-message                     | Cached (97% reduction)                          |
| Sync Speed     | ~5 min                          | ~2 min (57% faster)                             |

### Migration Path

**From v1.0 to v2.0:**

1. Run migration:

   ```bash
   npm run migrate:0011 --workspace=@mitable/backend
   ```

2. Re-sync to populate v2.0 metadata:
   ```bash
   npm run sync-slack --workspace=@mitable/backend
   ```

**Backward Compatibility:**

- New columns are nullable (won't break existing data)
- Old `slack_messages` table can remain (deprecated)
- Retriever uses `search_content` table automatically

---

## Questions?

For issues or questions:

1. Check logs in backend console
2. Verify environment variables
3. Test Slack API connectivity
4. Check Pinecone dashboard
5. Review this documentation

---

**Last Updated:** November 25, 2025  
**Version:** 2.0 - Thread-Aware Chunking  
**Status:** ✅ Complete and Working
