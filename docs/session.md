
 ▐▛███▜▌   Claude Code v2.1.50
▝▜█████▛▘  Opus 4.6 · Claude Max
  ▘▘ ▝▝    ~/Documents/mitable

❯ Help me plan out this new pivot. we are going agentic placing a bet on peole working with agents more. We want mitable to   
  be the easy way to spin up agents to do work like you would. we use the contetx of what we record aobut your day to provied 
   the agents with releevnat context (if they need it ) to perform tasks. We wont make the agents but we allow you to add our 
   context ot agent sotuions liek claude code, openclaw whatever else. Lets plan this all out                                 

⏺ This is a big pivot - from onboarding buddy to context layer for AI agents. Let me explore what you already have that maps to
  this new direction, and what needs to change.

  Let me kick off parallel exploration of the key systems.

⏺ 3 Explore agents finished (ctrl+o to expand)
   ├─ Explore context capture systems · 41 tool uses · 63.5k tokens
   │  ⎿  Done
   ├─ Explore API and data flow · 30 tool uses · 85.0k tokens
   │  ⎿  Done
   └─ Explore electron frontend architecture · 58 tool uses · 75.7k tokens
      ⎿  Done

⏺ Great exploration results. I now have a deep understanding of your entire codebase. Here's what's exciting: you already have
  ~80% of the hard part built - the context capture pipeline (screenshots, activity classification, embeddings, workstream
  analysis, session summarization) is production-grade. The pivot is really about exposing that rich context to external agents
  instead of consuming it internally.

  Let me design the implementation plan.

⏺ Plan(Design agentic context pivot plan)
  ⎿  Done (55 tool uses · 101.8k tokens · 3m 56s)
  (ctrl+o to expand)

⏺ Excellent research. Before I finalize the plan, let me verify a few critical files and ask you some important questions about
  the direction.

⏺ Read 3 files (ctrl+o to expand)

⏺ Good, I've verified the current architecture. Before I write the final plan, I have a few important questions about the
  direction:

⏺ User answered Claude's questions:
  ⎿  · For the capture mechanism - do you want to keep the Electron desktop app as the primary way users record their
     workday, or are you thinking about lighter alternatives (browser extension, CLI daemon, etc.)? → Keep Electron app
     · What's your initial integration target for connecting agents to Mitable context? → Context files (.md injection)
     · For the team/admin features (dashboard, people management, org metrics) - keep them or strip down to personal-only
     initially? → Personal-only first
     · How aggressive should this pivot be? Should we rip out onboarding code now or gradually sunset it? → Clean break

⏺ Clear direction. Let me write the final plan.

⏺ Updated plan
  ⎿  /plan to preview

⏺ The plan is written. Here's the summary of what I'm proposing:

  The big picture: Mitable keeps its capture engine (the hard part, already built) and pivots the output layer. Instead of feeding
   context to an internal onboarding agent, you write it to .md files that any external agent can read.

  5 phases:

  1. Context File Generation - New contextFileService writes ~/.mitable/context.md with structured work context. New "Agents" view
   in Electron with one-click setup for Claude Code/Cursor. One new backend endpoint assembles context from existing services.
  2. Clean Break - Remove onboarding code (roadmaps, nudges, chats, expert matching, visual guidance). New nav: Timeline,
  Sessions, Recaps, Agents, Integrations.
  3. REST Context API + API Keys - Versioned /api/v1/context/ endpoints with mk_live_ API key auth for programmatic agent access.
  4. MCP Server - @mitable/mcp-server npm package wrapping the REST API. Native integration for Claude Code, Cursor, Windsurf.
  5. SDK + Streaming - TypeScript SDK, webhooks, SSE streaming, per-project context files.

  The plan starts with the simplest thing that delivers value (write a file) and layers sophistication on top.
  ⎿  Tool use rejected with user message: the claude.md has been updatedd. i thin you have a fundamental mistunderstaing of the
     state of the product

⏺ You're right, let me re-read the updated CLAUDE.md and memory to understand the current state properly.

⏺ Recalled 1 memory, read 1 file (ctrl+o to expand)

⏺ Got it - I was wrong. Mitable has already pivoted away from onboarding. The current product is a work context capture + time
  insights platform. The Calendar, Sessions, Recaps, Docs views are the active product, not legacy. The onboarding stuff
  (roadmaps, nudges, chats) is already legacy code.

  So this new pivot is: take your existing context capture platform and make it the feed that powers external AI agents. Let me
  rewrite the plan with this correct understanding.

