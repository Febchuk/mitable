# OpenClaw — Design Document

## 1. What Is OpenClaw?

OpenClaw is a **self-hosted, open-source AI agent platform** that runs on your own devices. It connects messaging platforms (WhatsApp, Telegram, Slack, Discord, iMessage, Signal, and 15+ others) to AI models (Claude, GPT, Gemini, DeepSeek, local models), giving you a persistent personal AI assistant accessible from any channel.

- **Created by**: Peter Steinberger (Nov 2025, originally named "Clawdbot")
- **Renamed**: Clawdbot → Moltbot (Jan 27, 2026, Anthropic trademark) → OpenClaw (Jan 30, 2026)
- **GitHub**: `github.com/openclaw/openclaw` — 254K+ stars, 48K+ forks
- **Stack**: TypeScript, Node.js ≥22, pnpm workspaces, Vitest
- **License**: Open source, now backed by OpenAI under an open-source foundation
- **Philosophy**: "Local, fast, always-on" — your data stays on your hardware

---

## 2. High-Level Architecture

OpenClaw follows a **hub-and-spoke architecture** with a single Gateway as the control plane.

```
┌─────────────────────────────────────────────────────────┐
│                    MESSAGING CHANNELS                    │
│  WhatsApp · Telegram · Discord · Slack · iMessage · ...  │
└──────────────────────────┬──────────────────────────────┘
                           │ (Baileys, grammY, discord.js, Bolt, etc.)
                           ▼
┌──────────────────────────────────────────────────────────┐
│                 GATEWAY (WebSocket Server)                │
│                 ws://127.0.0.1:18789                     │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────┐ │
│  │ Channel  │  │ Session  │  │ Access    │  │ Config │ │
│  │ Adapters │  │ Router   │  │ Control   │  │ Mgr    │ │
│  └──────────┘  └──────────┘  └───────────┘  └────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │ (RPC / streaming)
                           ▼
┌──────────────────────────────────────────────────────────┐
│                    AGENT RUNTIME (Pi)                     │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────┐ │
│  │ Context  │  │ Model    │  │ Tool      │  │ State  │ │
│  │ Assembly │  │ Invoker  │  │ Executor  │  │ Persist│ │
│  └──────────┘  └──────────┘  └───────────┘  └────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  Tools   │ │  Memory  │ │  Skills  │
        │ Browser  │ │ SQLite + │ │ SKILL.md │
        │ Canvas   │ │ Vectors  │ │ ClawHub  │
        │ Cron     │ │ BM25     │ │          │
        │ Bash     │ │          │ │          │
        └──────────┘ └──────────┘ └──────────┘

        ┌──────────────────────────────────┐
        │        CONTROL INTERFACES        │
        │  CLI · WebChat · macOS App ·     │
        │  iOS Node · Android Node         │
        └──────────────────────────────────┘
```

---

## 3. Core Components

### 3.1 The Gateway

The Gateway is a **single-process WebSocket server** (default `127.0.0.1:18789`) that acts as the control plane. It is the single source of truth for sessions, routing, and channel connections.

**Responsibilities:**
- Manages all messaging platform connections via channel adapters
- Routes inbound messages to the correct session context
- Handles CLI, WebChat, macOS app, and mobile node connections
- Enforces access control (allowlists, DM pairing, group mention gating)
- Manages system-wide state and configuration
- Serves the Web Control UI at `http://127.0.0.1:18789/`

**Communication:** Type-safe WebSocket messages validated via JSON Schema. Event-driven (no polling).

### 3.2 Channel Adapters

Each messaging platform gets a dedicated adapter implementing a unified interface:

| Platform | Library | Auth Method |
|----------|---------|-------------|
| WhatsApp | Baileys | QR code |
| Telegram | grammY | Bot token |
| Discord | discord.js | Bot token |
| Slack | Bolt | OAuth |
| iMessage | BlueBubbles | Native integration |
| Signal | signal-cli | Linked device |
| + 15 more | Various | Various |

Each adapter handles:
- **Authentication**: Platform-specific auth flows
- **Message normalization**: Converts platform formats to a unified internal schema
- **Access control**: Per-channel allowlists, DM pairing policies, group mention requirements
- **Output formatting**: Respects platform markdown, message size limits, media APIs, chunking

### 3.3 Agent Runtime

The Pi agent runtime (`src/agents/piembeddedruntime.ts`) executes the core AI loop. It runs in RPC mode with tool/block streaming.

