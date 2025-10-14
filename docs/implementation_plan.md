Implementation Prompts by Phase
Phase 1: MVP Foundation (Weeks 1-4)
Week 1: Desktop App Foundation
Prompt 1.1: Monorepo Setup
@Architecture Agent

Set up the Mitable monorepo following the structure in Electron_Express_monorepo_UPDATED.md:

1. Initialize npm workspaces with root package.json
2. Create workspace structure:
   - apps/backend (Express API)
   - apps/electron (Electron app with 5 windows)
   - packages/shared (Shared types, Zod schemas)
3. Configure Turbo for parallel builds
4. Set up TypeScript with base config
5. Configure ESLint and Prettier
6. Add initial scripts for dev/build/lint

Deliverable: Complete monorepo structure with working npm scripts

**Important**: The Electron app uses electron-vite for unified development. Key differences from traditional setups:

- Single dev server on port 5173 (not 5 separate servers)
- No individual Vite configs per renderer
- Shared Tailwind/PostCSS configuration
- electron-vite outputs preload scripts as .mjs files
- Use `app.isPackaged` for environment detection (not `process.env.NODE_ENV`)

Prompt 1.2: Electron Multi-Window Architecture
@Architecture Agent @Frontend Agent

Implement the 5-window Electron architecture using electron-vite:

1. electron-vite configuration (apps/electron/electron.vite.config.ts):
   - Configure main process entry (src/main.ts)
   - Configure 5 preload entries (agent, console, overlay, guide, nudge)
   - Configure 5 renderer entries (HTML files for each window)
   - Set up React plugin and path aliases
   - Configure externalizeDepsPlugin for proper dependency handling

2. Main process (apps/electron/src/main.ts):
   - Create agent window (always-on-top floating widget)
   - Create console window (main hub)
   - Create overlay window (fullscreen visual feedback)
   - Create guide window (step-by-step instructions)
   - Create nudge window (expert recommendations)
   - Use app.isPackaged for environment detection
   - Load from http://localhost:5173/{window} in dev
   - Load from ../renderer/{window}.html in production
   - Reference preload scripts as ../preload/{window}.mjs
   - Implement window coordination via IPC
   - Set up global hotkey (Cmd+H) for console window

3. Preload scripts for each window:
   - apps/electron/src/preload/agent.ts
   - apps/electron/src/preload/console.ts
   - apps/electron/src/preload/overlay.ts
   - apps/electron/src/preload/guide.ts
   - apps/electron/src/preload/nudge.ts
   - Secure context bridge APIs
   - IPC channel definitions
   - Note: electron-vite outputs these as .mjs files

4. Shared configuration:
   - Create tailwind.config.js at electron root (shared by all renderers)
   - Create postcss.config.js at electron root
   - Create src/renderer/styles.css (shared Tailwind styles)
   - Import order: @import before @tailwind directives

5. Renderer structure for each window:
   - apps/electron/src/renderer/{window}/index.html
   - apps/electron/src/renderer/{window}/src/{window}.tsx (entry point)
   - apps/electron/src/renderer/{window}/src/App.tsx
   - Import shared styles: import "../../styles.css"
   - Basic placeholder UI for each window

Deliverable: 5 working windows with IPC communication, unified dev server on port 5173, all windows show on app launch
Prompt 1.3: Screen Capture System
@Architecture Agent @Frontend Agent

Implement the screen capture system for the help pill:

1. Global hotkey handler (Cmd+H):
   - Capture active screen on trigger
   - Get screen dimensions and DPI scale
   - Multi-monitor support

2. Screenshot capture:
   - Use Electron desktopCapturer API
   - Return base64 PNG
   - Include metadata (window title, app name, timestamp)

3. Privacy controls:
   - App blacklist (exclude sensitive apps)
   - Visual indicator of what's captured
   - Screenshot retention policy (30 seconds)

4. Help pill UI:
   - Show screenshot preview
   - Display detected context
   - Question input field
   - "Get Help" and "Cancel" actions

Deliverable: Working Cmd+H trigger that captures screen and shows help pill
Prompt 1.4: Help Pill UI Component
@Frontend Agent

Build the Help Pill overlay component matching the PRD design:

Component: apps/electron/src/renderer/agent/src/App.tsx

Features:

1. Floating pill appears center-screen on Cmd+H
2. Screenshot thumbnail preview
3. Detected context display (app name, window title)
4. Auto-resizing text input for question
5. Example suggestions
6. "Get Help" primary button
7. "Find an Expert Instead" secondary action
8. Dynamic click-through (only capture clicks over UI elements)
9. Close button

Styling:

- Dark mode by default
- Gradient background (gray-800 to gray-900)
- Rounded corners (radius-lg)
- Drop shadow (shadow-2xl)
- Smooth animations (fade-in, slide-in)

Deliverable: Polished help pill component with full functionality
Week 2: AI Integration
Prompt 2.1: Gemini Vision Service
@AI Integration Agent @Backend Agent

Create the Gemini Vision service for UI object detection:

Service: apps/backend/src/services/gemini-vision.service.ts

Functions:

1. detectUIElements(screenshot: base64, windowContext: object)
   - Send screenshot to Gemini 2.5 Flash
   - Prompt: "Detect all UI elements in this screenshot. Return a JSON array with: element type, text content, bounding box {x, y, width, height}, confidence score."
   - Parse response into structured format
   - Return UIElement[]

2. analyzeScreenContext(screenshot: base64, question: string)
   - Multimodal prompt combining image + text
   - Extract user intent and workflow stage
   - Return IntentAnalysis object

Error handling:

- API rate limits
- Invalid responses
- Timeout handling (5s max)

Deliverable: Working Gemini Vision integration with UI detection
Prompt 2.2: Context Analysis & Intent Service
@AI Integration Agent @Backend Agent

Build the context analysis service:

Service: apps/backend/src/services/context-analysis.service.ts

Functions:

1. analyzeIntent(question: string, uiElements: UIElement[], appContext: object)
   - Classify user intent (escalate_ticket, change_setting, find_feature, etc.)
   - Map to known workflows
   - Identify required actions
   - Return confidence score

2. mapToWorkflow(intent: string, context: object)
   - Match intent to workflow templates
   - Extract workflow steps
   - Return WorkflowStep[]

3. buildPromptContext(question, uiElements, knowledgeChunks)
   - Construct comprehensive context for response generation
   - Format UI elements for LLM consumption
   - Include relevant documentation snippets

Deliverable: Intent analysis service with workflow mapping
Prompt 2.3: Knowledge Retrieval with Hybrid Search
@AI Integration Agent @Database Agent

Implement hybrid search for knowledge retrieval:

1. Embedding service (apps/backend/src/services/embedding.service.ts):
   - generateEmbedding(text: string)
   - Use OpenAI text-embedding-3-large
   - Cache frequent queries (Redis)

2. Hybrid search service (apps/backend/src/services/knowledge-search.service.ts):
   - semanticSearch(query: string, limit: number)
     - Generate embedding for query
     - pgvector cosine similarity search
   - keywordSearch(query: string, limit: number)
     - PostgreSQL full-text search
   - hybridSearch(query: string, limit: number)
     - Combine semantic (70%) + keyword (30%)
     - Rank by relevance score
     - Deduplicate results