⏺ User answered Claude's questions:
  ⎿  · To make sure I understand the pivot correctly: Mitable today captures work context + gives time insights + drafts
     updates. The new bet is adding a layer where this captured context flows into AI agents (Claude Code, Cursor, etc.) so
     they know what you're working on. Is the existing product (Calendar, Sessions, Recaps, time insights) staying as-is,
     with agent integration being an additive feature on top? → Additive - keep existing + add agents

⏺ Now I have the right picture. Let me rewrite the plan properly.

⏺ Updated plan
  ⎿  /plan to preview

⏺ The plan is rewritten. Key corrections from my first attempt:

  - Current product is kept entirely — Calendar, Sessions, Recaps, Docs, team features all stay
  - Agent integration is additive — new contextFileService, new backend context endpoint, new "Agents" view in the sidebar
  - No removals — the onboarding code is already legacy; this plan only adds
  - Phase 1 is dead simple — write a .md file to disk, agents read it. ~5 new/modified files on each side (Electron + backend)

  The plan builds in layers: file injection (immediate value, no infrastructure) → REST API + API keys (programmatic access) → MCP
   server (native agent integration) → SDK + streaming.
  ⎿  Tool use rejected with user message: its more that we want to be ble to kick off agents from mitable, those agents can then
     use our context if applicable ot the tsak its trying to do

⏺ That's a fundamentally different model - let me make sure I understand this correctly.
  ⎿  Tool use rejected with user message: The user wants to clarify these questions.
         This means they may have additional information, context or questions for you.
         Take their response into account and then reformulate the questions if appropriate.
         Start by asking them what they would like to clarify.

         Questions asked:
     - "So the flow is: user is in Mitable, describes a task they want done, and Mitable kicks off an agent to do it - with the
     agent getting Mitable's work context injected if relevant. Is that right? Walk me through what the user experience looks like
      in your head."
       Answer: Both / flexible
     - "When you say 'kick off agents' - what does that literally mean technically? How does Mitable trigger Claude Code or Cursor
      to start doing something?"
       Answer: Not sure yet
     - "When an agent is working on a task, does it pull context from Mitable on-demand (like an API call during execution), or
     does Mitable inject all relevant context upfront when launching the task?"
       Answer: Both

⏺ What would you like to clarify? I want to make sure I fully understand your vision before planning the technical approach.

⏺ User answered Claude's questions:
  ⎿  · What additional context or thoughts do you have about how the agent launching should work? Feel free to describe the
     experience you're imagining, reference products you've seen, or share any constraints/ideas. → Let me type it out

⏺ Go ahead, I'm listening. Tell me what you're envisioning.

⏺ User answered Claude's questions:
  ⎿  · Go ahead and describe the agent launching experience you're imagining - the user journey, what it feels like, examples
      of tasks someone would kick off. Use 'Other' to type freely. → Consider bash vs mcp becuase mcp has schema overhead
     whereas we can continue to write md files ot the memory of an agent and it can use bash instead. if it needs to interact
      with mcps there are packages that convert mcps to bash so we can interact with th em

⏺ That's a much clearer picture. So the approach is:

  1. Context = files — Write .md files to an agent's memory/context directory
  2. Launch = bash/CLI — Spawn the agent via CLI (e.g., claude command)
  3. Interaction = bash — If the agent needs Mitable data mid-task, use bash commands (not MCP)
  4. MCP interop = mcp-to-bash converters — If agents need MCP tools, packages like mcptools convert them to CLI

  No MCP server, no schema overhead. Just files and processes.

⏺ User answered Claude's questions:
  ⎿  · For the 'kick off' UX in Mitable: the user describes a task in the Console UI, picks an agent (Claude Code, etc.), and
      Mitable writes context files + spawns the agent CLI from Electron. Does the user then switch to the agent's own
     interface (e.g., terminal for Claude Code), or does Mitable show the agent's output inline? → more just to monitor its
     progress. i am thinking laucnihg the agent headless like https://code.claude.com/docs/en/headless but i want visiility
     into the agents progress
     · For the context files: should Mitable write to each agent's native memory location (e.g.,
     ~/.claude/projects/.../memory/ for Claude Code), or write to ~/.mitable/context/ and have agents configured to read from
      there? → Mitable central location

⏺ Now I have a clear picture. Let me research Claude Code's headless mode to understand the exact API, then finalize the plan.

