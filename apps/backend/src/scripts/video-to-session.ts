/**
 * Video to Session Testing Utility
 *
 * Converts video recordings into monitoring sessions by extracting frames
 * at specified intervals and feeding them through the session pipeline.
 *
 * Usage:
 *   npm run video-to-session -- --video ./test-videos/session1.mp4 --user-id <uuid> --org-id <uuid>
 *
 * Purpose:
 *   Performance testing - compare AI-generated summaries against manual human summaries
 */

import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import minimist from "minimist";
import { db } from "../db/client";
import * as schema from "../db/schema/index";
import { eq } from "drizzle-orm";
import { frameAnalysisService } from "../services/frame-analysis.service";
import { sessionSummarizationService } from "../services/session-summarization.service";

// ===========================
// Types
// ===========================

interface VideoToSessionOptions {
  videoPath: string;
  userId: string;
  orgId: string;
  interval: number; // seconds
  appName: string;
  windowTitle: string;
}

interface ExtractedFrame {
  frameNumber: number;
  filePath: string;
  timestamp: number; // milliseconds from video start
}

// ===========================
// Configuration
// ===========================

const DEFAULT_INTERVAL = 5; // seconds
const DEFAULT_APP_NAME = "Screen Recording";
const DEFAULT_WINDOW_TITLE = "Video Playback";
const TEMP_DIR_PREFIX = "mitable-video-frames-";

// ===========================
// CLI Argument Parsing
// ===========================

function parseArgs(): VideoToSessionOptions | null {
  const args = minimist(process.argv.slice(2));

  if (args.help || args.h) {
    printUsage();
    return null;
  }

  // Required: video path
  if (!args.video) {
    console.error("❌ Error: --video argument is required");
    printUsage();
    process.exit(1);
  }

  // User ID and Org ID (required)
  if (!args["user-id"] || !args["org-id"]) {
    console.error("❌ Error: --user-id and --org-id are required");
    printUsage();
    process.exit(1);
  }

  return {
    videoPath: args.video,
    userId: args["user-id"],
    orgId: args["org-id"],
    interval: args.interval || DEFAULT_INTERVAL,
    appName: args["app-name"] || DEFAULT_APP_NAME,
    windowTitle: args["window-title"] || DEFAULT_WINDOW_TITLE,
  };
}

function printUsage(): void {
  console.log(`
Video to Session Testing Utility

Usage:
  npm run video-to-session -- --video <path> --user-id <uuid> --org-id <uuid> [options]

Required Arguments:
  --video <path>          Path to video file (MP4, MOV, etc.)
  --user-id <uuid>        User ID for the session
  --org-id <uuid>         Organization ID for the session

Optional Arguments:
  --interval <seconds>    Frame extraction interval (default: 5)
  --app-name <name>       Simulated app name (default: "Screen Recording")
  --window-title <title>  Simulated window title (default: "Video Playback")
  --help, -h              Show this help message

Example:
  npm run video-to-session -- \\
    --video ./test-videos/session1.mp4 \\
    --user-id 550e8400-e29b-41d4-a716-446655440000 \\
    --org-id 660e8400-e29b-41d4-a716-446655440000 \\
    --interval 5
`);
}

// ===========================
// Video Frame Extraction
// ===========================

/**
 * Check if ffmpeg is available
 */
async function checkFFmpeg(): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg.getAvailableFormats((err) => {
      if (err) {
        reject(
          new Error(
            "ffmpeg is not installed or not in PATH. Please install ffmpeg: https://ffmpeg.org/download.html"
          )
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * Get video duration in seconds
 */
async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        const duration = metadata.format.duration || 0;
        resolve(duration);
      }
    });
  });
}

/**
 * Extract frames from video at specified interval
 */