**The Agentic Loop (step by step):**

```
1. INGEST       → Message arrives from a channel adapter
2. ROUTE        → Gateway resolves it to a session context
3. ASSEMBLE     → Load conversation history, system prompt, skills, memories
4. INVOKE       → Stream request to configured LLM provider
5. TOOL CALL?   → If model requests a tool:
   5a. EXECUTE  →   Run tool (in Docker sandbox for DM/group sessions)
   5b. RETURN   →   Feed tool result back to model
   5c. GOTO 4   →   Model continues generation
6. DELIVER      → Format response per platform, send via channel adapter
7. PERSIST      → Write session state, memory updates to disk
```

**Key design decisions:**
- Streaming throughout — responses start delivering before generation completes
- Tool calls are intercepted mid-stream, executed, and results fed back
- Sessions are append-only event logs supporting branching and recovery
- Automatic compaction summarizes older conversations ("memory flush") before condensing

### 3.4 Session Management

Sessions encode trust boundaries and permissions:

| Session Type | ID Pattern | Trust Level |
|---|---|---|
| Main | `agent:<id>:main` | Full host access (operator) |
| DM | `agent:<id>:<channel>:dm:<senderId>` | Sandboxed by default |
| Group | `agent:<id>:<channel>:group:<groupId>` | Sandboxed by default |

**Per-session controls:** thinking level, verbose mode, model override, send policy, activation mode.

Sessions persist as JSON files under `~/.openclaw/sessions/`. Automatic pruning and compaction keep context windows manageable.

---

## 4. System Prompt Architecture

OpenClaw composes prompts from **layered sources** — behavior is modified by editing files, not code:

### Static Files (in workspace)

| File | Purpose |
|------|---------|
| `AGENTS.md` | Core operational constraints (bundled default) |
| `SOUL.md` | Personality and tone guidance (optional) |
| `TOOLS.md` | User-specific tool conventions (optional) |

### Dynamic Context (assembled at runtime)

- Recent session history
- Relevant skills from `skills/<name>/SKILL.md`
- Semantically similar memories from hybrid search
- Auto-generated tool definitions (TypeBox schemas)

Skills are **selectively injected** — only relevant ones load to avoid prompt bloat.

---

## 5. Memory System

### Storage

- **Source of truth**: Plain Markdown files on disk
- **Index**: SQLite database with vector embeddings at `~/.openclaw/memory/<agentId>.sqlite`
- **Files**:
  - `MEMORY.md` — Long-term curated facts (main sessions only)
  - `memory/YYYY-MM-DD.md` — Daily running logs

### Hybrid Search (Retrieval)

Combines two signals for robust retrieval:

| Signal | Weight | Strength |
|--------|--------|----------|
| Vector similarity (cosine) | 70% | Conceptual matching ("Mac Studio gateway" ≈ "the machine running the gateway") |
| BM25 keyword | 30% | Exact token matching (IDs, env vars, code symbols) |

**Embedding providers** (auto-selected): Local model → OpenAI → Gemini → disabled

### Index Management

- File watcher auto-reindexes on changes
- Supports experimental session transcript indexing
- Optional **QMD backend**: swap SQLite for a local-first search sidecar with BM25 + vectors + reranking

---

## 6. Skills System

A skill is simply a **directory containing a `SKILL.md` file** — no SDK, no compilation, no special runtime.

### SKILL.md Structure

```yaml
---
name: my-skill
description: What this skill does
requires:
  bins: [ffmpeg, jq]       # CLI tools needed
  env: [API_KEY]            # Env vars needed
  config: [some.setting]    # Config keys needed
---

# Instructions

Markdown instructions that teach the agent how to perform this skill...
```

### Skill Locations (priority order)

1. **Workspace skills** (`~/.openclaw/workspace/skills/`) — highest priority, user-owned
2. **Managed skills** (`~/.openclaw/skills/`) — shared across agents, installed from ClawHub
3. **Bundled skills** — shipped with OpenClaw

### ClawHub

A skill registry for discovering and installing community skills:

```bash
openclaw skills install <skill-name>
```

Skills are discovered automatically — the agent indexes `SKILL.md` files and selectively injects relevant ones into context at runtime.

---

## 7. Tools

OpenClaw provides a rich set of built-in tools, declared via TypeBox schemas and auto-injected into model context.

### Built-in Tools