3. Database setup:
   - Add pgvector extension
   - Create indexes for vector and FTS

Deliverable: Working hybrid search with <500ms latency
Prompt 2.4: Response Generation with Streaming
@AI Integration Agent @Backend Agent

Create the response generation service with streaming:

Service: apps/backend/src/services/response-generation.service.ts

Functions:

1. generateResponse(context: PromptContext, stream: boolean)
   - Construct prompt with: question, UI elements, knowledge chunks
   - Call Gemini API with streaming enabled
   - Parse response for:
     - Conversational answer
     - Workflow steps with UI element references
     - Source citations
     - Confidence score

2. generateVisualGuide(workflowSteps: Step[], uiElements: UIElement[])
   - Map workflow steps to UI element coordinates
   - Generate arrow positions and highlighting boxes
   - Calculate instruction positioning
   - Return VisualGuideConfig

API endpoint: POST /api/v1/help/request

- Accept screenshot + question
- Stream response chunks via SSE
- Return full response with visual guide data

Deliverable: Streaming response generation with visual guidance
Week 3: Visual Overlays
Prompt 3.1: Overlay Window System
@Frontend Agent @Architecture Agent

Build the visual overlay system for guidance:

Main overlay (apps/electron/src/renderer/overlay/src/App.tsx):

1. Fullscreen transparent window
2. Always-on-top, click-through by default
3. Receives highlight data via IPC
4. Renders:
   - Curved arrows pointing to UI elements
   - Element highlights (colored outlines)
   - Step instructions (floating tooltips)
   - Progress indicator

Components:

- Arrow (SVG path with animation)
- Highlight (div with border and glow)
- StepInstruction (positioned tooltip)
- ProgressTracker (top-right corner)

Positioning algorithm:

- Calculate arrow start/end from coordinates
- Auto-position instructions to avoid covering targets
- Handle multi-monitor scenarios
- DPI scaling support

Deliverable: Working overlay system with precise visual guidance
Prompt 3.2: Workflow Step Navigation
@Frontend Agent @Architecture Agent

Implement step-by-step workflow navigation:

Guide window (apps/electron/src/renderer/guide/src/App.tsx):

1. Side panel showing current step
2. Step description and action
3. Navigation controls:
   - Previous button (go back)
   - Next button (advance)
   - Complete button (finish workflow)
   - Pause button (freeze guidance)

Coordination:

- When step changes, update overlay highlights
- Send IPC message to overlay with new coordinates
- Track completion status
- Save progress to backend

IPC channels:

- guide-start: Initialize workflow
- guide-update-step: Change current step
- guide-end: Complete workflow
- overlay-highlight-update: Update overlay
- overlay-highlight-clear: Remove highlights

Deliverable: Working step navigation with overlay coordination
Prompt 3.3: Dynamic Click-Through Control
@Frontend Agent @Architecture Agent

Implement dynamic click-through for agent and guide windows:

Mechanism:

1. Track mouse position in renderer
2. Check if mouse is over interactive elements
3. Send IPC to main process: setIgnoreMouseEvents(ignore: boolean)
4. Main process updates window click-through state

Implementation for each window:

- Agent window: Click-through except over input/buttons
- Guide window: Click-through except over navigation controls
- Nudge window: Click-through except over action buttons
- Overlay window: Always click-through

Performance optimization:

- Throttle mouse move events (60fps max)
- Cache element bounds
- Efficient collision detection

Deliverable: Smooth click-through that doesn't block user interactions
Prompt 3.4: Overlay Animations & Polish
@Frontend Agent

Add animations and visual polish to overlays:

Animations:

1. Arrow appearance:
   - Fade-in over 300ms
   - Draw animation (stroke-dasharray)
   - Gentle pulse on target

2. Highlight appearance:
   - Scale from 0.95 to 1.0
   - Fade-in with glow effect
   - Subtle breathing animation

3. Step transitions:
   - Fade out old, fade in new
   - Slide instruction to new position
   - Progress indicator update

Styling:

- Color-coded by step (Blue, Green, Purple)
- Smooth cubic-bezier easing
- Drop shadows for depth
- Semi-transparent backgrounds

Accessibility:

- High contrast mode support
- Reduced motion option
- Keyboard navigation

Deliverable: Polished visual overlay with smooth animations
Week 4: Conversation & Polish
Prompt 4.1: Conversation Persistence
@Backend Agent @Database Agent

Implement conversation management system:

Database schema:

- conversations table (see PRD schema)
- messages table with type (user/ai)
- conversation_metadata for context

API endpoints:

- POST /api/v1/conversations (create new)
- GET /api/v1/conversations (list with pagination)
- GET /api/v1/conversations/:id (get with messages)
- POST /api/v1/conversations/:id/messages (add message)
- PATCH /api/v1/conversations/:id (update status/rating)

Service: apps/backend/src/services/conversation.service.ts

- createConversation(userId, initialContext)
- addMessage(conversationId, type, content, metadata)
- getConversationWithMessages(conversationId)
- listConversations(userId, filters, pagination)
- updateConversation(conversationId, updates)

Features:

- Thread management
- Message ordering
- Context aggregation
- Search functionality

Deliverable: Full conversation CRUD with persistence
Prompt 4.2: Chat History UI
@Frontend Agent

Build the Chats section in main console:

Component: apps/electron/src/renderer/console/src/components/ChatsTab.tsx

Features:

1. Conversation list (left panel):
   - Title (auto-generated or user-edited)
   - Last message preview
   - Timestamp
   - Status badge (Active, Resolved, On Hold)
   - Filter buttons (All, Active, Resolved)
   - Search bar

2. Conversation detail (right panel):
   - Initial screenshot context
   - Message thread
   - User messages (right-aligned)
   - AI messages (left-aligned, with sources)
   - Follow-up input field
   - Actions (thumbs up/down, copy, share)

3. Real-time updates:
   - WebSocket connection for new messages
   - Optimistic UI updates
   - Streaming message display

Deliverable: Full chat history UI with conversation threading
Prompt 4.3: Follow-Up Questions
@AI Integration Agent @Backend Agent @Frontend Agent

Implement conversation context for follow-up questions:

Backend:

1. Maintain conversation context window (last 10 messages)
2. Include context in AI prompts for follow-ups
3. Reference past messages: "As I mentioned earlier..."
4. Cross-reference related conversations

Frontend:

1. Follow-up input always visible in conversation detail
2. Send message with conversation ID
3. Stream AI response
4. Update message list in real-time

AI prompt engineering:

- Include conversation history
- Reference previous answers
- Maintain consistency
- Acknowledge user's learning progress

Deliverable: Natural follow-up conversation with context awareness
Prompt 4.4: Error Handling & Edge Cases
@Backend Agent @Frontend Agent @Testing Agent

Implement comprehensive error handling:

Backend errors:

1. API errors (500):
   - Log to Sentry
   - Return user-friendly message
   - Retry logic for transient failures

2. AI errors:
   - Gemini API timeout (fallback response)
   - Rate limit (queue request)
   - Invalid response (validate and retry)
   - Low confidence (<70%): suggest human expert

