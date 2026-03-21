# MCP Server

Mitable exposes a [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets external AI agents — Claude Desktop, Claude Code, Cursor, etc. — read and act on your organization's work data.

## Architecture

The server is **stateless**: each HTTP request creates a fresh `McpServer` instance scoped to the authenticated organization. There is no session management or SSE streaming — just `POST /mcp` with a JSON-RPC body.

**Endpoint:** `POST /mcp`
**Auth:** Bearer token (API key)

## Authentication

API keys use the format `mk_live_<base64url>`. The full key is shown once at creation and stored as a SHA-256 hash — it cannot be retrieved later.

Include the key in every request:

```
Authorization: Bearer mk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## API Key Management

All endpoints require admin authentication (JWT via `requireAuth` middleware).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/api-keys` | Create a new key. Body: `{ "name": "My Agent" }`. Returns `{ id, key, keyPrefix }`. |
| `GET` | `/api/api-keys` | List all keys (prefix only, never full key). |
| `DELETE` | `/api/api-keys/:id` | Revoke a key (soft delete). |

## Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "mitable": {
      "url": "https://mitablebackend-production.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer mk_live_YOUR_API_KEY"
      }
    }
  }
}
```

### Claude Code

Add to `.claude/settings.json` or run:

```bash
claude mcp add mitable \
  --transport http \
  --url https://mitablebackend-production.up.railway.app/mcp \
  --header "Authorization: Bearer mk_live_YOUR_API_KEY"
```

### Local Development

Replace the URL with `http://localhost:3000/mcp`.

## Tools Reference

### Sessions

#### `get_sessions`
List monitoring sessions with optional filters.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `userId` | `string (uuid)` | — | Filter by user ID |
| `status` | `string` | — | `active`, `paused`, `ended`, `summarizing`, `ready`, `delivered` |
| `dateFrom` | `string` | — | ISO date — sessions started on or after |
| `dateTo` | `string` | — | ISO date — sessions started on or before |
| `page` | `integer` | `1` | Page number |
| `limit` | `integer` | `20` | Results per page (max 100) |

#### `get_session_detail`
Get full details of a single session including summary, workstreams, and key frames.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionId` | `string (uuid)` | **Required.** The session ID |

#### `search_sessions`
Semantic search across session data using natural language queries.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | `string` | — | **Required.** Natural language search query |
| `userId` | `string (uuid)` | — | Filter to a specific user's sessions |
| `topK` | `integer` | `10` | Number of results (max 50) |

#### `get_day_summary`
Get a summary of a user's work day assembled from session summaries.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `userId` | `string (uuid)` | — | **Required.** The user to summarize |
| `date` | `string` | today | Date in `YYYY-MM-DD` format |

### Metrics

#### `get_team_metrics`
Organization-wide metrics: focus time, meeting load, app usage, category breakdown.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | `enum` | `today` | `today`, `yesterday`, `week`, `month`, `all` |

#### `get_team_activity`
Per-user activity breakdown (work time, meeting time) for the last 30 days. No parameters.

#### `get_user_activity`
Detailed activity for a specific user over a time period.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `userId` | `string (uuid)` | — | **Required.** The user to query |
| `period` | `enum` | `week` | `today`, `yesterday`, `week`, `month`, `all` |

### Documents

#### `search_documents`
Search knowledge base documents by keyword, type, or status.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | `string` | — | Search term for title and description |
| `docType` | `string` | — | Filter by document type |
| `status` | `string` | — | `draft`, `published`, `archived` |
| `page` | `integer` | `1` | Page number |
| `limit` | `integer` | `20` | Results per page (max 50) |

#### `get_document`
Get full document content by ID.

| Parameter | Type | Description |
|-----------|------|-------------|
| `documentId` | `string (uuid)` | **Required.** The document ID |

#### `create_document`
Create a new knowledge base document.

| Parameter | Type | Description |
|-----------|------|-------------|
| `title` | `string` | **Required.** Document title |
| `content` | `string` | **Required.** Document content (markdown) |
| `docType` | `string` | Document type (e.g., `update`, `note`, `report`) |
| `description` | `string` | Short description |

### Integrations

#### `list_slack_channels`
List Slack channels the bot is a member of. No parameters.

#### `send_slack_message`
Send a message to a Slack channel.

| Parameter | Type | Description |
|-----------|------|-------------|
| `channelId` | `string` | **Required.** Slack channel ID |
| `text` | `string` | **Required.** Message text |

### Recaps

#### `generate_recap`
Generate an AI recap from one or more session IDs.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionIds` | `string[] (uuid)` | — | **Required.** Session IDs to include |
| `tone` | `enum` | `professional` | `professional`, `casual`, `concise`, `detailed` |
| `length` | `enum` | `standard` | `brief`, `standard`, `comprehensive` |

#### `list_recaps`
List previously generated recaps.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `userId` | `string (uuid)` | — | Filter to a specific user |
| `limit` | `integer` | `20` | Results (max 50) |

## Resources Reference

| URI | Description |
|-----|-------------|
| `mitable://organization` | Organization name, domain, and settings |
| `mitable://organization/subscription` | Subscription tier, status, usage, and limits |
| `mitable://organization/integrations` | Connected providers, statuses, and last sync times |
| `mitable://organization/team` | Team roster: IDs, names, emails, roles, statuses |

## Example Prompts

Once the MCP server is connected, you can ask Claude things like:

- **"What did the engineering team work on this week?"** — uses `get_sessions` + `get_team_activity`
- **"Summarize Sarah's day yesterday"** — uses `get_day_summary`
- **"Find all sessions related to the billing migration"** — uses `search_sessions`
- **"How much time did the team spend in meetings vs. focused work this month?"** — uses `get_team_metrics`
- **"Draft a weekly update from my last 5 sessions"** — uses `get_sessions` + `generate_recap`
- **"Post the team metrics summary to #engineering in Slack"** — uses `get_team_metrics` + `send_slack_message`
- **"Search our docs for anything about the onboarding flow"** — uses `search_documents`
- **"Create a document summarizing this week's accomplishments"** — uses `get_sessions` + `create_document`
