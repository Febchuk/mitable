# On-Device AI Strategy — Technical Reference

> **Branch:** `feat/mitable_on_device`
> **Date:** April 2026
> **Status:** Working on desktop (RTX 4060 Ti), **crashing on laptop (GTX 1070 Max-Q)** — llama-server exits instantly with Windows code `3221225785`.

---

## 1. What We're Building

Mitable's on-device AI pipeline runs **entirely locally** inside the Electron app — no cloud calls for screen understanding, activity classification, transcription, or session storytelling. The goal is privacy-first work tracking that works offline.

### Pipeline stages

| Stage                     | Model                              | Server                                  | Purpose                                                                        |
| ------------------------- | ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| **Sensor** (vision)       | SmolVLM2 2.2B Q4_K_M + mmproj Q8_0 | `llama-server` (vision mode)            | Classify each screenshot: what app, what the user is doing                     |
| **Classifier** (text)     | Phi-3.5 Mini 3.8B Q4_K_M           | `llama-server` (text-only, 2nd process) | RLM loop over batches of sensor frames → structured activity classification    |
| **Storyteller** (text)    | Phi-3.5 Mini 3.8B Q4_K_M           | Same text server                        | RLM loop → narrative summary + task list from classifications + transcriptions |
| **Transcription** (audio) | Whisper Small (ggml)               | `whisper-cli.exe` (per-chunk)           | Speech-to-text from mic audio, stored in local DB                              |

### Architecture (current — CPU whisper, GPU vision)

```
During session (parallel):
  GPU: Screenshots → [SmolVLM2 llama-server] → sensor_output per frame
  CPU: Audio → [whisper-cli, 60s batches] → transcriptions

Buffer 20 frames or 60s
    ↓
[Phi-3.5 text via 2nd llama-server — RLM classifier loop]
    ↓ activity classification
    ↓
Session ends:
    ↓
[Phi-3.5 text — RLM storyteller loop]
    ↓ narrative + tasks + time breakdown (uses classifications + transcriptions)
    ↓
Local SQLite DB → optional cloud resync
```

**Key design choice:** Whisper runs on **CPU only** — no CUDA, no VRAM. This
eliminates GPU contention between vision and audio, and avoids Pascal-era CUDA
crashes entirely for the transcription path.

---

## 2. Models & Binaries

### Asset Registry (all required, ~4.6 GB total)

