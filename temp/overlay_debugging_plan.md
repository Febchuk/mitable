# Overlay Window Debugging Plan
**Date**: 2025-11-08  
**Issue**: Overlay window not showing despite complete data flow

---

## Executive Summary

### Current State Analysis
Based on log analysis from `/Users/febechukwuma/Documents/mitable/temp/run_logs.txt`:

**✅ WORKING - Backend generates and emits data correctly:**
- Line 787-790: `[GuideNextStepTool]` creates window trigger with bounding box
- Line 798: `[Conversations] Emitting window_trigger event: { window: 'overlay', hasData: true }`

**❌ MISSING - No frontend/IPC logs after backend emission:**
- ❌ No `[API] Received window_trigger event` log
- ❌ No `[ChatDetail] Window trigger received` log  
- ❌ No `[Preload] showOverlay() called` log
- ❌ No `[Main] OVERLAY_SHOW received` log
- ❌ No `[Overlay Preload]` or `[Overlay]` logs

### Breaking Point
**The flow stops at backend SSE emission.** The frontend SSE parser is NOT receiving or NOT parsing the `window_trigger` event.

---

## Complete Data Flow Trace

### Expected Flow

```
[1] Backend Tool (guide-next-step.tool.ts:237)
    ↓ triggerWindow: { window: "overlay", data: {...} }

[2] Agent Service (agent.service.ts:648-658)
    ↓ yield { type: "window_trigger", windowTrigger: {...} }

[3] Backend Route (conversations.ts:942-953)
    ↓ res.write(`data: ${JSON.stringify(windowTriggerEvent)}\n\n`)
    ✅ LOG: "[Conversations] Emitting window_trigger event"

[4] Frontend API (conversations.ts:282-289)
    ↓ Parse SSE "data: {...}"
    ❌ MISSING LOG: "[API] Received window_trigger event"

[5] Frontend Callback (conversations.ts:287)
    ↓ callbacks.onWindowTrigger?.(window, data)
    ❌ MISSING LOG

[6] ChatDetail Component (ChatDetail.tsx:37-42)
    ↓ onWindowTrigger: (windowType, data) => {...}
    ❌ MISSING LOG: "[ChatDetail] Window trigger received"

[7] Preload Console (console.ts:80-83)
    ↓ showOverlay: (data) => ipcRenderer.send(OVERLAY_SHOW, data)
    ❌ MISSING LOG: "[Preload] showOverlay() called"

[8] Main Process (main.ts:593-607)
    ↓ ipcMain.on(OVERLAY_SHOW, ...)
    ❌ MISSING LOG: "[Main] OVERLAY_SHOW received"

[9] Overlay Preload (overlay.ts:18-23)
    ↓ onOverlayData: (callback) => ipcRenderer.on("overlay-data", ...)
    ❌ MISSING LOG: "[Overlay Preload] Received overlay-data"

[10] Overlay App (App.tsx:96-108)
     ↓ setBoundingBoxData(data)
     ❌ MISSING LOG: "[Overlay] Received bounding box data"
```

---

## Logs We SEE (from run_logs.txt)

### Backend - Tool Generation
```
Line 787-790: [GuideNextStepTool] Window trigger: {
  hasWindowTrigger: true,
  hasBoundingBox: true,
  boundingBox: { x: 0.307, y: 0.593, width: 0.398, height: 0.045 }
}
```

### Backend - SSE Emission
```
Line 792-796: [Conversations] Streaming chunk sent: {
  type: 'complete',
  hasContent: true,
  hasWindowTrigger: true,
  windowType: 'overlay'
}

Line 798: [Conversations] Emitting window_trigger event: { 
  window: 'overlay', 
  hasData: true 
}
```

---

## Logs We DON'T SEE (Missing)

### Frontend - SSE Parsing (Step 4)
**File**: `/Users/febechukwuma/Documents/mitable/apps/electron/src/renderer/lib/api/conversations.ts:282-289`

**Expected logs (MISSING)**:
```
[API] Received window_trigger event: { ... }
[API] Stored windowTriggerData: { ... }
```

### Frontend - Callback Invocation (Step 6)
**File**: `/Users/febechukwuma/Documents/mitable/apps/electron/src/renderer/console/src/components/views/employee/ChatsView/ChatDetail.tsx:37-42`