3. Database errors:
   - Connection failures
   - Transaction rollbacks
   - Data validation errors

Frontend errors:

1. Network failures:
   - Offline indicator
   - Retry button
   - Queue messages for later

2. Screenshot failures:
   - Permission denied (show instructions)
   - Invalid format (retry)

3. UI errors:
   - Overlay positioning failures (fallback to center)
   - Window creation errors (recreate)

Edge cases:

- Multi-monitor edge scenarios
- Very large screenshots (resize)
- Rapid successive help requests (debounce)

Deliverable: Robust error handling with graceful degradation

Phase 2: Roadmap & Nudges (Weeks 5-8)
Week 5: Roadmap Core
Prompt 5.1: Roadmap Data Model & API
@Database Agent @Backend Agent

Implement roadmap system data layer:

1. Database schema (PRD section):
   - roadmaps table
   - roadmap_tasks table
   - source_materials table
   - task_sources junction table

2. Repositories:
   - RoadmapRepository (CRUD operations)
   - TaskRepository (with dependencies)
   - SourceMaterialRepository

3. API endpoints:
   - GET /api/v1/roadmap (get user's roadmap)
   - GET /api/v1/roadmap/tasks/:id (task details)
   - PATCH /api/v1/roadmap/tasks/:id (update status)
   - POST /api/v1/roadmap/generate (create new roadmap)

4. Business logic:
   - Calculate progress percentages
   - Handle task dependencies
   - Validate task transitions
   - Track completion timestamps

Deliverable: Complete roadmap data layer with API
Prompt 5.2: AI Roadmap Generation
@AI Integration Agent @Backend Agent

Build AI-powered roadmap generation:

Service: apps/backend/src/services/roadmap-generation.service.ts

Function: generateRoadmap(userProfile, organizationId)

Process:

1. Retrieve role template (if exists)
2. Query knowledge base for role-relevant content
3. AI prompt:
   Generate a 4-week onboarding roadmap for:
   Role: {{role}}
   Experience: {{experienceLevel}}
   Department: {{department}}
   Knowledge base: {{relevantDocs}}
   Output format:

Week-by-week breakdown
5-8 tasks per week
Clear dependencies
Estimated time per task
Task categories (administrative, technical, social, training)
Source material suggestions

4. Parse AI response into structured tasks
5. Assign task order and dependencies
6. Link source materials
7. Store in database

Deliverable: Working AI roadmap generation for any role
Prompt 5.3: Roadmap UI - Week View
@Frontend Agent

Build the Roadmap section UI:

Component: apps/electron/src/renderer/console/src/components/RoadmapTab.tsx

Layout:

1. Progress header:
   - Overall completion percentage
   - Progress bar (animated)
   - Current week indicator

2. Week cards (collapsible):
   - Week number and title
   - Progress indicator (7/7 tasks complete)
   - Task list (when expanded)
   - Expand/collapse animation

3. Task cards:
   - Checkbox (status)
   - Title and brief description
   - Estimated time badge
   - Category icon
   - Click to open detail drawer

Interactions:

- Click week card to expand/collapse
- Click task to open detail drawer
- Drag tasks to reorder (within constraints)
- Filter by status (Not Started, In Progress, Completed)

Styling:

- Card-based design
- Smooth transitions
- Status color coding
- Hover effects

Deliverable: Interactive roadmap week view
Prompt 5.4: Task Detail Drawer
@Frontend Agent

Build the task detail drawer component:

Component: TaskDetailDrawer.tsx

Slides from right side, contents:

1. Header:
   - Task title
   - Status dropdown
   - Close button

2. Description section:
   - Full task description
   - Category badge
   - Estimated time
   - Due date (if set)

3. Source materials:
   - Grid/carousel of attached resources
   - Thumbnails for videos/PDFs
   - Click to open in-app or external
   - Duration indicators

4. Steps section (if available):
   - Numbered list of sub-steps
   - Checkbox for each
   - AI help button per step

5. Help actions:
   - "Get AI Help with This Task" button
   - "Find an Expert" button

6. Footer:
   - Mark as Complete button
   - Cancel button

Deliverable: Fully functional task detail drawer
Week 6: Roadmap Advanced
Prompt 6.1: Task Dependencies Logic
@Backend Agent @Frontend Agent

Implement task dependency system:

Backend:

1. Validate task dependencies on creation:
   - No circular dependencies
   - Dependencies within same roadmap
   - Earlier weeks come first

2. Calculate available tasks:
   - Check all dependencies completed
   - Return only unlocked tasks

3. Auto-progression:
   - When task completed, unlock dependents
   - Update week status (all tasks done = complete)

Frontend:

1. Visual dependency indicators:
   - Locked tasks show lock icon
   - Hover shows "Requires: Task X, Y"
   - Grayed out until unlocked

2. Week unlocking:
   - Weeks unlock based on dependencies
   - Show countdown to unlock

Deliverable: Working dependency system with visual feedback
Prompt 6.2: Adaptive Roadmap Adjustment
@AI Integration Agent @Backend Agent

Build adaptive roadmap intelligence:

Service: apps/backend/src/services/roadmap-adaptation.service.ts

Functions:

1. analyzeProgress(userId, roadmapId)
   - Calculate completion rate vs. expected
   - Analyze help request patterns (struggling topics)
   - Check task skip patterns

2. suggestAdjustments(analysisResults)
   - If ahead: Suggest accelerated path
   - If behind: Add prerequisite tasks or extend timeline
   - If struggling: Recommend additional resources
   - If skipping: Adjust difficulty or relevance

3. applyAdjustments(roadmapId, adjustments)
   - Add/remove/reorder tasks
   - Update dependencies
   - Notify user of changes

Background job:

- Run daily for active roadmaps
- Generate suggestions
- Require user approval before applying

Deliverable: Adaptive roadmap system with AI suggestions
Prompt 6.3: Source Materials Integration
@Backend Agent @Frontend Agent

Implement source materials system:

Backend:

1. Source materials repository:
   - CRUD operations
   - Search and filter
   - Association with tasks

2. Content types:
   - Documentation (PDF, MD, HTML)
   - Videos (YouTube, Vimeo, internal)
   - Tutorials (interactive)
   - Articles (blog posts)

3. Metadata extraction:
   - PDF thumbnails
   - Video durations
   - Auto-tagging

Frontend:

1. Material card component:
   - Thumbnail
   - Title and description
   - Type icon
   - Duration (if video)
   - Open button

2. Material viewer:
   - In-app PDF viewer
   - Video player
   - Web viewer for articles

Deliverable: Complete source materials system
Prompt 6.4: Integration with Help System
@Backend Agent @Frontend Agent

Connect roadmap tasks with help system:

Features:

1. "Get AI Help" button on each task:
   - Pre-fills question with task context
   - Includes task description in context
   - Links help conversation to task

2. Auto-complete detection:
   - If help request resolves task action
   - Suggest marking task complete
   - One-click complete from conversation

3. Related conversations:
   - Show past help requests for this task
   - "Others also asked..." section

4. Knowledge building:
   - Successful help interactions become source materials
   - AI learns common task difficulties
   - Improve future roadmap generation

Deliverable: Seamless integration between roadmap and help
Week 7: Nudge System
Prompt 7.1: Expert Matching Algorithm
@AI Integration Agent @Backend Agent

Build the expert matching system:

Service: apps/backend/src/services/expert-matching.service.ts

Functions:

1. buildExpertProfiles(organizationId)
   - Extract expertise from nudge history (topics resolved)
   - Parse Slack participation (channel keywords)
   - Use role/department metadata
   - Generate expertise tags with confidence scores

2. matchExperts(question: string, screenshot?: base64)
   - Generate question embedding
   - Semantic similarity with expert profiles
   - Factor in:
     - Expertise match (40%)
     - Availability (30%)
     - Response rate (30%)
   - Return top 3 matches with scores

3. updateExpertStats(nudgeId, outcome)
   - Track response time
   - Update response rate
   - Aggregate helpfulness ratings
   - Adjust expertise tags based on successful resolutions

Algorithm:

```python
score = (
    semantic_similarity(question, expert_expertise) * 0.4 +
    expert.response_rate * 0.15 +
    (expert.helpfulness_rating / 5.0) * 0.15 +
    availability_score(expert) * 0.3
) * 100
Deliverable: Expert matching with 85%+ accuracy

**Prompt 7.2: Nudge Composition Flow**
@Frontend Agent @Backend Agent
Build nudge creation user flow:
Frontend flow:

Trigger points:

"Find an Expert" from help pill
"Get Expert Help" from conversation (if AI confidence low)
Manual: "Ask a Colleague" button


Expert selection screen:

Show top 3 recommended experts
Display: Name, role, match score, availability, stats
Option to search all experts
Select expert button


Message composition:

Auto-drafted message from AI:



     Hi [Expert],

     I'm working on [context from screenshot] and could use your expertise.

     Situation: [User question rephrased]

     What I've tried: [Prior help attempts if any]

     Could you point me in the right direction?

     Thanks!
     [User]

User can edit before sending
Screenshot attachment checkbox


Confirmation & tracking:

"Nudge sent!" confirmation
Added to Nudges tab
Real-time status updates



Backend:

POST /api/v1/nudges/match (get expert suggestions)
POST /api/v1/nudges (send nudge)

Deliverable: Complete nudge composition flow

**Prompt 7.3: Slack Integration for Nudges**
@Integration Agent @Backend Agent
Implement Slack bot for nudge delivery:
Setup:

Slack app creation:

OAuth scopes: chat:write, users:read, channels:read
Bot token storage (encrypted)
Workspace installation flow


Slack bot service:

Send DM to expert with nudge
Format message with rich blocks:

Screenshot attachment
Question context
Action buttons (View Full Context, Respond)




Incoming webhooks:

Expert response notifications
Thread updates
Status changes



Message format:
json{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🎯 New Nudge from Steve Johnson"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Topic:* Billing dispute escalation\n\n*Question:* Billing dispute over $450 premium feature change - how should I handle this?"
      },
      "accessory": {
        "type": "image",
        "image_url": "{{screenshot_url}}",
        "alt_text": "Screenshot"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View Full Context"
          },
          "url": "{{app_url}}/nudges/{{nudge_id}}"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Respond"
          },
          "action_id": "nudge_respond"
        }
      ]
    }
  ]
}
Deliverable: Working Slack integration for nudges

**Prompt 7.4: Nudges Tab UI**
@Frontend Agent
Build the Nudges section in main console:
Component: apps/electron/src/renderer/console/src/components/NudgesTab.tsx
Layout:

Filter tabs:

Pending (default)
In Progress
Resolved
All


Nudge list:

Expert avatar and name
Role and match score
Question preview
Time sent
Status badge
Click to expand


Nudge detail (expanded card):

Full question
Screenshot thumbnail
Conversation thread (if started)
Expert response
Action buttons:

Send Follow-up
Mark Resolved
Rate Helpful




Real-time updates:

WebSocket for status changes
Expert response notifications
Badge counts



Statistics panel (sidebar):

Total nudges sent
Average response time
Most helpful experts
Your top topics

Deliverable: Complete nudges tracking UI

#### Week 8: Integration & Testing

**Prompt 8.1: End-to-End Testing**
@Testing Agent
Write E2E tests for critical user flows:
Setup: Playwright with Electron support
Test suites:

Help request flow:

Press Cmd+H
Verify help pill appears
Enter question
Click "Get Help"
Verify conversation panel opens
Check streaming response
Click "Show Me How"
Verify visual overlay appears
Follow steps
Mark as resolved


Roadmap flow:

Open roadmap tab
Expand week 2
Click task
Verify detail drawer
Mark task complete
Verify progress update


Nudge flow:

Trigger expert finder
Select expert from recommendations
Compose message
Send nudge
Verify Slack notification sent
Simulate expert response
Verify status update



Test files: apps/electron/e2e/*.spec.ts
Deliverable: Comprehensive E2E test suite with 80%+ coverage of flows

**Prompt 8.2: Performance Optimization**
@Architecture Agent @Frontend Agent @Backend Agent
Optimize performance across the stack:
Frontend:

React optimization:

Memoization (useMemo, useCallback)
Code splitting per window
Lazy loading components
Virtual scrolling for long lists


Renderer performance:

Debounce mouse events
RequestAnimationFrame for overlays
Minimize re-renders
Efficient IPC communication



Backend:

API optimization:

Response caching (Redis)
Database query optimization
Connection pooling
Rate limiting


AI optimization:

Embedding cache
Batch processing
Streaming responses
Parallel processing



Metrics:

Help response time: <4s end-to-end
UI frame rate: 60fps
API p95 latency: <500ms
Memory usage: <200MB per window

Deliverable: Optimized system meeting performance targets

**Prompt 8.3: UI Polish & Animations**
@Frontend Agent
Add final polish to all UI components:

Micro-interactions:

Button hover states with scale
Input focus animations
Loading states with skeletons
Success/error toast notifications


Transitions:

Page transitions (fade)
Modal appearances (scale + fade)
List item animations (stagger)
Progress bar animations


Dark mode refinement:

Consistent color scheme
Proper contrast ratios (WCAG AA)
Smooth theme transitions


Accessibility:

Keyboard navigation
Focus indicators
Screen reader support
Reduced motion mode


Error states:

Empty states with illustrations
Error messages with actions
Offline indicators



Deliverable: Polished, accessible UI across all windows

**Prompt 8.4: Beta Testing Preparation**
@Documentation Agent @Testing Agent
Prepare for beta user testing:

User documentation:

Getting started guide
Feature walkthroughs (with screenshots)
FAQ
Troubleshooting guide
Keyboard shortcuts reference


Onboarding flow:

First-run wizard
Permission requests (screen recording)
Account setup
Initial roadmap generation
Interactive tutorial


Feedback mechanisms:

In-app feedback form
Bug report button (with auto-context)
Feature request form
User survey (after 1 week)


Analytics instrumentation:

Event tracking (PostHog)
Error monitoring (Sentry)
Performance metrics
Usage dashboards


Beta testing plan:

Recruit 5-10 design partners
Weekly feedback sessions
Prioritized issue tracker
Rapid iteration process



Deliverable: Beta-ready app with documentation and feedback systems

---

### Phase 3: Enterprise Features (Weeks 9-12)

#### Week 9: Admin Dashboard

**Prompt 9.1: Organization Management**
@Backend Agent @Frontend Agent @Database Agent
Build organization and user management system:
Backend:

Organization API:

GET /api/v1/admin/organization (settings)
PATCH /api/v1/admin/organization (update settings)
GET /api/v1/admin/users (list all users)
POST /api/v1/admin/users (invite user)
PATCH /api/v1/admin/users/:id (update role, department)
DELETE /api/v1/admin/users/:id (deactivate)


Settings structure:

Subscription tier
Feature flags
Integration configs (Slack workspace, HR system)
Branding (logo, colors)
Privacy settings (screenshot retention, blacklist)



Frontend:

Admin dashboard (new window or tab):

Organization overview
User directory with search/filter
Settings panels
Usage statistics


User management:

Table view with pagination
Role assignment dropdown
Bulk actions
Invite flow with email



Deliverable: Complete org/user management for admins

**Prompt 9.2: Knowledge Base Upload & Processing**
@Backend Agent @AI Integration Agent @Frontend Agent
Build document upload and processing pipeline:
Backend:

Upload endpoint:

POST /api/v1/documents/upload
Support: PDF, DOCX, TXT, MD, HTML
Max size: 50MB
S3 storage


Processing pipeline (async):

Extract text (pdf-parse, mammoth)
Chunk into 512-token segments
Generate embeddings for each chunk
Store in document_chunks table
Update search vectors
Mark document as processed


Document management:

List documents
Preview/download
Delete (cascade to chunks)
Bulk operations



Frontend:

Upload interface:

Drag-and-drop zone
File type validation
Upload progress
Processing status


Document library:

Grid/list view
Search and filter
Preview modal
Metadata editing



Background job:

Queue: Bull with Redis
Retry logic
Error notifications

Deliverable: Working document upload with async processing

**Prompt 9.3: Usage Analytics Dashboard**
@Backend Agent @Frontend Agent
Build analytics dashboard for admins:
Backend:

Analytics aggregation service:

Daily/weekly/monthly metrics
User engagement (DAU, WAU, MAU)
Feature usage (help requests, nudges, roadmap)
Performance metrics (response times, success rates)
Top questions and topics


API endpoints:

GET /api/v1/admin/analytics/overview
GET /api/v1/admin/analytics/users (user-level breakdown)
GET /api/v1/admin/analytics/topics (popular topics)
GET /api/v1/admin/analytics/export (CSV export)



Frontend:

Dashboard layout:

KPI cards (total users, help requests, avg response time)
Charts (time series, bar charts, pie charts)
Date range selector
Export button


Visualizations:

User adoption curve
Feature usage breakdown
Top questions by frequency
Nudge success rates
Roadmap completion rates



Libraries:

Recharts for visualizations
Date-fns for date handling

Deliverable: Comprehensive analytics dashboard

**Prompt 9.4: Admin Settings & Configuration**
@Frontend Agent @Backend Agent
Build admin settings interface:
Settings categories:

General:

Organization name
Subdomain
Logo upload
Primary color


Integration:

Slack workspace (connect/disconnect)
Email provider (SendGrid API key)
HR system connector (future)


Privacy & Security:

Screenshot retention policy
App blacklist
Data export controls
User consent settings


AI Configuration:

Confidence threshold for human escalation
Response tone preference
Knowledge base priorities


Subscription:

Current plan
Usage limits
Billing information (Stripe portal)
Upgrade/downgrade options



Deliverable: Complete admin settings panel

#### Week 10: Analytics & Insights

**Prompt 10.1: Event Tracking System**
@Backend Agent @Frontend Agent
Implement comprehensive event tracking:
Events to track:

User actions:

help_request_initiated
help_request_completed
roadmap_task_completed
nudge_sent
nudge_resolved
conversation_rated


System events:

user_onboarded
roadmap_generated
expert_matched
document_processed


Performance events:

ai_response_time
api_latency
error_occurred



Implementation:

Frontend:

Track user interactions
Send to backend via POST /api/v1/analytics/event
Batch events (every 30s or 10 events)


Backend:

Store in analytics_events table
Send to PostHog/Mixpanel
Aggregate for dashboards


Privacy:

User opt-out
Anonymize sensitive data
GDPR compliance



Deliverable: Complete event tracking system

**Prompt 10.2: User-Level Analytics**
@Backend Agent @Frontend Agent
Build user-level analytics and insights:
Manager view (for team leads):

Team dashboard:

List of direct reports
Onboarding progress per person
Help request patterns
Roadmap completion rates
Time to productivity metrics


Individual user view:

Detailed onboarding timeline
Help topics breakdown
Experts consulted
Learning patterns
Struggling areas (low confidence requests)



API:

GET /api/v1/analytics/team (team overview)
GET /api/v1/analytics/users/:id (individual details)

Privacy:

Only accessible to managers and admins
No PII in screenshots without consent

Deliverable: User-level analytics for managers

**Prompt 10.3: Reporting & Export**
@Backend Agent @Frontend Agent
Build reporting and data export features:
Reports:

Onboarding Report:

Time to productivity by cohort
Task completion rates
Most challenging tasks
Help request frequency


Knowledge Gaps Report:

Topics with most help requests
Low confidence responses
Unanswered questions
Expert coverage gaps


ROI Report:

Time saved vs. baseline
Support ticket reduction
Training cost savings
User satisfaction scores



Export formats:

CSV (raw data)
PDF (formatted report)
JSON (API export)

Scheduling:

Weekly email reports to admins
On-demand generation

Deliverable: Comprehensive reporting system

**Prompt 10.4: Data Visualization Components**
@Frontend Agent
Build reusable data visualization components:
Components:

TimeSeriesChart:

Line/area chart for trends
Multiple series support
Tooltips with details
Zoom and pan


BarChart:

Horizontal/vertical bars
Grouped bars
Click to drill down


PieChart:

Donut variant
Percentage labels
Interactive legend


HeatMap:

Grid-based visualization
Color scales
Hover details


MetricCard:

Large number display
Trend indicator (up/down)
Comparison to previous period



Library: Recharts with custom styling
Deliverable: Chart component library

#### Week 11: Integrations

**Prompt 11.1: HR System Connectors**
@Integration Agent @Backend Agent
Build HR system integration framework:
Supported systems (Phase 1):

BambooHR
Workday (basic)
Manual CSV upload

Functions:

Employee sync:

Fetch new hires (daily)
Update user profiles (role, department, start date)
Auto-generate roadmaps for new hires
Sync org structure


Webhook listeners:

New hire added â†' Create Mitable account + roadmap
Role changed â†' Adjust roadmap
Termination â†' Archive account



Implementation:

Abstract connector interface:

typescriptinterface HRConnector {
  syncEmployees(): Promise<Employee[]>;
  getEmployee(id: string): Promise<Employee>;
  setupWebhook(url: string): Promise<void>;
}

Specific implementations:

BambooHRConnector
WorkdayConnector
CSVImporter


Admin configuration:

API credentials storage (encrypted)
Sync schedule
Field mapping



Deliverable: Working HR integrations for auto-onboarding

**Prompt 11.2: SSO Implementation**
@Integration Agent @Backend Agent
Implement Single Sign-On:
Protocols:

SAML 2.0:

Identity provider (IdP) initiated
Service provider (SP) metadata
Attribute mapping (email, name, role)


OAuth 2.0 / OpenID Connect:

Google Workspace
Microsoft Azure AD
Okta



Implementation:

SAML setup:

Use passport-saml
Generate SP metadata
Accept IdP metadata upload
Parse SAML assertions


OAuth setup:

Standard OAuth flow
Callback handling
Token management


User provisioning:

Auto-create on first login
Attribute sync
Role mapping



Admin UI:

SSO configuration panel
Test connection
User attribute mapping

Deliverable: SAML and OAuth SSO support

**Prompt 11.3: Webhook System**
@Backend Agent @Integration Agent
Build outgoing webhook system:
Features:

Event subscriptions:

Admins configure which events to send
Available events:

user.onboarded
roadmap.completed
help_request.unresolved
nudge.created




Webhook configuration:

Target URL
Secret for HMAC signature
Retry policy (3 attempts, exponential backoff)
Event filters


Delivery:

Queue with Bull
Async processing
Delivery status tracking
Failure notifications



Payload format:
json{
  "event": "user.onboarded",
  "timestamp": "2025-01-03T12:00:00Z",
  "data": {
    "userId": "uuid",
    "email": "user@example.com",
    "onboardingStartDate": "2025-01-01"
  },
  "signature": "hmac-sha256-signature"
}
Admin UI:

Webhook list
Add/edit/delete
Test endpoint
Delivery logs

Deliverable: Production-ready webhook system

**Prompt 11.4: API Client Library**
@Backend Agent @Documentation Agent
Create API client libraries:
Languages:

JavaScript/TypeScript
Python (basic)

TypeScript SDK:
typescriptimport { MitableClient } from '@mitable/sdk';

const client = new MitableClient({
  apiKey: process.env.MITABLE_API_KEY,
  baseUrl: 'https://api.mitable.com'
});

// Usage
const roadmap = await client.roadmaps.get(userId);
const experts = await client.nudges.matchExperts(question);
Features:

Auto-generated from OpenAPI spec
Type-safe interfaces
Retry logic
Error handling
Rate limit handling
Webhook signature verification

Documentation:

Installation guide
Authentication
Code examples per endpoint
Error codes reference

Deliverable: Published npm package + docs

#### Week 12: Security & Compliance

**Prompt 12.1: Security Audit & Fixes**
@Architecture Agent @Backend Agent @Testing Agent
Conduct security audit and implement fixes:
Audit checklist:

Authentication:

JWT implementation review
Token expiration and refresh
Password hashing (bcrypt with salt)
Session management


Authorization:

Role-based access control (RBAC)
Resource ownership checks
Admin privilege separation


Input validation:

All API inputs validated (Zod schemas)
SQL injection prevention (parameterized queries)
XSS prevention (sanitize user content)
CSRF protection


Data protection:

Encryption at rest (database)
Encryption in transit (TLS 1.3)
Screenshot secure storage (S3 with encryption)
Secure secret management (AWS Secrets Manager)


API security:

Rate limiting (per user, per IP)
DDoS protection (Cloudflare)
API key rotation
Audit logging



Penetration testing:

Hire external firm or use OWASP ZAP
Address findings
Re-test

Deliverable: Security audit report + fixes implemented

**Prompt 12.2: Privacy Controls**
@Backend Agent @Frontend Agent
Enhance privacy controls:
User privacy settings:

Screenshot control:

Opt-out of screenshot capture
App blacklist (user-defined)
Blur sensitive info (experimental)
Auto-delete screenshots (configurable: 30s, 1m, 5m, never)


Data sharing:

Opt-out of analytics
Opt-out of AI training data
Export all data (GDPR)
Delete account (right to be forgotten)


Consent management:

Initial consent flow
Granular permissions
Revoke anytime



Admin controls:

Organization policies:

Enforce screenshot deletion
Disable certain integrations
Data residency preferences
Compliance mode (HIPAA, SOC 2)



Implementation:

Privacy settings API
User preferences UI
Consent tracking
Data export/deletion jobs

Deliverable: Comprehensive privacy controls

**Prompt 12.3: Compliance Documentation**
@Documentation Agent @Backend Agent
Create compliance documentation:
Documents:

Privacy Policy:

Data collection practices
Data usage
Data sharing (none)
User rights
Contact information


Terms of Service:

Acceptable use
Service availability
Disclaimers
Limitation of liability


Data Processing Agreement (DPA):

For enterprise customers
GDPR-compliant
Data processing terms
Security measures


Security Whitepaper:

Architecture overview
Encryption methods
Access controls
Incident response
Certifications (future: SOC 2)


Compliance Checklist:

GDPR compliance
CCPA compliance
SOC 2 readiness
HIPAA considerations



Deliverable: Complete compliance documentation

**Prompt 12.4: Data Encryption**
@Backend Agent @Database Agent
Implement comprehensive data encryption:
Encryption at rest:

Database:

PostgreSQL encryption (pgcrypto)
Encrypt sensitive columns:

User emails (reversible)
API keys
Integration tokens


Encrypted backups


File storage (S3):

Server-side encryption (SSE-S3)
Screenshot files
Document uploads



Encryption in transit:

API:

TLS 1.3 enforced
Strong cipher suites
HSTS headers


WebSocket:

WSS (WebSocket Secure)
Same TLS config



Key management:

AWS KMS for encryption keys
Key rotation policy (annual)
Separate keys per environment

Deliverable: Full encryption implementation

---

### Phase 4: Scale & Polish (Weeks 13-16)

#### Week 13-14: Scale & Performance

**Prompt 13.1: Load Testing**
@Testing Agent @Backend Agent
Design and execute load testing:
Setup: k6 or Artillery
Test scenarios:

Normal load:

100 concurrent users
Mixed operations (help requests, roadmap views, nudges)
Sustained for 1 hour


Peak load:

500 concurrent users
50 help requests/second
Sustained for 15 minutes


Stress test:

Ramp up to 1000 users
Find breaking point
Measure recovery time



Metrics:

API response times (p50, p95, p99)
Error rates
Database query times
Memory/CPU usage
WebSocket connection stability

Performance targets:

p95 < 500ms for API
p99 < 2s for AI responses
Error rate < 0.1%
Handle 500 concurrent users

Load test script example (k6):
javascriptimport http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 500 },
    { duration: '5m', target: 500 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  // Help request
  let response = http.post('https://api.mitable.com/v1/help/request',
    JSON.stringify({
      screenshot: 'base64...',
      question: 'How do I escalate this ticket?',
    }),
    { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${__ENV.API_KEY}` } }
  );

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 4s': (r) => r.timings.duration < 4000,
  });

  sleep(5);
}
Deliverable: Load test results and performance report