| Tool | Description |
|------|-------------|
| **Browser** | Chrome/Chromium automation via CDP (snapshots, navigation, uploads, profiles) |
| **Canvas** | A2UI — agent-driven interactive visual workspaces (see section 8) |
| **Bash** | Shell command execution (elevated mode with per-session toggle + allowlisting) |
| **Cron** | Scheduled recurring tasks + webhook triggers |
| **File ops** | Read/write workspace files |
| **Node commands** | Camera snap/clip, screen recording, location, notifications (via paired devices) |
| **Sessions** | Agent-to-agent: `sessions_list`, `sessions_send`, `sessions_history`, `sessions_spawn` |

### Cron & Webhooks (Autonomous Agent)

A key architectural concept: **cron-triggered agentic loop**. Instead of only responding to human input, the agent is periodically woken up to evaluate tasks.

Use cases:
- Daily briefings sent to your WhatsApp
- Website change monitoring
- Calendar conflict surfacing
- Gmail Pub/Sub integration

### Tool Sandboxing

- **Main sessions**: Tools run natively on host
- **DM/Group sessions**: Tools run in ephemeral Docker containers with resource limits
- Elevated bash requires explicit per-session opt-in with allowlisting

---

## 8. Canvas & A2UI (Agent-to-UI)

Canvas is OpenClaw's system for agents to create **interactive visual interfaces**.

### Architecture

- Runs as a **separate server process** (port 18793) — isolated from Gateway
- Agent calls `canvas.update()` with HTML containing A2UI attributes
- Canvas server pushes content over WebSocket to connected clients
- Clients render the HTML as interactive UI

### How A2UI Works

```
Agent generates HTML with A2UI attributes
       ↓
Canvas server receives + parses A2UI
       ↓
WebSocket push to connected clients
       ↓
Client renders interactive UI
       ↓
User clicks button → action event sent to Canvas server
       ↓
Canvas server forwards as tool call to agent
       ↓
Agent processes action, calls canvas.update() with new state
       ↓
UI refreshes automatically
```

**Key principle**: A2UI is a **declarative data format**, not executable code. Agents can only use pre-approved components from a catalog — no UI injection attacks.

### Multi-Platform Rendering

| Platform | Renderer |
|----------|----------|
| macOS | Native WebKit view |
| iOS | Swift UI component |
| Android | WebView |
| Web | Browser tab |

---

## 9. Security Model

### Network Security

- **Default**: Loopback-only binding (`127.0.0.1`)
- **Remote access**: SSH tunnels or Tailscale Serve/Funnel
- **Auth**: Token-based or password for non-loopback connections
- **Device pairing**: Cryptographic challenge-response

### DM Security (Inbound Messages)

- **Default mode**: `dmPolicy="pairing"` — unknown senders get a pairing code, messages not processed until approved
- **Open mode**: Explicit opt-in (`dmPolicy="open"` + `"*"` in allowlist)
- **Diagnostics**: `openclaw doctor` surfaces risky DM configurations

### Prompt Injection Defense

- Context isolation: user messages kept distinct from system instructions
- Tool results wrapped in structured formats
- Sandboxed execution for untrusted sessions (Docker containers)

### Channel-Level Controls

- Per-channel allowlists
- DM pairing approval required by default
- Group mention-gating (agent only responds when @mentioned)

---

## 10. Multi-Agent Routing

OpenClaw supports running **multiple isolated agent instances** from a single Gateway:

```json
{
  "agents": {
    "mapping": {
      "discord-agent": {
        "channels": ["discord"],
        "model": "claude-sonnet",
        "workspace": "~/agents/discord"
      },
      "telegram-support": {
        "channels": ["telegram"],
        "model": "gpt-4",
        "workspace": "~/agents/support"
      }
    }
  }
}
```

Each agent gets:
- Independent workspace and files
- Own model configuration
- Isolated session state
- Separate memory and skills

**Agent-to-agent communication** via session tools: `sessions_list`, `sessions_send`, `sessions_history`, `sessions_spawn`.

---

## 11. Configuration

### File Location

`~/.openclaw/openclaw.json` (JSON5 format, supports comments)

### Layering

Environment variables → config file → defaults

### Key Sections

| Section | Purpose |
|---------|---------|
| `channels.<platform>` | Authentication, allowlists, group policies |
| `agents.mapping` | Route channels to agent instances |
| `gateway` | Network binding, auth mode, control UI settings |
| `experimental` | Feature flags for beta functionality |

---

## 12. Data Storage Layout