**Expected log (MISSING)**:
```
[ChatDetail] Window trigger received: { windowType: 'overlay', data: {...} }
```

### Preload - IPC Send (Step 7)
**File**: `/Users/febechukwuma/Documents/mitable/apps/electron/src/preload/console.ts:80-83`

**Expected log (MISSING)**:
```
[Preload] showOverlay() called with data: { ... }
```

### Main Process - IPC Receive (Step 8)
**File**: `/Users/febechukwuma/Documents/mitable/apps/electron/src/main.ts:593-607`

**Expected log (MISSING)**:
```
[Main] OVERLAY_SHOW received with data: { ... }
[Main] Overlay window shown with bounding box data
```

### Overlay - Data Receive (Steps 9-10)
**Files**: 
- `/Users/febechukwuma/Documents/mitable/apps/electron/src/preload/overlay.ts:18-23`
- `/Users/febechukwuma/Documents/mitable/apps/electron/src/renderer/overlay/src/App.tsx:96-108`

**Expected logs (MISSING)**:
```
[Overlay Preload] Received overlay-data: { ... }
[Overlay] Received bounding box data: { ... }
```

---

## Root Cause Analysis

### Hypothesis: SSE Parsing Issue in Frontend

The `window_trigger` event is being emitted by backend but NOT parsed by frontend SSE reader.

**Possible causes**:

1. **SSE Format Issue**: Backend emits TWO events (complete + window_trigger), but frontend only processes the first?
2. **Event Order Issue**: `window_trigger` sent AFTER `done` event?
3. **Conditional Logic Issue**: `onWindowTrigger` callback not set or not firing?
4. **Type Mismatch**: `chunk.type === "window_trigger"` not matching?

### Evidence Supporting Hypothesis

**Backend code (conversations.ts:942-953)**:
```typescript
// Emit separate window_trigger event if windowTrigger is embedded in complete chunk
if (chunk.type === "complete" && (chunk as any).windowTrigger) {
  const windowTriggerEvent = {
    type: "window_trigger",
    windowTrigger: (chunk as any).windowTrigger,
  };

  console.log("[Conversations] Emitting window_trigger event:", {
    window: (chunk as any).windowTrigger.window,
    hasData: !!(chunk as any).windowTrigger.data,
  });

  res.write(`data: ${JSON.stringify(windowTriggerEvent)}\n\n`);
}
```

**Frontend code (conversations.ts:254-289)**:
```typescript
switch (chunk.type) {
  case "chunk":
    // ... chunk handling
    break;

  case "complete":
    // ... complete handling
    break;

  case "window_trigger":
    console.log("[API] Received window_trigger event:", chunk.windowTrigger);
    if (chunk.windowTrigger) {
      windowTriggerData = chunk.windowTrigger;
      console.log("[API] Stored windowTriggerData:", windowTriggerData);
      callbacks.onWindowTrigger?.(chunk.windowTrigger.window, chunk.windowTrigger.data);
    }
    break;

  // ... other cases
}
```

**This log should fire if the event is parsed**: `[API] Received window_trigger event`  
**It does NOT appear in logs** → Event is NOT being parsed.

---

## Debugging Plan: Strategic Log Additions

### Phase 1: Confirm SSE Reception (Frontend API Layer)

**File**: `/Users/febechukwuma/Documents/mitable/apps/electron/src/renderer/lib/api/conversations.ts`

#### 1.1 Log ALL SSE Lines (Before Parsing)
**Location**: Line ~241 (inside `for (const line of lines)` loop)

**Add**:
```typescript
for (const line of lines) {
  console.log("[API] SSE line received:", line.substring(0, 100)); // First 100 chars

  // Skip empty lines and ping messages
  if (!line.trim() || line.startsWith(":")) {
    console.log("[API] Skipping empty/ping line");
    continue;
  }

  // ... rest of parsing
}
```

#### 1.2 Log Chunk Type BEFORE Switch
**Location**: Line ~252 (right after JSON.parse)

