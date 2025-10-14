# Mitable AI Onboarding Buddy - Complete Product Requirements Document

**Your AI Onboarding Companion: Just-in-time contextual help meets intelligent workflow guidance**

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Product Vision & Strategy](#product-vision--strategy)
- [User Personas & Journey Maps](#user-personas--journey-maps)
- [Core Product Architecture](#core-product-architecture)
- [Feature Specifications](#feature-specifications)
  - [Main Console](#1-main-console)
  - [Just-in-Time Help System](#2-just-in-time-help-system)
  - [Nudge System](#3-nudge-system)
  - [Roadmap & Onboarding Paths](#4-roadmap--onboarding-paths)
  - [Conversation Management](#5-conversation-management)
- [Technical Architecture](#technical-architecture)
- [Data Models & API Specifications](#data-models--api-specifications)
- [UI/UX Specifications](#uiux-specifications)
- [Implementation Roadmap](#implementation-roadmap)
- [Success Metrics & KPIs](#success-metrics--kpis)
- [Go-to-Market Strategy](#go-to-market-strategy)

---

## Executive Summary

### The Problem

Organizations invest heavily in onboarding new employees, yet:

- **70% of new hires** feel unprepared during their first week
- **Average time to productivity**: 8-12 weeks for technical roles
- **Knowledge workers spend 20% of their time** searching for information or finding the right person to ask
- **Traditional training**: Generic, front-loaded, and quickly forgotten
- **Documentation**: Static, hard to search, often outdated, lacks context

### The Solution: Mitable AI Onboarding Buddy

Mitable is an intelligent desktop AI assistant that provides **contextual, just-in-time help** by combining:

1. **Screen Context Awareness** - AI sees what you're looking at via advanced UI object detection
2. **User Intent Understanding** - Combines visual context with natural language questions
3. **Precise Visual Guidance** - Overlays with pixel-accurate arrows pointing to exact UI elements
4. **Intelligent Colleague Discovery** - Finds and nudges the right experts when AI can't help
5. **Structured Onboarding Paths** - AI-curated roadmaps with week-by-week tasks and resources
6. **Conversational Memory** - Persistent chat history that learns from your workflow

### Key Differentiators

| Traditional Solutions       | Mitable AI Onboarding Buddy        |
| --------------------------- | ---------------------------------- |
| Generic documentation       | Contextual to what you're seeing   |
| Manual search               | AI understands intent + context    |
| "Read this guide"           | "Click here, then select this"     |
| Static onboarding checklist | AI-personalized learning paths     |
| Guess who to ask            | Smart colleague matching + nudging |
| One-time training           | Continuous learning companion      |

### Target Market

**Primary**: B2B SaaS companies with 50-5000 employees
**Initial Focus**: Customer service teams, sales teams, technical support
**Design Partner**: Lorikeet (Agentic Customer Service Platform)

### Business Model

- **Free Tier**: Individual users, basic features, 50 help requests/month
- **Team Plan**: $15/user/month - Full features, unlimited requests, team analytics
- **Enterprise**: $25/user/month - SSO, advanced security, custom integrations, dedicated support

### Key Metrics (Target - 6 months post-launch)

- **Time to Productivity**: 40% reduction (from 8 weeks to 4.8 weeks)
- **Support Ticket Reduction**: 65% fewer "how do I" questions
- **User Satisfaction**: 4.5+/5.0 average rating
- **Adoption Rate**: 80%+ of new hires use daily in first 30 days
- **ROI**: $25,000 saved per 10-person onboarding cohort

---

## Product Vision & Strategy

### Vision Statement

**"Make every employee feel like an expert from day one by providing intelligent, contextual guidance exactly when and where they need it."**

### Product Principles

1. **Contextual over Generic** - Help must be specific to what the user is doing right now
2. **Visual over Verbal** - Show, don't just tell. Point to exact UI elements.
3. **Proactive over Reactive** - Anticipate needs based on workflow patterns
4. **Human-AI Collaboration** - AI handles routine, humans handle complexity
5. **Learning over Training** - Continuous micro-learning beats upfront dumps
6. **Non-disruptive over Intrusive** - Help flows with work, never blocks it

### Strategic Positioning

**Market Category**: AI-Powered Digital Adoption Platform (DAP) for Onboarding

**Positioning Statement**:
_For growing companies struggling with lengthy onboarding, Mitable is the AI assistant that cuts time-to-productivity in half by providing contextual, visual guidance exactly when employees need help—combining screen awareness, intelligent colleague matching, and personalized learning paths in one seamless desktop experience._

### Competitive Landscape

| Competitor    | Category        | Limitation                                         | Mitable Advantage                                     |
| ------------- | --------------- | -------------------------------------------------- | ----------------------------------------------------- |
| WalkMe, Pendo | Traditional DAP | Requires manual setup per app, no AI understanding | AI-powered context detection, works across all apps   |
| Guru, Notion  | Knowledge Base  | Static docs, manual search                         | AI retrieves relevant content based on screen context |
| Slack, Teams  | Communication   | Finding right person is manual                     | Smart colleague matching with expertise mapping       |
| Loom, Scribe  | Documentation   | Creating guides is time-consuming                  | Auto-generates guidance from screen analysis          |

---

## User Personas & Journey Maps

### Primary Persona: "New Hire Natalie"

**Demographics**:

- Age: 26
- Role: Customer Success Associate (just hired)
- Experience: 2 years CS experience, first time using Lorikeet platform
- Tech comfort: Medium-high

**Goals**:

- Ramp up quickly to handle customer tickets independently
- Avoid bothering teammates with basic questions
- Build confidence in using company tools
- Make a good first impression

**Pain Points**:

- "I don't know what I don't know"
- "I feel dumb asking the same questions repeatedly"
- "The documentation is overwhelming and hard to search"
- "I spend more time looking for answers than actually working"
- "I'm not sure who to ask for help with different things"

**Current Workflow (Without Mitable)**:

1. Encounters unfamiliar task (e.g., "How do I escalate this ticket?")
2. Searches company wiki → Can't find specific answer
3. Asks in Slack #help channel → Waits 20 minutes for response
4. Gets generic answer → Still doesn't know which exact button to click
5. Tries random approaches → Makes mistake → Needs to fix it
6. Total time wasted: 45-60 minutes

**Ideal Workflow (With Mitable)**:

1. Encounters unfamiliar task
2. Presses Cmd+H → Agent appears showing screen context
3. Types "How do I escalate this ticket?"
4. AI analyzes screen + question → Provides 3-step visual guide with arrows
5. Follows visual indicators → Completes task correctly
6. Total time: 2 minutes ✅

### Secondary Persona: "Manager Mike"

**Demographics**:

- Age: 35
- Role: Customer Success Team Lead
- Experience: 8 years, manages team of 12
- Responsibility: Onboard 3-4 new hires per quarter

**Goals**:

- Reduce time spent answering repetitive questions
- Ensure consistent onboarding quality
- Track new hire progress and identify knowledge gaps
- Scale onboarding without adding headcount

**Pain Points**:

- "I answer the same questions every week"
- "I can't track if new hires are actually learning"
- "Onboarding takes me away from strategic work"
- "Different team members give inconsistent guidance"

### Tertiary Persona: "Subject Matter Expert Emma"

**Demographics**:

- Age: 31
- Role: Senior Solutions Engineer
- Experience: 5 years, deep product expertise
- Responsibility: Complex escalations, training

**Goals**:

- Help new team members without constant interruptions
- Share knowledge efficiently
- Focus on high-value technical work

**Pain Points**:

- "I get pulled into basic questions that interrupt deep work"
- "I've explained the same process 20 times"
- "I want to help but don't have time for constant questions"

### User Journey Map: Natalie's First Week

#### Day 1: Setup & Overwhelm

**Morning**:

- HR paperwork, IT setup, Mitable installation
- Mitable shows personalized Week 1 Roadmap with 12 tasks
- First task: "Complete account setup" → AI guides through profile completion

**Afternoon**:

- Stuck on Slack configuration → Presses Cmd+H
- AI sees Slack settings screen → Provides step-by-step channel setup guide
- Completes task ✅ → Roadmap updates automatically

#### Day 2-3: Learning Core Workflows

- Encounters first customer ticket → Uses Mitable to learn ticket workflow
- AI recognizes Lorikeet interface → Provides contextual guidance on ticket fields
- Asks follow-up questions in conversation → AI remembers context
- Marks "Shadow customer interaction" complete on roadmap

#### Day 4-5: Encountering Complexity

- Encounters complex billing dispute → AI doesn't have full context
- Mitable suggests: "This looks complex. Would you like me to find an expert?"
- Shows 3 colleagues with billing expertise (Emma, ranked #1)
- Sends nudge to Emma → Emma responds with 10-min walkthrough
- Logs interaction for future AI learning

#### Week 2+: Becoming Independent

- Help requests decrease from 15/day to 3/day
- Uses Mitable primarily for edge cases and complex scenarios
- Contributes to knowledge base through successful interactions
- Mentors next new hire using shared roadmap insights

---

## Core Product Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   DESKTOP APPLICATION (Electron)                │
│                                                                  │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────────┐ │
│  │ Main Console  │  │ Agent         │  │ Overlay System       │ │
│  │               │  │ (Cmd+H)       │  │                      │ │
│  │ • Home        │  │               │  │ • Visual Guides      │ │
│  │ • Roadmap     │  │ • Screenshot  │  │ • Precise Arrows     │ │
│  │ • Nudges      │  │ • Question    │  │ • Step Indicators    │ │
│  │ • Chats       │  │ • AI Response │  │ • Element Highlights │ │
│  └───────────────┘  └───────────────┘  └──────────────────────┘ │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ CAPABILITIES                                              │   │
│  │ • Screen capture • Global hotkeys • Window management    │   │
│  │ • Multi-monitor • Privacy controls • Secure IPC          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────┬────────────────────────────────────────┘
                          │ HTTPS/WSS (TLS 1.3)
┌─────────────────────────▼────────────────────────────────────────┐
│                   CLOUD BACKEND (Node.js)                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ AI PROCESSING ENGINE                                        │ │
│  │                                                             │ │
│  │ ┌─────────────────┐  ┌──────────────────┐  ┌─────────────┐│ │
│  │ │ Gemini Vision   │  │ Context AI       │  │ Response    ││ │
│  │ │ • UI Detection  │  │ • Intent Analysis│  │ Generation  ││ │
│  │ │ • Coordinates   │  │ • Workflow Map   │  │ • Visual    ││ │
│  │ │ • OCR + Bounds  │  │ • Semantic Search│  │ • Guidance  ││ │
│  │ └─────────────────┘  └──────────────────┘  └─────────────┘│ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ BUSINESS LOGIC SERVICES                                     │ │
│  │                                                             │ │
│  │ • Nudge Matching Engine    • Roadmap Generator             │ │
│  │ • Conversation Manager     • Analytics Aggregator          │ │
│  │ • Knowledge Synthesizer    • User Preference Learning      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ DATA LAYER (PostgreSQL + pgvector)                         │ │
│  │                                                             │ │
│  │ • Users & Orgs       • Conversations      • Analytics      │ │
│  │ • Roadmaps & Tasks   • Nudges & Experts   • Knowledge Base │ │
│  │ • UI Element Coords  • Source Materials   • Feedback       │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. **Main Console** (Electron Window)

- Persistent desktop window with sidebar navigation
- Four main sections: Home, Roadmap, Nudges, Chats
- Always accessible, minimizes to tray
- Real-time updates via WebSocket

#### 2. **Agent System** (Global Hotkey → Overlay)

- Triggered by Cmd+H (configurable)
- Captures screen context automatically
- Lightweight agent widget for question input
- Transforms into conversation panel or visual overlay

#### 3. **AI Processing Pipeline**

- **Input**: Screenshot + User question + App context
- **Stage 1**: Gemini Vision UI object detection → UI elements with coordinates
- **Stage 2**: Multimodal AI intent analysis → User goal + workflow step
- **Stage 3**: Hybrid knowledge search → Relevant company docs
- **Stage 4**: Response generation → Step-by-step visual guidance
- **Output**: Conversational answer + Visual overlay coordinates + Workflow steps

#### 4. **Nudge Matching Engine**

- Analyzes question semantic content
- Matches to colleague expertise profiles (built from past interactions)
- Considers availability, response rate, team structure
- Generates personalized nudge message
- Tracks nudge lifecycle (sent → responded → resolved)

#### 5. **Roadmap System**

- AI generates personalized onboarding roadmap based on role
- Week-by-week task breakdown with dependencies
- Each task has: description, steps, source materials, estimated time
- Auto-updates based on completion and learning pace
- Integrates with HR systems for role-specific content

---

## Feature Specifications

### 1. Main Console

The Main Console is the central hub of Mitable, providing persistent access to all features.

#### 1.1 Navigation Structure

```
┌─────────────────────────────────────────────────────┐
│  🏠 mitable                                     ⚙️  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ◉ Roadmap        ← Sidebar                        │
│  ○ Nudges                                          │
│  ○ Chats                                           │
│                                                     │
│  ─────────────────                                 │
│                                                     │
│  🔔 Notifications                                  │
│  ⚙️  Settings                                       │
│                                                     │
│  [Main Content Area →]                             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 1.2 Home Dashboard

**Purpose**: Welcome screen with quick actions and activity overview

**Components**:

1. **Welcome Header**
   - Personalized greeting: "Welcome, Steve"
   - Current time-based message (Morning/Afternoon)
   - Quick help trigger: "How can I help you today?" with Cmd+H button

2. **Today's Focus** (Smart Recommendations)

   ```
   ┌─────────────────────────────────────────────┐
   │ 🎯 Today's Focus                            │
   ├─────────────────────────────────────────────┤
   │ • Complete security training (Due today)    │
   │ • Review escalation process guide          │
   │ • Shadow team lead on customer call (2pm)  │
   └─────────────────────────────────────────────┘
   ```

3. **Recent Activity**
   - Last 5 help requests with timestamps
   - Recent roadmap completions
   - Recent nudges sent/received

4. **Quick Stats**
   - Roadmap progress: "18% Complete"
   - Help requests this week: 12
   - Nudges pending: 2

5. **Quick Actions**
   - "Ask for Help" (Cmd+H) - Large primary button
   - "Browse Knowledge" - Secondary button
   - "View Full Roadmap" - Tertiary link

**UI Specifications**:

- Layout: 2-column grid (70% content, 30% sidebar)
- Color scheme: Dark mode default (customizable)
- Typography: Inter font family, 14px base size
- Spacing: 24px between major sections
- Animations: Subtle fade-in on load, micro-interactions on hover

---

#### 1.3 Roadmap Section

**Purpose**: Personalized onboarding journey with week-by-week tasks

**Structure**:

```
┌──────────────────────────────────────────────────────────────┐
│ Onboarding Roadmap                                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Overall Progress: ███████████░░░░░░░░░░ 58% Complete        │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ ✓ Week 1: Welcome & Setup                    100%     │  │
│ │   7/7 tasks complete                                   │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ ⊙ Week 2: Learning Core Workflows            75%      │  │
│ │   6/8 tasks complete • 2 days remaining                │  │
│ │                                                        │  │
│ │   ☑ Set up development environment      1h 15m       │  │
│ │   ☑ Get access to GitHub, AWS, tools    2h           │  │
│ │   ☑ Review Lorikeet Architecture        1.5h         │  │
│ │   ☑ Clone repos and run local setup     1h 15m       │  │
│ │   ☑ Complete security training          1h           │  │
│ │   ☐ Shadow customer deployment          1h           │  │
│ │   ☐ Integrate Lorikeet API (test)       1h           │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ ○ Week 3: Active Participation            0%         │  │
│ │   Unlocks in 2 days                                   │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ ○ Week 4: Full Integration                 0%         │  │
│ │   Unlocks in 9 days                                   │  │
│ └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Key Features**:

1. **Task Cards** (Click to expand)
   - Title + Description
   - Estimated time
   - Category tag (Administrative, Technical, Social, etc.)
   - Status: Not started | In progress | Completed | Blocked
   - Due date
   - Source materials (documentation, videos, tutorials)
   - Help button: "Get AI help with this task"

2. **Task Detail Expanded View** (Expands inline below task)

   ```
   ┌────────────────────────────────────────────────────────┐
   │ ☐ Shadow customer deployment call             1h     │
   │                                                        │
   │   📝 Description                                       │
   │   Observe a senior team member handling a customer    │
   │   deployment call to learn best practices.            │
   │                                                        │
   │   📚 Source Materials (3)                              │
   │   • Deployment Process Guide [Google Docs]            │
   │   • Customer Call Best Practices [Loom]               │
   │   • Post-Call Checklist [Notion]                      │
   │                                                        │
   │   🎯 Steps to Complete                                 │
   │   1. Schedule time with team lead                     │
   │   2. Review deployment checklist                      │
   │   3. Join call and take notes                         │
   │   4. Debrief with mentor                              │
   │                                                        │
   │   💬 Need Help?                                        │
   │   [Ask AI Assistant] [Find Expert]                    │
   │                                                        │
   │   [✅ Mark as Complete]                                │
   └────────────────────────────────────────────────────────┘
   ```

3. **Source Material Carousel**
   - Grid or carousel view of attached resources
   - Types: Documentation, Video, Tutorial, Internal, External
   - Click to open in-app browser or external app
   - Visual thumbnails for videos/PDFs
   - Duration indicators for videos

4. **Adaptive Roadmap Intelligence**
   - AI adjusts task order based on dependencies and user progress
   - Suggests accelerating or slowing pace based on completion rate
   - Identifies knowledge gaps from help request patterns
   - Recommends additional resources proactively

**Interactions**:

- Click task → Expand inline to show details (description, source materials, steps)
- Click again or click collapse → Hide details
- Right-click task → Context menu (Mark complete, Get help, Skip, etc.)
- Drag tasks to reorder (within constraints)
- Filter by status, category, due date
- Search tasks by keyword

**Data Model**:

```typescript
interface RoadmapTask {
  id: string;
  roadmapId: string;
  weekNumber: number;
  title: string;
  description: string;
  category: "administrative" | "technical" | "social" | "training" | "learning" | "work";
  status: "not_started" | "in_progress" | "completed" | "blocked";
  priority: "low" | "medium" | "high" | "critical";
  estimatedTime: string; // "1h 15m"
  dueDate?: Date;
  dependencies: string[]; // Task IDs that must be completed first
  steps?: TaskStep[];
  sourceMaterials: SourceMaterial[];
  aiHelpAvailable: boolean;
  createdAt: Date;
  completedAt?: Date;
}

interface TaskStep {
  id: string;
  order: number;
  description: string;
  isCompleted: boolean;
  aiGuidanceAvailable: boolean;
}

interface SourceMaterial {
  id: string;
  title: string;
  description?: string;
  type: "documentation" | "video" | "tutorial" | "article" | "internal" | "external";
  sourceType:
    | "Google Docs"
    | "Notion"
    | "Confluence"
    | "Loom"
    | "YouTube"
    | "Internal"
    | "External"; // Where the doc is from
  url: string;
  thumbnail?: string;
  duration?: string;
  tags: string[];
}
```

---

#### 1.4 Nudges Section

**Purpose**: Track requests for human expert help and discover knowledgeable colleagues

**Main View**:

```
┌──────────────────────────────────────────────────────────────┐
│ Your Nudge History                                     [🔍]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ SC  Sarah Chen                            2h ago       │││
│ │     Senior Billing Specialist                          │││
│ │                                                         │││
│ │     Billing dispute over $450 premium feature change.  │││
│ │                                                         │││
│ │     [✓ Resolved]                                       │││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ MR  Mike Rodriguez                        5h ago       │││
│ │     Customer Success Lead                              │││
│ │                                                         │││
│ │     De-escalation strategy for angry customer          │││
│ │     threatening legal action.                          │││
│ │                                                         │││
│ │     [⏳ In Progress]                                   │││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ LP  Lisa Park                           Yesterday      │││
│ │     Operations Manager                                 │││
│ │                                                         │││
│ │     Late cancellation fee waiver approval process.     │││
│ │                                                         │││
│ │     [✓ Resolved]                                       │││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ JW  James Wilson                       2 days ago      │││
│ │     Technical Support Lead                             │││
│ │                                                         │││
│ │     Account merge system error A402 - known bug?       │││
│ │                                                         │││
│ │     [⚠️ Pending]                                       │││
│ └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**Nudge Detail View** (Click to expand):

```
┌────────────────────────────────────────────────────────┐
│ Nudge Details                                     [×]  │
├────────────────────────────────────────────────────────┤
│                                                        │
│ SC  Sarah Chen                                         │
│     Senior Billing Specialist • 5 years experience    │
│     Expertise: Billing, Pricing, Disputes             │
│                                                        │
│ ─────────────────────────────────────────────────────  │
│                                                        │
│ 📤 Your Request (2h ago)                               │
│ "Billing dispute over $450 premium feature change."   │
│                                                        │
│ 📸 Screenshot Context                                  │
│ [Thumbnail of customer ticket screen]                 │
│                                                        │
│ ─────────────────────────────────────────────────────  │
│                                                        │
│ 💬 Conversation Thread                                 │
│                                                        │
│ Sarah: "Hi! I can help with this. This is a common    │
│ scenario. The customer was upgraded mid-cycle..."      │
│                                                        │
│ You: "Thanks! So I should apply the pro-rata credit?"  │
│                                                        │
│ Sarah: "Exactly. Use the adjustment form in the        │
│ Billing tab. Let me know if you need more help!"      │
│                                                        │
│ You: "Perfect, all set! Thanks Sarah 🙏"              │
│                                                        │
│ ─────────────────────────────────────────────────────  │
│                                                        │
│ Status: ✓ Resolved                                     │
│ Response Time: 8 minutes                               │
│ Resolution Time: 2 hours                               │
│                                                        │
│ [Send Follow-up] [Rate Helpful] [Close]               │
└────────────────────────────────────────────────────────┘
```

**Key Features**:

1. **Nudge Lifecycle States**
   - **Pending**: Sent, awaiting response
   - **In Progress**: Expert has responded, conversation ongoing
   - **Resolved**: Issue solved, conversation complete
   - **No Response**: Expert didn't respond within SLA

2. **Expert Matching Algorithm**
   - Analyzes question semantics
   - Maps to colleague expertise (from past interactions, role, bio)
   - Considers availability (calendar integration optional)
   - Ranks by: expertise match (40%), availability (30%), response rate (30%)
   - Shows top 3 suggestions with confidence scores

3. **Nudge Composition Flow**

   ```
   Step 1: AI suggests "This might need an expert"
   Step 2: Shows recommended experts with match scores
   Step 3: User selects expert or searches directory
   Step 4: AI pre-drafts nudge message with context
   Step 5: User reviews/edits message
   Step 6: Nudge sent (Slack, email, or in-app)
   ```

4. **Nudge Template** (AI-generated)

   ```
   Hi [Expert Name],

   I'm working on [context from screenshot] and could use your expertise.

   Situation: [User question rephrased clearly]

   What I've tried: [AI summarizes any prior help attempts]

   Could you point me in the right direction?

   Thanks!
   [User Name]

   📸 [Screenshot attached]
   ```

5. **Nudge Analytics** (For user)
   - Average response time by expert
   - Your nudge history and patterns
   - Most helpful experts (based on your ratings)

6. **Gamification** (Optional enterprise feature)
   - Experts earn "Helper Points" for quick, helpful responses
   - Leaderboard for most helpful colleagues
   - Badges: "Quick Responder", "Expert Explainer", etc.

**Data Model**:

```typescript
interface Nudge {
  id: string;
  senderId: string;
  recipientId: string;
  organizationId: string;
  question: string;
  screenshotUrl?: string;
  contextData: {
    appName?: string;
    windowTitle?: string;
    detectedUIElements?: UIElement[];
  };
  status: "pending" | "in_progress" | "resolved" | "no_response";
  expertMatchScore: number; // 0-100
  conversationThreadId?: string;
  sentAt: Date;
  respondedAt?: Date;
  resolvedAt?: Date;
  responseTime?: number; // minutes
  resolutionTime?: number; // minutes
  userRating?: 1 | 2 | 3 | 4 | 5;
  userFeedback?: string;
}

interface Expert {
  userId: string;
  displayName: string;
  role: string;
  department: string;
  expertiseAreas: string[]; // Tags like "billing", "technical", "escalations"
  averageResponseTime: number; // minutes
  responseRate: number; // 0-100%
  helpfulnessRating: number; // 0-5
  totalNudgesReceived: number;
  totalNudgesResolved: number;
  availability?: "available" | "busy" | "away";
}
```

---

#### 1.5 Chats Section

**Purpose**: Conversation history with the AI agent - a simple log of all your interactions

**Main View**:

```
┌──────────────────────────────────────────────────────────────┐
│ Conversation History                   [🔍 Search] [+ New]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ Billing dispute escalation process         54m ago      │││
│ │ Last message: 54 minutes ago                            │││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ How to handle angry customer call          2h ago      │││
│ │ Last message: 2 hours ago                               │││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ Refund policy exception approval           13h ago     │││
│ │ Last message: 13 hours ago                              │││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ Account merge technical issue              Yesterday    │││
│ │ Last message: 1 day ago                                 │││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ Priority level for VIP customer            3 days ago   │││
│ │ Last message: 3 days ago                                │││
│ └──────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ Unclear escalation path for legal          3 days ago   │││
│ │ Last message: 3 days ago                                │││
│ └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**Chat Detail View** (Click to open full conversation):

```
┌────────────────────────────────────────────────────────┐
│ ← Back    Billing dispute escalation           [···]  │
├────────────────────────────────────────────────────────┤
│                                                        │
│ 📸 Initial Context                                     │
│ [Screenshot thumbnail from when you asked]             │
│ App: Lorikeet Customer Portal                          │
│ Time: 54 minutes ago                                   │
│                                                        │
│ ─────────────────────────────────────────────────────  │
│                                                        │
│ 👤 You                                       54m ago   │
│ How do I escalate this billing dispute over the       │
│ $450 premium feature change?                           │
│                                                        │
│ 🤖 AI Assistant                              54m ago   │
│ To escalate this billing dispute:                      │
│                                                        │
│ 1. Click the "Priority" dropdown (top right)           │
│ 2. Select "High"                                       │
│ 3. Click "Assign" button                               │
│ 4. Choose "Billing Team"                               │
│ 5. Add escalation note explaining the situation        │
│                                                        │
│ 📖 View full escalation guide                          │
│                                                        │
│ [👍 2] [👎] [📋 Copy] [🎯 Show Me How]                │
│                                                        │
│ 👤 You                                       50m ago   │
│ What should I write in the escalation note?            │
│                                                        │
│ 🤖 AI Assistant                              50m ago   │
│ Include these key points:                              │
│ • Customer name and account ID                         │
│ • Amount in dispute ($450)                             │
│ • Reason for dispute (feature change billing)          │
│ • Customer's position/concern                          │
│ • Your initial assessment                              │
│ • Why billing team expertise is needed                 │
│                                                        │
│ Example template:                                      │
│ "Customer [Name] (ID: [XXX]) disputes $450 charge...   │
│                                                        │
│ [👍 1] [👎] [📋 Copy]                                  │
│                                                        │
│ ─────────────────────────────────────────────────────  │
│                                                        │
│ Type a follow-up question...              [Send ➤]   │
└────────────────────────────────────────────────────────┘
```

**Key Features**:

1. **Conversation Threading**
   - Each help request starts a new conversation thread
   - Follow-up questions add to the same thread
   - AI maintains context across messages in the thread
   - Screenshot context attached to conversation

2. **Conversation Metadata**
   - Title (auto-generated from first question or user-edited)
   - Created timestamp
   - Last message timestamp
   - Message count
   - App context (what app you were using)
   - Tags (auto-tagged by AI: billing, technical, escalation, etc.)

3. **Search & Filters**
   - Full-text search across all conversations
   - Filter by: Date range, App context, Tags
   - Sort by: Recent, Oldest, Most relevant

4. **Conversation Actions**
   - **Continue**: Add follow-up question
   - **Share**: Export conversation as PDF or link
   - **Related**: AI suggests related past conversations
   - **Delete**: Permanently remove

5. **AI Memory & Learning**
   - AI references past conversations: "Like we discussed yesterday about billing disputes..."
   - Builds user preference model: "I notice you usually handle escalations this way..."
   - Improves suggestions based on conversation outcomes

**Data Model**:

```typescript
interface Conversation {
  id: string;
  userId: string;
  organizationId: string;
  title: string; // Auto-generated or user-edited
  messages: Message[];
  initialScreenshot?: {
    url: string;
    appContext: string;
    windowTitle: string;
    timestamp: Date;
  };
  tags: string[]; // Auto-tagged by AI
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  userRating?: 1 | 2 | 3 | 4 | 5;
  aiConfidenceScore?: number; // How confident AI was in responses
}

interface Message {
  id: string;
  conversationId: string;
  type: "user" | "ai";
  content: string;
  timestamp: Date;
  metadata?: {
    workflowSteps?: WorkflowStep[];
    sourcesReferenced?: string[];
    relatedConversations?: string[];
    aiModel?: string;
    processingTime?: number;
  };
  userFeedback?: {
    helpful: boolean;
    timestamp: Date;
  };
}
```

---

### 2. Just-in-Time Help System

The core interaction model: contextual help triggered at the moment of need.

#### 2.1 Activation Flow

**Trigger Options**:

1. **Global Hotkey**: Cmd/Ctrl + H (default, customizable)
2. **System Tray**: Click icon → "Ask for Help"
3. **Roadmap Task**: Click "Get AI Help" on any task
4. **Menu Bar**: Help → Ask AI Assistant

**User Flow**:

```
[User encounters problem]
        ↓
[Presses Cmd+H]
        ↓
[Agent appears - Compact floating widget showing:]
  • Screenshot preview (small thumbnail)
  • Question input field
  • Detected context: "Lorikeet Customer Portal"
        ↓
[User types question]
        ↓
[Clicks "Get Help" or presses Enter]
        ↓
[Two simultaneous actions:]
  1. Screenshot sent to AI for analysis
  2. Conversation panel slides in from right
        ↓
[AI processes (2-4 seconds)]
        ↓
[Response streams into conversation panel]
        ↓
[If actionable: "Show Me How" button appears]
        ↓
[Click "Show Me How"]
        ↓
[Visual overlay with arrows/highlights appears]
        ↓
[User follows visual guide]
        ↓
[Completes task → Provides feedback]
```

#### 2.2 Agent Component

**Visual Design** (Compact Floating Widget - appears at bottom center):

```
                     ┌─────────────────────────────────────┐
                     │ 🤖  [Ask me anything...]     [→]   │
                     └─────────────────────────────────────┘
                                  (Always visible)
```

When activated (Cmd+H pressed):

```
┌────────────────────────────────────────────────────┐
│ Detected context: Lorikeet Customer Portal  [×]   │
├────────────────────────────────────────────────────┤
│                                                    │
│ 🤖 Agent                                           │
│                                                    │
│ ┌───────────────────────────────────────────────┐ │
│ │ What do you need help with?                   │ │
│ │                                               │ │
│ │ [Text input - auto-resizing]                 │ │
│ │                                               │ │
│ └───────────────────────────────────────────────┘ │
│                                                    │
│ 💡 Try: "How do I escalate?" or "Show me where"   │
│                                                    │
│ [📸 Screenshot captured] [Find Expert Instead]    │
│                                                    │
│ [Get Help →]                                       │
└────────────────────────────────────────────────────┘

  ↓ Expands into conversation window →

┌────────────────────────────────────────────────────┐
│ ← Back  Billing dispute help                  [×] │
├────────────────────────────────────────────────────┤
│                                                    │
│ 👤 You: How do I escalate this billing dispute?   │
│                                                    │
│ 🤖 Agent: To escalate this:                       │
│    1. Click Priority dropdown (top right)         │
│    2. Select "High"                               │
│    3. Click "Assign" → "Billing Team"             │
│                                                    │
│    [👍] [👎] [Show Me How]                        │
│                                                    │
│ ─────────────────────────────────────────────────  │
│                                                    │
│ Type a follow-up...                      [Send]   │
└────────────────────────────────────────────────────┘
```

**Key Features**:

- **Auto-capture**: Screenshot taken when Cmd+H pressed
- **Context detection**: AI detects app name, window title
- **Smart positioning**: Appears center-screen, non-blocking
- **Privacy preview**: Shows what will be analyzed
- **Quick actions**: Pre-filled question suggestions based on context
- **Escape route**: Option to find human expert instead

**Privacy Controls**:

- Visual indicator showing what's captured
- Option to exclude specific windows/apps (blacklist)
- "Blur sensitive info" toggle (experimental)
- Screenshot deleted after response (30 sec retention)

#### 2.3 AI Response Generation

**Processing Pipeline**:

1. **UI Object Detection** (Gemini Vision)
   - Input: Screenshot (PNG, base64)
   - Output: UI elements with bounding boxes
   - Processing time: ~1-2 seconds

   ```json
   {
     "elements": [
       {
         "id": "elem-1",
         "type": "button",
         "text": "Assign",
         "boundingBox": { "x": 847, "y": 123, "width": 85, "height": 32 },
         "confidence": 0.97
       },
       {
         "id": "elem-2",
         "type": "dropdown",
         "text": "Priority",
         "boundingBox": { "x": 752, "y": 88, "width": 120, "height": 36 },
         "confidence": 0.95
       }
     ]
   }
   ```

2. **Intent Analysis** (Gemini Multimodal)
   - Input: Screenshot + User question + Detected UI elements
   - Analysis: What is the user trying to accomplish?
   - Output: User intent + Required workflow steps
   - Processing time: ~1-2 seconds

   ```json
   {
     "intent": "escalate_ticket",
     "workflow": "ticket_escalation_to_billing",
     "requiredActions": ["change_priority", "assign_to_team", "add_escalation_note"],
     "confidence": 0.89
   }
   ```

3. **Knowledge Retrieval** (Hybrid Search)
   - Input: Intent + Question semantics
   - Search: Semantic (pgvector) + Keyword (PostgreSQL FTS)
   - Output: Top 3-5 relevant knowledge chunks
   - Processing time: ~500ms

   ```json
   {
     "results": [
       {
         "title": "Escalation Process Guide",
         "chunk": "To escalate a billing dispute: 1. Set priority to High...",
         "relevanceScore": 0.92,
         "source": "docs/escalation-guide.pdf"
       }
     ]
   }
   ```

4. **Response Generation** (Gemini)
   - Input: User question + UI elements + Intent + Knowledge chunks
   - Generation: Step-by-step guidance with UI element references
   - Output: Conversational answer + Workflow steps with coordinates
   - Processing time: ~1-2 seconds
   ```json
   {
     "answer": "To escalate this billing dispute:\n\n1. Click the \"Priority\" dropdown in the top right\n2. Select \"High\"\n3. Click \"Assign\" button\n4. Choose \"Billing Team\"\n\nWould you like me to show you where each button is?",
     "workflowSteps": [
       {
         "id": "step-1",
         "description": "Click the Priority dropdown",
         "action": "click",
         "targetElementId": "elem-2",
         "coordinates": { "x": 812, "y": 106 }
       },
       {
         "id": "step-2",
         "description": "Select 'High' from dropdown",
         "action": "select",
         "targetValue": "High"
       }
     ],
     "confidence": 0.87,
     "sources": ["escalation-guide.pdf", "billing-team-sla.md"]
   }
   ```

**Total Processing Time**: ~3-5 seconds

#### 2.4 Visual Guidance Overlays

When user clicks "Show Me How", visual overlays appear on top of their application.

**Overlay Types**:

1. **Arrow Pointers**
   - Curved arrows pointing from indicator to UI element
   - Color-coded by step (Step 1: Blue, Step 2: Green, etc.)
   - Animated "pulse" effect to draw attention
   - Precise positioning using detected coordinates

2. **Element Highlights**
   - Colored outline around target UI element
   - Subtle glow effect
   - Semi-transparent fill
   - Matches arrow color

3. **Step Instructions**
   - Floating tooltip next to arrow
   - Shows step number and action
   - "Click here" or "Select this option"
   - Auto-positions to avoid covering important UI

4. **Workflow Progress Indicator**
   - Top-right corner shows "Step 2 of 5"
   - Mini-checklist of all steps
   - Current step highlighted

**Visual Design Example**:

```
[Your application screen]
                                          ┌──────────────────┐
                                          │ Step 2 of 4      │
                     ╭─────────────>      │ ☑ Set priority   │
                    ╱                     │ ⊙ Assign team    │
                   ╱                      │ ○ Add note       │
    ┌─────────────┐                       │ ○ Submit         │
    │ 2. Click the │                      └──────────────────┘
    │ "Assign"     │
    │ button       │
    └─────────────┘
                                 [Assign] ← Highlighted button
```

**Overlay Controls**:

- **Next Step** button: Advance to next instruction
- **Previous Step**: Go back
- **Pause**: Freeze guidance to examine screen
- **Close**: Exit visual guidance
- **Minimize**: Hide temporarily (press Cmd+H to show again)

**Smart Positioning Algorithm**:

- Avoids covering the target UI element
- Prefers placing instructions above/right of target
- If space constrained, automatically repositions
- Multi-monitor aware: places on correct screen
- DPI scaling handled automatically

**Data Model**:

```typescript
interface VisualGuide {
  id: string;
  conversationId: string;
  steps: GuidanceStep[];
  currentStepIndex: number;
  isActive: boolean;
  screenContext: {
    appName: string;
    windowTitle: string;
    screenWidth: number;
    screenHeight: number;
    dpiScale: number;
  };
}

interface GuidanceStep {
  id: string;
  order: number;
  description: string;
  action: "click" | "type" | "select" | "navigate" | "read";
  targetElement?: {
    elementId: string;
    boundingBox: BoundingBox;
    text: string;
    type: string;
  };
  arrowConfig: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    color: string;
    curvature: number;
  };
  highlightConfig?: {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
  };
  instructionPosition: {
    x: number;
    y: number;
    alignment: "left" | "right" | "top" | "bottom";
  };
}
```

---

### 3. Nudge System

**Full specification detailed in section 1.4 Nudges Section above.**

Additional technical details:

#### 3.1 Expert Discovery & Matching

**Expertise Profile Building**:

- **Manual**: Users can add expertise tags to their profile
- **Automatic**: AI learns from:
  - Nudge interactions they've successfully resolved
  - Slack channel participation patterns
  - Role and department
  - Documents they've authored/edited
  - Calendar events and meeting titles

**Matching Algorithm**:

```python
def calculate_expert_match_score(question, expert):
    # Semantic similarity between question and expertise areas
    expertise_score = cosine_similarity(
        embed(question),
        embed(expert.expertise_areas)
    ) * 0.4

    # Historical performance
    performance_score = (
        expert.response_rate * 0.15 +
        expert.helpfulness_rating / 5.0 * 0.15
    )

    # Availability
    availability_score = get_availability_score(expert) * 0.3

    # Total score (0-100)
    total_score = (expertise_score + performance_score + availability_score) * 100

    return min(total_score, 100)
```

**Expert Ranking Display**:

```
┌────────────────────────────────────────────────────┐
│ Recommended Experts                                │
├────────────────────────────────────────────────────┤
│                                                    │
│ 1. SC Sarah Chen                    Match: 94%    │
│    Senior Billing Specialist                      │
│    📊 95% response rate • ⭐ 4.8/5 rating          │
│    ✓ Available now                                │
│    [Send Nudge]                                   │
│                                                    │
│ 2. DM David Martinez                Match: 87%    │
│    Compliance Manager                             │
│    📊 88% response rate • ⭐ 4.6/5 rating          │
│    ⏰ Usually responds in ~15 min                 │
│    [Send Nudge]                                   │
│                                                    │
│ 3. TH Tatsunosuke Hanano            Match: 76%    │
│    Product Specialist                             │
│    📊 72% response rate • ⭐ 4.4/5 rating          │
│    🟡 Busy (meeting until 2pm)                    │
│    [Send Nudge]                                   │
│                                                    │
│ [Browse All Experts]                              │
└────────────────────────────────────────────────────┘
```

#### 3.2 Nudge Delivery Channels

**Multi-channel notification**:

1. **In-app** (Mitable desktop notification)
2. **Slack** (Direct message with context)
3. **Email** (Fallback if Slack unavailable)
4. **Mobile push** (Future: Mitable mobile app)

**Slack Integration Example**:

```
MitableBot  9:24 AM
@sarah.chen you have a new nudge from Steve Johnson

📸 Screenshot attached
🎯 Topic: Billing dispute escalation

Steve asked:
"Billing dispute over $450 premium feature change - how should I handle this?"

[View Full Context] [Respond]
```

---

### 4. Roadmap & Onboarding Paths

**Full specification in section 1.3 Roadmap Section above.**

#### 4.1 AI-Generated Roadmap Creation

**Input Parameters**:

- User role (from HR system or manual input)
- Department
- Prior experience level (Junior, Mid, Senior)
- Learning pace preference (Fast-track, Standard, Gradual)
- Team-specific workflows

**Generation Process**:

```python
def generate_onboarding_roadmap(user_profile, organization_id):
    # 1. Retrieve role-specific template
    base_template = get_role_template(user_profile.role)

    # 2. Query knowledge base for role-relevant content
    relevant_docs = hybrid_search(
        query=f"onboarding guide for {user_profile.role}",
        organization_id=organization_id,
        limit=50
    )

    # 3. AI generates week-by-week breakdown
    roadmap = ai_model.generate_roadmap(
        role=user_profile.role,
        experience=user_profile.experience_level,
        knowledge_base=relevant_docs,
        template=base_template,
        pace=user_profile.learning_pace
    )

    # 4. Add dependencies and ordering
    roadmap = add_task_dependencies(roadmap)

    # 5. Attach source materials to each task
    roadmap = enrich_with_sources(roadmap, relevant_docs)

    return roadmap
```

**Adaptive Roadmap Adjustment** (Optional Feature - can be enabled per organization):

- If user completes tasks faster than estimated → Accelerate pace
- If user struggles (many help requests) → Add prerequisite tasks
- If user skips certain categories → Prompt to confirm or auto-adjust

_Note: This feature can be toggled on/off in organization settings. Some teams prefer fixed onboarding paths._

**Example Roadmap Structure for "Customer Success Associate"**:

```yaml
Week 1: Welcome & Setup
  Day 1:
    - Complete HR onboarding (1h)
    - IT equipment setup (1h)
    - Install Mitable & configure (15m)
    - Meet immediate team (30m)
  Day 2-3:
    - Security & compliance training (2h)
    - Lorikeet platform overview (3h)
    - Shadow senior CS rep (4h)
  Day 4-5:
    - Review customer success playbook (2h)
    - Practice ticket handling (sandbox) (3h)
    - End-of-week sync with manager (30m)

Week 2: Core Workflows
  - Learn ticket categorization (2h)
  - Master escalation processes (2h)
  - Billing dispute handling (1.5h)
  - Customer communication best practices (2h)
  - First live ticket (supervised) (1h)

Week 3: Building Independence
  - Handle 5 tickets independently
  - Complete customer call shadowing
  - Learn reporting and analytics
  - Mid-onboarding review

Week 4: Full Ownership
  - Full ticket ownership
  - 30-day review with manager
  - Set quarterly goals
  - Mentor next new hire (optional)
```

---

### 5. Conversation Management

**Full specification in section 1.5 Chats Section above.**

#### 5.1 Conversation Context Persistence

**Context Window**:

- AI maintains full conversation history (up to 10,000 tokens)
- References past messages: "As I mentioned earlier about escalations..."
- Cross-conversation learning: "This is similar to the issue you had yesterday with billing."

**Context Metadata Tracking**:

```typescript
interface ConversationContext {
  conversationId: string;
  user: {
    id: string;
    role: string;
    experienceLevel: "junior" | "mid" | "senior";
    onboardingWeek: number;
  };
  appContext: {
    currentApp: string;
    windowTitle: string;
    detectedWorkflow?: string;
  };
  temporalContext: {
    timeOfDay: string;
    dayOfWeek: string;
    userWorkingHours: { start: string; end: string };
  };
  priorInteractions: {
    relatedConversations: string[];
    commonTopics: string[];
    learningPatterns: string[];
  };
}
```

**AI Response Personalization**:

- Adjusts explanation depth based on user experience level
- References user's past successful approaches
- Adapts tone based on user preferences (concise vs. detailed)

---

## Technical Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DESKTOP APPLICATION (Electron)                  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ MAIN PROCESS (Node.js + Electron APIs)                       │  │
│  │                                                               │  │
│  │  • Window Manager        • Screen Capture                    │  │
│  │  • Global Hotkey Handler • Privacy Controller                │  │
│  │  • IPC Coordinator       • Security Layer                    │  │
│  │  • Local Storage         • Background Services               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ RENDERER PROCESSES (Chromium + React)                        │  │
│  │                                                               │  │
│  │  Main Console Window          Agent Overlay                   │  │
│  │  • Home Dashboard             • Screenshot Preview           │  │
│  │  • Roadmap Section            • Question Input               │  │
│  │  • Nudges Section             • Quick Actions                │  │
│  │  • Chats Section                                             │  │
│  │  • Settings Panel             Conversation Panel             │  │
│  │                               • Message Thread               │  │
│  │  Visual Overlay Windows       • Streaming Response           │  │
│  │  • Arrow Indicators           • Follow-up Input              │  │
│  │  • Element Highlights                                        │  │
│  │  • Step Instructions          Settings Window                │  │
│  │  • Progress Tracker           • Hotkey Config                │  │
│  │                               • Privacy Settings             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ PRELOAD SCRIPTS (Context Bridge)                             │  │
│  │ • Secure IPC API exposure                                    │  │
│  │ • Input validation & sanitization                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ HTTPS REST API + WebSocket (TLS 1.3)
┌──────────────────────────▼───────────────────────────────────────────┐
│                    CLOUD BACKEND (Node.js + Express)                 │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ API GATEWAY LAYER                                            │  │
│  │ • Authentication (JWT)      • Rate Limiting                  │  │
│  │ • Request Validation        • Error Handling                 │  │
│  │ • Logging & Monitoring      • CORS Configuration             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ AI PROCESSING ENGINE                                         │  │
│  │                                                               │  │
│  │  Gemini Vision Service        Context Analysis Service       │  │
│  │  • UI object detection        • Intent classification        │  │
│  │  • Bounding box extraction    • Workflow mapping             │  │
│  │  • OCR with coordinates       • Semantic understanding       │  │
│  │                                                               │  │
│  │  Knowledge Retrieval Service  Response Generation Service    │  │
│  │  • Hybrid search (vector+FTS) • Prompt engineering           │  │
│  │  • Context ranking            • Streaming responses          │  │
│  │  • Source attribution         • Confidence scoring           │  │
│  │                                                               │  │
│  │  Embedding Service            Quality Assurance Service      │  │
│  │  • Text embeddings (OpenAI)   • Hallucination detection      │  │
│  │  • Caching layer              • Response validation          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ BUSINESS LOGIC SERVICES                                      │  │
│  │                                                               │  │
│  │  Conversation Service         Nudge Service                  │  │
│  │  • Thread management          • Expert matching              │  │
│  │  • Message persistence        • Notification delivery        │  │
│  │  • Context aggregation        • Response tracking            │  │
│  │                                                               │  │
│  │  Roadmap Service              Analytics Service              │  │
│  │  • Generation & personalization • Event tracking             │  │
│  │  • Progress tracking          • Usage metrics                │  │
│  │  • Adaptive adjustment        • Feedback aggregation         │  │
│  │                                                               │  │
│  │  User Service                 Organization Service           │  │
│  │  • Profile management         • Team structure               │  │
│  │  • Preference learning        • Knowledge base config        │  │
│  │  • Expertise tracking         • Admin controls               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ DATA ACCESS LAYER                                            │  │
│  │ • Repository pattern     • Query optimization                │  │
│  │ • Connection pooling     • Transaction management            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────────┐
│              DATABASE (PostgreSQL 15 + pgvector)                     │
│                                                                      │
│  Organizations    Users         Roadmaps       Conversations         │
│  RoadmapTasks     Messages      Nudges         Experts               │
│  Documents        DocumentChunks (embeddings)  UIElements            │
│  SourceMaterials  HelpInteractions             Analytics             │
│  FeedbackEvents   UserPreferences              AuditLogs             │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES (APIs)                          │
│                                                                      │
│  • Google Gemini 2.5 Flash (Vision + Multimodal)                    │
│  • OpenAI (Embeddings: text-embedding-3-large)                       │
│  • Slack API (Nudge notifications)                                   │
│  • Email Service (SendGrid/AWS SES)                                  │
│  • Analytics (PostHog/Mixpanel)                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Data Models & API Specifications

### Core Database Schema

```sql
-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(100) UNIQUE,
  settings JSONB DEFAULT '{}',
  subscription_tier VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  display_name VARCHAR(255),
  role VARCHAR(100),
  department VARCHAR(100),
  experience_level VARCHAR(50),
  onboarding_start_date DATE,
  expertise_areas TEXT[],
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Expert Profiles (derived from user interactions)
CREATE TABLE expert_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  expertise_tags TEXT[],
  average_response_time INTEGER, -- minutes
  response_rate DECIMAL(3,2), -- 0.00-1.00
  helpfulness_rating DECIMAL(2,1), -- 0.0-5.0
  total_nudges_received INTEGER DEFAULT 0,
  total_nudges_resolved INTEGER DEFAULT 0,
  availability_status VARCHAR(20) DEFAULT 'available',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Roadmaps
CREATE TABLE roadmaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(255),
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  total_weeks INTEGER,
  current_week INTEGER DEFAULT 1,
  progress_percentage INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Roadmap Tasks
CREATE TABLE roadmap_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id UUID REFERENCES roadmaps(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  status VARCHAR(50) DEFAULT 'not_started',
  priority VARCHAR(50) DEFAULT 'medium',
  estimated_time VARCHAR(50),
  due_date TIMESTAMP,
  completed_at TIMESTAMP,
  task_order INTEGER,
  dependencies UUID[], -- Array of task IDs
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Source Materials
CREATE TABLE source_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50), -- 'documentation', 'video', 'tutorial', etc.
  url TEXT,
  thumbnail_url TEXT,
  duration VARCHAR(50),
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- Task-Source Material Junction
CREATE TABLE task_sources (
  task_id UUID REFERENCES roadmap_tasks(id) ON DELETE CASCADE,
  source_id UUID REFERENCES source_materials(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, source_id)
);

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  initial_screenshot_url TEXT,
  app_context VARCHAR(255),
  window_title VARCHAR(255),
  tags TEXT[],
  ai_confidence_score DECIMAL(3,2),
  user_rating INTEGER,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_message_at TIMESTAMP DEFAULT NOW()
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL, -- 'user' or 'ai'
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  user_feedback VARCHAR(20), -- 'helpful', 'not_helpful'
  feedback_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Nudges
CREATE TABLE nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  screenshot_url TEXT,
  context_data JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'pending',
  expert_match_score INTEGER,
  conversation_thread_id UUID REFERENCES conversations(id),
  sent_at TIMESTAMP DEFAULT NOW(),
  responded_at TIMESTAMP,
  resolved_at TIMESTAMP,
  response_time INTEGER, -- minutes
  resolution_time INTEGER, -- minutes
  user_rating INTEGER,
  user_feedback TEXT
);

-- Documents (Knowledge Base)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content_type VARCHAR(100),
  file_url TEXT,
  processed_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  search_vector tsvector,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Document Chunks (for semantic search)
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  chunk_order INTEGER,
  embedding VECTOR(1536), -- OpenAI embedding dimension
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- UI Elements (detected from screenshots)
CREATE TABLE ui_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  element_text VARCHAR(255),
  element_type VARCHAR(100),
  bounding_box JSONB, -- {x, y, width, height}
  screenshot_context TEXT,
  workflow_stage VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Analytics Events
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_roadmap_tasks_roadmap ON roadmap_tasks(roadmap_id);
CREATE INDEX idx_roadmap_tasks_status ON roadmap_tasks(status);
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_nudges_recipient ON nudges(recipient_id);
CREATE INDEX idx_nudges_status ON nudges(status);
CREATE INDEX idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_documents_search_vector ON documents USING gin(search_vector);
CREATE INDEX idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_type ON analytics_events(event_type);
```

### REST API Endpoints

#### Authentication

```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
```

#### Help & Conversations

```
POST   /api/v1/help/request
  Body: { screenshot: base64, question: string, context: object }
  Response: { conversationId, answer, workflowSteps, sources }

GET    /api/v1/conversations
  Query: ?status=active&limit=20&offset=0
  Response: { conversations: [...], total, hasMore }

GET    /api/v1/conversations/:id
  Response: { conversation: {...}, messages: [...] }

POST   /api/v1/conversations/:id/messages
  Body: { content: string }
  Response: { message: {...}, aiResponse: {...} }

PATCH  /api/v1/conversations/:id
  Body: { status: 'resolved', rating: 5 }
  Response: { conversation: {...} }

POST   /api/v1/messages/:id/feedback
  Body: { helpful: boolean }
  Response: { success: true }
```

#### Roadmap

```
GET    /api/v1/roadmap
  Response: { roadmap: {...}, tasks: [...], progress: {...} }

GET    /api/v1/roadmap/tasks/:id
  Response: { task: {...}, sources: [...], steps: [...] }

PATCH  /api/v1/roadmap/tasks/:id
  Body: { status: 'completed' }
  Response: { task: {...}, roadmapUpdated: {...} }

POST   /api/v1/roadmap/generate
  Body: { role, experienceLevel, pace }
  Response: { roadmap: {...}, estimatedDuration: '4 weeks' }
```

#### Nudges

```
POST   /api/v1/nudges/match
  Body: { question: string, screenshot?: base64 }
  Response: { experts: [{ user, matchScore, availability }] }

POST   /api/v1/nudges
  Body: { recipientId, question, screenshot?, context }
  Response: { nudge: {...}, notificationSent: true }

GET    /api/v1/nudges
  Query: ?status=pending&limit=20
  Response: { nudges: [...], total }

GET    /api/v1/nudges/:id
  Response: { nudge: {...}, conversation: {...} }

PATCH  /api/v1/nudges/:id
  Body: { status: 'resolved', rating: 5 }
  Response: { nudge: {...} }
```

#### Knowledge Base

```
POST   /api/v1/documents/upload
  Body: FormData with file
  Response: { document: {...}, processingStatus: 'queued' }

GET    /api/v1/documents
  Query: ?search=billing&type=pdf&limit=20
  Response: { documents: [...], total }

GET    /api/v1/documents/:id
  Response: { document: {...}, chunks: [...] }

DELETE /api/v1/documents/:id
  Response: { success: true }
```

#### User & Organization

```
GET    /api/v1/users/me
PATCH  /api/v1/users/me
  Body: { displayName, preferences, expertiseAreas }

GET    /api/v1/users/:id/expert-profile
  Response: { expertProfile: {...}, stats: {...} }

GET    /api/v1/organization/settings
PATCH  /api/v1/organization/settings
```

#### Analytics

```
GET    /api/v1/analytics/usage
  Query: ?startDate=2024-01-01&endDate=2024-01-31
  Response: { metrics: {...}, trends: [...] }

GET    /api/v1/analytics/roadmap-progress
  Response: { overall: 58%, byWeek: [...] }

POST   /api/v1/analytics/event
  Body: { eventType, eventData }
  Response: { recorded: true }
```

---

## UI/UX Specifications

### Design System

#### Color Palette

```css
/* Dark Mode (Default) */
--background-primary: #000000;
--background-secondary: #0a0a0a;
--background-tertiary: #1a1a1a;
--background-elevated: #1f1f1f;

--text-primary: #ffffff;
--text-secondary: #a1a1aa;
--text-tertiary: #71717a;

--border-primary: rgba(255, 255, 255, 0.2);
--border-secondary: rgba(255, 255, 255, 0.1);

--accent-primary: #3b82f6; /* Blue */
--accent-secondary: #10b981; /* Green */
--accent-tertiary: #8b5cf6; /* Purple */

--status-success: #10b981;
--status-warning: #f59e0b;
--status-error: #ef4444;
--status-info: #3b82f6;

/* Light Mode */
--background-primary-light: #ffffff;
--background-secondary-light: #f9fafb;
--background-tertiary-light: #f3f4f6;

--text-primary-light: #111827;
--text-secondary-light: #6b7280;
--text-tertiary-light: #9ca3af;
```

#### Typography

```css
/* Font Family */
--font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-family-mono: "SF Mono", "Monaco", "Inconsolata", monospace;

/* Font Sizes */
--text-xs: 11px;
--text-sm: 13px;
--text-base: 14px;
--text-lg: 16px;
--text-xl: 18px;
--text-2xl: 24px;
--text-3xl: 30px;

/* Font Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

#### Spacing

```css
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
--spacing-2xl: 48px;
```

#### Elevation (Shadows)

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
--shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.15);
```

#### Border Radius

```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 16px;
--radius-xl: 24px;
--radius-full: 9999px;
```

### Component Specifications

#### Button Variants

```tsx
// Primary
<button className="bg-accent-primary hover:bg-blue-600 text-white
  font-semibold px-4 py-2 rounded-lg transition-all">
  Get Help
</button>

// Secondary
<button className="bg-background-elevated hover:bg-background-tertiary
  border border-border-primary text-text-primary font-medium px-4 py-2
  rounded-lg transition-all">
  Cancel
</button>

// Tertiary
<button className="text-accent-primary hover:text-blue-400
  font-medium underline-offset-2 hover:underline">
  Learn more
</button>

// Icon Button
<button className="w-10 h-10 rounded-full bg-background-elevated
  hover:bg-background-tertiary flex items-center justify-center
  transition-all">
  <Icon />
</button>
```

#### Card Component

```tsx
<div
  className="bg-background-secondary border border-border-primary
  rounded-lg p-6 hover:border-accent-primary transition-all"
>
  {/* Card content */}
</div>
```

### Interaction Patterns

#### Animations

```css
/* Fade In */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Slide In */
@keyframes slideInRight {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Pulse */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

/* Usage */
.fade-in {
  animation: fadeIn 0.3s ease-out;
}
.slide-in-right {
  animation: slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
```

#### Loading States

```tsx
// Skeleton Loader
<div className="animate-pulse">
  <div className="h-4 bg-background-tertiary rounded w-3/4 mb-2"></div>
  <div className="h-4 bg-background-tertiary rounded w-1/2"></div>
</div>

// Spinner
<div className="animate-spin rounded-full h-8 w-8 border-2
  border-accent-primary border-t-transparent"></div>

// Streaming Text (typing indicator)
<span className="inline-block w-2 h-4 bg-accent-primary
  animate-pulse ml-1"></span>
```

---

## Implementation Roadmap

### Phase 1: MVP Foundation (Weeks 1-4)

**Goal**: Core help system with basic visual guidance

**Week 1: Desktop App Foundation**

- ✅ Electron project setup
- ✅ Main window with navigation shell
- ✅ Global hotkey registration (Cmd+H)
- ✅ Screen capture implementation
- ✅ Basic agent UI

**Week 2: AI Integration**

- ✅ Gemini Vision API integration
- ✅ UI object detection pipeline
- ✅ Context analysis service
- ✅ Response streaming implementation
- ✅ Basic conversation UI

**Week 3: Visual Overlays**

- ✅ Transparent overlay windows
- ✅ Arrow and highlight components
- ✅ Coordinate mapping system
- ✅ Multi-step workflow UI
- ✅ Overlay positioning algorithms

**Week 4: Conversation & Polish**

- ✅ Conversation persistence
- ✅ Chat history UI
- ✅ Follow-up questions
- ✅ Error handling
- ✅ Performance optimization

**Deliverable**: Working help system with AI-powered visual guidance

---

### Phase 2: Roadmap & Nudges (Weeks 5-8)

**Goal**: Add structured onboarding and human expert discovery

**Week 5: Roadmap Core**

- [ ] Roadmap data models & API
- [ ] AI roadmap generation service
- [ ] Roadmap UI (week view, tasks)
- [ ] Progress tracking
- [ ] Source materials integration

**Week 6: Roadmap Advanced**

- [ ] Task detail drawer
- [ ] Step-by-step task breakdown
- [ ] Adaptive roadmap adjustment
- [ ] Task dependencies logic
- [ ] Integration with help system

**Week 7: Nudge System**

- [ ] Expert matching algorithm
- [ ] Nudge composition flow
- [ ] Nudge delivery (in-app, Slack)
- [ ] Nudge tracking & status
- [ ] Expert profile building

**Week 8: Integration & Testing**

- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] UI polish & animations
- [ ] Beta user testing
- [ ] Bug fixes

**Deliverable**: Complete onboarding platform with AI + human help

---

### Phase 3: Enterprise Features (Weeks 9-12)

**Goal**: Admin dashboard, analytics, integrations

**Week 9: Admin Dashboard**

- [ ] Organization management
- [ ] User directory
- [ ] Knowledge base upload
- [ ] Document processing pipeline
- [ ] Usage analytics dashboard

**Week 10: Analytics & Insights**

- [ ] Event tracking system
- [ ] Metrics calculation
- [ ] Reporting UI
- [ ] Export capabilities
- [ ] Data visualization

**Week 11: Integrations**

- [ ] Slack workspace integration
- [ ] HR system connectors (BambooHR, Workday)
- [ ] SSO (SAML, OAuth)
- [ ] Webhook system
- [ ] API documentation

**Week 12: Security & Compliance**

- [ ] Security audit
- [ ] Penetration testing fixes
- [ ] Compliance documentation
- [ ] Privacy controls enhancement
- [ ] Data encryption at rest

**Deliverable**: Enterprise-ready platform

---

### Phase 4: Scale & Polish (Weeks 13-16)

**Goal**: Production readiness, scale testing, launch prep

**Week 13-14: Scale & Performance**

- [ ] Load testing
- [ ] Database optimization
- [ ] Caching layer (Redis)
- [ ] CDN setup
- [ ] Auto-scaling configuration

**Week 15: Launch Preparation**

- [ ] Documentation
- [ ] Onboarding flow for new orgs
- [ ] Pricing & billing integration
- [ ] Marketing website
- [ ] Support system setup

**Week 16: Beta Launch**

- [ ] Beta user onboarding (10-20 orgs)
- [ ] Monitoring & alerting
- [ ] Rapid iteration on feedback
- [ ] Bug fixes
- [ ] Performance tuning

**Deliverable**: Public beta launch

---

## Success Metrics & KPIs

### User Metrics

**Adoption & Engagement**

- **Daily Active Users (DAU)**: Target 75% of new hires use daily in first 30 days
- **Weekly Active Users (WAU)**: 90%+ in onboarding period
- **Retention**: 60%+ continue using after onboarding complete
- **Help Requests per User**: 8-15 per day (Week 1), declining to 2-3 (Week 4)

**Task Completion**

- **Roadmap Completion Rate**: 85%+ of tasks completed on time
- **Task Success Rate**: 90%+ of AI-guided tasks completed successfully
- **Average Time per Task**: 30% reduction vs. without Mitable

**Help Quality**

- **Resolution Rate**: 75%+ of help requests resolved without escalation
- **AI Confidence**: Average confidence score >80%
- **User Satisfaction**: 4.2+/5.0 average rating on help responses
- **Helpful Feedback**: 80%+ thumbs up on AI responses

### Business Impact Metrics

**Time & Cost Savings**

- **Time to Productivity**: 40% reduction (8 weeks → 4.8 weeks)
- **Training Cost Reduction**: $2,500 saved per new hire
- **Support Ticket Reduction**: 65% fewer "how do I" questions
- **Trainer Time Saved**: 20 hours per new hire

**Nudge System Performance**

- **Expert Match Accuracy**: 85%+ match score for top recommendation
- **Average Response Time**: <15 minutes
- **Resolution Rate**: 80%+ of nudges successfully resolved
- **Expert Satisfaction**: 4.0+/5.0 rating from experts

**Organizational Learning**

- **Knowledge Base Growth**: 30% increase in documented processes
- **Knowledge Coverage**: 90%+ of common questions have documented answers
- **Process Standardization**: 50% increase in consistent approaches

### Technical Metrics

**Performance**

- **Help Response Time**: <4 seconds end-to-end
- **UI Detection Accuracy**: 90%+ for common applications
- **Coordinate Precision**: <10 pixel deviation
- **API Uptime**: 99.9%
- **Error Rate**: <0.5% of requests

**AI Quality**

- **Hallucination Rate**: <5% of responses
- **Source Attribution**: 95%+ responses cite relevant sources
- **Confidence Calibration**: Confidence score correlates with actual success rate

---

## Go-to-Market Strategy

### Target Market Segmentation

**Primary Target**:

- **Company Size**: 50-500 employees
- **Verticals**: SaaS, Tech, Professional Services
- **Roles**: Customer Success, Sales, Technical Support
- **Pain Point**: High onboarding costs, long ramp times

**Initial Design Partners (5-10)**:

- Lorikeet (Agentic CS Platform)
- 2-3 SaaS companies with active hiring
- 2-3 customer service organizations

### Pricing Strategy

**Free Tier** (Forever)

- Individual users
- 50 help requests/month
- Basic roadmap (4 weeks)
- Community support

**Team Plan** ($15/user/month)

- Unlimited help requests
- Full roadmap (customizable)
- Nudge system (unlimited)
- Team analytics
- Email support

**Enterprise** ($25/user/month)

- Everything in Team
- SSO & advanced security
- Custom integrations
- Dedicated support
- SLA guarantees
- On-premise deployment option

### Launch Plan

**Phase 1: Private Beta (Weeks 1-4)**

- Onboard 5 design partners
- Weekly feedback sessions
- Rapid iteration
- Build case studies

**Phase 2: Public Beta (Weeks 5-8)**

- Open to 50 companies
- Waitlist for demand generation
- Product Hunt launch
- Content marketing (blog, guides)

**Phase 3: General Availability (Week 9+)**

- Public launch
- Pricing enforcement
- Sales team hiring
- Scaled marketing

### Marketing Channels

**Inbound**

- SEO: "onboarding software", "digital adoption platform"
- Content: Guides on reducing onboarding time
- Product-led growth: Free tier with upgrade prompts

**Outbound**

- Targeted LinkedIn outreach to HR/Ops leaders
- Partnership with HR software companies
- Conference sponsorships (SaaStr, HR Tech)

**Community**

- LinkedIn thought leadership
- Twitter/X engagement
- Reddit (r/humanresources, r/startups)

---

## Appendix

### Technology Stack Summary

**Desktop**

- Electron 28+
- React 18
- TypeScript 5.0+
- Tailwind CSS
- Framer Motion (animations)
- Vite (build tool)

**Backend**

- Node.js 20+
- Express.js
- PostgreSQL 15 + pgvector
- Redis (caching)
- TypeScript

**AI & ML**

- Google Gemini 2.5 Flash (Vision + Multimodal)
- OpenAI text-embedding-3-large
- LangChain (orchestration)

**Infrastructure**

- Docker containers
- AWS (ECS, RDS, S3)
- CloudFront (CDN)
- CloudWatch (monitoring)

**External Services**

- Slack API
- SendGrid (email)
- PostHog (analytics)
- Sentry (error tracking)

---

**Document Version**: 1.0
**Last Updated**: 2025-01-03
**Maintained By**: Product Team
**Next Review**: Weekly during development

---

This comprehensive PRD serves as the single source of truth for building Mitable AI Onboarding Buddy from MVP through enterprise platform. All features, architecture, and specifications are based on the product vision demonstrated in the UI mockups and current partial implementation.