**Prompt 13.2: Database Optimization**
@Database Agent @Backend Agent
Optimize database performance:
Optimization tasks:

Query analysis:

Enable pg_stat_statements
Identify slow queries (>100ms)
EXPLAIN ANALYZE for complex queries
Add missing indexes


Index optimization:

Review existing indexes (index usage stats)
Add composite indexes for common filters
Remove unused indexes
Partial indexes where applicable


Connection pooling:

Configure pg-pool
Pool size based on load test results
Idle timeout settings
Connection health checks


Query optimization:

Rewrite N+1 queries
Use SELECT specific columns
Batch operations where possible
Implement pagination properly


Partitioning (if needed):

analytics_events by month
messages by conversation date
Automated partition management


Vacuuming:

Configure autovacuum
Schedule VACUUM ANALYZE
Monitor bloat



Target metrics:

p95 query time < 50ms
p99 query time < 200ms
Index hit rate > 99%
Connection wait time < 10ms

Deliverable: Optimized database with performance improvements

**Prompt 13.3: Caching Layer**
@Backend Agent @Architecture Agent
Implement Redis caching layer:
Caching strategy:

API response caching:

Roadmap data (TTL: 5 minutes)
Document search results (TTL: 1 hour)
Expert profiles (TTL: 15 minutes)
Organization settings (TTL: 30 minutes)


