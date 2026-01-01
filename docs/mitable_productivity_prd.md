# Mitable: Desktop Productivity Tool

## 1. Executive Summary

**Vision**: "Your work, documented automatically. Never forget what you worked on, never start from scratch documenting a process."

**Product**: A desktop app that watches your screen during work sessions, generates session summaries, creates and updates documentation based on your activity, and builds a smart to-do list from detected unfinished work.

**Target User**: Individual contributors AND teams (developers, designers, writers, researchers)

**Platform**: Desktop only (Electron for macOS/Windows)

**Positioning**: "Granola for all desktop work" - not just meetings, but async work like coding, design, research, and writing.

**Team Focus**: Designed for team collaboration from day one - shared session updates, process docs library, team visibility.

---

## 2. Problem Statement

### Pain Points
1. **Manual work logging is tedious** - Standups, timesheets, and progress updates require manual recall
2. **Documentation is neglected** - "I'll document this later" never happens
3. **To-dos slip through cracks** - Tasks noticed during work get forgotten
4. **Context switching amnesia** - "What was I working on before lunch?"

### Current Solutions Fall Short
| Solution | Gap |
|----------|-----|
| Granola | Meeting-only, audio-focused |
| Loom | Active recording, not passive |
| Time Doctor | Surveillance-focused, for managers |
| RescueTime | Time tracking only, no content awareness |
| Manual notes | Requires discipline, interrupts flow |

---

## 3. Core Features

### 3.1 User-Initiated Sessions
- **Start session from WatchPill or Console**
- **Select which windows to watch** (multi-select)
- **Optional session goal/context** for better summaries
- **Pause/Resume** anytime via WatchPill
- **Privacy-first**: Configurable app blocklist, local-first storage option

### 3.2 Work Session Logs
- **AI-generated summaries**: "What did I work on?" in one sentence
- **Activity breakdown**: Time per app, meaningful actions vs. passive viewing
- **Searchable history**: Find past work by keyword, date, or app
- **Edit before sharing**: Review and refine summaries

**Example Output:**
```
Morning Session (9:15 AM - 12:30 PM)
- Worked on authentication refactor in VS Code (2h 15m)
- Reviewed 3 PRs on GitHub
- Researched JWT best practices (MDN, Stack Overflow)

Afternoon Session (1:45 PM - 5:00 PM)
- Fixed 2 bugs in user-service.ts
- Slack discussion with backend team about API design
- Updated Linear tickets for sprint planning
```

### 3.3 Session-Driven Documentation
- **Create docs from sessions**: Generate documentation based on what you worked on
- **Update existing docs**: Enrich or revise docs based on new session activity
- **Link sessions to docs**: Associate sessions with specific documentation
- **Visual enrichment**: Include relevant screenshots from session
- **Export formats**: Markdown, Notion, Confluence, PDF

**Use Cases:**
- Working on a feature? Session activity becomes feature documentation
- Debugging an issue? Session captures troubleshooting steps for the doc
- Learning a new tool? Session notes become a reference guide
- Code review? Session insights update the architecture doc

**Example - Creating a Doc:**
```markdown
# Authentication System

## Overview
Based on session from Dec 30, 2024 (2h 15m in VS Code)

## Key Components
- JWT token generation in `auth.service.ts`
- Middleware validation in `auth.middleware.ts`
- Refresh token handling

## Recent Changes
- Added token expiry validation
- Fixed edge case in refresh flow

[Screenshot: Token flow diagram from session]
```

**Example - Updating a Doc:**
```
Session detected work on: "Authentication System" doc
AI suggests updates:
- Add section on new refresh token endpoint
- Update diagram with new validation step
- Include troubleshooting notes from debugging session
```

### 3.4 Smart To-Do Detection
- **Screen content analysis**: Detect open Jira tickets, PR reviews pending, unanswered emails
- **Unfinished work detection**: Notice when you leave a task mid-way
- **Context-aware suggestions**: "You had this file open but didn't commit"
- **Standalone list**: Simple, fast to-do UI
- **Manual additions**: Quick capture for new tasks