| Asset              | File on disk                               | Size    | Source                                                                                                                                                              |
| ------------------ | ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **llama-server**   | `llama-server.exe`                         | ~55 MB  | [llama.cpp b8690 win-cuda-12.4](https://github.com/ggml-org/llama.cpp/releases/download/b8690/llama-b8690-bin-win-cuda-12.4-x64.zip)                                |
| **Vision model**   | `smolvlm2-2.2b-gui.Q4_K_M.gguf`            | ~1.1 GB | [HuggingFace mradermacher](https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.Q4_K_M.gguf) |
| **Vision mmproj**  | `smolvlm2-2.2b-gui.mmproj-Q8_0.gguf`       | ~593 MB | [Same repo](https://huggingface.co/mradermacher/SmolVLM2-2.2B-Instruct-Agentic-GUI-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Agentic-GUI.mmproj-Q8_0.gguf)           |
| **Text model**     | `phi-3.5-mini-instruct.Q4_K_M.gguf`        | ~2.3 GB | [HuggingFace bartowski](https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf)                                 |
| **Whisper server** | `whisper-server.exe` (+ `whisper-cli.exe`) | ~457 MB | [whisper.cpp v1.8.4 cublas-12.4.0](https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-cublas-12.4.0-bin-x64.zip)                              |
| **Whisper model**  | `ggml-whisper-small.bin`                   | ~488 MB | [HuggingFace ggerganov](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin)                                                                   |

### Why these models

- **SmolVLM2 2.2B**: Smallest multimodal model that understands GUI screenshots well. Agentic-GUI variant is fine-tuned for screen understanding. Q4_K_M quantization fits in 8 GB VRAM with the mmproj encoder.
- **Phi-3.5 Mini 3.8B**: Good instruction-following at small size for structured JSON output (RLM tool-call protocol). Q4_K_M keeps it under 2.5 GB.
- **Whisper Small**: Best accuracy/size tradeoff for real-time transcription. Larger models (medium, large) are too slow for 10s chunk processing.

---

## 3. Server Configuration & CLI Flags

### llama-server (vision — SmolVLM2)

```
llama-server.exe
  --model       <smolvlm2-2.2b-gui.Q4_K_M.gguf>
  --mmproj      <smolvlm2-2.2b-gui.mmproj-Q8_0.gguf>
  --port        <dynamic free port>
  --host        127.0.0.1
  --ctx-size    4096 (or 2048 on Pascal)
  --n-gpu-layers -1 (all layers on GPU)
  --parallel    1
  --flash-attn  <off|auto|on>
  --no-jinja
  --chat-template smolvlm
  [--fit off]   (on Pascal/older GPUs)
```

- Ready when stdout/stderr contains `"server is listening on"`
- Startup timeout: **120 seconds** (model loading can be slow)
- Health check: GET `/health` every 30s
- API: `POST /v1/chat/completions` (OpenAI-compatible), `temperature: 0.1`, `max_tokens: 256`

### llama-server (text — Phi-3.5, 2nd process)

```
llama-server.exe
  --model       <phi-3.5-mini-instruct.Q4_K_M.gguf>
  --port        <different free port>
  --host        127.0.0.1
  --ctx-size    4096 (or 2048 on Pascal)
  --n-gpu-layers -1
  --parallel    1
  --flash-attn  <off|auto|on>
  [--fit off]
```

- Startup timeout: **60 seconds**
- Same health check pattern
- API: same OpenAI-compatible endpoint, `temperature: 0.1–0.3`, `max_tokens: 1024–2048`

### whisper-cli (CPU-only, per audio chunk)

```
whisper-cli.exe
  --model       <ggml-whisper-small.bin>
  --file        <temp WAV file>
  --threads     4
  --language    en
  --no-timestamps
  --no-prints
  --no-gpu
```

- Spawned per **60s** audio chunk via `execFile` — **CPU only, no CUDA env**
- Timeout: scales with audio length (base 30s + 2s per second of audio)
- Runs **independently** of GPU servers — no VRAM used
- Note: `whisper-server.exe` **hangs on Windows** after model load — we use `whisper-cli.exe` from the same release zip instead

---

## 4. GPU Tuning by Hardware

Detection uses `nvidia-smi --query-gpu=name,compute_cap`.

| GPU tier                         | Compute cap | `--n-gpu-layers` | `--flash-attn` | `--fit`      | `--ctx-size` | Whisper flash |
| -------------------------------- | ----------- | ---------------- | -------------- | ------------ | ------------ | ------------- |
| **Ampere+** (RTX 30xx/40xx)      | ≥ 8.0       | -1 (all GPU)     | on             | on (default) | 4096         | on            |
| **Turing** (RTX 20xx, GTX 16xx)  | 7.x         | -1               | auto           | on           | 4096         | on            |
| **Pascal** (GTX 10xx, Tesla P40) | 6.x         | -1               | **off**        | **off**      | **2048**     | **off**       |
| Legacy GTX (name fallback)       | unknown     | -1               | off            | off          | 2048         | off           |
| Non-Windows / no NVIDIA          | —           | -1               | auto           | on           | 4096         | on            |

### Windows CUDA environment

`windowsCudaEnv.ts` prepends to `PATH`:

- Server binary directories (llama + whisper `bin/` folders)
- `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\bin` (+ v12.3, v12.2)
- `C:\Program Files\NVIDIA Corporation\NVSMI`

CUDA runtime DLLs (`cublas64_12.dll`, `cublasLt64_12.dll`, `cudart64_12.dll`, etc.) are cross-copied between the llama and whisper bin directories after download.

---

## 5. Server Lifecycle (Atomic Start/Stop)

### Start sequence (`startOnDeviceServersAtomic`)

1. `llamaServerService.start()` — vision server on **GPU** (SmolVLM2 + mmproj)
2. `textServerService.start()` — text server on **GPU** (Phi-3.5), **best-effort**: if fails, falls back to sequential mode
3. `whisperServerService.start()` — whisper CLI validation on **CPU** (non-blocking: if fails, audio is disabled but GPU servers stay up)

### Stop

`stopOnDeviceServersBoth()` — `Promise.allSettled` on all three services.

### Sequential fallback

If the text server can't start alongside vision (e.g., not enough VRAM for two models), `_parallelMode = false`. At session end:

1. Vision server stops
2. Text server starts (now has all VRAM)
3. Deferred classification runs
4. Story generation runs
5. Text server stops

---

## 6. Local Storage (SQLite)

Path: `{userData}/on-device/mitable-local.db` (WAL mode, NORMAL sync)

| Table               | Key columns                                                                    | Purpose                                  |
| ------------------- | ------------------------------------------------------------------------------ | ---------------------------------------- |
| **captures**        | session_id, frame_id, sensor_output, delta_changed, user_action                | Per-screenshot vision results            |
| **classifications** | session_id, batch_index, activity_description, activity_type, importance_score | RLM classifier output per 20-frame batch |
| **stories**         | session_id (unique), narrative, tasks (JSON), time_breakdown, model_used       | Final session summary                    |
| **transcriptions**  | session_id, chunk_index, transcript, start_time_ms, end_time_ms, confidence    | Whisper output per 10s audio chunk       |

---

## 7. RLM (Recursive Language Model) Loops

Both classifier and storyteller use the project's RLM pattern: iterative LLM tool-call loops where the model calls tools to inspect data, then produces a final result.

### Classifier RLM

- **Tools:** `get_batch_overview`, `get_frames` (paginated), `classify`
- **Max iterations:** 5
- **Temperature:** 0.1
- **Output:** `{ description, activityType, onTask, importanceScore }`
- **Activity types:** coding, browsing, writing, communicating, designing, meeting, reading, other

### Storyteller RLM

- **Tools:** `get_session_stats`, `get_activity_timeline`, `get_transcriptions`, `get_activity_detail`, `write_summary`
- **Max iterations:** 15
- **Temperature:** 0.3, max_tokens: 2048
- **Output:** `{ narrative, tasks[], timeBreakdown }`

---

## 8. What Works

- **RTX 4060 Ti (desktop, sm 8.9):** Full pipeline runs — vision, text (parallel), whisper, classification, storytelling. All servers start and stay running.
- **macOS Apple Silicon:** Expected to work (Metal backend, untested on this branch).
- **Whisper on any hardware:** `whisper-cli.exe` runs on CPU — no GPU needed, no CUDA issues.
- **Atomic lifecycle:** If any server fails to start, all are stopped — no half-running state.
- **Sequential fallback:** If text server can't coexist with vision, classification/storytelling defers to session end.

---

## 9. What Doesn't Work — The GTX 1070 Problem

### Symptoms

- `llama-server.exe` exits **immediately** (~70ms) with Windows code **`3221225785`** (hex `0xC0000135` — DLL not found, or `0xC0000409` — stack buffer overrun, depending on interpretation).
- Happens with **every** combination of flags tried:
  - `--n-gpu-layers -1` (full GPU) — crashes
  - `--n-gpu-layers 0` (CPU only) — **still crashes** (CUDA binary initializes GPU anyway)
  - `--flash-attn off` — crashes
  - `--fit off` — crashes
  - `--ctx-size 2048` — crashes
- No stderr output captured before exit (process dies before printing anything).

### Hardware

- **GPU:** NVIDIA GeForce GTX 1070 with Max-Q Design
- **Compute capability:** 6.1 (Pascal architecture)
- **VRAM:** 8 GB dedicated
- **Driver:** Current (nvidia-smi works, reports correct GPU)

### What we know

1. **Ollama runs multimodal models on the same GPU** — confirmed by user. Ollama supports compute cap 5.0+ per their [hardware docs](https://docs.ollama.com/gpu). But Ollama uses a **different engine** (own builds, scheduling, potentially different CUDA paths) — not the same as raw `llama-server.exe` from llama.cpp releases.

2. **The llama.cpp b8690 `win-cuda-12.4` binary** is a prebuilt zip. We don't know which CUDA architectures (sm_XX) are compiled in. The [b8690 release](https://github.com/ggml-org/llama.cpp/releases/tag/b8690) doesn't document target architectures. If `sm_61` is **not** in the binary's SASS, it would rely on PTX JIT — which can fail or produce broken code on Pascal.

3. **Known llama.cpp issues on Pascal:**
   - [Issue #1837](https://github.com/ggerganov/llama.cpp/issues/1837): Tesla P40 (sm_61) crashes with `CUDA error 1: invalid argument` — same arch as GTX 1070.
   - [Issue #19868](https://github.com/ggml-org/llama.cpp/issues/19868): b8146/b8147 Windows crashes (all GPUs) — was a `ftell` overflow bug, fixed by b8148+. Our b8690 should have this fix.
   - [Issue #14826](https://github.com/ggml-org/llama.cpp/issues/14826): llama-server on Windows crashes silently with access violation in `llama.dll`.

4. **The crash happens even with `--n-gpu-layers 0`** — this means the CUDA binary is failing during **initialization** (not during layer offload). The CUDA backend likely tries to initialize the GPU context regardless of layer count.

5. **`whisper-cli.exe`** from the same CUDA 12.4 build **works fine** on the same GPU — so CUDA itself and the driver are functional. The issue is specific to `llama-server.exe` (or `llama.dll` / `ggml-cuda.dll`).

---

## 10. Approaches Not Yet Tried

### A. Use the Vulkan build instead of CUDA

llama.cpp b8690 ships a **[`win-vulkan-x64` build](https://github.com/ggml-org/llama.cpp/releases/download/b8690/llama-b8690-bin-win-vulkan-x64.zip)** (~56 MB). Vulkan works on all NVIDIA GPUs (and AMD) without CUDA. This would:

- Bypass CUDA initialization entirely
- Still use GPU acceleration (Vulkan compute shaders)
- Need testing: Vulkan multimodal (mmproj) support in llama-server may be incomplete or slower

**Implementation:** Download `win-vulkan` zip for Pascal-tier GPUs instead of `win-cuda-12.4`. Could detect at download time or keep both and switch at start time.

### B. Build llama.cpp from source with Pascal SASS

Compile with `-DCMAKE_CUDA_ARCHITECTURES="61"` to guarantee native sm_61 code. The prebuilt may only include newer archs + PTX fallback.

### C. Use an older llama.cpp release

Earlier releases (e.g., b3000-era) had simpler CUDA code paths and were more compatible with Pascal. The multimodal/mmproj stack has evolved significantly.

### D. Use Ollama as the backend instead of raw llama-server

Since Ollama **works** on the GTX 1070, we could:

- Ship/require Ollama as a dependency
- Pull models via `ollama pull`
- Use Ollama's OpenAI-compatible API (`localhost:11434/v1/chat/completions`)
- Lose some control over flags but gain hardware compatibility

### E. Use a different vision model that doesn't need mmproj

The `--mmproj` multimodal projection is where most Pascal issues seem to concentrate. A text-only pipeline with OCR (e.g., Tesseract on screenshots → text → Phi-3.5 classification) would avoid the multimodal CUDA path entirely.

### F. Try CUDA 11.8 build

Older CUDA toolkit versions have better Pascal support. llama.cpp doesn't ship CUDA 11.8 binaries but could be built from source.

### G. Partial GPU offload experiments

Try `--n-gpu-layers 10`, `20`, `30` to see if a specific layer count works. If the crash is in mmproj GPU offload specifically, there might be a threshold.

---

## 11. File Map

```
apps/electron/src/services/on-device/
├── index.ts                      # Barrel exports
├── modelManager.ts               # Asset registry, GPU detection, download, tuning
├── llamaServerService.ts         # Vision llama-server lifecycle
├── textServerService.ts          # Text llama-server lifecycle (Phi-3.5)
├── whisperServerService.ts       # Whisper CLI wrapper
├── localInferenceService.ts      # Vision sensor + classifier + storyteller pipeline
├── localAudioService.ts          # Audio buffering + whisper transcription
├── localDb.ts                    # SQLite schema + CRUD
├── onDeviceServerLifecycle.ts    # Atomic start/stop orchestration
├── windowsCudaEnv.ts             # Windows CUDA PATH helper
└── rlm/
    ├── classifier-rlm-prompts.ts # Classifier system/user prompts + tools
    └── storyteller-rlm-prompts.ts # Storyteller system/user prompts + tools
```

---

## 12. Key Decisions & Trade-offs

| Decision                       | Why                                        | Trade-off                                                                |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------ |
| SmolVLM2 for vision            | Smallest multimodal with GUI understanding | Needs mmproj (CUDA-sensitive), limited accuracy                          |
| Phi-3.5 for text               | Good JSON output, small                    | 3.8B can struggle with complex classification                            |
| Two llama-server processes     | Parallel vision + text = faster sessions   | Needs ~4 GB+ VRAM for both; sequential fallback exists                   |
| whisper-cli not whisper-server | Server hangs on Windows after model load   | Per-chunk CLI spawn is slower but reliable                               |
| Whisper CPU-only               | Eliminates VRAM contention entirely        | Slower than GPU whisper (~2-4x realtime on CPU) but 60s batches are fine |
| CUDA 12.4 prebuilt             | No build step for users                    | May lack Pascal SASS; Vulkan alternative exists                          |
| `--fit off` on Pascal          | VRAM auto-fit subprocess caused issues     | Removes a safety net but avoids a crash path                             |
| All-GPU layers on Pascal       | User confirmed Ollama works with GPU       | Still crashes — the issue is deeper than layer offload                   |

---

## 13. Reproduction Steps

1. Machine with **GTX 1070** (compute 6.1), Windows, current NVIDIA drivers
2. `git checkout feat/mitable_on_device && npm install && npm run dev`
3. Log in, navigate to On-Device AI settings
4. Download all components (~4.6 GB)
5. Toggle "Enable On-Device AI"
6. Observe in terminal: `llama-server exited with code 3221225785` within ~70ms

The **desktop** with RTX 4060 Ti completes the same flow successfully.
