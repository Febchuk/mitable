# Overlay Window Debugging - Executive Summary

## Current Status

**Problem**: Overlay window not showing despite complete backend data flow.

**Breaking Point**: Frontend SSE parsing (Step 5 in data flow)

**Evidence**:

- ✅ Backend logs show `window_trigger` event being emitted
- ❌ Frontend logs show NO parsing or handling of the event

## Files to Review

1. **Debugging Plan** (comprehensive): `/Users/febechukwuma/Documents/mitable/temp/overlay_debugging_plan.md`
2. **Flow Diagram** (visual): `/Users/febechukwuma/Documents/mitable/temp/overlay_flow_diagram.txt`
3. **Run Logs** (evidence): `/Users/febechukwuma/Documents/mitable/temp/run_logs.txt`

## Quick Start: Priority Actions

### 1. Add Phase 1 Logs (Highest Priority)

**File**: `apps/electron/src/renderer/lib/api/conversations.ts`

Add logs at these locations:

- Line ~241: Log every SSE line received
- Line ~252: Log chunk type after JSON.parse
- Line ~283: Log when window_trigger case fires
- Line ~300: Add default case to log unknown types

### 2. Test Reproduction

```bash
# Restart dev environment
npm run dev

# In app:
1. Open Spotify application
2. Ask: "How do I open my liked songs playlist in spotify"
3. Click "Move on to next step" twice (triggers bounding box)
```

### 3. Analyze Logs

Look for the FIRST missing log in this sequence:

```
[Conversations] Emitting window_trigger event ← Should see this
[API] SSE line received                      ← Looking for this
[API] Parsed chunk type                      ← Looking for this
[API] Received window_trigger event          ← Looking for this
```

## Root Cause Hypotheses (in order of likelihood)

1. **SSE Event Not Parsed** - Frontend switch case not matching `chunk.type === "window_trigger"`
2. **SSE Event Not Received** - Network issue or event sent after stream closes
3. **Callback Not Registered** - `onWindowTrigger` callback not set correctly
4. **IPC Channel Mismatch** - Channel name typo preventing IPC communication

## Expected Data at Each Step

### Backend Emission (Working ✅)

```typescript
{
  type: "window_trigger",
  windowTrigger: {
    window: "overlay",
    data: {
      boundingBox: { x: 0.307, y: 0.593, width: 0.398, height: 0.045 },
      label: "Move on to next step",
      instruction: "Great, you're already logged in...",
      elementType: "button"
    }
  }
}
```

### Frontend Parsing (Broken ❌)

Should parse to:

```typescript
chunk = {
  type: "window_trigger",  // This should match switch case
  windowTrigger: { ... }    // This should exist
}
```

Then call:

```typescript
callbacks.onWindowTrigger("overlay", {
  boundingBox: { ... },
  label: "Move on to next step",
  instruction: "...",
  elementType: "button"
})
```

## Success Criteria

When fixed, you should see this complete log sequence:

```
[Conversations] Emitting window_trigger event: { window: 'overlay' }
[API] SSE line received: data: {"type":"window_trigger",...}
[API] Parsed chunk type: window_trigger
[API] Received window_trigger event
[ChatDetail] Window trigger callback FIRED
[ChatDetail] Calling showOverlay
[Preload] showOverlay() called
[Preload] Sending IPC to main process
[Main] OVERLAY_SHOW received
[Main] Overlay window shown
[Overlay Preload] Received overlay-data
[Overlay] Received bounding box data
[Overlay] State updated with bounding box data
```

## Next Steps

1. Read the full debugging plan: `temp/overlay_debugging_plan.md`
2. Add Phase 1 logs (SSE parsing)
3. Restart dev environment
4. Reproduce issue
5. Analyze logs to identify exact breaking point
6. Apply fixes based on breaking point
7. Add remaining logs (Phases 2-5) for verification

## Key Insights from Log Analysis

### What Works (✅)

- Backend tool creates window trigger correctly (Line 787-790)
- Backend agent service yields window_trigger event (not logged but inferred)
- Backend route emits SSE event correctly (Line 798)
- Screenshot capture working correctly
- Workflow state management working correctly

### What's Missing (❌)

- No frontend SSE parsing logs
- No frontend callback invocation logs
- No IPC send logs
- No main process IPC receive logs
- No overlay window logs

### Critical Finding

The complete absence of frontend logs suggests the issue is in the FIRST step of frontend processing (SSE parsing), not in later steps like IPC or window management.

## Files Modified (After Applying All Logs)

1. `apps/electron/src/renderer/lib/api/conversations.ts` (Phase 1)
2. `apps/electron/src/renderer/console/src/components/views/employee/ChatsView/ChatDetail.tsx` (Phase 2)
3. `apps/electron/src/preload/console.ts` (Phase 3)
4. `apps/electron/src/main.ts` (Phase 4)
5. `apps/electron/src/preload/overlay.ts` (Phase 5)
6. `apps/electron/src/renderer/overlay/src/App.tsx` (Phase 5)

---

**Report Generated**: 2025-11-08  
**Analysis Based On**: run_logs.txt (973 lines analyzed)  
**Confidence Level**: High (clear evidence of breaking point)
