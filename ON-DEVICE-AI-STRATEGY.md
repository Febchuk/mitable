# On-Device AI Strategy — Ollama + Gemma 4

## Overview

Mitable runs all AI inference locally using **Ollama** serving **Google Gemma 4** models.
Zero raw data leaves the user's device — only session summaries are synced to the cloud.

## Architecture

```
Electron Main Process
  ├── ollamaLifecycle     — start/stop Ollama, detect hardware, pull model
  ├── ollamaService       — OpenAI-compatible API wrapper (localhost:11434)
  ├── localInferenceService — frame batching, sensor (vision), classifier + storyteller (RLM)
  ├── localAudioService   — PCM buffering, transcription (Gemma audio or Whisper CPU)
  └── localDb (SQLite)    — captures, classifications, stories, transcriptions

Ollama Process (child of Electron)
  └── Gemma 4 model (E4B or 12B depending on hardware)
```

## Two-Tier Model Strategy

| Tier            | VRAM   | Model                  | Modalities           | Audio                         |
| --------------- | ------ | ---------------------- | -------------------- | ----------------------------- |
| **Constrained** | <12 GB | `gemma4:e4b` (~5 GB)   | Text + Image + Audio | Gemma native (20s clips)      |
| **Capable**     | 12 GB+ | `gemma4:12b` (~6.6 GB) | Text + Image         | whisper-cli CPU (60s batches) |

Hardware tier is auto-detected at startup via `nvidia-smi` (Windows/Linux) or `sysctl` (Mac).
Mac unified memory: 16 GB+ = capable, under 16 GB = constrained.

## File Map

```
apps/electron/src/services/on-device/
  ├── hardwareDetector.ts      — GPU/VRAM detection, tier classification
  ├── ollamaService.ts         — Ollama subprocess, install, pull, chat completion API
  ├── ollamaLifecycle.ts       — coordinated start/stop, hardware profile
  ├── localInferenceService.ts — frame buffer, sensor, classifier RLM, storyteller RLM
  ├── localAudioService.ts     — PCM buffer, tier-branched transcription
  ├── localDb.ts               — SQLite (captures, classifications, stories, transcriptions)
  ├── modelManager.ts          — manifest, enabled flag, optional whisper download
  ├── whisperServerService.ts  — whisper-cli wrapper (capable tier only)
  ├── index.ts                 — barrel exports
  └── rlm/
      ├── local-rlm-engine.ts           — iterative tool-calling loop (JSON mode)
      ├── classifier-rlm-environment.ts — classifier state
      ├── classifier-rlm-prompts.ts     — classifier system/user prompts
      ├── classifier-rlm-tools.ts       — get_batch_overview, get_frames, classify
      ├── storyteller-rlm-environment.ts — storyteller state
      ├── storyteller-rlm-prompts.ts     — storyteller system/user prompts
      └── storyteller-rlm-tools.ts       — get_session_stats, get_classifications, etc.
```

## Session Lifecycle

1. **App startup**: detect hardware → ensure Ollama installed → pull model → warmup
2. **Session start**: `localInferenceService.start()` + `localAudioService.start()`
3. **During session**: screenshots batched (20 frames / 60s) → Ollama vision → SQLite;
   audio buffered (20s/60s) → transcribed → SQLite
4. **Session end**: flush remaining → storyteller RLM generates narrative → SQLite
5. **App close**: kill Ollama process, free VRAM

## Key Differences from Old Pipeline

| Old (llama.cpp)                                       | New (Ollama + Gemma 4)              |
| ----------------------------------------------------- | ----------------------------------- |
| 3 separate processes (SmolVLM2, Phi-3.5, whisper-cli) | 1 Ollama process + optional whisper |
| Parallel/sequential mode dance                        | Single model handles everything     |
| Manual CUDA env patching                              | Ollama handles GPU compat           |
| GBNF grammar constraints                              | Ollama native JSON mode             |
| 6 separate asset downloads                            | `ollama pull` one command           |
| Pascal GPU crashes (3221225785)                       | Ollama tested on Pascal             |
| GPU tuning heuristics                                 | Ollama auto-configures              |