**Detection Examples:**
- GitHub PR tab open for >5 min without action -> "Review PR #234"
- Code file with TODO comment visible -> "Fix: handle edge case in parser"
- Email draft saved but not sent -> "Send email to Sarah about launch date"
- Jira ticket opened then browser switched -> "Continue: LIN-341 JWT implementation"

### 3.5 Team Collaboration
- **Share session updates**: Post session summaries to team Slack/Teams channels
- **Team activity feed**: See what teammates worked on (with privacy controls)
- **Shared docs library**: Team-wide documentation built from sessions
- **Collaborative doc updates**: Multiple team members contribute to same docs
- **Work visibility**: Managers/leads can see high-level summaries (not screenshots)

**Example Team Flow:**
1. Developer starts session, selects windows to watch
2. Works normally, session captures activity
3. Stops session, AI generates summary
4. Reviews/edits summary in Console
5. Clicks "Share Update" -> posts to team Slack channel

---

## 4. User Experience

### 4.1 Two-Window Architecture

**WatchPill** (Floating, always-on-top)
- Shows current session status (recording, paused, duration)
- Quick actions: Pause/Resume, Stop Session
- Launch Console button
- Minimal footprint, always accessible

**Console Window** (Main hub - 3 tabs)
- **Sessions tab**: Session history, summaries, share updates
- **Docs tab**: Create docs from sessions, update existing docs
- **To-Do tab**: Smart to-do list with AI detection
- **Settings**: Privacy controls, window selection, capture preferences

### 4.2 Key Interactions

**Starting a Session**
1. User clicks "Start Session" in WatchPill or Console
2. Select which windows to watch (multi-select)
3. Optionally set session goal/context
4. Session begins capturing selected windows

**During Session**
1. WatchPill shows session timer and status
2. Pause/Resume anytime via WatchPill
3. Continue working normally

**Ending Session**
1. Click "Stop" in WatchPill
2. AI generates session summary
3. Review summary in Console -> Sessions tab
4. Edit, add notes, or share updates with team

**Creating/Updating Docs**
1. After a session, view suggested doc contributions
2. Create a new doc from session activity, OR
3. Update an existing doc with new insights from session
4. Review AI-suggested content
5. Edit, refine, export to Markdown/Notion

**Managing To-Dos**
1. AI-detected tasks appear in To-Do tab
2. Extracted from: TODO comments, open tickets, unfinished work
3. Mark complete, snooze, or dismiss
4. Add manual tasks via quick-add

---

## 5. Technical Approach

### 5.1 Existing Infrastructure (Reused)

| Component | Location | Purpose |
|-----------|----------|---------|
| Screenshot capture | `captureService.ts` | Multi-window capture with privacy filtering |
| Session management | `monitoringSessionService.ts` | Session lifecycle, pause/resume |
| Frame analysis | `frame-analysis.service.ts` | Delta detection, importance scoring |
| Delta detection | `deltaDetection.service.ts` | Change analysis between frames |
| Narrative generation | `master-story.service.ts` | Session summaries |
| Doc generation | `doc-generation.service.ts` | Process documentation |
| Privacy filtering | `capturePolicy.ts` | App blocklist, sensitive content |
| Slack integration | `slack.service.ts` | Share updates to channels |

### 5.2 New Components (To Build)

| Component | Purpose | Priority |
|-----------|---------|----------|
| To-do detection service | Extract actionable items from screens | P1 |
| To-do list UI | Standalone task management | P1 |
| To-do database schema | Store detected and manual tasks | P1 |

### 5.3 Architecture (Simplified)

**Console Tabs:**
- Sessions (existing MonitoringView)
- Docs (existing doc generation)
- To-Do (new)

