# Overlay Debugging - Quick Reference Card

## 🔴 The Problem

Overlay window not showing despite backend sending all data correctly.

## 🎯 Breaking Point

**Step 5**: Frontend SSE parsing in `conversations.ts:282-289`

## 📊 Evidence from Logs

```
Line 798: ✅ [Conversations] Emitting window_trigger event: { window: 'overlay' }
Line ???: ❌ [API] Received window_trigger event  ← MISSING
```

## ⚡ Quick Start (3 Steps)

### Step 1: Add Debug Logs

**File**: `apps/electron/src/renderer/lib/api/conversations.ts`

**Line ~241** (inside for loop):

```typescript
for (const line of lines) {
  console.log("[API] SSE line received:", line.substring(0, 100));
  // ... existing code
}
```

**Line ~252** (after JSON.parse):

```typescript
const chunk: StreamChunk = JSON.parse(data);
console.log("[API] Parsed chunk type:", chunk.type, "keys:", Object.keys(chunk));
```

**Line ~283** (in window_trigger case):

```typescript
case "window_trigger":
  console.log("[API] Received window_trigger event:", chunk.windowTrigger);
  // ... existing code
```

**Line ~300** (add default case):

```typescript
default:
  console.warn("[API] Unknown chunk type:", chunk.type);
  break;
```

### Step 2: Restart & Test

```bash
npm run dev

# In app:
1. Open Spotify
2. Ask: "How do I open my liked songs playlist in spotify"
3. Click "Move on to next step" (twice)
```

### Step 3: Check Logs

Look for missing log in sequence:

```
✅ [Conversations] Emitting window_trigger event
❓ [API] SSE line received: data: {"type":"window_trigger",...}
❓ [API] Parsed chunk type: window_trigger
❓ [API] Received window_trigger event
```

## 🔍 What to Look For

### If you see: `[API] SSE line received` but NOT `[API] Parsed chunk type`

**Problem**: JSON parsing error
**Fix**: Check JSON format in SSE line

### If you see: `[API] Parsed chunk type` but NOT `[API] Received window_trigger event`

**Problem**: Switch case not matching OR callback not firing
**Fix**: Check exact string match for `chunk.type === "window_trigger"`

### If you DON'T see: `[API] SSE line received` at all

**Problem**: SSE event not reaching frontend
**Fix**: Check browser DevTools → Network → SSE stream

## 📁 Full Documentation

- **Comprehensive Plan**: `/Users/febechukwuma/Documents/mitable/temp/overlay_debugging_plan.md` (22KB)
- **Flow Diagram**: `/Users/febechukwuma/Documents/mitable/temp/overlay_flow_diagram.txt` (4.4KB)
- **Summary**: `/Users/febechukwuma/Documents/mitable/temp/DEBUGGING_SUMMARY.md` (4.8KB)
- **Original Logs**: `/Users/febechukwuma/Documents/mitable/temp/run_logs.txt` (54KB)

## 🎯 Expected Data Structure

Backend sends:

```json
{
  "type": "window_trigger",
  "windowTrigger": {
    "window": "overlay",
    "data": {
      "boundingBox": { "x": 0.307, "y": 0.593, "width": 0.398, "height": 0.045 },
      "label": "Move on to next step",
      "instruction": "Great, you're already logged in...",
      "elementType": "button"
    }
  }
}
```

Frontend should parse and call:

```typescript
callbacks.onWindowTrigger("overlay", {
  boundingBox: { x: 0.307, y: 0.593, width: 0.398, height: 0.045 },
  label: "Move on to next step",
  instruction: "...",
  elementType: "button",
});
```

## 🚨 Common Issues & Fixes

| Symptom                               | Cause                       | Fix                                              |
| ------------------------------------- | --------------------------- | ------------------------------------------------ |
| No SSE logs at all                    | Frontend not parsing stream | Check network tab, verify SSE format             |
| "Unknown chunk type" log              | Type mismatch               | Check exact string: `"window_trigger"`           |
| Parse succeeds, callback doesn't fire | Callback not registered     | Check `useSendMessage({ onWindowTrigger: ... })` |
| Callback fires, IPC not sent          | Preload not loaded          | Check `window.consoleAPI?.showOverlay` exists    |

## ✅ Success Criteria

You'll know it's working when you see ALL these logs in sequence:

```
[Conversations] Emitting window_trigger event
[API] SSE line received
[API] Parsed chunk type: window_trigger
[API] Received window_trigger event
[ChatDetail] Window trigger callback FIRED
[Preload] showOverlay() called
[Main] OVERLAY_SHOW received
[Main] Overlay window shown
[Overlay Preload] Received overlay-data
[Overlay] Received bounding box data
```

---

**Last Updated**: 2025-11-08  
**Status**: Ready for debugging
