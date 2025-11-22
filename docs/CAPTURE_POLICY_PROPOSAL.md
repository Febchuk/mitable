# Capture Policy - Team Discussion & Proposal

**Date:** Nov 13, 2025  
**Author:** Aurel  
**For Review By:** Febe, Mikun  
**Status:** Proposal - Needs Team Decision

---

## Problem Statement

Client requirement: **No PII in screenshots** (especially for workflow UI guidance).

However, screenshot capture in Mitable has **multiple use cases and entry points**, making a blanket solution complex:

### Current Capture Use Cases:

1. **Workflow UI Guidance** (Visual Guidance Agent)
   - User asks: "Help me create a Slack channel"
   - AI needs to see the screen to guide them
   - **Problem:** Client doesn't want AI seeing sensitive apps (Slack, email, banking)

2. **Bounding Box Feature** (Advanced)
   - Draws boxes around UI elements user should click
   - Requires full-screen capture for coordinate mapping

3. **General Chat** (Console Window)
   - Currently captures screenshot on EVERY message send (`captureScreenshot: true`)
   - No heuristics, no policy checks

4. **Conversation Window** (Pill)
   - Uses conditional capture with heuristics
   - Checks workflow state, message content

---

## Current Architecture (Why It's Complex)

### Screenshot Capture Entry Points:

```
📁 apps/electron/src/renderer/
├── console/src/components/views/employee/ChatsView/ChatDetail.tsx
│   └── Line 51: captureScreenshot: true  ❌ ALWAYS captures
│
├── console/src/hooks/queries/chats/useSendMessage.ts
│   └── Lines 54-75: Auto-capture if enabled
│
└── conversation/src/App.tsx
    ├── Lines 188-191: Conditional capture with heuristics
    └── Lines 463-478: Workflow action capture
```

### Capture Service:

```
📁 apps/electron/src/services/captureService.ts
├── captureVisibleWindows() - Multi-window capture for watch mode (policy aware)
├── normalizeWindowSourceId() - Maps desktopCapturer IDs to OS IDs
└── Temp file utilities (saveToTemp, cleanup, etc.)
```

**Key Issue:** No centralized "is this app allowed?" check anywhere.

---

## What We've Built (Stashed for Now)

### Completed Work:
```bash
git stash list
# "Capture policy work - defer for later"
```

**Contents:**
- ✅ `capturePolicy.ts` - Deny-first policy engine
  - Load deny-list from ENV (`CAPTURE_DENY_APPS=slack,outlook,1password`)
  - OS-agnostic matching (strips .exe, .app, .AppImage)
  - Checks app name AND window title
  
- ✅ `activeWindowBridge.ts` - IPC bridge using `active-win`
  - Gets focused window info from OS
  - Returns app name, window title, bounds

- ✅ Modified `captureService.ts`
  - Policy check BEFORE pixel capture
  - Returns structured error instead of null:
    ```typescript
    {
      success: false,
      error: "I'm not allowed to view Slack due to capture policy...",
      reason: "policy_blocked",
      blockedApp: "Slack"
    }
    ```

- ✅ Documentation (`CAPTURE_POLICY.md`, `.env.example`)

### What's NOT Done:
- ❌ Frontend error handling (show message to user)
- ❌ Disable full-screen → switch to window-specific only
- ❌ Fix `captureScreenshot: true` in ChatDetail (always capturing)
- ❌ Centralized capture decision logic
- ❌ Integration with Visual Guidance Agent

---

## Proposed Approach: Start with Workflow Only

### Phase 1: Workflow UI Guidance (Scoped Implementation)

**Goal:** Block screenshots of sensitive apps ONLY during workflow UI guidance.

**Scope:**
- ✅ Visual Guidance Agent workflows
- ✅ "Help me do X in Slack" → blocked gracefully
- ❌ NOT general chat (Console window)
- ❌ NOT bounding box feature
- ❌ NOT conversation window pill

**Implementation:**
1. Use stashed capture policy work as-is
2. Add policy check to workflow capture path only
3. Agent receives error → responds with text-based instructions:
   ```
   "I'm not allowed to view Slack due to your organization's capture policy.
   I can help you with text-based instructions instead."
   ```

**Changes Required:**
```typescript
// apps/backend/src/agents/visual-guidance.agent.ts
// When workflow needs screenshot:

if (captureResult && !captureResult.success) {
  // Policy blocked
  return `I understand you'd like help with ${captureResult.blockedApp}, 
          but I'm not allowed to view it. 
          I can provide text-based instructions instead.`;
}
```

**Minimal footprint:** Only touches workflow code, doesn't refactor entire capture system.

---

## Questions for Team

### For Febe & Mikun (Capture System Owners):

1. **Scope Agreement:**
   - Is workflow-only implementation acceptable for Phase 1?
   - Or do we need to solve for all capture use cases now?

2. **Architecture:**
   - Should we centralize all capture logic?
   - Or keep separate paths for different features?

3. **Full-Screen vs Window:**
   - Client concern: Full-screen captures entire display (leaks other windows)
   - Should we disable full-screen capture entirely?
   - Or only for workflow mode?

4. **Bounding Box Feature:**
   - This requires full-screen for coordinate mapping
   - How does this interact with capture policy?
   - Is this feature client-visible or internal-only?

5. **Console Chat Behavior:**
   - Currently: `captureScreenshot: true` on every message
   - This seems unintentional (from debug/testing?)
   - Should this be removed/fixed as part of this work?

---

## Recommendation

**Start small, iterate:**
1. ✅ **Phase 1:** Workflow UI guidance only (use stashed work)
2. ⏳ **Phase 2:** Audit all capture paths, decide architecture
3. ⏳ **Phase 3:** Implement policy across all features (if needed)

**Rationale:**
- Gets client requirement met for primary use case (workflow)
- Doesn't require refactoring entire capture system
- Lets Febe/Mikun (capture owners) design broader solution
- Aurel (me) stays in PII/RAG lane

---

## Stashed Work Location

```bash
# View stashed changes:
git stash list

# See what's in the stash:
git stash show stash@{0}

# Apply when ready:
git stash pop

# Files included:
# - apps/electron/src/services/capturePolicy.ts
# - apps/electron/src/main/activeWindowBridge.ts
# - apps/electron/src/services/captureService.ts (modified)
# - apps/electron/src/preload/conversation.ts (modified)
# - apps/electron/src/main.ts (modified)
# - docs/CAPTURE_POLICY.md
# - .env.example
```

---

## Next Steps

1. **Team Discussion:** Review this proposal, decide on scope
2. **Architecture Decision:** Febe/Mikun design capture system changes
3. **Implementation:** Use stashed work as starting point
4. **Testing:** Test with real sensitive apps (Slack, Outlook, etc.)

---

**Note:** This overlaps with Febe/Mikun's capture system work. Aurel (me) focused on PII redaction & RAG, so deferring capture architecture decisions to the experts.