Session caching:

User sessions
JWT blacklist
Rate limit counters


Computed data:

Analytics aggregations (TTL: 1 hour)
Expert match scores (TTL: 5 minutes)
Embeddings (TTL: 24 hours)



Implementation:

Redis setup:

Redis cluster for HA
Persistence (RDB + AOF)
Eviction policy (allkeys-lru)


Cache service:

typescriptclass CacheService {
  async get<T>(key: string): Promise<T | null>;
  async set(key: string, value: any, ttl?: number): Promise<void>;
  async invalidate(pattern: string): Promise<void>;
  async warmup(): Promise<void>;
}

Cache invalidation:

On data updates
Intelligent patterns (e.g., user:*:roadmap)


Cache warming:

Preload frequently accessed data
Background job



Deliverable: Production-ready caching with 50%+ hit rate

**Prompt 13.4: CDN & Asset Optimization**
@Architecture Agent @Frontend Agent
Set up CDN and optimize assets:
CDN setup (CloudFront):

Distribution configuration:

Origin: S3 for static assets
Edge locations worldwide
Custom domain (cdn.mitable.com)
HTTPS only


Asset types:

JavaScript bundles
CSS files
Images (screenshots, thumbnails)
Fonts



Asset optimization:

JavaScript:

Code splitting (per window)
Tree shaking
Minification
Gzip/Brotli compression