**WatchPill:**
- Session control (existing Agent window)

---

## 6. Privacy & Security

### 6.1 Privacy Principles
1. **Local-first option**: All data can stay on device
2. **User controls everything**: Granular app/window blocking
3. **No surveillance**: Tool for self, not for managers
4. **Transparent capture**: Always know when capturing

### 6.2 Privacy Features

| Feature | Description |
|---------|-------------|
| App blocklist | Exclude banking, password managers, personal apps |
| Incognito mode | One-click pause all capture |
| Content redaction | Blur sensitive content before storage |
| Retention controls | Auto-delete after X days |
| Local encryption | All data encrypted at rest |
| No cloud required | Fully functional offline |

### 6.3 Default Blocked Apps
- Password managers (1Password, LastPass, Bitwarden)
- Banking apps
- Personal email (Gmail, Outlook personal)
- Messaging (Messages, WhatsApp)
- Healthcare apps

---

## 7. Success Metrics

### 7.1 Engagement
| Metric | Target |
|--------|--------|
| Daily Active Users | 60%+ of installs |
| Sessions per day | 2+ (morning + afternoon) |
| Summary views | 80%+ view daily summary |
| Retention (30-day) | 40%+ |

### 7.2 Value Delivery
| Metric | Target |
|--------|--------|
| Update prep time | <2 minutes |
| Docs created/updated | 2+ per user/month |
| To-do detection accuracy | 80%+ useful |
| User satisfaction | 4.2+/5.0 |

### 7.3 Technical
| Metric | Target |
|--------|--------|
| Capture latency | <100ms |
| AI processing | <5 seconds |
| Battery impact | <5% daily |
| Memory footprint | <200MB |

---

## 8. Competitive Positioning

| | Mitable | Granola | Loom | RescueTime |
|---|---------|---------|------|------------|
| **Focus** | All desktop work | Meetings | Recordings | Time tracking |
| **Capture** | User-initiated sessions | Meeting-triggered | Manual | Passive |
| **Output** | Logs + Docs + Tasks | Meeting notes | Videos | Reports |
| **AI** | Vision + NLP | Transcription | Clips | None |
| **Privacy** | Local-first | Cloud | Cloud | Cloud |
| **Target** | ICs + Teams | Anyone | Anyone | Managers |

**Unique Value**: Only tool that combines screen capture + AI understanding + actionable outputs (docs, tasks) for async work.

---

## 9. Pricing Model

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Individual use, 3 sessions/day, local storage only |
| **Pro** | $12/mo | Unlimited sessions, cloud sync, Slack/Notion export |
| **Enterprise** | Custom | Team workspaces, admin controls, SSO, on-premise option |

---

## 10. Implementation Phases

### Phase 1: Cleanup + Rebrand (Week 1)
- Remove onboarding-specific backend code (roadmaps, nudges, guides)
- Hide onboarding UI from Console navigation
- Update route registration
- Deliverable: Clean codebase without onboarding features

### Phase 2: Console Simplification (Week 2)
- Reorganize Console tabs: Sessions, Docs, To-Do
- Verify existing features work (sessions, doc generation)
- Test end-to-end flows
- Deliverable: Simplified 3-tab Console

### Phase 3: To-Do Feature (Weeks 3-4)
- Create to-do database schema
- Build to-do detection service
- Create To-Do tab UI
- Integrate detection into frame analysis
- Deliverable: AI-assisted to-do list

### Phase 4: Team Features + Polish (Weeks 5-8)
- Team workspace setup
- Team activity feed
- Shared docs library
- Pricing tier enforcement
- Deliverable: Production-ready v1.0

---

## 11. Open Questions

1. **Audio capture**: Add optional voice memos/transcription?
2. **Mobile companion**: View summaries on phone?
3. **Linear/Jira integration**: Auto-create tickets from detected to-dos?
4. **Browser extension**: Lighter-weight option for browser-only users?
