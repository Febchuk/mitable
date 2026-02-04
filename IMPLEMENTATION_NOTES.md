# Deepgram Audio Transcription - Implementation Notes

## Installation Commands

### Electron

```bash
cd apps/electron
npm install @deepgram/sdk
```

### Backend

```bash
cd apps/backend
npm install @deepgram/sdk ws @types/ws
```

## Environment Variables

Add to `apps/backend/.env`:

```
DEEPGRAM_API_KEY=your_api_key_here
```

## Architecture Overview

### Audio Flow

1. Electron renderer captures mic + system audio (Web Audio API)
2. Electron main process receives audio chunks via IPC
3. Main process forwards to backend via WebSocket
4. Backend streams to Deepgram WebSocket
5. Deepgram returns transcripts with speaker diarization
6. Backend saves to `session_transcripts` table

### Files to Create/Modify

**Electron:**

- `apps/electron/src/services/audioTranscriptionService.ts` - NEW
- `apps/electron/src/main.ts` - UPDATE (add IPC handlers)
- `apps/electron/src/renderer/watchingPill/src/App.tsx` - UPDATE (add mic toggle)
- `apps/electron/src/preload/watchingPill.ts` - UPDATE (add audio IPC)

**Backend:**

- `apps/backend/src/services/deepgramTranscriptionService.ts` - NEW
- `apps/backend/src/routes/monitoring.ts` - UPDATE (add WebSocket endpoint)
- `apps/backend/src/db/migrations/0027_add_session_transcripts.sql` - NEW
- `apps/backend/src/db/schema/sessions.ts` - UPDATE (add table)
- `apps/backend/src/config.ts` - UPDATE (add Deepgram key)

## Next Steps

1. Run installation commands above
2. Add DEEPGRAM_API_KEY to backend .env
3. Implement services and UI