CSS:

Purge unused Tailwind classes
Minification
Critical CSS inline


Images:

WebP format
Responsive images (srcset)
Lazy loading
Thumbnail generation


Fonts:

Self-host fonts
Preload critical fonts
Font subsetting



Build optimization:

Vite build settings for production
Source maps for debugging
Bundle size monitoring

Deliverable: Optimized asset delivery with <1s load time

#### Week 15: Launch Preparation

**Prompt 15.1: Documentation**
@Documentation Agent
Create comprehensive user and developer documentation:
User documentation:

Getting Started:

Installation (Mac, Windows, Linux)
First-time setup wizard
Permission requests (screen recording)
Account creation/login


Feature Guides:

Using the Help System (Cmd+H workflow)
Following Visual Guidance
Navigating Your Roadmap
Sending Nudges to Experts
Managing Conversations


FAQ:

Troubleshooting common issues
Privacy and data questions
Billing and account management
Integration setup


Video Tutorials:

Script for 5 short videos (<3 min each)
Screen recording plans



Developer documentation:

API Reference:

OpenAPI/Swagger spec
All endpoints with examples
Authentication guide
Rate limits
Error codes


Integration Guides:

Slack integration setup
HR system connectors
Webhook configuration
SSO setup (SAML, OAuth)


SDK Documentation:

