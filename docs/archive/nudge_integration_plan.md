# Nudge Integration Plan: Inline Expert Cards in Conversation Window

**Date**: 2025-10-30
**Status**: Planning
**Goal**: Remove external Nudge Window and display expert recommendations as inline cards in the Agent Conversation window

---

## Table of Contents

1. [Overview](#overview)
2. [Current Architecture](#current-architecture)
3. [Proposed Architecture](#proposed-architecture)
4. [Implementation Plan](#implementation-plan)
5. [Technical Specifications](#technical-specifications)
6. [User Flow](#user-flow)
7. [Migration Strategy](#migration-strategy)
8. [Testing Plan](#testing-plan)

---

## Overview

### Problem Statement

Currently, when users ask for expert help (e.g., "Who can help me with React?"), the system:

1. Shows expert recommendations in a **separate Nudge Window**
2. User clicks "Escalate" → Nudge Window calls IPC → Console opens with form
3. Requires managing an additional window (complexity, UX friction)

### Proposed Solution

Display expert recommendations **inline in the Conversation window** as message cards, similar to how workflow steps are displayed. Users can click "Nudge" directly from the conversation to open the Console with pre-filled nudge form.

### Benefits

- ✅ **Simpler Architecture**: One less window to manage
- ✅ **Better UX**: Experts visible in conversation history
- ✅ **Consistent Pattern**: Matches workflow card UI paradigm
- ✅ **Faster Workflow**: No intermediate window, direct to Console
- ✅ **Less Cognitive Load**: Everything in one place

---

## Current Architecture

### Data Flow (Current)

```
User: "Who can help with React?"
    ↓
ExpertMatchingAgent → FindExpertTool
    ↓ (generates experts + suggestedNudge)
Returns: { messageType: "experts", cardData: {...}, triggerWindow: {...} }
    ↓
Backend detects triggerWindow
    ↓
Sends IPC: NUDGE_SHOW to Main Process
    ↓
Main Process → Nudge Window (shows expert list)
    ↓
User clicks "Escalate"
    ↓
Nudge Window → IPC: NUDGE_CREATE_REQUEST
    ↓
Main Process → Console Window
    ↓
Console opens nudge creation form with pre-filled data
```

### Key Components (Current)

| Component           | Role                                               | Location                                           |
| ------------------- | -------------------------------------------------- | -------------------------------------------------- |
| ExpertMatchingAgent | Finds experts via FindExpertTool                   | `apps/backend/src/agents/expert-matching.agent.ts` |
| FindExpertTool      | Generates experts + suggestedNudge + triggerWindow | `apps/backend/src/tools/find-expert.tool.ts`       |
| Nudge Window        | Displays expert list, handles escalation           | `apps/electron/src/renderer/nudge/`                |
| Console Window      | Shows nudge creation form                          | `apps/electron/src/renderer/console/`              |

### Issues with Current Architecture

1. **Window Coordination Complexity**: Main process must manage 3 windows (Agent, Nudge, Console)
2. **State Management**: Expert data passed through multiple IPC hops
3. **UX Friction**: User sees experts in separate window, loses conversation context
4. **Data Flow Confusion**: `triggerWindow` gets lost in frontend type system
5. **Maintenance Burden**: Extra window to maintain, update, test

---

## Proposed Architecture

### Data Flow (Proposed)

```
User: "Who can help with React?"
    ↓
ExpertMatchingAgent → FindExpertTool
    ↓ (generates experts + suggestedNudge)
Returns: { messageType: "experts", cardData: { experts, suggestedNudge } }
    ↓
Backend streams to Agent Conversation Window
    ↓
Conversation renders <ExpertsCard> inline
    ↓
User clicks "Nudge Sarah Chen"
    ↓
Agent Window → IPC: OPEN_CONSOLE_NUDGE_FORM
    ↓
Main Process → Console Window
    ↓
Console opens nudge creation form with pre-filled data
```

### Key Components (Proposed)

| Component             | Role                                                  | Location                                                                |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| ExpertMatchingAgent   | Finds experts via FindExpertTool                      | `apps/backend/src/agents/expert-matching.agent.ts` (unchanged)          |
| FindExpertTool        | Generates experts + suggestedNudge (NO triggerWindow) | `apps/backend/src/tools/find-expert.tool.ts` (modified)                 |
| ExpertsCard Component | Displays expert list inline in conversation           | `apps/electron/src/renderer/agent/src/components/ExpertsCard.tsx` (NEW) |
| Agent Conversation    | Renders ExpertsCard based on messageType              | `apps/electron/src/renderer/agent/src/App.tsx` (modified)               |
| Console Window        | Shows nudge creation form                             | `apps/electron/src/renderer/console/` (unchanged)                       |

### Benefits of Proposed Architecture

1. **Fewer Windows**: Agent + Console (no Nudge Window)
2. **Simpler IPC**: One direct call from Agent → Main → Console
3. **Better Context**: Experts visible in conversation history
4. **Less Code**: Remove entire Nudge Window renderer + preload + IPC handlers
5. **Consistent UX**: Matches workflow card pattern

---

## Implementation Plan

### Phase 1: Backend Changes

**1.1 Update FindExpertTool** (`apps/backend/src/tools/find-expert.tool.ts`)

**Change**: Remove `triggerWindow` field from return

**Before**:

```typescript
return {
  messageType: "experts",
  content: responseText,
  cardData: { experts, suggestedNudge },
  streamable: true,
  triggerWindow: {
    // REMOVE THIS
    window: "nudge",
    data: { experts, query, suggestedNudge },
  },
};
```

**After**:

```typescript
return {
  messageType: "experts",
  content: responseText,
  cardData: { experts, suggestedNudge },
  streamable: true,
  // No triggerWindow - will render inline
};
```

**Rationale**: ExpertsMessage will render inline in conversation, no need to trigger external window.

---

### Phase 2: Frontend - Agent Window Changes

**2.1 Create ExpertsCard Component** (`apps/electron/src/renderer/agent/src/components/ExpertsCard.tsx`)

**Requirements**:

- Display list of 3-5 expert matches
- Show avatar, name, role, department, match score
- Show top 2 expertise topics
- "Nudge" button per expert
- Clicking "Nudge" calls IPC to open Console

**Component Structure**:

```typescript
interface ExpertsCardProps {
  experts: ExpertMatch[];
  suggestedNudge?: SuggestedNudge;
  conversationId: string;
}

export function ExpertsCard({ experts, suggestedNudge, conversationId }: ExpertsCardProps) {
  const handleNudge = (expert: ExpertMatch) => {
    window.agentAPI.openNudgeForm({
      expert: expert.expert,
      context: suggestedNudge?.context || "",
      question: suggestedNudge?.question || "",
      conversationId: conversationId,
    });
  };

  return (
    <div className="experts-card">
      <h3>Experts who can help:</h3>
      {experts.map(expert => (
        <div key={expert.expert.id} className="expert-item">
          <Avatar src={expert.expert.avatarUrl} name={expert.expert.name} />
          <div className="expert-info">
            <p className="name">{expert.expert.name}</p>
            <p className="role">{expert.expert.role} • {expert.expert.department}</p>
            <p className="expertise">{expert.expertise.topics.slice(0, 2).join(", ")}</p>
            <span className="match-score">{(expert.matchScore * 100).toFixed(0)}% match</span>
          </div>
          <button onClick={() => handleNudge(expert)}>Nudge</button>
        </div>
      ))}
    </div>
  );
}
```

**Styling Considerations**:

- Match existing message card styling
- Use existing avatar component if available
- Match score badge with color coding (green >80%, yellow >60%, gray <60%)
- Responsive layout

---

**2.2 Update Agent Conversation Rendering** (`apps/electron/src/renderer/agent/src/App.tsx`)

**Change**: Add case for rendering experts messages

**Location**: In message rendering logic (likely around line 200-300)

**Add**:

```typescript
// Import at top
import { ExpertsCard } from "./components/ExpertsCard";

// In message rendering:
{message.messageType === "experts" && message.cardData && (
  <ExpertsCard
    experts={message.cardData.experts}
    suggestedNudge={message.cardData.suggestedNudge}
    conversationId={conversationId}
  />
)}
```

**Verify**: Check if message rendering already handles workflow cards - use same pattern.

---

**2.3 Update Agent Preload** (`apps/electron/src/preload/agent.ts`)

**Change**: Add `openNudgeForm` method to exposed API

**Add**:

```typescript
contextBridge.exposeInMainWorld("agentAPI", {
  // ... existing methods

  openNudgeForm: (data: {
    expert: any;
    context: string;
    question: string;
    conversationId: string;
  }) => ipcRenderer.send(IPC_CHANNELS.OPEN_CONSOLE_NUDGE_FORM, data),
});
```

**TypeScript Declaration**:

```typescript
// In global.d.ts or inline
interface Window {
  agentAPI: {
    // ... existing
    openNudgeForm: (data: {
      expert: any;
      context: string;
      question: string;
      conversationId: string;
    }) => void;
  };
}
```

---

### Phase 3: IPC Layer Changes

**3.1 Add New IPC Channel** (`packages/shared/src/ipc.ts`)

**Add**:

```typescript
export const IPC_CHANNELS = {
  // ... existing channels

  // Nudge system (updated)
  OPEN_CONSOLE_NUDGE_FORM: "open-console-nudge-form", // NEW
  // Keep existing Console-related channels
};
```

---

**3.2 Add IPC Handler in Main Process** (`apps/electron/src/main.ts`)

**Add** (around line 750-800 where other nudge handlers are):

```typescript
// Handle nudge form opening from Agent conversation
ipcMain.on(IPC_CHANNELS.OPEN_CONSOLE_NUDGE_FORM, (_event, data) => {
  console.log("[Main] Opening Console nudge form with data:", data);

  if (consoleWindow && !consoleWindow.isDestroyed()) {
    // Show and focus console
    consoleWindow.show();
    consoleWindow.focus();

    // Send data to console via IPC
    consoleWindow.webContents.send(IPC_CHANNELS.NUDGE_OPEN_CREATOR, {
      expert: data.expert,
      context: data.context,
      question: data.question,
      conversationId: data.conversationId,
    });
  } else {
    console.error("[Main] Console window not available");
  }
});
```

**Note**: This reuses existing `NUDGE_OPEN_CREATOR` channel that Console already listens to.

---

### Phase 4: Console Window Changes

**4.1 Verify Console Integration** (`apps/electron/src/renderer/console/src/components/ConsoleLayout.tsx`)

**Check**: Console already listens for `NUDGE_OPEN_CREATOR` (implemented earlier)

**Expected Code** (around line 50-100):

```typescript
useEffect(() => {
  window.consoleAPI?.onNudgeOpenCreator?.((data: any) => {
    console.log("[Console] Nudge creator opened with data:", data);
    navigate("/nudges/create", { state: data });
  });
}, [navigate]);
```

**Action**: No changes needed if this exists. Verify it's working.

---

**4.2 Verify CreateNudge Pre-population** (`apps/electron/src/renderer/console/src/components/views/employee/NudgesView/CreateNudge.tsx`)

**Check**: Component already pre-fills from location.state (implemented earlier)

**Expected Code** (lines 41-76):

```typescript
useEffect(() => {
  if (location.state) {
    const { expert, context, question, conversationId } = location.state;
    setSelectedPeople([expert]);
    setContext(context);
    setQuestion(question);
    setConversationId(conversationId);
  }
}, [location.state]);
```

**Action**: No changes needed. Already implemented.

---

### Phase 5: Type System Updates

**5.1 Update Backend Types** (`apps/backend/src/tools/base.tool.ts`)

**Change**: ExpertsMessage should NOT have triggerWindow

**Before**:

```typescript
export interface ExpertsMessage extends BaseMessage {
  messageType: "experts";
  cardData: {
    experts: ExpertMatch[];
    suggestedNudge?: SuggestedNudge;
  };
}
```

**After**: (No change needed - already correct)

**Note**: `triggerWindow` is on `StreamChunk`, not `ExpertsMessage`. We'll just stop setting it in FindExpertTool.

---

**5.2 Update Agent Frontend Types**

**Add** (if not exists) to `apps/electron/src/renderer/agent/src/types.ts`:

```typescript
export interface ExpertMatch {
  expert: {
    id: string;
    userId: string;
    name: string;
    email: string;
    department: string;
    role: string;
    expertise: string[];
    avatarUrl?: string;
    responseRate: number;
    helpfulnessRating: number;
    availability: "available" | "away" | "busy" | "offline";
  };
  matchScore: number;
  expertise: {
    topics: string[];
  };
  performance: {
    responseRate: number;
    helpfulnessScore: number;
  };
}

export interface SuggestedNudge {
  context: string;
  question: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  messageType?: "text" | "workflow" | "experts";
  cardData?: {
    // For workflow messages
    solution?: string;
    stepList?: any[];
    workflowActive?: boolean;

    // For experts messages
    experts?: ExpertMatch[];
    suggestedNudge?: SuggestedNudge;
  };
  sources?: any[];
}
```

---

### Phase 6: Remove Nudge Window (Optional - Can be done later)

**6.1 Deprecate Nudge Window Files**

**Mark for future removal**:

- `apps/electron/src/renderer/nudge/` (entire directory)
- `apps/electron/src/preload/nudge.ts`
- NUDGE_SHOW, NUDGE_HIDE, NUDGE_RESIZE IPC handlers in main.ts

**Don't remove immediately** - keep for backward compatibility testing.

---

**6.2 Remove from Main Process** (`apps/electron/src/main.ts`)

**Future cleanup** (after Phase 1-5 verified working):

```typescript
// REMOVE: Nudge window creation
// let nudgeWindow: BrowserWindow | null = null;

// REMOVE: createNudgeWindow() function

// REMOVE: IPC handlers
// ipcMain.on(IPC_CHANNELS.NUDGE_SHOW, ...)
// ipcMain.on(IPC_CHANNELS.NUDGE_HIDE, ...)
// ipcMain.on(IPC_CHANNELS.NUDGE_RESIZE, ...)
```

**Keep**:

- `NUDGE_OPEN_CREATOR` handler (used by Console)
- `OPEN_CONSOLE_NUDGE_FORM` handler (new, used by Agent)

---

## Technical Specifications

### ExpertsCard Component Details

**File**: `apps/electron/src/renderer/agent/src/components/ExpertsCard.tsx`

**Props Interface**:

```typescript
interface ExpertsCardProps {
  experts: ExpertMatch[];
  suggestedNudge?: SuggestedNudge;
  conversationId: string;
}
```

**Layout**:

```
┌─────────────────────────────────────────────────┐
│ 💬 Experts who can help:                        │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │ [Avatar] Sarah Chen                    92%   │ │
│ │          Senior Engineer • Engineering       │ │
│ │          React, TypeScript               [Nudge] │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ [Avatar] John Doe                      85%   │ │
│ │          Tech Lead • Frontend                │ │
│ │          React Hooks, State Management   [Nudge] │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ [Avatar] Jane Smith                    78%   │ │
│ │          Developer • Engineering             │ │
│ │          Frontend, React             [Nudge] │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Styling Classes** (Tailwind CSS):

```tsx
<div className="bg-background-secondary rounded-lg p-4 space-y-3">
  <h3 className="text-text-primary font-semibold">💬 Experts who can help:</h3>

  {experts.map((expert) => (
    <div
      key={expert.expert.id}
      className="flex items-center gap-3 p-3 bg-background-elevated rounded-lg border border-border-subtle hover:border-border-primary transition-colors"
    >
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
        {expert.expert.name.charAt(0)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-text-primary font-medium truncate">{expert.expert.name}</p>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              expert.matchScore > 0.8
                ? "bg-green-500/20 text-green-500"
                : expert.matchScore > 0.6
                  ? "bg-yellow-500/20 text-yellow-500"
                  : "bg-gray-500/20 text-gray-500"
            }`}
          >
            {(expert.matchScore * 100).toFixed(0)}% match
          </span>
        </div>
        <p className="text-text-secondary text-sm truncate">
          {expert.expert.role} • {expert.expert.department}
        </p>
        <p className="text-text-tertiary text-xs truncate">
          {expert.expertise.topics.slice(0, 2).join(", ")}
        </p>
      </div>

      {/* Nudge Button */}
      <button
        onClick={() => handleNudge(expert)}
        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors shrink-0"
      >
        Nudge
      </button>
    </div>
  ))}
</div>
```

---

### IPC Data Structure

**From Agent → Main → Console**:

```typescript
interface NudgeFormData {
  expert: {
    id: string;
    name: string;
    email: string;
    role: string;
    department: string;
    expertise: string[];
  };
  context: string; // AI-generated, editable
  question: string; // AI-generated, editable
  conversationId: string; // For reference
}
```

**IPC Flow**:

```typescript
// Agent Window
window.agentAPI.openNudgeForm(data);
  ↓ IPC: OPEN_CONSOLE_NUDGE_FORM
// Main Process
ipcMain.on(OPEN_CONSOLE_NUDGE_FORM, (_event, data) => {
  consoleWindow.webContents.send(NUDGE_OPEN_CREATOR, data);
});
  ↓ IPC: NUDGE_OPEN_CREATOR
// Console Window
window.consoleAPI.onNudgeOpenCreator((data) => {
  navigate("/nudges/create", { state: data });
});
```

---

## User Flow

### Scenario 1: User Asks for Help

**Step 1**: User in Agent Conversation Window

```
User: "Who can help me understand React hooks?"
```

**Step 2**: Assistant responds with expert recommendations

```
Assistant: "I found 3 experts who can help with this..."

[Expert Card inline in conversation]
┌─────────────────────────────────────────┐
│ 💬 Experts who can help:                │
│                                          │
│ Sarah Chen - 92% match         [Nudge]  │
│ Senior Engineer • Engineering            │
│ React, TypeScript                        │
│                                          │
│ John Doe - 85% match           [Nudge]  │
│ Tech Lead • Frontend                     │
│ React Hooks, State Management            │
│                                          │
│ Jane Smith - 78% match         [Nudge]  │
│ Developer • Engineering                  │
│ Frontend, React                          │
└─────────────────────────────────────────┘
```

**Step 3**: User clicks "Nudge" on Sarah Chen

**Step 4**: Console window opens with pre-filled form

```
Console → Nudges → Create New Nudge

Selected People:
[x] Sarah Chen - Senior Engineer

Context: *
The user is trying to understand React hooks and needs
guidance on best practices. They're specifically interested
in useEffect and custom hooks patterns.
[Edit this text...]

Specific Question:
How can I optimize useEffect dependencies and avoid
infinite re-render loops?
[Edit this text...]

Resources (Optional)
[Attach files, links, screenshots...]

[Save as Draft]  [Send Nudge]
```

**Step 5**: User reviews, optionally edits, sends nudge

---

### Scenario 2: Manual Nudge Creation

**Same as before** - User can still navigate directly to Console → Nudges → Create without conversation context.

Fields will be empty and user fills manually.

---

## Migration Strategy

### Phase 1: Backend Changes (No Breaking Changes)

**Week 1, Days 1-2**

1. Update FindExpertTool - remove triggerWindow
2. Test expert matching still works
3. Verify experts message saves to database correctly

**Risk**: Low - No breaking changes, just removing unused field

**Rollback**: Revert FindExpertTool changes

---

### Phase 2: Agent Frontend Changes (Additive)

**Week 1, Days 3-5**

1. Create ExpertsCard component
2. Add rendering logic to Agent conversation
3. Add IPC method to preload
4. Test clicking "Nudge" button

**Risk**: Low - Additive changes, doesn't affect existing functionality

**Rollback**: Remove ExpertsCard import, remove messageType case

---

### Phase 3: IPC Handler (Additive)

**Week 2, Days 1-2**

1. Add OPEN_CONSOLE_NUDGE_FORM handler
2. Test end-to-end flow
3. Verify Console opens with pre-filled form

**Risk**: Low - New handler doesn't affect existing handlers

**Rollback**: Remove IPC handler

---

### Phase 4: Deprecate Nudge Window (After Verification)

**Week 2, Days 3-5**

1. Remove Nudge Window initialization from main.ts
2. Remove Nudge Window IPC handlers
3. Delete Nudge Window renderer files

**Risk**: Medium - Removes entire window

**Rollback**: Keep Nudge Window files in git history, restore if needed

---

## Testing Plan

### Unit Tests

**Agent - ExpertsCard Component**

- ✅ Renders expert list correctly
- ✅ Shows correct match scores
- ✅ Displays expertise topics
- ✅ "Nudge" button calls IPC correctly
- ✅ Handles missing suggestedNudge gracefully

**Console - CreateNudge Component**

- ✅ Pre-fills form from location.state
- ✅ Handles missing context/question
- ✅ Expert pre-selected correctly

---

### Integration Tests

**End-to-End Flow**

1. ✅ User asks for help in Agent
2. ✅ Expert recommendations appear inline
3. ✅ Clicking "Nudge" opens Console
4. ✅ Console form pre-filled correctly
5. ✅ User can edit and send nudge
6. ✅ Nudge created in database

**IPC Communication**

1. ✅ Agent → Main: OPEN_CONSOLE_NUDGE_FORM
2. ✅ Main → Console: NUDGE_OPEN_CREATOR
3. ✅ Data structure preserved across IPC hops

---

### Manual Testing Scenarios

**Scenario 1**: Expert Match Flow

```
Test: Ask "Who can help with billing?"
Expected: Experts shown inline, clicking Nudge opens Console
```

**Scenario 2**: Manual Nudge Creation

```
Test: Navigate directly to Console → Create Nudge
Expected: Form empty, user fills manually
```

**Scenario 3**: Conversation History

```
Test: Scroll up and see previous expert recommendations
Expected: Expert cards still visible and functional
```

**Scenario 4**: Multiple Experts

```
Test: Request help for broad topic (3-5 experts)
Expected: All experts shown, can nudge any of them
```

---

## Success Metrics

### Quantitative

- ✅ Reduce window count from 5 to 4 (20% reduction)
- ✅ Reduce IPC hops from 3 to 2 (33% reduction)
- ✅ Delete ~500 lines of Nudge Window code
- ✅ Time to nudge: <2 seconds (vs ~4 seconds with separate window)

### Qualitative

- ✅ Users report easier access to expert recommendations
- ✅ Conversation context preserved
- ✅ Consistent UI pattern with workflow cards
- ✅ Fewer support questions about "where did the experts go?"

---

## Risks & Mitigation

### Risk 1: Inline Cards Too Large

**Risk**: Expert cards take up too much conversation space

**Mitigation**:

- Collapsible card UI (expand/collapse)
- Limit to top 3 experts initially, "Show more" button
- Compact card design

---

### Risk 2: Lost Nudge Window Features

**Risk**: Nudge Window had features not in inline cards

**Mitigation**:

- Review Nudge Window functionality before removal
- Ensure ExpertsCard has feature parity
- Keep Nudge Window files in git history

---

### Risk 3: IPC Handler Conflicts

**Risk**: New OPEN_CONSOLE_NUDGE_FORM conflicts with existing handlers

**Mitigation**:

- Use unique channel name
- Test both manual and conversation-based nudge creation
- Ensure Console handler doesn't break

---

## Timeline

### Week 1

- **Days 1-2**: Backend changes (FindExpertTool)
- **Days 3-5**: Agent frontend (ExpertsCard component)

### Week 2

- **Days 1-2**: IPC handlers + integration testing
- **Days 3-5**: Deprecate Nudge Window + final testing

### Total: 2 weeks (10 working days)

---

## Open Questions

1. **Avatar Images**: Do we have avatar URLs for experts? Fallback to initials?
2. **Availability Status**: Show online/offline badge on experts?
3. **Match Score Threshold**: Hide experts below certain match score?
4. **Card Styling**: Match existing message card CSS or new design?
5. **Animation**: Slide-in animation for expert cards?
6. **Notification**: Toast/alert when nudge sent successfully?

---

## Appendix A: File Changes Summary

### Files to Modify

| File                                           | Changes                             | Lines Changed |
| ---------------------------------------------- | ----------------------------------- | ------------- |
| `apps/backend/src/tools/find-expert.tool.ts`   | Remove triggerWindow                | ~5 lines      |
| `apps/electron/src/renderer/agent/src/App.tsx` | Add ExpertsCard rendering           | ~10 lines     |
| `apps/electron/src/preload/agent.ts`           | Add openNudgeForm method            | ~8 lines      |
| `apps/electron/src/main.ts`                    | Add OPEN_CONSOLE_NUDGE_FORM handler | ~15 lines     |
| `packages/shared/src/ipc.ts`                   | Add IPC channel constant            | ~1 line       |

### Files to Create

| File                                                              | Purpose                | Est. Lines |
| ----------------------------------------------------------------- | ---------------------- | ---------- |
| `apps/electron/src/renderer/agent/src/components/ExpertsCard.tsx` | Display experts inline | ~150 lines |
| `apps/electron/src/renderer/agent/src/types.ts`                   | Type definitions       | ~50 lines  |

### Files to Delete (Later)

| File                                 | Purpose          | Lines      |
| ------------------------------------ | ---------------- | ---------- |
| `apps/electron/src/renderer/nudge/`  | Entire directory | ~500 lines |
| `apps/electron/src/preload/nudge.ts` | Nudge preload    | ~40 lines  |

---

## Appendix B: CSS Color Scheme

```css
/* Match Score Colors */
.match-high {
  /* >80% */
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}
.match-medium {
  /* >60% */
  background: rgba(234, 179, 8, 0.2);
  color: #eab308;
}
.match-low {
  /* <60% */
  background: rgba(107, 114, 128, 0.2);
  color: #6b7280;
}

/* Availability Colors */
.available {
  color: #22c55e;
} /* green */
.away {
  color: #eab308;
} /* yellow */
.busy {
  color: #ef4444;
} /* red */
.offline {
  color: #6b7280;
} /* gray */
```

---

## Appendix C: Alternative Designs Considered

### Design 1: Slide-in Panel (Rejected)

**Pros**: More space, can show detailed info
**Cons**: Complex animation, still separate from conversation

### Design 2: Modal Overlay (Rejected)

**Pros**: Focus on experts, blocking UI
**Cons**: Modal fatigue, extra click to dismiss

### Design 3: Inline Cards (Chosen)

**Pros**: Simple, consistent, conversation context preserved
**Cons**: Takes up vertical space

---

## References

- [Multi-Agent Architecture Doc](./multi_agent_architecture.md)
- [Electron 5-Window Architecture](./Electron_Express_monorepo_UPDATED.md)
- [Complete PRD](./mitable_complete_prd.md)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-30
**Author**: AI Assistant
**Status**: Ready for Review