**Add**:
```typescript
try {
  const chunk: StreamChunk = JSON.parse(data);
  console.log("[API] Parsed chunk type:", chunk.type, "keys:", Object.keys(chunk));

  switch (chunk.type) {
    // ... existing cases
  }
} catch (error) {
  console.error("[API] JSON parse failed:", error, "data:", data);
}
```

#### 1.3 Log Switch Default Case
**Location**: Line ~300 (add default case to switch)

**Add**:
```typescript
switch (chunk.type) {
  case "chunk":
    // ...
    break;

  case "complete":
    // ...
    break;

  case "window_trigger":
    // ...
    break;

  case "done":
    // ...
    break;

  case "error":
    // ...
    break;

  default:
    console.warn("[API] Unknown chunk type:", chunk.type, "full chunk:", chunk);
    break;
}
```

### Phase 2: Confirm Callback Registration (ChatDetail)

**File**: `/Users/febechukwuma/Documents/mitable/apps/electron/src/renderer/console/src/components/views/employee/ChatsView/ChatDetail.tsx`

#### 2.1 Log Callback Registration
**Location**: Line ~37 (inside onWindowTrigger callback)

**Add**:
```typescript
onWindowTrigger: (windowType: string, data: any) => {
  console.log("[ChatDetail] Window trigger callback FIRED:", { 
    windowType, 
    hasData: !!data,
    dataKeys: data ? Object.keys(data) : [],
    hasConsoleAPI: !!window.consoleAPI,
    hasShowOverlay: !!window.consoleAPI?.showOverlay
  });

  if (windowType === "overlay") {
    console.log("[ChatDetail] Calling showOverlay with data:", data);
    window.consoleAPI?.showOverlay?.(data);
  }
},
```

#### 2.2 Log Mutation Setup
**Location**: Line ~23 (right after useSendMessage hook)

**Add**:
```typescript
const sendMessageMutation = useSendMessage({
  onChunk: (chunk: string) => {
    setStreamingContent((prev) => prev + chunk);
  },
  onComplete: (_fullContent: string) => {
    setStreamingContent("");
    setIsStreaming(false);
  },
  onError: (error: string) => {
    console.error("[ChatDetail] Streaming error:", error);
    setStreamingContent("");
    setIsStreaming(false);
  },
  onWindowTrigger: (windowType: string, data: any) => {
    // ... existing code
  },
  captureScreenshot: true,
});

console.log("[ChatDetail] useSendMessage configured with callbacks:", {
  hasOnChunk: !!sendMessageMutation,
  hasOnWindowTrigger: true,
});
```

### Phase 3: Confirm IPC Send (Console Preload)

**File**: `/Users/febechukwuma/Documents/mitable/apps/electron/src/preload/console.ts`

#### 3.1 Enhanced Logging in showOverlay
**Location**: Line ~80-83

**Replace**:
```typescript
// Overlay management
showOverlay: (data: unknown) => {
  console.log("[Preload] showOverlay() called with data:", {
    hasData: !!data,
    dataType: typeof data,
    dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
    rawData: data
  });
  
  console.log("[Preload] Sending IPC to main process:", IPC_CHANNELS.OVERLAY_SHOW);
  ipcRenderer.send(IPC_CHANNELS.OVERLAY_SHOW, data);
  console.log("[Preload] IPC sent successfully");
},
```

### Phase 4: Confirm IPC Receive (Main Process)

**File**: `/Users/febechukwuma/Documents/mitable/apps/electron/src/main.ts`

#### 4.1 Enhanced Logging in OVERLAY_SHOW Handler
**Location**: Line ~593-607

**Replace**:
```typescript
ipcMain.on(IPC_CHANNELS.OVERLAY_SHOW, (_event, data) => {
  console.log("[Main] OVERLAY_SHOW received:", {
    hasData: !!data,
    dataType: typeof data,
    dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
    rawData: data
  });

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    console.error("[Main] Overlay window not available:", {
      exists: !!overlayWindow,
      isDestroyed: overlayWindow?.isDestroyed()
    });
    return;
  }

  console.log("[Main] Overlay window exists, sending overlay-data to renderer");

  // Send data to overlay window
  overlayWindow.webContents.send("overlay-data", data);
  console.log("[Main] overlay-data IPC sent to overlay renderer");

  // Show overlay window
  console.log("[Main] Showing overlay window");
  overlayWindow.show();
  overlayWindow.focus();

  console.log("[Main] Overlay window shown with bounding box data");
});
```

