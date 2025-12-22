# Video to Session Testing Utility

## Overview

This utility converts video recordings into monitoring sessions by extracting frames at specified intervals and feeding them through the existing session pipeline. It's designed for performance testing - comparing AI-generated summaries against manual human summaries.

## Prerequisites

1. **ffmpeg** must be installed on your system:
   ```bash
   # macOS
   brew install ffmpeg
   
   # Ubuntu/Debian
   sudo apt-get install ffmpeg
   
   # Windows
   # Download from https://ffmpeg.org/download.html
   ```

2. **Dependencies** installed:
   ```bash
   cd apps/backend
   npm install
   ```

3. **Database** must be running and accessible (check your `.env` file)

4. **Valid user and organization IDs** from your database

## Usage

### Basic Usage

```bash
cd apps/backend
npm run video-to-session -- \
  --video ./test-videos/session1.mp4 \
  --user-id 550e8400-e29b-41d4-a716-446655440000 \
  --org-id 660e8400-e29b-41d4-a716-446655440000
```

### With Custom Options

```bash
npm run video-to-session -- \
  --video ./test-videos/work-session.mp4 \
  --user-id <your-user-id> \
  --org-id <your-org-id> \
  --interval 3 \
  --app-name "VS Code" \
  --window-title "Coding Session"
```

## Arguments

### Required

- `--video <path>` - Path to video file (MP4, MOV, etc.)
- `--user-id <uuid>` - User ID for the session
- `--org-id <uuid>` - Organization ID for the session

### Optional

- `--interval <seconds>` - Frame extraction interval (default: 5 seconds)
- `--app-name <name>` - Simulated app name (default: "Screen Recording")
- `--window-title <title>` - Simulated window title (default: "Video Playback")
- `--help, -h` - Show help message

## How It Works

```
Video File (MP4/MOV)
    ↓
[1] Extract frames every N seconds (ffmpeg)
    ↓
[2] Create monitoring session in DB
    ↓
[3] For each frame:
    - Convert to base64
    - Insert into session_captures table
    - Analyze with frame-analysis.service
    - Store analysis results
    ↓
[4] End session
    ↓
[5] Generate summary with session-summarization.service
    ↓
[6] Cleanup temporary files
    ↓
Session ready in app!
```

## Output

The script will:

1. **Extract frames** from your video at the specified interval
2. **Create a session** in your database with status "active"
3. **Process each frame**:
   - Save to `session_captures` table with image data
   - Analyze using the existing frame analysis service
   - Store delta detection, importance scores, etc.
4. **Generate summary** using the existing summarization service
5. **Clean up** temporary frame files
6. **Output** the session ID and summary

### Example Output

```
╔═══════════════════════════════════════════════════════════╗
║         Video to Session Testing Utility                  ║
╚═══════════════════════════════════════════════════════════╝

✅ ffmpeg is available

📹 Extracting frames from video...
   Video: ./test-videos/session1.mp4
   Interval: 5s
   Output: /tmp/mitable-video-frames-1234567890
   Duration: 3m 15s
   Expected frames: ~40

⚙️  Running ffmpeg...
   Progress: 100%

✅ Extracted 39 frames

📝 Creating monitoring session...
✅ Session created: abc123-def456-...

🔄 Processing 39 frames...
   ✓ Frame 1: Progression detected - User editing authentication code in VS Code...
   ✓ Frame 2: No change - Same view of authentication code...
   ✓ Frame 3: Progression detected - User switched to browser, viewing documentation...
   ...
   ✓ Frame 39: Progression detected - User committing changes to git...

✅ Processed 39 frames

📊 Ending session and generating summary...

✅ Summary generated in 2.34s

📝 Narrative Summary:
   Spent the session implementing JWT authentication. Started by editing the auth 
   service, then researched best practices online, wrote unit tests, and committed 
   the changes. Also responded to a few Slack messages about the feature.

🎯 Accomplishments:
   • Implemented JWT validation in auth.service.ts
   • Added unit tests for authentication flow
   • Committed changes to feature branch

╔═══════════════════════════════════════════════════════════╗
║                    Session Complete                        ║
╚═══════════════════════════════════════════════════════════╝

Session ID: abc123-def456-...
Frames Processed: 39
Duration: 3m 15s

The session is now available in your app for review.

🧹 Cleaning up temporary files...
✅ Cleanup complete
```

## Finding User and Org IDs

You can find valid IDs from your database:

```sql
-- Get user IDs
SELECT id, email FROM users LIMIT 5;

-- Get org IDs
SELECT id, name FROM organizations LIMIT 5;
```

Or use the IDs from your current dev session in the app.

## Viewing Results

After running the script:

1. The session will be in your database with status "ready"
2. You can view it in your app at: `http://localhost:3000/sessions/<session-id>`
3. All frames are stored in `session_captures` table with analysis data
4. The summary is in `session_summaries` table

## Troubleshooting

### "ffmpeg is not installed or not in PATH"

Install ffmpeg using the instructions in Prerequisites above.

### "Video file not found"

Check that the path to your video file is correct. Use absolute paths or paths relative to `apps/backend/`.

### "Error: --user-id and --org-id are required"

You must provide valid user and organization IDs. Get them from your database or use IDs from your dev environment.

### Frame analysis fails

If individual frames fail analysis (e.g., Groq API errors), the script will:
- Log the error
- Mark the frame as "skipped"
- Continue processing remaining frames

This ensures one bad frame doesn't kill the entire session.

### No summary generated

Check that:
- At least some frames were successfully analyzed
- Your Groq/Gemini API keys are configured in `.env`
- The database connection is working

## Performance Notes

- **Processing time**: ~2-5 seconds per frame (depends on API latency)
- **Storage**: Each frame is ~500KB-2MB in the database (base64 encoded)
- **API costs**: Uses Groq for frame analysis and Gemini for summarization
- **Cleanup**: Temporary frame files are deleted after processing

## Use Cases

1. **Performance Testing**: Compare AI summaries vs. manual summaries
2. **Regression Testing**: Ensure summary quality doesn't degrade
3. **Benchmarking**: Test different prompt variations
4. **Demo Data**: Create realistic test sessions for development

## Limitations

- Only supports single-window recordings (no multi-window simulation yet)
- All frames marked as "on-task" by default
- No session goal context (could be added as CLI arg)
- Simulates periodic captures only (no focus_change triggers)

## Future Enhancements

Possible improvements:

- [ ] Support for multiple window recordings
- [ ] Session goal as CLI argument
- [ ] Batch processing multiple videos
- [ ] Comparison mode (show AI vs. human summary side-by-side)
- [ ] Export results to JSON for analysis
- [ ] Support for existing session IDs (append frames)

