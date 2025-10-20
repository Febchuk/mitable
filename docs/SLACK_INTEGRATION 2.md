# Slack Integration Documentation

## Overview

The Slack integration allows organizations to sync Slack messages into Mitable's knowledge base, making them searchable and accessible to the AI assistant. Messages are embedded into Pinecone for semantic search and stored in the database for reference.

## Architecture Flow

```
User → OAuth Flow → Slack API → Backend → Database → Pinecone
                                    ↓
                              Message Sync Service
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
  accessToken: string (encrypted bot token - xoxb-...)
  refreshToken: string | null
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

- `accessToken` stores the Slack bot token (xoxb-...)
- `status` is only "connected" if `accessToken` exists
- One integration per (organizationId, provider) combination

### `slack_messages` Table

Stores synced Slack messages for reference:

```typescript
{
  id: string (UUID)
  organizationId: string
  channelId: string
  channelName: string
  messageTs: string (Slack timestamp - unique ID)
  userId: string (Slack user ID)
  userName: string
  text: string (message content)
  threadTs: string | null (parent message timestamp if reply)
  metadata: {
    team_id: string
    reactions?: array
    files?: array
  }
  createdAt: timestamp (message posted time)
  updatedAt: timestamp
}
```

**Key Points:**

- `messageTs` is Slack's unique message identifier
- `threadTs` links replies to parent messages
- Messages are namespaced by `organizationId`

---

## Backend Architecture

### File Structure

```
apps/backend/src/
├── routes/
│   ├── integrations.ts       # Slack OAuth and integration endpoints
│   └── admin.ts              # Admin endpoints (list integrations)
├── services/
│   ├── slack.service.ts      # Slack API client wrapper
│   ├── ingestion.service.ts  # Message fetching and processing
│   └── vector.service.ts     # Pinecone embedding operations
├── config.ts                 # Environment variables
└── db/
    └── schema/
        └── integrations.schema.ts  # Database schema
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

---

### 3. `services/ingestion.service.ts`

**Purpose:** Fetch, process, and embed Slack messages

**Key Method:**

```typescript
async ingestSlackMessages(
  organizationId: string,
  accessToken: string,
  selectedChannels: string[]
): Promise<{ messagesEmbedded: number }>
```

**Flow:**

1. **Fetch Messages**
   - Get last sync timestamp from integration
   - For each selected channel:
     - Call `slackService.getChannelMessages()`
     - Use `oldest` parameter for incremental sync
     - Fetch up to 1000 messages per channel

2. **Process Messages**
   - Filter out bot messages
   - Enrich with user names
   - Format text content
   - Handle thread replies

3. **Store in Database**
   - Upsert into `slack_messages` table
   - Use `(organizationId, messageTs)` as unique key
   - Preserve message metadata

4. **Embed into Pinecone**
   - For each message:
     - Generate embedding via OpenAI API
     - Store in Pinecone namespace: `${organizationId}-slack`
     - Include metadata: `channelName`, `userName`, `timestamp`

5. **Return Results**
   - Count of embedded messages
   - Update `lastSyncedAt` in integration

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

7. **Messages Sync**
   - Backend fetches messages from selected channels
   - Stores in `slack_messages` table
   - Embeds into Pinecone
   - Returns count of embedded messages

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

### Token Storage:

- Slack bot tokens stored in database
- Should be encrypted at rest (future enhancement)
- Never exposed to frontend
- Cleared on disconnect

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

## Database Tables Summary

| Table            | Records   | Purpose                       |
| ---------------- | --------- | ----------------------------- |
| `integrations`   | 1 per org | Store OAuth tokens and config |
| `slack_messages` | Many      | Archive synced messages       |
| Pinecone         | Many      | Semantic search vectors       |

---

## Questions?

For issues or questions:

1. Check logs in backend console
2. Verify environment variables
3. Test Slack API connectivity
4. Check Pinecone dashboard
5. Review this documentation

---

**Last Updated:** October 16, 2025  
**Version:** 1.0  
**Status:** ✅ Complete and Working
