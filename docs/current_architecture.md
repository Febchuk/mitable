# Mitable AI Onboarding Buddy - Current Architecture State

**Document Version:** 1.0
**Last Updated:** 2025-10-20
**Implementation Status:** ~65-70% of MVP Complete

This document represents the **actual current state** of the Mitable implementation, not the planned architecture. For planned architecture, see `mitable_complete_prd.md` and `Electron_Express_monorepo_UPDATED.md`.

---

## Architecture Overview

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║                        MITABLE AI ONBOARDING BUDDY - CURRENT STATE                   ║
║                              Implementation: ~65-70% Complete                         ║
╚══════════════════════════════════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION LAYER - Electron Windows                        │
│                              (All 5 Windows Implemented ✓)                            │
└──────────────────────────────────────────────────────────────────────────────────────┘

     ┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
     │  Agent Window   │         │  Console Window  │         │ Overlay Window  │
     │   (740x80px)    │         │  (1264x888px)    │         │  (Fullscreen)   │
     │                 │         │                  │         │                 │
     │ • Cmd+H toggle  │◄───────►│ • Main Hub       │         │ • Transparent   │
     │ • Floating pill │   IPC   │ • 3 Tabs:        │         │ • Click-through │
     │ • Expands up    │         │   - Roadmap ✓    │         │ • Highlights    │
     │ • Always-on-top │         │   - Chats ✓      │         │   [NOT RENDERED]│
     └────────┬────────┘         │   - Nudges ✓     │         └────────┬────────┘
              │                  └────────┬─────────┘                  │
              │                           │                            │
              │         ┌─────────────────┴─────────────┐             │
              │         │                               │             │
              │   ┌─────▼──────┐                  ┌─────▼──────┐     │
              │   │Guide Window│                  │Nudge Window│     │
              │   │ (400x600)  │                  │ (400x600)  │     │
              │   │            │                  │            │     │
              │   │ • Left side│ ◄──Mutual────── ►│• Right side│     │
              │   │ • Steps    │   Exclusivity    │• Expert rec│     │
              │   │ • Active   │                  │• Active    │     │
              │   └────────────┘                  └────────────┘     │
              │                                                       │
              └───────────────────────────┬───────────────────────────┘
                                         │
                                    [28 IPC Channels]
                                         │