### Phase 5: Confirm Overlay Reception (Overlay Preload + App)

**File**: `/Users/febechukwuma/Documents/mitable/apps/electron/src/preload/overlay.ts`

#### 5.1 Enhanced Logging in onOverlayData
**Location**: Line ~18-23

**Replace**:
```typescript
onOverlayData: (callback: (data: unknown) => void) => {
  console.log("[Overlay Preload] Setting up onOverlayData listener");
  
  ipcRenderer.on("overlay-data", (_event: IpcRendererEvent, data: unknown) => {
    console.log("[Overlay Preload] Received overlay-data IPC:", {
      hasData: !!data,
      dataType: typeof data,
      dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
      rawData: data
    });
    
    console.log("[Overlay Preload] Calling callback with data");
    callback(data);
    console.log("[Overlay Preload] Callback invoked successfully");
  });
  
  console.log("[Overlay Preload] onOverlayData listener registered");
},
```

**File**: `/Users/febechukwuma/Documents/mitable/apps/electron/src/renderer/overlay/src/App.tsx`

#### 5.2 Enhanced Logging in App.tsx
**Location**: Line ~94-108

**Replace**:
```typescript
// Listen for overlay data (bounding boxes from workflow)
useEffect(() => {
  console.log("[Overlay] Setting up onOverlayData listener in App.tsx");
  
  const handleOverlayData = (data: BoundingBoxData) => {
    console.log("[Overlay] handleOverlayData FIRED:", {
      hasData: !!data,
      hasBoundingBox: !!data?.boundingBox,
      boundingBox: data?.boundingBox,
      label: data?.label,
      instruction: data?.instruction,
      elementType: data?.elementType,
    });
    
    console.log("[Overlay] Setting bounding box data in state");
    setBoundingBoxData(data);
    setGuideData(null); // Clear guide data when bounding box is received
    console.log("[Overlay] State updated with bounding box data");
  };

  if (window.overlayAPI?.onOverlayData) {
    console.log("[Overlay] overlayAPI.onOverlayData exists, registering callback");
    window.overlayAPI.onOverlayData(handleOverlayData);
    console.log("[Overlay] Callback registered successfully");
  } else {
    console.error("[Overlay] overlayAPI.onOverlayData NOT FOUND");
  }
}, []);

console.log("[Overlay] App.tsx render:", {
  hasBoundingBoxData: !!boundingBoxData,
  hasGuideData: !!guideData,
  boundingBoxData: boundingBoxData,
});
```

---

## Expected Data Structures at Each Step

### Step 1: Backend Tool Return
```typescript
{
  messageType: "workflow",
  content: "Great, you're already logged in! Now, click the 'Move on to next step' button...",
  cardData: { ... },
  triggerWindow: {
    window: "overlay",
    data: {
      boundingBox: { x: 0.307, y: 0.593, width: 0.398, height: 0.045 },
      label: "Move on to next step",
      instruction: "Great, you're already logged in! Now, click...",
      elementType: "button"
    }
  },
  streamable: true
}
```

### Step 2: Agent Service Yield
```typescript
{
  type: "window_trigger",
  windowTrigger: {
    window: "overlay",
    data: {
      boundingBox: { x: 0.307, y: 0.593, width: 0.398, height: 0.045 },
      label: "Move on to next step",
      instruction: "Great, you're already logged in! Now, click...",
      elementType: "button"
    }
  }
}
```

### Step 3: Backend SSE Emission
```
data: {"type":"window_trigger","windowTrigger":{"window":"overlay","data":{...}}}

```

### Step 4: Frontend SSE Parse
```typescript
chunk = {
  type: "window_trigger",
  windowTrigger: {
    window: "overlay",
    data: { ... }
  }
}
```

### Step 5: Frontend Callback
```typescript
callbacks.onWindowTrigger("overlay", {
  boundingBox: { x: 0.307, y: 0.593, width: 0.398, height: 0.045 },
  label: "Move on to next step",
  instruction: "Great, you're already logged in! Now, click...",
  elementType: "button"
})
```

