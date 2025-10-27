# Mitable AI Onboarding Buddy - Visual Architecture Diagrams

**Document Version:** 1.0
**Last Updated:** 2025-10-20
**Status:** Current implementation state (~65-70% complete)

This document provides Mermaid diagrams for the current implementation. These diagrams are fully compatible with GitHub, GitLab, and any modern markdown renderer that supports Mermaid.

---

## Table of Contents

1. [High-Level System Architecture](#1-high-level-system-architecture)
2. [Conversation Flow Sequence](#2-conversation-flow-sequence-diagram)
3. [Window Coordination via IPC](#3-window-coordination-via-ipc)
4. [Database Schema Relationships](#4-database-schema-relationships)
5. [Nudge Creation Flow](#5-nudge-creation-flow)
6. [Template Assignment Flow](#6-template-assignment-flow)
7. [Integration Architecture](#7-integration-architecture)

---

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph "Presentation Layer - Electron Windows"
        Agent["🪟 Agent Window<br/>(740x80px)<br/>Cmd+H Toggle"]
        Console["🖥️ Console Window<br/>(1264x888px)<br/>Main Hub"]
        Overlay["👁️ Overlay Window<br/>(Fullscreen)<br/>Transparent"]
        Guide["📋 Guide Window<br/>(400x600px)<br/>Left Side"]
        Nudge["💡 Nudge Window<br/>(400x600px)<br/>Right Side"]
    end

    subgraph "IPC Communication Layer"
        IPC["28 IPC Channels<br/>GUIDE_START, NUDGE_SHOW,<br/>OVERLAY_UPDATE, etc."]
    end

    subgraph "Application Layer - Backend API (Express)"
        Auth["🔐 Auth API<br/>/auth/*"]
        Conv["💬 Conversation API<br/>/conversations/*"]
        NudgeAPI["💡 Nudge API<br/>/nudges/*"]
        Admin["👔 Admin API<br/>/admin/*"]
        Integrations["🔌 Integration API<br/>/integrations/*"]
    end

    subgraph "Service Layer"
        AgentSvc["🤖 agent.service<br/>OpenAI Function Calling"]
        LLMSvc["🧠 llm.service<br/>Gemini Multimodal"]
        EmbedSvc["📊 embedding.service<br/>OpenAI Embeddings"]
        VectorSvc["🔍 vector.service<br/>Pinecone Search"]
        NotionSvc["📝 notion.service<br/>Notion API"]
        SlackSvc["💬 slack.service<br/>Slack API"]
        ExpertSvc["👤 expertMatching.service<br/>Scoring Algorithm"]
    end

    subgraph "Data Layer"
        Postgres["🗄️ PostgreSQL (Supabase)<br/>18 Tables<br/>Drizzle ORM"]
        Pinecone["🔢 Pinecone Vector DB<br/>1536-dimensional<br/>mitable-embeddings"]
    end

    subgraph "External Services"
        OpenAI["🤖 OpenAI<br/>Embeddings + Function Calling"]
        Gemini["✨ Google Gemini<br/>Vision + Multimodal"]
        SlackAPI["💬 Slack API<br/>OAuth + Messages"]
        NotionAPI["📝 Notion API<br/>OAuth + Pages"]
    end

    %% Window connections
    Agent <-->|IPC| IPC
    Console <-->|IPC| IPC
    Overlay <-->|IPC| IPC
    Guide <-->|IPC| IPC
    Nudge <-->|IPC| IPC

    %% IPC to Backend
    IPC <-->|HTTP/SSE| Auth
    IPC <-->|HTTP/SSE| Conv
    IPC <-->|HTTP/SSE| NudgeAPI
    IPC <-->|HTTP/SSE| Admin
    IPC <-->|HTTP/SSE| Integrations

    %% Backend to Services
    Conv --> AgentSvc
    Conv --> LLMSvc
    NudgeAPI --> ExpertSvc
    Admin --> NotionSvc
    Integrations --> SlackSvc
    Integrations --> NotionSvc

    %% Services to Data
    AgentSvc --> EmbedSvc
    AgentSvc --> VectorSvc
    EmbedSvc --> Pinecone
    VectorSvc --> Pinecone
    Auth --> Postgres
    Conv --> Postgres
    NudgeAPI --> Postgres
    Admin --> Postgres

    %% Services to External
    EmbedSvc --> OpenAI
    AgentSvc --> OpenAI
    LLMSvc --> Gemini
    NotionSvc --> NotionAPI
    SlackSvc --> SlackAPI

    %% Styling
    classDef implemented fill:#4ade80,stroke:#16a34a,stroke-width:2px,color:#000
    classDef partial fill:#fbbf24,stroke:#d97706,stroke-width:2px,color:#000
    classDef missing fill:#f87171,stroke:#dc2626,stroke-width:2px,color:#000

    class Agent,Console,Guide,Nudge,Auth,Conv,NudgeAPI,Admin,Postgres,AgentSvc,ExpertSvc,NotionSvc,SlackSvc implemented
    class Overlay,VectorSvc,EmbedSvc,LLMSvc,Pinecone partial
    class Integrations partial
```

**Legend:**

- 🟢 Green = Fully implemented and operational
- 🟡 Yellow = Partially implemented
- 🔴 Red = Missing or non-functional

---

## 2. Conversation Flow Sequence Diagram

Shows the end-to-end flow when a user sends a message in the chat interface.

```mermaid
sequenceDiagram
    actor User
    participant ConsoleUI as Console Window<br/>(ChatsView)
    participant IPC as IPC Layer
    participant API as Backend API<br/>/conversations/*
    participant AgentSvc as agent.service
    participant OpenAI as OpenAI API<br/>(Function Calling)
    participant DB as PostgreSQL

    User->>ConsoleUI: Types message and hits send
    ConsoleUI->>API: POST /conversations/{id}/messages/stream
    API->>DB: Insert message (role: user)
    DB-->>API: Message stored

    API->>AgentSvc: Process message with context
    AgentSvc->>DB: Fetch conversation history
    DB-->>AgentSvc: Previous messages

    AgentSvc->>OpenAI: Stream chat completion<br/>(with tool definitions)

    alt Tool Use Required
        OpenAI-->>AgentSvc: Function call request
        AgentSvc->>AgentSvc: Execute tool<br/>(search, database query, etc.)
        AgentSvc->>OpenAI: Tool result
        OpenAI-->>AgentSvc: Continue generation
    end

    loop Streaming Response
        OpenAI-->>AgentSvc: SSE chunk
        AgentSvc-->>API: Forward chunk
        API-->>ConsoleUI: SSE event
        ConsoleUI->>ConsoleUI: Render chunk in real-time
    end

    OpenAI-->>AgentSvc: [DONE]
    AgentSvc->>DB: Insert message (role: assistant)
    DB-->>AgentSvc: Saved
    AgentSvc-->>API: Complete
    API-->>ConsoleUI: Stream ended
    ConsoleUI->>User: Full response visible
```

---

## 3. Window Coordination via IPC

Shows how the 5 Electron windows communicate via IPC channels.

```mermaid
sequenceDiagram
    actor User
    participant Agent as Agent Window
    participant Main as Main Process<br/>(IPC Broker)
    participant Console as Console Window
    participant Overlay as Overlay Window
    participant Guide as Guide Window
    participant Nudge as Nudge Window

    %% User triggers help
    User->>Agent: Press Cmd+H
    Agent->>Main: AGENT_TOGGLE
    Main->>Agent: Show/Hide window

    %% User clicks "Show Console"
    User->>Agent: Click "Open Console"
    Agent->>Main: AGENT_SHOW_CONSOLE
    Main->>Console: Show window
    Main->>Console: Focus window

    %% Guide starts (mutually exclusive with Nudge)
    User->>Console: Start guided walkthrough
    Console->>Main: GUIDE_START (with guide data)

    Main->>Guide: GUIDE_DATA
    Main->>Guide: Show window
    Guide->>User: Display step 1

    Main->>Overlay: OVERLAY_HIGHLIGHT_UPDATE<br/>(coordinates for arrows)
    Note over Overlay: ⚠️ Window exists but<br/>rendering NOT implemented

    Main->>Nudge: Hide window<br/>(mutual exclusivity)

    %% User progresses through guide
    User->>Guide: Click "Next Step"
    Guide->>Main: GUIDE_NEXT_STEP
    Main->>Overlay: OVERLAY_HIGHLIGHT_UPDATE<br/>(new coordinates)

    %% User completes guide
    User->>Guide: Complete final step
    Guide->>Main: GUIDE_COMPLETE
    Main->>Guide: Hide window
    Main->>Overlay: OVERLAY_HIDE

    %% Nudge appears (mutually exclusive with Guide)
    Console->>Main: NUDGE_SHOW (with nudge data)
    Main->>Nudge: Show window with data
    Main->>Guide: Ensure Guide hidden<br/>(mutual exclusivity)
    Nudge->>User: Display expert recommendation

    %% User accepts nudge
    User->>Nudge: Click "Accept"
    Nudge->>Main: NUDGE_ACCEPT
    Main->>Console: Update nudge status
    Main->>Nudge: Hide window
```

---

## 4. Database Schema Relationships

Shows the relationships between the 18 PostgreSQL tables.

```mermaid
erDiagram
    organizations ||--o{ users : "has many"
    organizations ||--o{ roadmap_templates : "has many"
    organizations ||--o{ source_materials : "has many"
    organizations ||--o{ conversations : "has many"
    organizations ||--o{ integrations : "has many"

    %% User relationships
    users ||--o{ conversations : "has many"
    users ||--o{ user_template_assignments : "assigned to"
    users ||--o{ user_roadmap_tasks : "has many"
    users ||--o{ expert_profiles : "may have"
    users ||--o{ nudges : "receives"
    users ||--o{ analytics_events : "generates"

    %% Template system
    roadmap_templates ||--o{ roadmap_template_tasks : "contains"
    roadmap_templates ||--o{ user_template_assignments : "assigned via"
    roadmap_template_tasks ||--o{ roadmap_template_sources : "links to"
    source_materials ||--o{ roadmap_template_sources : "linked from"

    %% User roadmap (copied from templates)
    user_template_assignments ||--o{ user_roadmap_tasks : "generates"

    %% Conversations
    conversations ||--o{ messages : "contains"
    conversations ||--o{ nudges : "may spawn"

    %% Expert system
    expert_profiles ||--o{ expert_topics : "has expertise in"
    expert_profiles ||--o{ expert_interactions : "participates in"
    expert_profiles ||--o{ nudges : "recommended as"

    %% Nudges
    nudges ||--o{ nudge_resources : "has attachments"

    %% Integrations
    integrations ||--o{ sync_logs : "has sync history"

    organizations {
        uuid id PK
        string name
        string domain
        jsonb settings
        timestamp createdAt
    }

    users {
        uuid id PK
        uuid organizationId FK
        string email
        string firstName
        string lastName
        string role
        string department
        string jobTitle
        date startDate
        string status
    }

    roadmap_templates {
        uuid id PK
        uuid organizationId FK
        string name
        string description
        string icon
        string color
        string_array roleTags
        int estimatedWeeks
    }

    roadmap_template_tasks {
        uuid id PK
        uuid templateId FK
        string title
        string description
        int weekNumber
        int dayOfWeek
        int timeEstimate
        string priority
        string category
    }

    user_roadmap_tasks {
        uuid id PK
        uuid userId FK
        string title
        string description
        int weekNumber
        string status
        timestamp completedAt
        boolean custom
        text notes
    }

    conversations {
        uuid id PK
        uuid userId FK
        uuid organizationId FK
        string title
        string contextType
        timestamp createdAt
    }

    messages {
        uuid id PK
        uuid conversationId FK
        string role
        text content
        jsonb cardData
        jsonb sources
        timestamp createdAt
    }

    nudges {
        uuid id PK
        uuid employeeId FK
        uuid expertId FK
        uuid conversationId FK
        text question
        text context
        int expertMatchScore
        string status
        string deliveryChannel
        int responseTime
        int resolutionTime
    }

    expert_profiles {
        uuid id PK
        uuid userId FK
        text bio
        int responseRate
        int helpfulnessScore
        int totalInteractions
    }
```

---

## 5. Nudge Creation Flow

Shows the complete flow when an employee creates a nudge requesting expert help.

```mermaid
sequenceDiagram
    actor Employee
    participant UI as Console Window<br/>(CreateNudge)
    participant API as Backend API<br/>/nudges/create
    participant ExpertSvc as expertMatching.service
    participant DB as PostgreSQL

    Employee->>UI: Fill out nudge form<br/>(question, context, resources)
    Employee->>UI: Click "Request Help"

    UI->>API: POST /nudges/create<br/>{question, context, resources[]}

    API->>DB: Fetch expert profiles<br/>with topics and interactions
    DB-->>API: Expert data

    API->>ExpertSvc: scoreExperts(question, context, experts)

    Note over ExpertSvc: Scoring Algorithm:<br/>Expertise (40%)<br/>Performance (30%)<br/>Availability (30%)

    ExpertSvc->>ExpertSvc: Embed question text<br/>(OpenAI embeddings)

    loop For each expert
        ExpertSvc->>ExpertSvc: Calculate expertise similarity<br/>(cosine of embeddings)
        ExpertSvc->>ExpertSvc: Calculate performance score<br/>(responseRate + helpfulness)
        ExpertSvc->>ExpertSvc: Calculate availability score<br/>(status + calendar)
        ExpertSvc->>ExpertSvc: Weighted total = 0.4E + 0.3P + 0.3A
    end

    ExpertSvc-->>API: Ranked expert list with scores

    API->>DB: INSERT nudge with top expert<br/>(expertMatchScore)
    DB-->>API: Nudge ID

    loop For each resource
        API->>DB: INSERT nudge_resource
        DB-->>API: Resource ID
    end

    API->>DB: INSERT analytics_event<br/>(nudge_created)

    API-->>UI: Nudge created with expert info
    UI->>Employee: "Request sent to [Expert Name]"

    Note over UI,Employee: ⚠️ Slack delivery NOT implemented<br/>Nudge only visible in app
```

---

## 6. Template Assignment Flow

Shows how an admin assigns an onboarding template to a new employee.

```mermaid
sequenceDiagram
    actor Admin
    participant UI as Console Window<br/>(AddNewUser)
    participant API as Backend API<br/>/admin/users
    participant Supabase as Supabase Auth
    participant DB as PostgreSQL

    Admin->>UI: Fill out new user form<br/>(email, name, role, templates)
    Admin->>UI: Click "Create Employee"

    UI->>API: POST /admin/users<br/>{email, firstName, lastName,<br/>role, department, templateIds[]}

    API->>Supabase: Create Auth user<br/>(email, auto-generated password)
    Supabase-->>API: User ID + temporary password

    API->>DB: INSERT INTO users<br/>(all employee details)
    DB-->>API: User record created

    loop For each assigned template
        API->>DB: INSERT user_template_assignments<br/>{userId, templateId, status: assigned}
        DB-->>API: Assignment ID

        API->>DB: SELECT roadmap_template_tasks<br/>WHERE templateId = ?
        DB-->>API: Task list

        loop For each task in template
            API->>DB: INSERT user_roadmap_tasks<br/>(copy all fields, set userId,<br/>status: pending, custom: false)
            DB-->>API: Task copied
        end
    end

    API->>DB: INSERT analytics_event<br/>(user_created)

    API-->>UI: Success with user info
    UI->>Admin: "Employee created!<br/>Assigned [N] templates"

    Note over API,DB: Employee can now log in<br/>and see personalized roadmap

    rect rgb(200, 255, 200)
        Note over UI,DB: ✓ Fully Operational<br/>Copy-on-Assignment pattern working
    end
```

---

## 7. Integration Architecture

Shows how the system integrates with external services (Slack, Notion, etc.)

```mermaid
graph TB
    subgraph "Console Window - IntegrationsView"
        SlackConnect["Slack Connect Dialog"]
        NotionConnect["Notion Connect Dialog"]
        IntegrationCards["Integration Cards<br/>(Status Display)"]
    end

    subgraph "Backend - Integration API"
        OAuthRoutes["OAuth Routes<br/>/integrations/*/oauth/*"]
        SyncRoutes["Sync Routes<br/>/admin/integrations/*/sync"]
    end

    subgraph "Backend - Services"
        SlackSvc["slack.service.ts<br/>✓ OAuth<br/>✓ Fetch channels/messages<br/>✗ Auto-sync<br/>✗ Send nudges"]
        NotionSvc["notion.service.ts<br/>✓ OAuth<br/>✓ Fetch page blocks<br/>✓ AI task extraction<br/>✗ Auto-sync"]
    end

    subgraph "Database"
        IntegrationTable["integrations table<br/>(type, status, tokens,<br/>metadata)"]
        SyncLogs["sync_logs table<br/>(status, records,<br/>errors)"]
    end

    subgraph "External APIs"
        SlackAPI["Slack API<br/>- Web API<br/>- OAuth 2.0<br/>- Bot API"]
        NotionAPI["Notion API<br/>- REST API<br/>- OAuth 2.0<br/>- Blocks API"]
        GeminiAPI["Google Gemini<br/>- Multimodal AI<br/>- Task extraction"]
    end

    subgraph "Missing Components ⚠️"
        Workers["Background Sync Workers<br/>✗ Cron jobs<br/>✗ Queue system<br/>✗ Auto-sync"]
        SlackDelivery["Slack Nudge Delivery<br/>✗ Send to channels<br/>✗ Send to DMs<br/>✗ Interactive messages"]
        Encryption["Token Encryption<br/>✗ AES-256<br/>✗ Auto-refresh"]
    end

    %% Connections
    SlackConnect -->|Initiate OAuth| OAuthRoutes
    NotionConnect -->|Initiate OAuth| OAuthRoutes
    OAuthRoutes --> SlackSvc
    OAuthRoutes --> NotionSvc

    SlackSvc <-->|API Calls| SlackAPI
    NotionSvc <-->|API Calls| NotionAPI
    NotionSvc -->|Extract tasks| GeminiAPI

    SlackSvc --> IntegrationTable
    NotionSvc --> IntegrationTable
    SyncRoutes --> SlackSvc
    SyncRoutes --> NotionSvc
    SyncRoutes --> SyncLogs

    IntegrationCards -->|Display status| IntegrationTable

    %% Missing connections (dashed)
    Workers -.->|Should trigger| SyncRoutes
    SlackDelivery -.->|Should use| SlackSvc
    Encryption -.->|Should protect| IntegrationTable

    %% Styling
    classDef implemented fill:#4ade80,stroke:#16a34a,stroke-width:2px,color:#000
    classDef partial fill:#fbbf24,stroke:#d97706,stroke-width:2px,color:#000
    classDef missing fill:#f87171,stroke:#dc2626,stroke-width:2px,color:#000

    class SlackConnect,NotionConnect,OAuthRoutes,IntegrationTable,SyncLogs implemented
    class SlackSvc,NotionSvc,SyncRoutes partial
    class Workers,SlackDelivery,Encryption missing
```

---

## Integration Status Summary

| Integration      | OAuth | Fetch Data          | Auto-Sync | Send Data | Status |
| ---------------- | ----- | ------------------- | --------- | --------- | ------ |
| **Slack**        | ✓     | ✓ Channels/Messages | ✗         | ✗ Nudges  | 60%    |
| **Notion**       | ✓     | ✓ Pages/Blocks      | ✗         | N/A       | 95%    |
| **GitHub**       | ~     | ✗                   | ✗         | ✗         | 10%    |
| **Google Drive** | ~     | ✗                   | ✗         | ✗         | 10%    |

---

## System Health Dashboard

```mermaid
graph LR
    subgraph "✅ Fully Operational (100%)"
        A1["Electron Windows (5)"]
        A2["IPC Channels (28)"]
        A3["Database Schema (18 tables)"]
        A4["Auth System"]
        A5["Conversation System"]
        A6["Template System"]
        A7["Expert Matching"]
    end

    subgraph "🟡 Partially Working (50-90%)"
        B1["Backend API (95%)"]
        B2["Frontend Components (90%)"]
        B3["Nudge System (85%)"]
        B4["Notion Integration (95%)"]
        B5["AI Services (75%)"]
        B6["Slack Integration (60%)"]
        B7["Vector Search (50%)"]
    end

    subgraph "🔴 Not Implemented (0-15%)"
        C1["Visual Guidance (15%)"]
        C2["Screenshot Capture (0%)"]
        C3["UI Detection (10%)"]
        C4["Sync Workers (0%)"]
        C5["Token Encryption (0%)"]
    end

    classDef green fill:#4ade80,stroke:#16a34a,stroke-width:3px,color:#000
    classDef yellow fill:#fbbf24,stroke:#d97706,stroke-width:3px,color:#000
    classDef red fill:#f87171,stroke:#dc2626,stroke-width:3px,color:#000

    class A1,A2,A3,A4,A5,A6,A7 green
    class B1,B2,B3,B4,B5,B6,B7 yellow
    class C1,C2,C3,C4,C5 red
```

---

## Critical Path to MVP

```mermaid
graph TD
    Start["Current State<br/>~65-70% Complete"] --> Phase1

    Phase1["Phase 1: Visual Guidance<br/>(Weeks 1-2)"]
    Phase1 --> P1T1["Implement screenshot capture"]
    Phase1 --> P1T2["Integrate Gemini Vision"]
    Phase1 --> P1T3["Build overlay rendering"]

    P1T1 --> Milestone1
    P1T2 --> Milestone1
    P1T3 --> Milestone1

    Milestone1["✓ Help Flow Works End-to-End"] --> Phase2

    Phase2["Phase 2: Knowledge Base<br/>(Weeks 3-4)"]
    Phase2 --> P2T1["Complete ingestion pipeline"]
    Phase2 --> P2T2["Implement hybrid search"]
    Phase2 --> P2T3["Integrate with AI responses"]

    P2T1 --> Milestone2
    P2T2 --> Milestone2
    P2T3 --> Milestone2

    Milestone2["✓ AI Has Knowledge Base Context"] --> Phase3

    Phase3["Phase 3: Security<br/>(Week 5)"]
    Phase3 --> P3T1["Encrypt OAuth tokens"]
    Phase3 --> P3T2["Auto token refresh"]
    Phase3 --> P3T3["Error handling"]

    P3T1 --> MVP
    P3T2 --> MVP
    P3T3 --> MVP

    MVP["🎉 Production-Ready MVP<br/>~90% Complete"]

    classDef current fill:#3b82f6,stroke:#1d4ed8,stroke-width:3px,color:#fff
    classDef phase fill:#8b5cf6,stroke:#6d28d9,stroke-width:2px,color:#fff
    classDef task fill:#a78bfa,stroke:#7c3aed,stroke-width:1px,color:#000
    classDef milestone fill:#10b981,stroke:#059669,stroke-width:3px,color:#fff
    classDef mvp fill:#f59e0b,stroke:#d97706,stroke-width:4px,color:#000

    class Start current
    class Phase1,Phase2,Phase3 phase
    class P1T1,P1T2,P1T3,P2T1,P2T2,P2T3,P3T1,P3T2,P3T3 task
    class Milestone1,Milestone2 milestone
    class MVP mvp
```

---

## Notes on Rendering

All diagrams in this document use Mermaid syntax and will render automatically on:

- **GitHub** - Native support in markdown files
- **GitLab** - Native support
- **VS Code** - With Mermaid Preview extension
- **Obsidian** - Native support
- **Notion** - Via Mermaid blocks
- **Confluence** - Via Mermaid macro

For local viewing, use any of these tools or visit [Mermaid Live Editor](https://mermaid.live/).

---

**Document Prepared:** 2025-10-20
**Diagrams Generated:** Based on actual codebase exploration
**Format:** Mermaid (CommonMark compatible)
