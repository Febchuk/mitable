# ADR: Batch Screenshot Classification

**Status:** Proposed  
**Date:** 2026-02-23  
**Author:** Aurel  

## Context

Currently, every screenshot captured during a monitoring session triggers an individual API call chain:

1. Electron captures a screenshot every **10 seconds** (per window)
2. Client-side hash dedup skips identical frames
3. Each non-duplicate frame is sent immediately via `POST /analyze-frame`
4. Backend runs **Gemini Vision** (Sensor: compare prev vs current frame)
5. Backend runs **Classifier RLM** (classify the delta into an activity)

This means up to **6 Gemini + 6 Classifier calls per minute per window** — a significant API cost, especially since many frames return `changed: false` for trivial visual changes (cursor blink, clock tick, notification badge).

## Decision

Introduce a **batched screenshot classification pipeline** to reduce API costs while preserving data quality.

## Design

### Layer 1: Client-Side Pre-Filter (Biggest Win)

Add a cheap **pixel-diff threshold** before queueing frames for analysis:

- Downsample frame to ~64x64, compute pixel delta against previous frame
- If < 3-5% of pixels changed → mark as `no_change`, skip analysis entirely
- Only queue frames that exceed the threshold

**Expected impact:** 30-50% reduction in Gemini calls for users who stay on one screen.

### Layer 2: Batch Upload

Instead of sending each frame immediately:

- Accumulate frames locally in a `FrameBatchBuffer` for N seconds (e.g., 30-60s)
- Flush the batch in one `POST /analyze-frame-batch` request
- Backend processes the batch (Gemini still compares pairs, but in one HTTP roundtrip)

### Layer 3: Smart Sampling (Aggressive)

Within a batch of frames A, B, C, D, E, F:

- Only compare **A vs F** (first vs last) for the high-level delta
- Compare adjacent pairs only when pixel-diff signals a big change mid-batch
- Could turn 5 Gemini calls into 1-2

## Edge Cases

| Scenario | Handling |
|----------|----------|
| **Manual session end mid-batch** | `stopSession()` calls `buffer.flush()` before proceeding to storyteller |
| **Pause mid-batch** | Same — flush on pause |
| **App crash / force quit** | Frames already saved locally. On next launch, upload un-synced frames from checkpoint |
| **Storyteller at session end** | No change needed — it reads from `sessionCaptures` in DB. Flush completes before story generation starts |
| **Very short session (< batch interval)** | Flush triggers on end, so even a 15s session gets analyzed |
| **Network blip during batch upload** | Retry with exponential backoff. Frames stay in local storage until confirmed synced |

## Cost Impact Estimate

| Scenario | Gemini Calls/Min | Relative Cost |
|----------|-----------------|---------------|
| Current (10s, every frame) | ~6/min | 100% |
| + Pixel-diff filter | ~3-4/min | ~60% |
| + Batch (60s) + smart sampling | ~1-2/min | ~25% |

## Architecture Sketch

```
Electron (client)                          Backend
─────────────────                          ───────
capture (10s)
  ├─ hash dedup (existing)
  ├─ pixel-diff filter (NEW)
  └─ queue to FrameBatchBuffer (NEW)

FrameBatchBuffer
  ├─ flushInterval: 60s
  ├─ flush() on session end/pause
  ├─ flush() on buffer.length >= maxSize
  └─ POST /analyze-frame-batch ──────────→ processBatch()
                                             ├─ smart pair selection
                                             ├─ Gemini Vision (reduced calls)
                                             └─ Classifier (per meaningful delta)
```

## Key Files (Current Pipeline)

| File | Role |
|------|------|
| `packages/shared/src/session.ts` | `SESSION_DEFAULTS.CAPTURE_INTERVAL_MS: 10000` |
| `apps/electron/src/services/monitoringSessionService.ts` | Capture loop, `processCapture()`, `analyzeFrameAsync()` |
| `apps/backend/src/services/frame-analysis.service.ts` | Sensor step — calls Gemini Vision to compare frames |
| `apps/backend/src/services/gemini-vision-frame.service.ts` | Gemini Vision API wrapper (frame comparison) |
| `apps/backend/src/services/classifier.service.ts` | Classifier step — classifies delta into activity |

## Open Questions

1. **Batch interval:** 30s vs 60s vs dynamic (flush when N frames accumulate)?
2. **Client-side pixel diff:** Worth the complexity, or let backend decide which frames to skip?
3. **Backward compatibility:** Keep single-frame `/analyze-frame` as fallback, or fully migrate?