┌────────────────────────────────────────┼────────────────────────────────────────────┐
│                                        │                                             │
│  GUIDE_START, GUIDE_NEXT_STEP, GUIDE_COMPLETE, NUDGE_SHOW, NUDGE_ACCEPT,           │
│  OVERLAY_HIGHLIGHT_UPDATE, AGENT_TOGGLE, CONVERSATION_NEW, AUTH_SET_TOKENS, etc.   │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER - Backend Services (Express)                     │
│                           Base: http://localhost:3000                                │
└──────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────┐  ┌──────────────────────────┐  ┌─────────────────────────┐
│   Authentication API     │  │   Conversation API       │  │      Nudge API          │
│   /auth/*                │  │   /conversations/*       │  │      /nudges/*          │
├──────────────────────────┤  ├──────────────────────────┤  ├─────────────────────────┤
│ • POST /login       ✓    │  │ • GET / (all)       ✓    │  │ • GET / (all)      ✓    │
│ • POST /signup      ✓    │  │ • GET /{id}/msgs    ✓    │  │ • POST /create     ✓    │
│ • Token mgmt        ✓    │  │ • POST / (new)      ✓    │  │ • POST /{id}/accept ✓   │
│                          │  │ • POST /{id}/msgs   ✓    │  │ • POST /{id}/dismiss✓   │
│ [Supabase Auth]          │  │ • POST /stream (SSE)✓    │  │ • POST /generate-*  ✓   │
└──────────────────────────┘  └────────┬─────────────────┘  └─────────────────────────┘
                                       │
┌──────────────────────────┐  ┌────────▼─────────────────┐  ┌─────────────────────────┐
│     Admin API            │  │   Backend Services       │  │   Integration API       │
│     /admin/*             │  │   (Core Logic)           │  │   /integrations/*       │
├──────────────────────────┤  ├──────────────────────────┤  ├─────────────────────────┤
│ • GET /users        ✓    │  │ • agent.service     ✓    │  │ • POST /slack/oauth ✓   │
│ • POST /users       ✓    │  │ • llm.service       ✓    │  │ • POST /notion/oauth✓   │
│ • GET /templates    ✓    │  │ • embedding.service ✓    │  │ • Slack API         ✓   │
│ • POST /templates   ✓    │  │ • vector.service    ✓    │  │ • Notion API        ✓   │
│ • GET /integrations ✓    │  │ • notion.service    ✓    │  │ [OAuth flows ready]     │
│ • POST /{id}/connect✓    │  │ • slack.service     ✓    │  │ [Sync workers TODO]     │
│ • POST /{id}/sync   ✓    │  │ • expertMatching    ✓    │  └─────────────────────────┘
│ [Template assignment]    │  │ • guideGeneration   ✓    │
└──────────────────────────┘  │ • ingestion         ~    │
                              │ [Vision detection TODO]  │
                              └──────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER - Persistence & Vector Store                     │
└──────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────┐        ┌────────────────────────────────┐
│   PostgreSQL 15 (Supabase)             │        │   Pinecone Vector Store        │
│   18 Tables Implemented ✓               │        │   (1536-dimensional)           │
├────────────────────────────────────────┤        ├────────────────────────────────┤
│                                        │        │ • Index: mitable-embeddings    │
│ CORE ENTITIES:                         │        │ • Semantic search              │
│ • organizations                   ✓    │        │ • Metadata: doc_id, title,     │
│ • users (with role/dept/start)    ✓    │        │   type, chunk_index, org_id    │
│                                        │        │                                │
│ ONBOARDING (Admin Templates):          │        │ [Client configured ✓]          │
│ • roadmap_templates               ✓    │        │ [Ingestion pipeline ~]         │
│ • roadmap_template_tasks          ✓    │        └────────────────────────────────┘
│ • roadmap_template_sources        ✓    │
│ • source_materials                ✓    │
│                                        │
│ ONBOARDING (User Roadmaps):            │
│ • user_template_assignments       ✓    │
│ • user_roadmap_tasks              ✓    │
│                                        │
│ HELP SYSTEM:                           │
│ • conversations                   ✓    │
│ • messages (with cardData)        ✓    │
│                                        │
│ EXPERT MATCHING:                       │
│ • expert_profiles                 ✓    │
│ • expert_topics                   ✓    │
│ • expert_interactions             ✓    │
│ • nudges (with matchScore)        ✓    │
│ • nudge_resources                 ✓    │
│                                        │
│ INTEGRATIONS:                          │
│ • integrations (OAuth tokens)     ✓    │
│ • sync_logs                       ✓    │
│                                        │
│ ANALYTICS:                             │
│ • analytics_events                ✓    │
│                                        │
│ [Drizzle ORM with full relations] ✓    │
└────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL INTEGRATIONS & AI SERVICES                           │
└──────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐
│   OpenAI API    │  │  Google Gemini  │  │   Slack API     │  │   Notion API     │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤  ├──────────────────┤
│ • Embeddings ✓  │  │ • Vision API ~  │  │ • OAuth flow ✓  │  │ • OAuth flow ✓   │
│ • Function      │  │ • Task extract✓ │  │ • Channels   ✓  │  │ • Page fetch ✓   │
│   calling    ✓  │  │ • Multimodal ✓  │  │ • Messages   ✓  │  │ • Block parse✓   │
│ • text-embed-   │  │                 │  │ • Bot ready  ✓  │  │ • AI extract ✓   │
│   3-large    ✓  │  │ [UI detection   │  │ [Nudge delivery │  │ • Rate limit ✓   │
│                 │  │  NOT impl]      │  │  TODO]          │  │                  │
└─────────────────┘  └─────────────────┘  └─────────────────┘  └──────────────────┘
```

---

## Status Legend

- **✓** = Fully implemented and operational
- **~** = Partially implemented (configured but incomplete pipeline)
- **[TODO]** = Scaffolded/planned but not functional
- **[NOT impl]** = Missing entirely

---

## Detailed Component Breakdown

### 1. Electron Windows (100% Complete)

All 5 windows from the planned architecture are fully implemented in `/apps/electron/src/main.ts`:

#### Agent Window

- **Dimensions:** 740x80px (collapsed), 740x696px (expanded)
- **Position:** Bottom center of screen
- **Behavior:**
  - Frameless, transparent background
  - Always-on-top with platform-specific z-order (macOS: `modal-panel`, Windows: numeric)
  - Global hotkey: Cmd+H (macOS) / Ctrl+H (Windows)
  - Expands upward when entering conversation mode
  - Persists across fullscreen apps (macOS: `visibleOnAllWorkspaces`)

#### Console Window

- **Dimensions:** 1264x888px
- **Behavior:**
  - Main application hub
  - Native title bar (macOS: hidden with custom traffic lights at 6,10)
  - Closing this window closes entire application
  - Three main tabs: Roadmap ✓, Chats ✓, Nudges ✓

#### Overlay Window

- **Dimensions:** Fullscreen (primary display)
- **Behavior:**
  - Transparent, non-focusable
  - Click-through: `setIgnoreMouseEvents(true, { forward: true })`
  - Always-on-top
  - **Status:** Window implemented, but visual rendering (arrows/highlights) NOT implemented

#### Guide Window

- **Dimensions:** 400x600px
- **Position:** Left side, vertically centered
- **Behavior:**
  - Frameless, transparent
  - Always-on-top
  - Mutually exclusive with Nudge window (only one visible at a time)
  - Step-by-step guidance display

#### Nudge Window

- **Dimensions:** 400x600px
- **Position:** Right of Agent window with 16px gap
- **Behavior:**
  - Frameless, transparent
  - Always-on-top
  - Mutually exclusive with Guide window
  - Expert recommendations display

### 2. IPC Communication (28 Channels)

**Location:** `/packages/shared/src/ipc.ts`

All channels are defined and operational:

**Help System:**

- `HELP_REQUEST` - User requests help
- `HELP_RESPONSE` - AI provides help response
- `CAPTURE_SCREENSHOT` - Trigger screenshot capture (NOT IMPLEMENTED)
- `SCREENSHOT_CAPTURED` - Screenshot data returned (NOT IMPLEMENTED)

**Guide System:**

- `GUIDE_START` - Begin guided walkthrough
- `GUIDE_NEXT_STEP` - Proceed to next step
- `GUIDE_STEP_UPDATE` - Update current step status
- `GUIDE_COMPLETE` - Finish guide
- `GUIDE_CANCEL` - Cancel guide
- `GUIDE_DATA` - Guide configuration data

**Overlay:**

- `OVERLAY_SHOW` - Display overlay
- `OVERLAY_HIDE` - Hide overlay
- `OVERLAY_HIGHLIGHT_UPDATE` - Update visual highlights (NOT RENDERED)

**Nudge:**

- `NUDGE_SHOW` - Display nudge window
- `NUDGE_HIDE` - Hide nudge window
- `NUDGE_ACCEPT` - User accepts nudge recommendation
- `NUDGE_DISMISS` - User dismisses nudge
- `NUDGE_CREATE_REQUEST` - Request to create new nudge
- `NUDGE_OPEN_CREATOR` - Open nudge creation UI

**Window Management:**

- `WINDOW_SHOW` - Show specific window
- `WINDOW_HIDE` - Hide specific window
- `WINDOW_TOGGLE` - Toggle window visibility
- `SET_IGNORE_MOUSE_EVENTS` - Control click-through behavior

**Agent:**

- `AGENT_TOGGLE` - Toggle agent window visibility
- `AGENT_SHOW_CONSOLE` - Open console from agent
- `AGENT_RESIZE` - Resize agent window (collapse/expand)

**Authentication:**

- `AUTH_SET_TOKENS` - Store auth tokens
- `AUTH_GET_TOKEN` - Retrieve auth token
- `AUTH_CLEAR` - Clear auth state
- `AUTH_TOKEN_UPDATED` - Token refresh notification

**Conversation:**

- `CONVERSATION_NEW` - Create new conversation
- `CONVERSATION_LOAD` - Load existing conversation
- `CONVERSATION_UPDATE` - Update conversation state

### 3. Backend API Routes (40+ Endpoints)

**Base URL:** `http://localhost:3000`

#### Authentication (`/auth`)

- `POST /auth/login` - Email/password login via Supabase
- `POST /auth/signup` - New user registration

#### Conversations (`/conversations`)

- `GET /conversations` - List all conversations with messages
- `GET /conversations/:conversationId/messages` - Get specific conversation
- `POST /conversations` - Create new conversation
- `POST /conversations/:conversationId/messages` - Send message
- `POST /conversations/:conversationId/messages/stream` - Stream AI response (SSE)

#### Nudges (`/nudges`)

- `GET /nudges` - Get all nudges with expert information
- `POST /nudges/create` - Create nudge(s) with resources
- `POST /nudges/:nudgeId/accept` - Accept nudge recommendation
- `POST /nudges/:nudgeId/dismiss` - Decline nudge
- `POST /nudges/:nudgeId/resolve` - Mark nudge as resolved
- `POST /nudges/generate-context` - AI generates context from conversation
- `POST /nudges/generate-question` - AI generates question from conversation
- `GET /experts/search` - Search experts by name/role
- `GET /users/search` - Search users in organization

#### Admin - People Management (`/admin`)

- `GET /admin/users` - List all employees with progress metrics
- `GET /admin/users/:id` - Detailed user profile with analytics
- `POST /admin/users` - Create employee (Supabase Auth + DB + template assignment)

#### Admin - Template Management (`/admin`)

- `GET /admin/templates` - List all templates with usage statistics
- `GET /admin/templates/:id` - Template details with tasks organized by week
- `POST /admin/templates` - Create template (supports Notion URL import)

#### Admin - Integration Management (`/admin`)

- `GET /admin/integrations` - List all integrations with status
- `POST /admin/integrations/:id/connect` - Activate integration
- `POST /admin/integrations/:id/disconnect` - Deactivate integration
- `POST /admin/integrations/:id/sync` - Trigger manual sync
- `PATCH /admin/integrations/:id` - Update integration settings

#### Integrations (`/integrations`)

- `POST /integrations/slack/oauth/start` - Initiate Slack OAuth flow
- `POST /integrations/notion/oauth/start` - Initiate Notion OAuth flow
- Additional OAuth callbacks for GitHub, Google Drive (scaffolded)

### 4. Backend Services (9 Services)

**Location:** `/apps/backend/src/services/`

#### agent.service.ts ✓

- **Purpose:** Core AI orchestrator with OpenAI function calling
- **Features:**
  - Tool registration and execution framework
  - Streaming response handling (SSE)
  - Multi-turn conversation support
  - Agentic responses with multiple tool calls

#### llm.service.ts ✓

- **Purpose:** Google Gemini integration for multimodal AI
- **Features:**
  - Task extraction from Notion pages
  - Multimodal understanding (text + images)
  - Structured output generation

#### embedding.service.ts ✓

- **Purpose:** Vector embeddings via OpenAI
- **Model:** text-embedding-3-large (1536 dimensions)
- **Features:**
  - Converts knowledge base documents to vectors
  - Batch embedding support

#### vector.service.ts ✓

- **Purpose:** Pinecone vector search
- **Index:** `mitable-embeddings`
- **Features:**
  - Semantic similarity search
  - Metadata filtering by organization
  - Configurable top-k results

#### notion.service.ts ✓

- **Purpose:** Notion OAuth + API integration
- **Features:**
  - OAuth token management with refresh
  - Recursive page block fetching
  - Rate limiting (350ms between requests)
  - Text extraction from all block types
  - Image/file attachment handling

#### slack.service.ts ✓

- **Purpose:** Slack API integration
- **Features:**
  - Channel list retrieval
  - Direct message (DM) list retrieval
  - Message fetching from channels/DMs
  - Slack bot interactions
  - **Missing:** Nudge delivery mechanism

#### expertMatching.service.ts ✓

- **Purpose:** Expert recommendation algorithm
- **Algorithm Weights:**
  - Expertise similarity: 40% (cosine similarity of embeddings)
  - Performance: 30% (response rate + helpfulness rating)
  - Availability: 30% (calendar/status)
- **Features:**
  - Multi-factor scoring
  - Ranked expert list generation

#### guideGeneration.service.ts ✓

- **Purpose:** Visual guidance generation
- **Features:**
  - Step-by-step instruction generation
  - Coordinate-based UI guidance
  - Integration with overlay system

#### ingestion.service.ts ~

- **Purpose:** Knowledge base document ingestion
- **Status:** Partially implemented
- **Features:**
  - Document processing pipeline
  - Chunking and embedding
  - Vector storage
  - **Missing:** Complete end-to-end pipeline testing

### 5. Database Schema (18 Tables)

**Database:** PostgreSQL 15 (Supabase)
**ORM:** Drizzle with full relations
**Location:** `/apps/backend/src/db/schema/`

#### Core Entities

1. **organizations** - Multi-tenant support with name, domain, settings
2. **users** - Employee profiles with:
   - role (admin/employee)
   - email, firstName, lastName
   - department, jobTitle
   - startDate, status (active/inactive)
   - organizationId (FK)

#### Onboarding - Admin Templates

3. **roadmap_templates** - Reusable onboarding templates with:
   - name, description
   - icon, color (UI customization)
   - roleTags (Software Engineer, Designer, etc.)
   - estimatedWeeks
   - organizationId (FK)

4. **roadmap_template_tasks** - Tasks within templates:
   - title, description
   - weekNumber (1-16)
   - dayOfWeek (optional)
   - timeEstimate (hours)
   - priority (high/medium/low)
   - category (setup/training/project/meeting)
   - templateId (FK)

5. **roadmap_template_sources** - Many-to-many linking:
   - Maps tasks to source materials
   - templateTaskId (FK)
   - sourceMaterialId (FK)

6. **source_materials** - Shared learning resources:
   - title, description
   - url, type (documentation/video/tutorial/internal)
   - organizationId (FK)

#### Onboarding - User Roadmaps

7. **user_template_assignments** - Template-to-user assignments:
   - userId (FK)
   - templateId (FK)
   - assignedAt, assignedBy
   - status (assigned/in_progress/completed)

8. **user_roadmap_tasks** - User's personalized task list:
   - All fields from roadmap_template_tasks (copied on assignment)
   - userId (FK)
   - status (pending/in_progress/completed/skipped)
   - completedAt
   - custom (boolean - user-added task)
   - notes (user annotations)

#### Help System

9. **conversations** - Chat history:
   - title
   - userId (FK)
   - contextType (general/help_request/workflow)
   - organizationId (FK)

10. **messages** - Message content:
    - conversationId (FK)
    - role (user/assistant/system)
    - content (text)
    - cardData (JSON - for special UI renders like nudge cards)
    - sources (JSON array - citation links)

#### Expert Matching

11. **expert_profiles** - Expert metadata:
    - userId (FK)
    - bio
    - responseRate (0-100)
    - helpfulnessScore (0-100)
    - totalInteractions

12. **expert_topics** - Expertise areas:
    - expertId (FK)
    - topic (e.g., "React", "Kubernetes", "HR Policies")
    - confidenceScore (0-100)
    - evidenceCount (interactions on this topic)

13. **expert_interactions** - Interaction history:
    - expertId (FK)
    - employeeId (FK)
    - interactionType (nudge_accepted/direct_message/meeting)
    - topic
    - helpfulnessRating (1-5)
    - resolvedAt

14. **nudges** - Expert recommendations:
    - employeeId (FK)
    - expertId (FK)
    - conversationId (optional FK)
    - question (what the employee needs help with)
    - context (background information)
    - expertMatchScore (0-100)
    - status (pending/accepted/dismissed/resolved)
    - deliveryChannel (in_app/slack/email)
    - responseTime (duration until expert responds)
    - resolutionTime (duration until resolved)

15. **nudge_resources** - File/link attachments:
    - nudgeId (FK)
    - resourceType (file/link/screenshot)
    - resourceUrl
    - title

#### Integrations

16. **integrations** - OAuth connections:
    - organizationId (FK)
    - type (slack/notion/github/google_drive)
    - status (active/inactive/error)
    - accessToken (plaintext - TODO: encrypt)
    - refreshToken (plaintext - TODO: encrypt)
    - expiresAt
    - metadata (JSON - integration-specific config)

17. **sync_logs** - Integration sync history:
    - integrationId (FK)
    - status (success/failure)
    - recordsProcessed
    - errorMessage

#### Analytics

18. **analytics_events** - Event tracking:
    - userId (FK)
    - eventType (page_view/task_completed/help_requested/etc.)
    - eventData (JSON)
    - organizationId (FK)

### 6. Frontend Components (Console Window)

**Location:** `/apps/electron/src/renderer/console/src/components/`

#### Admin Views

- **SetupView** ✓ - Initial organization configuration wizard
- **DashboardView** ✓ - Admin dashboard with MetricCard components
- **PeopleView** ✓ - Employee management with:
  - Employee list table
  - AddNewUser modal dialog
  - PersonDetail sidebar for detailed profile
- **TemplatesView** ✓ - Template management with:
  - Template list/grid
  - CreateTemplate dialog (supports Notion URL import)
  - TemplateDetail view with week-by-week tasks
- **IntegrationsView** ✓ - Integration management with:
  - SlackConnectDialog / SlackConfigureDialog
  - NotionConnectDialog / NotionConfigureDialog
  - IntegrationCard components for each integration
  - OAuth flow handling

#### Employee Views

- **HomeView** ✓ - Employee home dashboard
- **RoadmapView** ✓ - Task roadmap with:
  - Week-by-week task view
  - Progress tracking
  - RoadmapTaskDetail sidebar for task details
- **ChatsView** ✓ - Conversation interface with:
  - Conversation list
  - ChatDetail for individual conversations
  - NewChat for starting new conversations
  - Streaming message support
- **NudgesView** ✓ - Nudge management with:
  - Nudge list (pending/accepted/resolved)
  - NudgeDetail for individual nudges
  - CreateNudge dialog for creating nudges
  - PeopleSelector for choosing experts
  - ResourceUploader for file attachments

#### Shared Infrastructure

- **Layout:** ConsoleLayout, Sidebar with NavItem, Logo
- **Context Providers:** UserContext, AdminContext, SidebarContext
- **React Query Hooks:** Custom hooks for all major operations:
  - Conversations (useConversations, useMessages, useSendMessage)
  - Nudges (useNudges, useCreateNudge, useAcceptNudge)
  - Roadmaps (useRoadmapTasks, useUpdateTask)
  - Admin (useUsers, useTemplates, useIntegrations)
- **API Services:**
  - auth.service.ts - Authentication operations
  - chats.service.ts - Conversation operations
  - nudges.service.ts - Nudge operations
  - roadmap.service.ts - Roadmap operations
  - admin.service.ts - Admin operations
- **UI Components:**
  - Button, IconButton
  - Avatar, Badge
  - Card, ProgressBar
  - ScrollArea, Chart

### 7. External Integrations

#### OpenAI ✓

- **Service:** Embeddings + Function Calling
- **Model:** text-embedding-3-large (1536 dimensions)
- **Features:**
  - Vector embeddings for knowledge base
  - Agentic function calling for tool use
  - Fully operational

#### Google Gemini ~

- **Service:** Multimodal AI (Vision + Text)
- **Features:**
  - ✓ Task extraction from Notion pages
  - ✓ Multimodal understanding
  - ✗ UI object detection (NOT IMPLEMENTED)
  - ✗ Screenshot analysis (NOT IMPLEMENTED)

#### Pinecone ~

- **Service:** Vector database
- **Index:** `mitable-embeddings` (1536 dimensions)
- **Features:**
  - ✓ Client configured
  - ✓ Semantic search ready
  - ~ Ingestion pipeline partially implemented
  - ? Actual vector data status unclear

#### Slack ✓

- **Service:** Team collaboration
- **Features:**
  - ✓ OAuth flow complete
  - ✓ Channel/DM fetching
  - ✓ Message retrieval
  - ✗ Nudge delivery (NOT IMPLEMENTED)
  - ⚠️ Tokens stored plaintext (TODO: encrypt)

#### Notion ✓

- **Service:** Documentation import
- **Features:**
  - ✓ OAuth flow complete
  - ✓ Page block fetching with recursive traversal
  - ✓ AI task extraction via Gemini
  - ✓ Rate limiting (350ms between requests)
  - ⚠️ Tokens stored plaintext (TODO: encrypt)

#### Supabase ✓

- **Service:** PostgreSQL database + Authentication
- **Features:**
  - ✓ User authentication (email/password)
  - ✓ Database hosting
  - ✓ Row-level security (RLS) configured
  - ✓ Token management

---

## Data Flow Examples

### Conversation Flow (Fully Operational ✓)

```
1. User types message in Console ChatDetail
   ↓
2. POST /conversations/{id}/messages/stream
   ↓
3. agent.service.ts receives message
   ↓
4. OpenAI function calling (tool use if needed)
   ↓
5. Stream SSE response back to UI
   ↓
6. UI renders message in real-time
```

### Nudge Creation Flow (Fully Operational ✓)

```
1. User fills out CreateNudge form (question, context, resources)
   ↓
2. POST /nudges/create
   ↓
3. expertMatching.service.ts scores experts:
   - Expertise similarity (40%)
   - Performance (30%)
   - Availability (30%)
   ↓
4. Create nudge in DB with top expert match
   ↓
5. Return nudge with expert info
   ↓
6. UI displays nudge in NudgesView
```

### Template Assignment Flow (Fully Operational ✓)

```
1. Admin assigns template to new employee
   ↓
2. POST /admin/users
   ↓
3. Create Supabase Auth user
   ↓
4. Insert into users table
   ↓
5. Copy all roadmap_template_tasks to user_roadmap_tasks
   ↓
6. Create user_template_assignments record
   ↓
7. Employee sees personalized roadmap on login
```

### Notion Import Flow (Fully Operational ✓)

```
1. Admin pastes Notion page URL in CreateTemplate
   ↓
2. POST /admin/templates (with notionUrl)
   ↓
3. notion.service.ts fetches page blocks recursively
   ↓
4. llm.service.ts (Gemini) extracts tasks:
   - Parses text blocks for task structure
   - Generates weekNumber, timeEstimate
   - Infers category and priority
   ↓
5. Create roadmap_template with extracted tasks
   ↓
6. Return template with tasks
   ↓
7. Admin sees template in TemplatesView
```

### Help Request Flow (BROKEN ✗)

```
1. User presses Cmd+H
   ↓
2. ✓ Agent window opens
   ↓
3. ✗ Screenshot capture NOT IMPLEMENTED
   ↓
4. ✗ Gemini Vision UI detection NOT IMPLEMENTED
   ↓
5. ✗ Visual overlay rendering NOT IMPLEMENTED
```

---

## Critical Gaps Identified

### 1. Visual Guidance System (HIGH PRIORITY)

**Status:** Architecture exists, implementation missing

**Missing Components:**

- Screenshot capture mechanism
  - `CAPTURE_SCREENSHOT` IPC channel defined but no handler
  - No native screen capture integration
  - No temporary file storage for screenshots

- Gemini Vision UI detection
  - API configured but no service implementation
  - No bounding box extraction
  - No UI element classification

- Overlay visual rendering
  - Overlay window exists and is click-through
  - No arrow/highlight rendering code
  - No SVG or Canvas-based drawing
  - No coordinate mapping from detection to display

**Impact:** Core value proposition (just-in-time visual help) is non-functional

### 2. Real-time Sync Workers (MEDIUM PRIORITY)

**Status:** OAuth flows complete, sync workers missing

**Missing Components:**

- Background worker infrastructure
  - No cron jobs or scheduled tasks
  - No queue system for sync jobs
  - Sync endpoints exist but are manual-trigger only

- Slack integration sync
  - Can fetch messages, but no auto-sync
  - No real-time message ingestion
  - No nudge delivery to Slack channels/DMs

- Notion integration sync
  - Can fetch pages on-demand
  - No monitoring for new/updated pages
  - No automatic knowledge base updates

**Impact:** Knowledge base becomes stale, manual syncs required

### 3. Security Hardening (HIGH PRIORITY - BLOCKER FOR PRODUCTION)

**Critical Issues:**

- OAuth tokens stored in plaintext in database
  - `integrations.accessToken` and `refreshToken` unencrypted
  - TODO comments in code acknowledge this risk
  - AES-256 encryption needed before production

- No token refresh automation
  - Tokens expire, no auto-refresh logic
  - Users must re-authenticate frequently

- No input validation on IPC channels
  - Preload scripts expose APIs directly
  - No schema validation on messages

**Impact:** Cannot deploy to production safely

### 4. AI Pipeline Completeness (MEDIUM PRIORITY)

**Status:** Individual services work, full pipeline not integrated

**Missing Components:**

- Hybrid search integration
  - Pinecone client exists
  - PostgreSQL full-text search exists
  - No combined semantic + keyword search

- Knowledge base ingestion
  - ingestion.service.ts scaffolded
  - No end-to-end pipeline from source → chunks → embeddings → Pinecone
  - No testing of full pipeline

- Vector search testing
  - Unknown if Pinecone index has data
  - No verification of semantic search quality
  - No benchmarking of search results

**Impact:** AI responses may lack relevant context from knowledge base

### 5. Error Handling & Resilience (LOW PRIORITY)

**Missing Components:**

- API error handling inconsistent across routes
- No retry logic for external API calls
- No circuit breakers for failing services
- Limited error logging/monitoring

**Impact:** Poor user experience when errors occur

---

## Implementation Completeness by Subsystem

| Subsystem                 | Completion | Notes                                         |
| ------------------------- | ---------- | --------------------------------------------- |
| **Electron Windows**      | 100%       | All 5 windows functional                      |
| **IPC Channels**          | 100%       | 28 channels defined, most operational         |
| **Backend API Routes**    | 95%        | 40+ endpoints, minor error handling gaps      |
| **Backend Services**      | 75%        | Core services done, pipeline integration gaps |
| **Database Schema**       | 100%       | 18 tables with relations                      |
| **Frontend Components**   | 90%        | All major views, polish needed                |
| **Authentication**        | 100%       | Supabase Auth fully integrated                |
| **Onboarding System**     | 95%        | Templates & roadmaps operational              |
| **Conversation System**   | 100%       | Chat with streaming responses                 |
| **Nudge System**          | 85%        | Creation/display works, delivery missing      |
| **Expert Matching**       | 100%       | Algorithm operational                         |
| **Visual Guidance**       | 15%        | Window exists, rendering missing              |
| **Screenshot Capture**    | 0%         | Not implemented                               |
| **UI Detection (Vision)** | 10%        | API configured, service missing               |
| **Notion Integration**    | 95%        | OAuth + import fully working                  |
| **Slack Integration**     | 60%        | OAuth + fetch working, sync/delivery missing  |
| **Vector Search**         | 50%        | Client ready, ingestion incomplete            |
| **Security**              | 40%        | Auth works, encryption missing                |

**Overall: ~65-70% Complete**

---

## What Works Right Now

### Fully Operational Features

1. **Admin can create onboarding templates manually**
   - Create template with name, icon, color
   - Add tasks week-by-week
   - Link tasks to source materials
   - View all templates with usage stats

2. **Admin can import templates from Notion**
   - Paste Notion page URL
   - AI extracts tasks automatically
   - Tasks organized by week
   - Template ready for assignment

3. **Admin can create employees and assign templates**
   - Add employee with email, name, role, department
   - Assign one or more templates
   - Tasks automatically copied to user's roadmap
   - Employee receives login credentials

4. **Employees can view and complete their roadmap**
   - See tasks organized by week
   - Mark tasks as complete
   - View progress percentage
   - Add custom tasks

5. **Employees can chat with AI assistant**
   - Start conversations
   - Receive streaming responses
   - AI can use tools (function calling)
   - View conversation history

6. **Employees can create and receive nudges**
   - Create nudge with question and context
   - Attach files/links/screenshots
   - Expert matching algorithm scores candidates
   - View pending/accepted/resolved nudges
   - Accept or dismiss recommendations

7. **Admin can manage integrations**
   - Connect Slack workspace (OAuth)
   - Connect Notion workspace (OAuth)
   - View integration status
   - Trigger manual syncs

8. **Multi-window coordination**
   - Agent window toggles with Cmd+H
   - Agent can open Console window
   - Guide and Nudge windows are mutually exclusive
   - Overlay responds to highlight updates

---

## What Doesn't Work Yet

### Non-Functional Features

1. **Visual guidance overlays**
   - Cannot capture screenshots
   - Cannot detect UI elements
   - Cannot render arrows or highlights
   - Core value proposition blocked

2. **Real-time integration syncing**
   - Must manually trigger syncs
   - No background workers
   - Knowledge base doesn't auto-update

3. **Slack nudge delivery**
   - Can fetch Slack messages
   - Cannot send nudges to Slack
   - In-app only for now

4. **Semantic search with knowledge base**
   - Vector DB configured
   - Ingestion pipeline incomplete
   - Cannot search uploaded documents

5. **Token encryption**
   - OAuth tokens in plaintext
   - Security risk for production

---

## Next Steps (Recommended Priority Order)

### Phase 1: Core Value Proposition (Weeks 1-2)

1. Implement screenshot capture (Electron native APIs)
2. Integrate Gemini Vision for UI object detection
3. Build overlay rendering (Canvas/SVG arrows and highlights)
4. Test end-to-end help flow: Cmd+H → screenshot → detection → overlay

### Phase 2: Knowledge Base (Weeks 3-4)

5. Complete ingestion pipeline (document → chunks → embeddings → Pinecone)
6. Implement hybrid search (semantic + keyword)
7. Integrate search results into AI responses
8. Test knowledge base quality with real documents

### Phase 3: Security & Production Readiness (Week 5)

9. Implement AES-256 encryption for OAuth tokens
10. Add automatic token refresh logic
11. Implement comprehensive error handling
12. Add logging and monitoring

### Phase 4: Real-time Integrations (Week 6)

13. Build background worker infrastructure
14. Implement Slack/Notion auto-sync
15. Add Slack nudge delivery
16. Test real-time updates

---

## File Locations Reference

### Electron Application

- Main process: `/apps/electron/src/main.ts`
- Preload scripts: `/apps/electron/src/preload/*.ts` (output: `.cjs`)
- Renderers: `/apps/electron/src/renderer/*/src/`
- Config: `/apps/electron/electron.vite.config.ts`

### Backend API

- Entry point: `/apps/backend/src/index.ts`
- Routes: `/apps/backend/src/routes.ts`
- Services: `/apps/backend/src/services/*.ts`
- Database schema: `/apps/backend/src/db/schema/*.ts`

### Shared Package

- IPC channels: `/packages/shared/src/ipc.ts`
- Types: `/packages/shared/src/types.ts`
- Guides: `/packages/shared/src/guides.ts`
- Nudges: `/packages/shared/src/nudges.ts`

### Documentation

- Complete PRD: `/docs/mitable_complete_prd.md`
- Architecture scaffold: `/docs/Electron_Express_monorepo_UPDATED.md`
- Project instructions: `/CLAUDE.md`

---

## Port Allocation (Development)

- **Backend API:** `http://localhost:3000`
- **electron-vite dev server:** `http://localhost:5173`
  - Agent: `http://localhost:5173/agent`
  - Console: `http://localhost:5173/console`
  - Overlay: `http://localhost:5173/overlay`
  - Guide: `http://localhost:5173/guide`
  - Nudge: `http://localhost:5173/nudge`

---

**Document Prepared:** 2025-10-20
**Assessment Method:** Comprehensive codebase exploration via Explore agent
**Accuracy:** Based on actual file examination, not planned documentation