async function extractFrames(
  videoPath: string,
  outputDir: string,
  intervalSeconds: number
): Promise<ExtractedFrame[]> {
  console.log(`\n📹 Extracting frames from video...`);
  console.log(`   Video: ${videoPath}`);
  console.log(`   Interval: ${intervalSeconds}s`);
  console.log(`   Output: ${outputDir}`);

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Get video duration
  const durationSeconds = await getVideoDuration(videoPath);
  const expectedFrameCount = Math.floor(durationSeconds / intervalSeconds) + 1;

  console.log(`   Duration: ${formatDuration(durationSeconds * 1000)}`);
  console.log(`   Expected frames: ~${expectedFrameCount}`);

  return new Promise((resolve, reject) => {
    const frames: ExtractedFrame[] = [];

    ffmpeg(videoPath)
      .outputOptions([
        `-vf fps=1/${intervalSeconds}`, // Extract 1 frame every N seconds
      ])
      .output(path.join(outputDir, "frame_%04d.png"))
      .on("start", (_commandLine) => {
        console.log(`\n⚙️  Running ffmpeg...`);
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          process.stdout.write(`\r   Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on("end", async () => {
        process.stdout.write("\r   Progress: 100%\n");

        // Read extracted frames
        const files = await fs.readdir(outputDir);
        const pngFiles = files.filter((f) => f.endsWith(".png")).sort();

        for (let i = 0; i < pngFiles.length; i++) {
          frames.push({
            frameNumber: i + 1,
            filePath: path.join(outputDir, pngFiles[i]),
            timestamp: i * intervalSeconds * 1000, // milliseconds
          });
        }

        console.log(`\n✅ Extracted ${frames.length} frames`);
        resolve(frames);
      })
      .on("error", (err) => {
        reject(new Error(`ffmpeg error: ${err.message}`));
      })
      .run();
  });
}

// ===========================
// Session Creation & Processing
// ===========================

/**
 * Create a new monitoring session in the database
 */
async function createSession(
  userId: string,
  orgId: string,
  options: VideoToSessionOptions
): Promise<string> {
  console.log(`\n📝 Creating monitoring session...`);

  const [session] = await db
    .insert(schema.monitoringSessions)
    .values({
      userId,
      organizationId: orgId,
      name: `Video Test: ${path.basename(options.videoPath)}`,
      status: "active",
      captureIntervalMs: options.interval * 1000,
      selectedWindows: [
        {
          windowId: "video-window-1",
          appName: options.appName,
          windowTitle: options.windowTitle,
        },
      ],
      startedAt: new Date(),
    })
    .returning({ id: schema.monitoringSessions.id });

  console.log(`✅ Session created: ${session.id}`);
  return session.id;
}

/**
 * Process a single frame: save to DB and analyze
 */
async function processFrame(
  sessionId: string,
  frame: ExtractedFrame,
  sequenceNumber: number,
  options: VideoToSessionOptions,
  sessionStartTime: Date,
  previousFrameBase64: string | null
): Promise<string> {
  // Read frame file
  const imageBuffer = await fs.readFile(frame.filePath);
  const imageBase64 = imageBuffer.toString("base64");

  // Calculate hash for deduplication
  const hash = crypto.createHash("sha256").update(imageBuffer).digest("hex");

  // Calculate capture timestamp
  const capturedAt = new Date(sessionStartTime.getTime() + frame.timestamp);

  // Insert capture into database
  const [capture] = await db
    .insert(schema.sessionCaptures)
    .values({
      sessionId,
      sequenceNumber,
      captureTrigger: "periodic",
      capturedAt,
      windowId: "video-window-1",
      appName: options.appName,
      windowTitle: options.windowTitle,
      screenshotPath: frame.filePath,
      screenshotHash: hash,
      imageData: imageBase64,
      analysisStatus: "pending",
    })
    .returning({ id: schema.sessionCaptures.id });

  // Analyze frame (with error handling - continue on failure)
  try {
    const analysisResult = await frameAnalysisService.analyzeFrame({
      sessionId,
      frameId: capture.id,
      currentFrame: imageBase64,
      previousFrame: previousFrameBase64,
      windowInfo: {
        windowSourceId: "video-window-1",
        appName: options.appName,
        windowTitle: options.windowTitle,
      },
      timestamp: capturedAt.toISOString(),
    });

    // Update capture with analysis results
    await db
      .update(schema.sessionCaptures)
      .set({
        analysisStatus: "analyzed",
        deltaChanged: analysisResult.deltaChanged,
        deltaChangeType: analysisResult.changeType,
        deltaChangeDescription: analysisResult.changeDescription,
        deltaUserAction: analysisResult.changeMagnitude === "major" ? "typing" : "viewing",
        activityDescription: analysisResult.summaryOfAction,
        confidence: String(analysisResult.confidence),
        importanceScore: analysisResult.progressionDetected ? 0.7 : 0.3,
        importanceReason: analysisResult.progressionDetected
          ? "Progression detected"
          : "No significant change",
        onTask: true, // Default to on-task for video testing
      })
      .where(eq(schema.sessionCaptures.id, capture.id));

    console.log(
      `   ✓ Frame ${sequenceNumber}: ${analysisResult.progressionDetected ? "Progression detected" : "No change"} - ${analysisResult.summaryOfAction.substring(0, 60)}...`
    );
  } catch (error) {
    console.error(`   ✗ Frame ${sequenceNumber}: Analysis failed -`, error);
    // Mark as skipped but continue processing
    await db
      .update(schema.sessionCaptures)
      .set({
        analysisStatus: "skipped",
      })
      .where(eq(schema.sessionCaptures.id, capture.id));
  }

  return imageBase64;
}

/**
 * Process all frames for the session
 */
async function processFrames(
  sessionId: string,
  frames: ExtractedFrame[],
  options: VideoToSessionOptions,
  sessionStartTime: Date
): Promise<void> {
  console.log(`\n🔄 Processing ${frames.length} frames...`);

  let previousFrameBase64: string | null = null;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const sequenceNumber = i + 1;

    try {
      previousFrameBase64 = await processFrame(
        sessionId,
        frame,
        sequenceNumber,
        options,
        sessionStartTime,
        previousFrameBase64
      );
    } catch (error) {
      console.error(`   ✗ Frame ${sequenceNumber}: Failed to process -`, error);
      // Continue with next frame
    }
  }

  console.log(`\n✅ Processed ${frames.length} frames`);
}

/**
 * End session and generate summary
 */
async function endSession(sessionId: string): Promise<void> {
  console.log(`\n📊 Ending session and generating summary...`);

  // Update session status
  await db
    .update(schema.monitoringSessions)
    .set({
      status: "ended",
      endedAt: new Date(),
    })
    .where(eq(schema.monitoringSessions.id, sessionId));

  // Generate summary
  const summary = await sessionSummarizationService.generateSessionSummary(sessionId);

  console.log(`\n✅ Summary generated in ${(summary.generationTimeMs / 1000).toFixed(2)}s`);
  console.log(`\n📝 Narrative Summary:`);
  console.log(`   ${summary.narrativeSummary}`);

  if (summary.accomplishments.length > 0) {
    console.log(`\n🎯 Accomplishments:`);
    summary.accomplishments.forEach((acc) => console.log(`   • ${acc}`));
  }

  if (summary.blockers.length > 0) {
    console.log(`\n⚠️  Blockers:`);
    summary.blockers.forEach((blocker) => console.log(`   • ${blocker}`));
  }
}

// ===========================
// Cleanup
// ===========================

/**
 * Delete temporary frame directory
 */
async function cleanup(tempDir: string): Promise<void> {
  console.log(`\n🧹 Cleaning up temporary files...`);
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log(`✅ Cleanup complete`);
  } catch (error) {
    console.error(`⚠️  Cleanup failed:`, error);
  }
}

// ===========================
// Utility Functions
// ===========================

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// ===========================
// Main Function
// ===========================

async function main(): Promise<void> {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Video to Session Testing Utility                  ║
╚═══════════════════════════════════════════════════════════╝
`);

  // Parse CLI arguments
  const options = parseArgs();
  if (!options) {
    return;
  }

  // Validate video file exists
  try {
    await fs.access(options.videoPath);
  } catch {
    console.error(`❌ Error: Video file not found: ${options.videoPath}`);
    process.exit(1);
  }

  // Check ffmpeg availability
  try {
    await checkFFmpeg();
    console.log(`✅ ffmpeg is available`);
  } catch (error) {
    console.error(`❌ ${error}`);
    process.exit(1);
  }

  // Create temp directory for frames
  const tempDir = path.join("/tmp", `${TEMP_DIR_PREFIX}${Date.now()}`);
  let sessionId: string | null = null;

  try {
    // Extract frames from video
    const frames = await extractFrames(options.videoPath, tempDir, options.interval);

    if (frames.length === 0) {
      console.error(`❌ No frames extracted from video`);
      process.exit(1);
    }

    // Create session
    sessionId = await createSession(options.userId, options.orgId, options);
    const sessionStartTime = new Date();

    // Process all frames
    await processFrames(sessionId, frames, options, sessionStartTime);

    // End session and generate summary
    await endSession(sessionId);

    // Output final information
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    Session Complete                        ║
╚═══════════════════════════════════════════════════════════╝

Session ID: ${sessionId}
Frames Processed: ${frames.length}
Duration: ${formatDuration(frames[frames.length - 1].timestamp)}

The session is now available in your app for review.
`);
  } catch (error) {
    console.error(`\n❌ Fatal error:`, error);
    process.exit(1);
  } finally {
    // Always cleanup temp files
    await cleanup(tempDir);
  }
}

// ===========================
// Entry Point
// ===========================

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