### Step 6: ChatDetail Handler
```typescript
onWindowTrigger: (windowType: "overlay", data: {
  boundingBox: { x: 0.307, y: 0.593, width: 0.398, height: 0.045 },
  label: "Move on to next step",
  instruction: "Great, you're already logged in! Now, click...",
  elementType: "button"
})
```

### Step 7: Preload IPC Send
```typescript
ipcRenderer.send("overlay-show", {
  boundingBox: { x: 0.307, y: 0.593, width: 0.398, height: 0.045 },
  label: "Move on to next step",
  instruction: "Great, you're already logged in! Now, click...",
  elementType: "button"
})
```

### Step 8: Main Process IPC Receive
```typescript
_event: IpcMainEvent
data: {
  boundingBox: { x: 0.307, y: 0.593, width: 0.398, height: 0.045 },
  label: "Move on to next step",
  instruction: "Great, you're already logged in! Now, click...",
  elementType: "button"
}
```

### Step 9: Overlay Preload Receive
```typescript
_event: IpcRendererEvent
data: {
  boundingBox: { x: 0.307, y: 0.593, width: 0.398, height: 0.045 },
  label: "Move on to next step",
  instruction: "Great, you're already logged in! Now, click...",
  elementType: "button"
}
```

### Step 10: Overlay App Render
```typescript
boundingBoxData: BoundingBoxData = {
  boundingBox: { x: 0.307, y: 0.593, width: 0.398, height: 0.045 },
  label: "Move on to next step",
  instruction: "Great, you're already logged in! Now, click...",
  elementType: "button"
}
```

---

## Testing Protocol

### 1. Apply All Logs (Phases 1-5)
Add all strategic logs listed above to the codebase.

### 2. Restart Dev Environment
```bash
npm run dev
```

### 3. Reproduce Issue
- Open Spotify application
- Ask: "How do I open my liked songs playlist in spotify"
- Click "Move on to next step" (workflow progression button)
- Click "Move on to next step" again (this triggers bounding box)

### 4. Analyze Logs
Check which logs appear and at what point the flow stops.

### 5. Identify Breaking Point
The FIRST missing log indicates where the flow breaks.

---

## Possible Outcomes & Next Steps

### Outcome 1: SSE Line NOT Received
**Symptom**: `[API] SSE line received` does NOT show `window_trigger` event

**Root Cause**: Backend not sending event correctly OR network issue

**Next Steps**:
- Check backend network response (browser DevTools → Network → SSE stream)
- Verify SSE format (should be `data: {...}\n\n`)
- Check if event sent AFTER stream ends

### Outcome 2: SSE Line Received, Parse Fails
**Symptom**: `[API] SSE line received` shows event, but `[API] Parsed chunk type` does NOT

**Root Cause**: JSON parse error

**Next Steps**:
- Check JSON format in SSE line
- Check for escaped characters or invalid JSON

### Outcome 3: Parse Works, Switch Case Fails
**Symptom**: `[API] Parsed chunk type` shows `window_trigger`, but callback NOT fired

**Root Cause**: Switch case not matching OR callback not registered

**Next Steps**:
- Verify `chunk.type === "window_trigger"` (exact string match)
- Verify `chunk.windowTrigger` exists
- Check if `callbacks.onWindowTrigger` is defined

### Outcome 4: Callback Fires, IPC Not Sent
**Symptom**: `[ChatDetail] Window trigger callback FIRED` shows, but `[Preload] showOverlay()` does NOT

**Root Cause**: `window.consoleAPI?.showOverlay` not available

**Next Steps**:
- Check preload script loaded correctly
- Verify `contextBridge.exposeInMainWorld` ran
- Check browser console for errors

### Outcome 5: IPC Sent, Main Not Receiving
**Symptom**: `[Preload] IPC sent successfully` shows, but `[Main] OVERLAY_SHOW received` does NOT

**Root Cause**: IPC channel mismatch OR main handler not registered

**Next Steps**:
- Verify IPC channel name matches exactly (`overlay-show`)
- Check if `ipcMain.on(OVERLAY_SHOW)` handler registered before window creation
- Check for typos in IPC_CHANNELS constant

### Outcome 6: Main Receives, Overlay Not Showing
**Symptom**: `[Main] Overlay window shown` shows, but overlay window not visible