Installation
Initialization
Code examples
Best practices


Architecture Docs:

System overview
Data flow diagrams
Security architecture
Deployment guide



Deliverable: Complete documentation site (Docusaurus or similar)

**Prompt 15.2: Onboarding Flow for New Organizations**
@Frontend Agent @Backend Agent
Build admin onboarding flow:
Flow:

Organization creation:

Company name
Subdomain selection
Industry selection
Company size


Admin account setup:

Name and email
Password creation
Admin role assignment


Team structure:

Department definitions
Role definitions
Upload employee list (CSV) or connect HR system


Knowledge base setup:

Upload initial documents
Connect documentation sources
AI processing kickoff


Integration setup (optional):

Connect Slack workspace
Configure email notifications
Set up SSO (if enterprise)


Customization:

Upload logo
Set primary brand color
Configure privacy settings


Invite first users:

Bulk invite via email
Generate invite links
Set default roadmap templates


Launch checklist:

Complete setup steps
Test help system
Review analytics dashboard



UI: Multi-step wizard with progress indicator
Deliverable: Smooth admin onboarding (15 minutes to fully set up)

**Prompt 15.3: Pricing & Billing Integration**
@Backend Agent @Frontend Agent @Integration Agent
Implement Stripe billing:
Plans:

Free:

1 user
50 help requests/month
Basic roadmap
Community support


Team ($15/user/month):

Up to 100 users
Unlimited help requests
Full roadmap features
Nudge system
Email support


Enterprise ($25/user/month):

Unlimited users
All Team features
SSO
Custom integrations
Dedicated support
SLA



Implementation:

Stripe setup:

Create products and prices
Configure webhooks
Set up customer portal


Backend:

Subscription management API
Usage tracking (help requests)
Billing alerts (approaching limits)
Invoice generation


Frontend:

Pricing page
Upgrade/downgrade flows
Payment method management
Usage dashboard
Billing history


Webhooks:

subscription.created
subscription.updated
subscription.deleted
payment_intent.succeeded
payment_intent.failed


Enforcement:

Check plan limits on actions
Soft limits (warnings) vs hard limits (blocked)
Grace period for failed payments



Deliverable: Production-ready billing system

**Prompt 15.4: Marketing Website**
@Frontend Agent @Documentation Agent
Build marketing website (separate from app):
Pages:

Homepage:

Hero section with value prop
Product demo (video or animated screenshots)
Key features (3-4 highlights)
Social proof (testimonials, logos)
CTA (Start Free Trial)


Features:

Just-in-Time Help System
Visual Guidance Overlays
AI-Powered Roadmaps
Expert Nudge System
Analytics Dashboard


Pricing:

Plan comparison table
FAQ section
CTA for each plan


About:

Company story
Team photos
Mission/values


Blog:

Thought leadership
Product updates
Customer stories


Resources:

Documentation link
API reference link
Support link



Tech stack:

Next.js for SSR
Tailwind CSS
Framer Motion for animations
MDX for blog

SEO:

Meta tags
Schema markup
Sitemap
Robots.txt

Deliverable: Professional marketing site ready for launch

#### Week 16: Beta Launch

**Prompt 16.1: Monitoring & Alerting Setup**
@Backend Agent @Architecture Agent
Set up production monitoring:
Services:

Application monitoring (Sentry):

Error tracking
Performance monitoring
Release tracking
User feedback


Infrastructure monitoring (DataDog or CloudWatch):

Server metrics (CPU, memory, disk)
Database performance
API latency
Cache hit rates


Uptime monitoring (Pingdom):

API endpoint checks
SSL certificate expiry
DNS checks