⏺ Fetch(https://docs.anthropic.com/en/docs/claude-code/cli-usage)
  ⎿  Received 681 bytes (301 Moved Permanently)

⏺ Fetch(https://docs.anthropic.com/en/docs/claude-code/sdk)
  ⎿  Received 643 bytes (301 Moved Permanently)

⏺ Fetch(https://code.claude.com/docs/en/cli-usage)
  ⎿  Received 28.7KB (200 OK)

⏺ Fetch(https://code.claude.com/docs/en/sdk)
  ⎿  Received 658 bytes (301 Moved Permanently)

⏺ Fetch(https://code.claude.com/docs/en/headless)
  ⎿  Received 7.1KB (200 OK)

⏺ Fetch(https://docs.claude.com/en/docs/agent-sdk/overview)
  ⎿  Received 627 bytes (302 Found)

⏺ Fetch(https://docs.claude.com/en/docs/agent-sdk/typescript)
  ⎿  Received 639 bytes (302 Found)

⏺ Fetch(https://platform.claude.com/docs/en/agent-sdk/overview)
  ⎿  Received 19.7KB (200 OK)

⏺ Fetch(https://platform.claude.com/docs/en/agent-sdk/typescript)
  ⎿  Received 65KB (200 OK)

⏺ Now I have the full picture. The Claude Agent SDK (@anthropic-ai/claude-agent-sdk) is exactly the tool — it lets you
  programmatically launch Claude Code from Electron's Node.js process, stream progress events back to the UI, and inject Mitable's
   work context into the prompt. Let me rewrite the plan.

⏺ Updated plan
  ⎿  /plan to preview

⏺ The plan now reflects the correct vision:

  Mitable becomes an agent launcher. Users describe tasks in Mitable's UI, Mitable injects captured work context, and launches
  agents headlessly via the Claude Agent SDK — with real-time progress streaming back to the Console.

  Key technical approach:
  - Claude Code: @anthropic-ai/claude-agent-sdk TypeScript package, called directly from Electron's main process. Gives streaming
  messages, cost tracking, sessions, and full programmatic control.
  - Other agents: Context written to ~/.mitable/context.md + CLI spawn
  - Context: Assembled from existing session/capture/daily-activity data — no new AI calls needed
  - UI: New "Agents" view with task launcher + real-time task monitor cards

  4 phases: Agent Launcher (core) → Context Files (non-SDK agents) → Task Persistence → API Keys for external access.
  ⎿  Tool use rejected with user message: just including recent wrok is dumb, we should include relevant work. more so that the 
     agent knows the relevant context if there is any. this could be exposign a skill to the agent to check if we have any 
     relevatn tdata to the query an dthen provide it? just doing blind recent work seems flakiy what if the recent work doenst 
     have any relevant ocntext nad in that case wer are just filling up the context windwo wifth no vlue                          
                                                                                 
⏺ You're absolutely right. Dumping recent work blindly is wasteful — if I'm working on auth today and ask the agent to fix a CSS  
  bug, my auth context is noise. The agent should pull relevant context on-demand via a tool/skill, using the semantic search you
  already have in session-retriever.service.ts.                                                                                   
                                                                                 
  Let me update the plan with the smart approach.                                                                                 
                                                                                                                                
⏺ Read 1 file (ctrl+o to expand)                                                                                                  
                                            
⏺ Updated plan                                                                                                                    
  ⎿  /plan to preview                                                            
                                                                                                                                  
⏺ Now update the Phase 1 sections to reflect the tool-based approach instead of context dump:                                     
                                                                                                                                  
⏺ Updated plan                                                                                                                    
  ⎿  /plan to preview                                                            
                                                                                                                                  
⏺ Now update the UI section to remove the "include recent work context" toggle (no longer relevant) and fix the files summary:
                                                                                                                                  
⏺ Updated plan                                                                                                                    
  ⎿  /plan to preview                                                            
                                                                                                                                  
⏺ Updated plan                                                                                                                  
  ⎿  /plan to preview                                                                                                             
                                                                                                                                  
⏺ Now update the verification plan to reflect the tool-based approach:           
                                                                                                                                  
⏺ Updated plan                                                                                                                    
  ⎿  /plan to preview                                                            
                                                                                                                                  
⏺ Also update the existing services to reuse table since contextAssemblyService is gone:                                        
                                                                                                                                  
⏺ Updated plan                                                                                                                    
  ⎿  /plan to preview                                                            
                                                                                                                                  
⏺ The plan now reflects the smart approach. Here's the key change:                                                              
                                                                                                                                  
  Before: Blind dump of recent work into the system prompt (wastes context window, often irrelevant).                             
                                                                                 
  After: Agent gets an in-process search_work_context MCP tool. It semantically searches your captured work history only when     
  relevant to its task, using the pgvector search you already have in session-retriever.service.ts. Self-contained tasks don't  
  touch the context at all.

  The in-process MCP server (createSdkMcpServer()) runs in the same Node.js process — zero overhead, no separate server. For
  non-SDK agents, same endpoints work via bash/curl.

──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 Ready to code?
                                                                                                                                  
 Here is Claude's plan:                                                          
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Mitable Pivot: Agent Launcher with On-Demand Work Context                                                                      

 Context

 Mitable captures how you work (screenshots, activity, app context) and provides time insights and update drafting. The new bet:
 people work with AI agents more and more. Mitable becomes the place you kick off agents to do work, with agents able to pull
 relevant context from your captured workday on-demand.

 You don't build agents. You let users launch agents (Claude Code, Cursor, OpenClaw, etc.) from Mitable's UI. Agents get a tool
 to search your work context — they only pull what's relevant to their task, not a blind dump of recent activity.

 What stays: All current features (Calendar, Sessions, Recaps, Docs, team dashboard, integrations).

 What's new: Agent launcher + task monitor + context search tool.

 ---
 Technical Foundation

 Claude Agent SDK

 The @anthropic-ai/claude-agent-sdk TypeScript package runs Claude Code programmatically from Electron's main process. Key
 feature: createSdkMcpServer() creates an in-process MCP server (zero overhead — runs in the same Node.js process, no child
 process spawn) that gives the agent a search_work_context tool.

 import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
 import { z } from "zod";

 // In-process MCP server — agent gets a tool to search Mitable context
 const mitableServer = createSdkMcpServer({
   name: "mitable",
   tools: [
     tool("search_work_context",
       "Search the user's captured work history for context relevant to a query. " +
       "Returns matching activity descriptions, session summaries, and workstreams. " +
       "Use this when you need to understand what the user has been working on.",
       { query: z.string().describe("What to search for in work history") },
       async ({ query }) => {
         // Calls Mitable backend — semantic search via session-retriever.service.ts
         const results = await searchMitableContext(query);
         return { content: [{ type: "text", text: results }] };
       }
     ),
     tool("get_current_activity",
       "Get what the user is currently working on right now.",
       {},
       async () => {
         const current = await getCurrentActivity();
         return { content: [{ type: "text", text: current }] };
       }
     ),
   ]
 });

 for await (const message of query({
   prompt: "Fix the auth bug in this project",
   options: {
     cwd: "/path/to/project",
     allowedTools: ["Read", "Edit", "Bash", "Glob", "Grep"],
     settingSources: ["project"],
     includePartialMessages: true,
     mcpServers: { mitable: mitableServer },  // agent gets search tools
     systemPrompt: {
       type: "preset",
       preset: "claude_code",
       append: "You have access to Mitable work context tools. Use search_work_context " +
               "to find relevant context about what the user has been working on if it " +
               "would help you complete the task. Don't call it if the task is self-contained."
     }
   }
 })) {
   // Stream to UI
 }

 Why in-process MCP over blind context dump:
 - Agent only pulls context relevant to its task (semantic search via pgvector)
 - No wasted context window on irrelevant recent activity
 - Agent decides when/if it needs context — self-contained tasks skip the search entirely
 - Uses existing session-retriever.service.ts which already does pgvector cosine similarity

 Why in-process MCP over external MCP server:
 - Zero process overhead (runs in same Node.js process as Electron main)
 - No separate server to manage
 - Type-safe tool definitions with Zod

 For non-SDK agents (Cursor, OpenClaw, CLI)

 Expose context via bash: a mitable CLI command or simple HTTP calls the agent can make:

 # Agent uses Bash tool to search Mitable context
 mitable context search "auth implementation"
 # or
 curl -s "http://localhost:3000/api/context/search?q=auth+implementation" -H "Authorization: Bearer $MITABLE_TOKEN"

 Key SDK capabilities:
 - Streaming: SDKMessage types give real-time tool usage, thinking, file edits
 - Sessions: Resume by session ID for multi-turn tasks
 - Hooks: PreToolUse/PostToolUse callbacks for monitoring
 - Permissions: acceptEdits, bypassPermissions, or custom canUseTool
 - Cost tracking: total_cost_usd, usage in result messages

 ---
 Phase 1: Agent Launcher + Context Injection

 1.1 Install SDK

 Add @anthropic-ai/claude-agent-sdk as a dependency in apps/electron/package.json.

 1.2 New Service: agentLauncherService.ts

 Create: apps/electron/src/services/agentLauncherService.ts

 Singleton service in the Electron main process that manages agent tasks.

 Core responsibilities:
 - Launch agent tasks via the Claude Agent SDK query() function
 - Create the in-process Mitable MCP server with context search tools
 - Track active tasks (Map of taskId → running query)
 - Stream SDKMessage events to Console renderer via IPC
 - Handle task lifecycle: start, monitor, cancel, complete

 Key methods:
 class AgentLauncherService {
   async launchTask(params: {
     prompt: string;           // user's task description
     cwd: string;              // target project directory
     agentType: "claude-code" | "cursor" | "generic";
     permissions: "plan" | "acceptEdits" | "bypassPermissions";
     enableContextTools: boolean;  // give agent access to Mitable context search
     model?: string;
     maxBudgetUsd?: number;
   }): Promise<string>         // returns taskId

   async cancelTask(taskId: string): Promise<void>
   getActiveTasks(): AgentTask[]
   getTaskHistory(): AgentTask[]
 }

 For Claude Code tasks, the launcher:
 1. Creates the in-process Mitable MCP server (if enableContextTools is true)
 2. Calls query() with the MCP server attached
 3. Streams events to the renderer

 // Build the in-process MCP server with context search tools
 const mitableServer = this.createMitableServer(userId, authToken);

 const agentQuery = query({
   prompt: params.prompt,  // just the user's task — no context blob
   options: {
     cwd: params.cwd,
     allowedTools: ["Read", "Edit", "Bash", "Glob", "Grep", "Write"],
     settingSources: ["project"],
     includePartialMessages: true,
     permissionMode: params.permissions,
     mcpServers: params.enableContextTools
       ? { mitable: mitableServer }
       : {},
     systemPrompt: {
       type: "preset",
       preset: "claude_code",
       append: params.enableContextTools
         ? "You have Mitable context tools available (search_work_context, get_current_activity). "
         + "Use them if the task would benefit from knowing what the user has been working on. "
         + "Skip them if the task is self-contained."
         : undefined
     },
     maxBudgetUsd: params.maxBudgetUsd,
   }
 });

 for await (const message of agentQuery) {
   mainWindow.webContents.send("agent:message", { taskId, message });
 }

 For other agents (Cursor, generic CLI): spawn via child_process.spawn. Agent accesses context via bash commands (see 1.4).

 1.3 In-Process MCP Server: Context Tools

 Built inside agentLauncherService.ts using createSdkMcpServer() + tool() from the Agent SDK.

 Tools exposed to the agent:

 search_work_context — Semantic search across captured work history
 - Input: { query: string, days?: number }
 - Calls backend: POST /api/context/search (new endpoint)
 - Backend uses SessionRetrieverService.search() (pgvector cosine similarity on session_chunks)
 - Returns: relevant activity descriptions, session summaries, workstream info
 - Agent calls this when the task might benefit from knowing what the user worked on

 get_current_activity — What the user is doing right now
 - Input: {} (no params)
 - Calls backend: GET /api/context/current (new endpoint)
 - Returns: current session status, active app, recent activity description
 - Agent calls this for time-sensitive tasks ("summarize what I'm doing")

 search_knowledge — Search integrated sources (Slack, Notion, GitHub)
 - Input: { query: string, sources?: string[] }
 - Calls backend: existing SearchService.search() (hybrid: Pinecone + PostgreSQL FTS)
 - Returns: relevant snippets from connected tools
 - Agent calls this when it needs organizational knowledge

 1.4 Backend: Context Search Endpoints

 Create: apps/backend/src/routes/context.ts

 Endpoints called by the in-process MCP tools (from Electron) and by bash commands (for non-SDK agents):

 POST /api/context/search
 - Auth: existing requireAuth JWT
 - Body: { query: string, days?: number, topK?: number }
 - Calls SessionRetrieverService.search() which does pgvector cosine similarity on session_chunks
 - Returns: ranked chunks with session metadata, timestamps, confidence scores

 GET /api/context/current
 - Auth: existing requireAuth JWT
 - Returns: current active session info (if any), most recent capture's activity description, active workstream

 POST /api/context/knowledge
 - Auth: existing requireAuth JWT
 - Body: { query: string, sources?: ["slack"|"notion"|"github"] }
 - Wraps existing SearchService.search() (hybrid semantic + keyword)
 - Returns: relevant snippets from connected integrations

 Create: apps/backend/src/services/context.service.ts

 Thin orchestration layer that delegates to existing services:
 - SessionRetrieverService.search() for semantic search on session_chunks
 - SearchService.search() for knowledge from integrations
 - Direct DB queries on monitoring_sessions for current activity
 - No new AI calls — queries already-processed and embedded data

 For bash-based agents (non-SDK), same endpoints work with curl:
 curl -s "http://localhost:3000/api/context/search" \
   -H "Authorization: Bearer $JWT" \
   -d '{"query":"auth implementation"}' | jq '.results[].text'

 1.5 IPC Channels for Agent Communication

 Modify: packages/shared/src/ipc.ts

 Add new channels:
 // Agent launcher channels
 AGENT_LAUNCH_TASK: "agent:launch-task"
 AGENT_CANCEL_TASK: "agent:cancel-task"
 AGENT_MESSAGE: "agent:message"           // main → renderer (streaming)
 AGENT_TASK_COMPLETE: "agent:task-complete"
 AGENT_GET_ACTIVE_TASKS: "agent:get-active-tasks"
 AGENT_GET_TASK_HISTORY: "agent:get-task-history"

 Modify: apps/electron/src/preload/console.ts

 Add preload methods for the Console renderer to call:
 launchAgentTask: (params) => ipcRenderer.invoke("agent:launch-task", params)
 cancelAgentTask: (taskId) => ipcRenderer.invoke("agent:cancel-task", taskId)
 onAgentMessage: (callback) => ipcRenderer.on("agent:message", callback)
 onAgentTaskComplete: (callback) => ipcRenderer.on("agent:task-complete", callback)
 getActiveAgentTasks: () => ipcRenderer.invoke("agent:get-active-tasks")
 getAgentTaskHistory: () => ipcRenderer.invoke("agent:get-task-history")

 Modify: apps/electron/src/renderer/console/src/global.d.ts

 Add type declarations for the new ConsoleAPI methods.

 1.6 Console UI: Agents View

 Create: apps/electron/src/renderer/console/src/components/views/employee/AgentsView/index.tsx

 The main agent launcher and task monitor view. Two sections:

 Task Launcher (top):
 - Text input: "What do you want the agent to do?"
 - Project directory picker (recent directories from captures, or file picker)
 - Agent type selector: Claude Code (primary), Cursor, Generic CLI
 - Toggle: "Enable Mitable context tools" (default on) — gives agent access to search your work history on-demand
 - Permission level: Plan mode / Accept edits / Full autonomy
 - Optional: cost cap, model selection
 - "Launch" button

 Active Tasks (bottom):
 - List of running agent tasks with real-time progress
 - Each task card shows:
   - Task description (the prompt)
   - Agent type + status (running/completed/failed/cancelled)
   - Live streaming output (collapsible): tool uses, file edits, thinking
   - Cost so far (from SDK usage tracking)
   - Duration
   - Cancel button (for running tasks)
   - Result (when complete)

 Create: apps/electron/src/renderer/console/src/components/views/employee/AgentsView/TaskCard.tsx

 Individual task card component with streaming message display.

 Create: apps/electron/src/renderer/console/src/components/views/employee/AgentsView/TaskLauncher.tsx

 The task input + configuration form.

 1.7 Navigation Update

 Modify: apps/electron/src/renderer/console/src/components/navigation/Nav.tsx

 Add nav item:
 Agents (icon: Bot or Zap) → /agents

 Modify: apps/electron/src/renderer/console/src/App.tsx

 Add route:
 <Route path="agents" element={<AgentsView />} />

 1.8 Main Process Integration

 Modify: apps/electron/src/main.ts

 - Initialize AgentLauncherService and ContextAssemblyService
 - Register IPC handlers for agent channels
 - Forward agent events to Console renderer window

 ---
 Phase 2: Context File Generation (for non-SDK agents)

 For agents that can't be launched via SDK (Cursor, OpenClaw, generic CLI tools), write context to ~/.mitable/context.md.

 2.1 New Service: contextFileService.ts

 Create: apps/electron/src/services/contextFileService.ts

 Writes and maintains ~/.mitable/context.md — updated on session events and periodic timer.

 - Reuses ContextAssemblyService for the content
 - Writes on: session end, recap ready, every 5 min during active sessions
 - Configurable via preferences

 2.2 Agent Setup (non-Claude-Code agents)

 Add to AgentsView:
 - Cursor card: Instructions to configure Cursor to read ~/.mitable/context.md
 - Generic card: Shows file path, copy button, manual setup instructions
 - Claude Code CLI card: One-click append to ~/.claude/CLAUDE.md to reference the context file (for users who prefer CLI over
 SDK-launched tasks)

 2.3 Context Preferences

 Modify: apps/electron/src/services/preferencesService.ts

 Add:
 contextFile: {
   enabled: boolean;          // default: true
   path: string;              // default: ~/.mitable/context.md
   updateIntervalMinutes: number; // default: 5
 }

 ---
 Phase 3: Task Persistence + History

 3.1 Backend: Agent Tasks Table

 Create: apps/backend/src/db/schema/agent-tasks.schema.ts

 agent_tasks table:
 - id, userId, organizationId
 - prompt (the task description)
 - agentType: "claude-code" | "cursor" | "generic"
 - status: "running" | "completed" | "failed" | "cancelled"
 - cwd (project directory)
 - contextSnapshot (the injected context, for reference)
 - result (agent's final output)
 - costUsd (from SDK tracking)
 - durationMs
 - sdkSessionId (Claude Agent SDK session ID, for resume)
 - createdAt, completedAt

 3.2 Backend: Agent Tasks Endpoints

 Create: apps/backend/src/routes/agent-tasks.ts

 POST   /api/agent-tasks          — Record a launched task
 PATCH  /api/agent-tasks/:id      — Update task status/result
 GET    /api/agent-tasks           — List user's tasks (paginated)
 GET    /api/agent-tasks/:id       — Get task details

 3.3 Task History UI

 Extend AgentsView with a "History" tab showing past tasks, their prompts, results, costs, and durations.

 ---
 Phase 4: API Keys + External Access

 For advanced users who want to build their own integrations or let custom agents access Mitable context.

 4.1 API Key System

 Create: apps/backend/src/db/schema/api-keys.schema.ts
 Create: apps/backend/src/middleware/apiKeyAuth.ts
 Create: apps/backend/src/services/api-key.service.ts

 API keys (mk_live_...) for external access to context data. SHA-256 hashed storage.

 4.2 Public Context API

 Create: apps/backend/src/routes/v1/context.ts

 Versioned at /api/v1/context/:
 GET  /v1/context/recent     — Recent activity
 POST /v1/context/search     — Semantic search (wraps session-retriever.service.ts)
 GET  /v1/context/current     — Current activity
 GET  /v1/context/sessions    — Session list
 GET  /v1/context/daily/:date — Daily rollup

 4.3 API Key Management UI

 Add to AgentsView: API key generation, listing (prefix only), revocation, usage stats.

 ---
 Files Summary

 Phase 1 (Agent Launcher — Core)

 ┌────────┬──────────────────────────────────────────────────────────────────────────────────────────────┐
 │ Action │                                             File                                             │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Create │ apps/electron/src/services/agentLauncherService.ts (includes in-process MCP server)          │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Create │ apps/backend/src/routes/context.ts (search, current, knowledge endpoints)                    │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Create │ apps/backend/src/services/context.service.ts (orchestrates existing services)                │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Create │ apps/electron/src/renderer/console/src/components/views/employee/AgentsView/index.tsx        │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Create │ apps/electron/src/renderer/console/src/components/views/employee/AgentsView/TaskCard.tsx     │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Create │ apps/electron/src/renderer/console/src/components/views/employee/AgentsView/TaskLauncher.tsx │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Modify │ apps/electron/package.json — add @anthropic-ai/claude-agent-sdk                              │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Modify │ packages/shared/src/ipc.ts — add agent IPC channels                                          │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Modify │ apps/electron/src/preload/console.ts — add agent preload methods                             │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Modify │ apps/electron/src/renderer/console/src/global.d.ts — add ConsoleAPI types                    │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Modify │ apps/electron/src/main.ts — init services, register IPC handlers                             │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Modify │ apps/backend/src/routes.ts — mount context router                                            │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Modify │ apps/electron/src/renderer/console/src/App.tsx — add /agents route                           │
 ├────────┼──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ Modify │ apps/electron/src/renderer/console/src/components/navigation/Nav.tsx — add Agents nav        │
 └────────┴──────────────────────────────────────────────────────────────────────────────────────────────┘

 Phase 2 (Context Files)

 ┌────────┬──────────────────────────────────────────────────────────────────────┐
 │ Action │                                 File                                 │
 ├────────┼──────────────────────────────────────────────────────────────────────┤
 │ Create │ apps/electron/src/services/contextFileService.ts                     │
 ├────────┼──────────────────────────────────────────────────────────────────────┤
 │ Modify │ apps/electron/src/services/preferencesService.ts — add context prefs │
 └────────┴──────────────────────────────────────────────────────────────────────┘

 Phase 3 (Task Persistence)

 ┌────────┬──────────────────────────────────────────────────┐
 │ Action │                       File                       │
 ├────────┼──────────────────────────────────────────────────┤
 │ Create │ apps/backend/src/db/schema/agent-tasks.schema.ts │
 ├────────┼──────────────────────────────────────────────────┤
 │ Create │ apps/backend/src/routes/agent-tasks.ts           │
 └────────┴──────────────────────────────────────────────────┘

 Phase 4 (API Keys + Public API)

 ┌────────┬───────────────────────────────────────────────┐
 │ Action │                     File                      │
 ├────────┼───────────────────────────────────────────────┤
 │ Create │ apps/backend/src/db/schema/api-keys.schema.ts │
 ├────────┼───────────────────────────────────────────────┤
 │ Create │ apps/backend/src/middleware/apiKeyAuth.ts     │
 ├────────┼───────────────────────────────────────────────┤
 │ Create │ apps/backend/src/services/api-key.service.ts  │
 ├────────┼───────────────────────────────────────────────┤
 │ Create │ apps/backend/src/routes/v1/context.ts         │
 └────────┴───────────────────────────────────────────────┘

 ---
 Existing Services to Reuse

 Need: Semantic search on work history
 Existing Service: SessionRetrieverService.search() — pgvector cosine similarity on session_chunks
 Path: apps/backend/src/services/session-retriever.service.ts
 ────────────────────────────────────────
 Need: Knowledge search (Slack/Notion/GitHub)
 Existing Service: SearchService.search() — hybrid Pinecone + PostgreSQL FTS
 Path: apps/backend/src/services/search.service.ts
 ────────────────────────────────────────
 Need: Embeddings
 Existing Service: EmbeddingService — OpenAI text-embedding-3-large
 Path: apps/backend/src/services/embedding.service.ts
 ────────────────────────────────────────
 Need: Session data
 Existing Service: monitoring_sessions queries
 Path: apps/backend/src/db/schema/monitoring.schema.ts
 ────────────────────────────────────────
 Need: Current activity
 Existing Service: Active session + recent captures
 Path: Same schema
 ────────────────────────────────────────
 Need: Session chunks (embedded)
 Existing Service: session_chunks with pgvector
 Path: apps/backend/src/db/schema/session-chunks.schema.ts
 ────────────────────────────────────────
 Need: Workstreams
 Existing Service: sessionWorkstreams table
 Path: apps/backend/src/db/schema/workstreams.schema.ts
 ────────────────────────────────────────
 Need: Auth middleware
 Existing Service: requireAuth
 Path: apps/backend/src/middleware/auth.ts
 ────────────────────────────────────────
 Need: IPC patterns
 Existing Service: Existing channel definitions
 Path: packages/shared/src/ipc.ts
 ────────────────────────────────────────
 Need: Preload patterns
 Existing Service: Existing console preload
 Path: apps/electron/src/preload/console.ts

 ---
 Verification Plan

 Phase 1 End-to-End Test

 1. Open Mitable, ensure sessions have been captured (run a few work sessions)
 2. Navigate to Agents view
 3. Test 1 — Self-contained task (context tools should NOT be called):
   - Enter: "List all TypeScript files in this project"
   - Launch with context tools enabled
   - Verify: agent does NOT call search_work_context (task is self-contained)
   - Verify: task completes normally
 4. Test 2 — Context-relevant task (context tools SHOULD be called):
   - Enter: "What was I working on related to authentication? Help me continue that work."
   - Launch with context tools enabled
   - Verify: agent calls search_work_context with an auth-related query
   - Verify: agent receives relevant session chunks from pgvector search
   - Verify: agent uses the context to inform its response
 5. Test 3 — Streaming + monitoring:
   - Launch a multi-step task
   - Verify: task card shows "Running" with streaming tool uses
   - Verify: cost and duration update in real-time
   - Verify: cancel button works

 Phase 2 Test

 1. Enable context file in settings
 2. Work in a session for a few minutes, end it
 3. Verify ~/.mitable/context.md exists with recent activity
 4. Open Claude Code CLI in a project with CLAUDE.md referencing the file
 5. Ask "what have I been working on?" — should answer from context

 Phase 3 Test

 1. Launch multiple agent tasks
 2. Navigate away and back to Agents view
 3. Verify task history persists
 4. Verify completed tasks show results and costs
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌

 Claude has written up a plan and is ready to execute. Would you like to proceed?

 ❯ 1. Yes, clear context (76% used) and auto-accept edits (shift+tab)
   2. Yes, auto-accept edits
   3. Yes, manually approve edits
   4. Type here to tell Claude what to change

 ctrl-g to edit in VS Code · ~/.claude/plans/mutable-purring-wolf.md