**Root Cause**: Overlay window positioning OR visibility issue

**Next Steps**:
- Check overlay window bounds (off-screen?)
- Check overlay window opacity (transparent?)
- Check overlay window z-order (behind other windows?)
- Check overlay window `show()` actually works

---

## Quick Diagnostic Commands

### Check Overlay Window State (Main Process)
Add to main.ts OVERLAY_SHOW handler:
```typescript
console.log("[Main] Overlay window state:", {
  exists: !!overlayWindow,
  isDestroyed: overlayWindow?.isDestroyed(),
  isVisible: overlayWindow?.isVisible(),
  isFocused: overlayWindow?.isFocused(),
  bounds: overlayWindow?.getBounds(),
  opacity: overlayWindow?.getOpacity(),
});
```

### Check SSE Response (Browser DevTools)
1. Open DevTools → Network tab
2. Find SSE request (filter: `/messages/stream`)
3. Click on request → Response tab
4. Look for `data: {"type":"window_trigger",...}`

### Check IPC Registration (Main Process Startup)
Add to main.ts after all IPC handlers:
```typescript
console.log("[Main] Registered IPC handlers:", {
  overlayShow: ipcMain.listenerCount(IPC_CHANNELS.OVERLAY_SHOW),
  // ... other handlers
});
```

---

## Files Modified (Summary)

1. `/Users/febechukwuma/Documents/mitable/apps/electron/src/renderer/lib/api/conversations.ts` (Phase 1)
2. `/Users/febechukwuma/Documents/mitable/apps/electron/src/renderer/console/src/components/views/employee/ChatsView/ChatDetail.tsx` (Phase 2)
3. `/Users/febechukwuma/Documents/mitable/apps/electron/src/preload/console.ts` (Phase 3)
4. `/Users/febechukwuma/Documents/mitable/apps/electron/src/main.ts` (Phase 4)
5. `/Users/febechukwuma/Documents/mitable/apps/electron/src/preload/overlay.ts` (Phase 5)
6. `/Users/febechukwuma/Documents/mitable/apps/electron/src/renderer/overlay/src/App.tsx` (Phase 5)

---

## Priority Actions (Immediate)

1. **Add Phase 1 logs first** (SSE parsing in conversations.ts)
   - This will confirm if `window_trigger` event is even reaching frontend
   - Fastest to implement, highest diagnostic value

2. **Test with single workflow step progression**
   - Simplest reproduction case
   - Generates bounding box reliably

3. **Check browser DevTools Network tab**
   - Manually verify SSE stream contains `window_trigger` event
   - Bypasses code to confirm backend is working

---

## Success Criteria

Once debugging is complete, we should see this log sequence:

```
[Conversations] Emitting window_trigger event: { window: 'overlay', hasData: true }
[API] SSE line received: data: {"type":"window_trigger",...
[API] Parsed chunk type: window_trigger keys: ["type","windowTrigger"]
[API] Received window_trigger event: { window: 'overlay', data: {...} }
[API] Stored windowTriggerData: { window: 'overlay', data: {...} }
[ChatDetail] Window trigger callback FIRED: { windowType: 'overlay', hasData: true, ... }
[ChatDetail] Calling showOverlay with data: { boundingBox: {...}, ... }
[Preload] showOverlay() called with data: { boundingBox: {...}, ... }
[Preload] Sending IPC to main process: overlay-show
[Preload] IPC sent successfully
[Main] OVERLAY_SHOW received: { hasData: true, dataKeys: [...], ... }
[Main] Overlay window exists, sending overlay-data to renderer
[Main] overlay-data IPC sent to overlay renderer
[Main] Showing overlay window
[Main] Overlay window shown with bounding box data
[Overlay Preload] Received overlay-data IPC: { hasData: true, ... }
[Overlay Preload] Calling callback with data
[Overlay Preload] Callback invoked successfully
[Overlay] handleOverlayData FIRED: { boundingBox: {...}, ... }
[Overlay] Setting bounding box data in state
[Overlay] State updated with bounding box data
[Overlay] App.tsx render: { hasBoundingBoxData: true, ... }
```

---

**End of Debugging Plan**