Log aggregation (Papertrail or CloudWatch Logs):

Centralized logging
Log search and filtering
Custom alerts



Alerts:

Critical (PagerDuty):

API error rate > 1%
Database connection failures
Disk space > 80%
Memory usage > 85%


Warning (Slack):

API latency p95 > 1s
Cache hit rate < 70%
Failed job queue > 100


Info (Email daily):

Daily usage summary
New user signups
Subscription changes



Dashboards:

Real-time health dashboard
Usage metrics dashboard
Performance dashboard
Business metrics dashboard

Deliverable: Complete monitoring with 24/7 alerting

**Prompt 16.2: Beta User Onboarding**
@Documentation Agent @Backend Agent @Frontend Agent
Prepare for beta user onboarding:
Beta program:

Application process:

Beta signup form
Company information
Use case description
Expected usage


Selection criteria:

Company size (50-500 employees)
Active hiring
Willing to give feedback
Target: 10-20 organizations


Onboarding:

Welcome email with setup guide
Kickoff call with product team
Dedicated Slack channel
Weekly check-ins


Support:

Priority support queue
Direct access to product team
Screen share sessions if needed
Bug bounty program


Feedback collection:

Weekly surveys
Feature request voting
Bug reporting
Usage data analysis



In-app:

Beta badge in UI
Quick feedback button
Feature flag controls for testing
Debug mode toggle

Deliverable: Beta program infrastructure

**Prompt 16.3: Rapid Iteration Process**
@Architecture Agent @Testing Agent
Establish rapid iteration workflow:
Development process:

Feature flags:

Toggle features per organization
A/B testing capability
Gradual rollout


CI/CD pipeline:

GitHub Actions
Automated tests on PR
Staging deployment on merge to main
Manual production deploy with approval


Release process:

Daily releases to staging
Weekly releases to production (beta)
Hotfix process for critical bugs


Monitoring deployment:

Error rates post-deploy
Performance regressions
Rollback capability


Feedback loop:

Daily standups with beta feedback review
Prioritize based on impact and effort
Weekly sprint planning
Ship fixes within 48 hours



Tools:

Feature flags: LaunchDarkly or PostHog
CI/CD: GitHub Actions
Deploy: Docker + AWS ECS
Rollback: Blue-green deployment

Deliverable: Efficient deployment pipeline for rapid iteration

**Prompt 16.4: Launch Readiness Checklist**
@Testing Agent @Documentation Agent @Architecture Agent
Final pre-launch checklist and verification:
Technical:

 All critical bugs fixed (P0, P1)
 Load testing passed (500 concurrent users)
 Security audit completed
 Encryption verified (at rest and in transit)
 Backups configured and tested
 Disaster recovery plan documented
 Monitoring and alerts active
 Error rates < 0.1%
 API latency p95 < 500ms

Features:

 Help system working end-to-end
 Visual overlays precise (<10px deviation)
 Roadmap generation functional
 Nudge system with Slack integration
 Admin dashboard complete
 Analytics accurate
 All integrations tested

Documentation:

 User guides complete
 API documentation published
 Video tutorials recorded
 FAQ comprehensive
 Support knowledge base ready

Legal & Compliance:

 Privacy policy published
 Terms of service published
 DPA template ready
 GDPR compliance verified
 Security whitepaper ready

Operations:

 Support system configured (Zendesk/Intercom)
 On-call rotation established
 Incident response playbook
 Status page set up (status.mitable.com)

Marketing:

 Website live
 Pricing page finalized
 Blog posts scheduled
 Product Hunt submission prepared
 Social media accounts active
 Email sequences configured

Beta:

 10+ organizations onboarded
 Feedback collection active
 Usage metrics tracked
 NPS survey sent
 Case studies in progress

Launch:

 Launch date selected
 Launch announcement drafted
 Press kit prepared
 Customer success team trained
 Go/no-go meeting scheduled

Deliverable: Verified launch-ready product

---

## Agent Coordination Patterns

### Pattern 1: Full-Stack Feature Implementation

For features spanning frontend and backend:

@Architecture Agent: Design data flow and API contract
@Database Agent: Create schema and migrations
@Backend Agent: Implement API endpoints and services
@Frontend Agent: Build UI components and integrate API
@Testing Agent: Write E2E tests for the flow
@Documentation Agent: Document the feature


### Pattern 2: AI Feature Development

For AI-powered features:

@AI Integration Agent: Design prompts and AI pipeline
@Backend Agent: Create service wrappers and API
@Database Agent: Set up vector storage if needed
@Frontend Agent: Build UI for AI interactions
@Testing Agent: Test AI accuracy and performance


### Pattern 3: Integration Development

For external service integrations:

@Integration Agent: Research API and design integration
@Backend Agent: Implement connector and webhooks
@Database Agent: Add necessary tables for sync
@Frontend Agent: Build configuration UI
@Documentation Agent: Write setup guide


### Pattern 4: Performance Optimization

When optimizing performance:

@Testing Agent: Profile and identify bottlenecks
@Database Agent: Optimize queries and indexes
@Backend Agent: Implement caching and optimize code
@Frontend Agent: Optimize rendering and bundle size
@Architecture Agent: Review architecture decisions


---

## Context Management Guidelines

### When Working with Agents

**Always provide these files in context when relevant:**

1. **Architecture Agent**:
   - `docs/Electron_Express_monorepo_UPDATED.md` (electron-vite architecture)
   - `REFACTOR_SUMMARY.md` (refactor details and fixes)
   - `electron.vite.config.ts`
   - `package.json` files
   - `tsconfig*.json` files

2. **Frontend Agent**:
   - UI/UX specifications from PRD
   - Design system specs
   - Component specifications
   - Existing component files

3. **Backend Agent**:
   - API specifications from PRD
   - Data models
   - Existing service files

4. **AI Integration Agent**:
   - AI processing pipeline specs from PRD
   - Prompt templates
   - Model specifications

5. **Database Agent**:
   - Database schema from PRD
   - Existing migration files
   - Query patterns

6. **Testing Agent**:
   - Feature specifications
   - Test coverage goals
   - Existing test files

### Managing Large Contexts

When context becomes too large:

1. **Split by subsystem**: Focus on one window or feature at a time
2. **Reference documentation**: Link to external docs rather than including full text
3. **Summarize PRD sections**: Extract only relevant specifications
4. **Iterate incrementally**: Build piece by piece, referring to previous work

### Token Budget Optimization

- Use concise but complete specifications
- Reference existing code by file path rather than including full contents
- Break large prompts into sequential steps
- Leverage agent memory from previous prompts in the same session

---

## Usage Instructions

1. **Start with Phase 1, Prompt 1.1** and work sequentially through the phases
2. **Provide relevant context files** from the repository for each prompt
3. **Review generated code** before moving to the next prompt
4. **Run tests** after each major component is implemented
5. **Commit frequently** with descriptive messages referencing the prompt number
6. **Adjust prompts** as needed based on your specific implementation details
7. **Document deviations** from the prompts in your commit messages

---

**Note**: These prompts are designed to be comprehensive starting points. Adapt them based on your specific requirements, tech stack variations, and implementation discoveries during development. The agents should be used collaboratively, with human oversight and decision-making throughout the process.
```