```
~/.openclaw/
├── openclaw.json              # Main configuration (JSON5)
├── sessions/                  # Conversation state (JSON per session)
├── memory/
│   └── <agentId>.sqlite       # Vector-indexed memories
├── credentials/               # Platform auth tokens (0600 permissions)
├── skills/                    # Managed skills (from ClawHub)
├── workspace/
│   ├── AGENTS.md              # Core agent instructions
│   ├── SOUL.md                # Personality (optional)
│   ├── TOOLS.md               # Tool conventions (optional)
│   ├── MEMORY.md              # Long-term memory
│   ├── memory/
│   │   └── YYYY-MM-DD.md      # Daily memory logs
│   └── skills/                # Workspace-level skills
└── <agent-workspaces>/        # Per-agent isolated workspaces
```

---

## 13. Deployment Patterns

| Environment | Method |
|-------------|--------|
| **Local dev** | `openclaw gateway --verbose` in foreground, loopback-only |
| **macOS production** | LaunchAgent service + menu bar app for lifecycle management |
| **Linux/VPS** | systemd user service + SSH tunnel or Tailscale Serve |
| **Container** | Docker/Fly.io with persistent volume + strong auth |
| **Cloudflare** | `cloudflare/moltworker` — runs on Workers |

---

## 14. Companion Apps & Nodes

| Platform | Type | Capabilities |
|----------|------|--------------|
| **macOS** | Native Swift app | Menu bar control, Voice Wake, PTT overlay, WebChat, Canvas |
| **iOS** | Native app | Device pairing, Canvas, camera, screen recording, voice |
| **Android** | Native app | Connect/Chat/Voice tabs, device commands |
| **Web** | Browser | WebChat UI served from Gateway |
| **CLI** | Terminal | `openclaw` command: gateway, agent, message, pairing |

Device nodes connect as WebSocket clients and expose local capabilities (camera, location, notifications) to the agent via `node.invoke`.

---

## 15. End-to-End Message Flow (Example)

```
1. User sends "summarize my emails" on WhatsApp
2. Baileys adapter receives message, normalizes to internal schema
3. Gateway checks allowlist → user is approved
4. Gateway resolves session: agent:default:whatsapp:dm:+1234567890
5. Agent runtime loads:
   - Session history (last N messages)
   - System prompt (AGENTS.md + SOUL.md)
   - Relevant skills (email skill detected via keyword)
   - Memory search results (user's email preferences)
6. Context sent to Claude (streaming)
7. Model responds with tool call: gmail.fetch_recent(count=20)
8. Tool executor runs Gmail fetch, returns email data
9. Model generates summary from email data
10. Response streamed back through Gateway → Baileys → WhatsApp
11. Session state persisted to disk
12. Memory updated if agent learned something new
```

---

## 16. Key Design Principles

1. **Local-first**: All data stored on your hardware, no cloud dependency
2. **Channel-agnostic**: One assistant, accessible from any messaging platform
3. **Files as configuration**: Behavior modified via Markdown files, not code changes
4. **Composable prompts**: Layered system prompt from static files + dynamic context
5. **Security by default**: Loopback binding, DM pairing, sandboxed untrusted sessions
6. **Declarative skills**: No SDK needed — just a `SKILL.md` file
7. **Hybrid memory**: Vector + BM25 search for robust retrieval
8. **Cron-enabled autonomy**: Agent can wake itself and act proactively

---

## Sources

- [OpenClaw GitHub Repository](https://github.com/openclaw/openclaw)
- [OpenClaw Official Docs](https://docs.openclaw.ai/)
- [OpenClaw Architecture, Explained (Substack)](https://ppaolo.substack.com/p/openclaw-system-architecture-overview)
- [OpenClaw Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)
- [What is OpenClaw? (DigitalOcean)](https://www.digitalocean.com/resources/articles/what-is-openclaw)
- [OpenClaw Skills Guide (DigitalOcean)](https://www.digitalocean.com/resources/articles/what-are-openclaw-skills)
- [OpenClaw Memory System (Milvus Blog)](https://milvus.io/blog/we-extracted-openclaws-memory-system-and-opensourced-it-memsearch.md)
- [OpenClaw Complete Guide 2026 (NxCode)](https://www.nxcode.io/resources/news/openclaw-complete-guide-2026)
- [A2UI Specification](https://a2ui.org/)
- [OpenClaw Creating Skills (GitHub docs)](https://github.com/openclaw/openclaw/blob/main/docs/tools/creating-skills.md)
- [ClawHub Skill Registry](https://github.com/openclaw/clawhub)
