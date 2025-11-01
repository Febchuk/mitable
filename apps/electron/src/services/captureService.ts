/**
 * Screenshot Capture Service
 *
 * Provides comprehensive screenshot capture functionality for the Mitable Agent window.
 * Supports multiple capture modes, multi-monitor setups, automatic image processing,
 * and temporary file management with auto-cleanup.
 *
 * Features:
 * - Active window capture
 * - Full screen capture (with display selection)
 * - Region capture
 * - Multi-monitor support
 * - Automatic image resizing (max 1920x1080)
 * - Retina/HiDPI display handling
 * - Temporary file management with auto-cleanup
 * - Window metadata extraction (title, bounds)
 * - Memory usage monitoring
 *
 * @module captureService
 */

import { desktopCapturer, screen, nativeImage, NativeImage, Display } from "electron";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import crypto from "crypto";

// ===========================
// Types & Interfaces
// ===========================

/**
 * Rectangle representing coordinates and dimensions
 */
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Display information from Electron's screen API
 */
export interface DisplayInfo {
  id: number;
  bounds: Rectangle;
  workArea: Rectangle;
  scaleFactor: number;
  rotation: number;
  internal: boolean;
}

/**
 * Window metadata extracted from capture source
 */
export interface WindowMetadata {
  title: string;
  bounds: Rectangle;
  sourceId: string;
  display: DisplayInfo;
}

/**
 * Screenshot capture options
 */
export interface CaptureOptions {
  /** Capture mode */
  mode?: "active-window" | "full-screen" | "region";
  /** Display ID for multi-monitor setups (full-screen mode only) */
  displayId?: number;
  /** Bounds for region capture (region mode only) */
  bounds?: Rectangle;
  /** Whether to save to temp file (default: false, returns base64) */
  saveToFile?: boolean;
}

/**
 * Screenshot capture result
 */
export interface CaptureResult {
  /** Base64-encoded image data (with data URL prefix) */
  dataUrl: string;
  /** Optional file path if saved to temp */
  filePath?: string;
  /** Screenshot metadata */
  metadata: {
    width: number;
    height: number;
    originalWidth: number;
    originalHeight: number;
    scaleFactor: number; // Display scale factor (1 = standard, 2 = Retina, 1.5 = Windows 150%)
    captureMode: string;
    timestamp: number;
    window?: WindowMetadata;
  };
}

/**
 * Temporary file information
 */
interface TempFileInfo {
  filePath: string;
  createdAt: number;
  expiresAt: number;
  size: number;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  tempFileCount: number;
  totalTempFileSize: number;
  memoryUsageMB: number;
}

/**
 * Conversation context for screenshot capture heuristics
 */
export interface ConversationContext {
  /** Whether there is an active workflow in progress */
  hasActiveWorkflow: boolean;
  /** Type of the last assistant message */
  lastMessageType?: string;
  /** Number of messages in conversation */
  messageCount: number;
  /** Whether the last message contained workflow card data */
  lastMessageHadCardData?: boolean;
}

/**
 * Screenshot capture decision result
 */
export interface CaptureDecision {
  /** Whether screenshot should be captured */
  shouldCapture: boolean;
  /** Reason for the decision (for logging/debugging) */
  reason: string;
  /** Confidence score (0-1) of the decision */
  confidence: number;
  /** Which heuristics triggered (for analytics) */
  triggeredHeuristics: string[];
}

// ===========================
// CaptureService Class
// ===========================

class CaptureService {
  private tempFiles: Map<string, TempFileInfo> = new Map();
  private readonly MAX_TEMP_FILES = 10;
  private readonly TEMP_FILE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
  private readonly MAX_WIDTH = 1920;
  private readonly MAX_HEIGHT = 1080;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanupInterval();
    console.log("[CaptureService] Initialized");
  }

  /**
   * Evaluate whether a screenshot should be captured based on message content and context
   *
   * @param message - User message content
   * @param context - Conversation context (workflow state, message history, etc.)
   * @returns Decision object with shouldCapture flag, reason, and confidence
   */
  evaluateCaptureNeed(message: string, context: ConversationContext): CaptureDecision {
    const triggeredHeuristics: string[] = [];
    let confidence = 0;

    // Normalize message for analysis
    const normalizedMessage = message.toLowerCase().trim();

    // ============================================
    // HEURISTIC 1: Active Workflow (HIGHEST PRIORITY)
    // ============================================
    // If there's an active workflow, ALWAYS capture to track progress
    if (context.hasActiveWorkflow) {
      triggeredHeuristics.push("active_workflow");
      return {
        shouldCapture: true,
        reason: "Active workflow in progress - screenshot required for step tracking",
        confidence: 1.0,
        triggeredHeuristics,
      };
    }

    // ============================================
    // HEURISTIC 2: Workflow-Related Last Message
    // ============================================
    // If last message was workflow-related, likely continuation
    if (context.lastMessageType === "workflow" || context.lastMessageHadCardData) {
      triggeredHeuristics.push("workflow_continuation");
      confidence += 0.8; // High confidence - workflows need screenshots
    }

    // ============================================
    // HEURISTIC 3: Help/Guidance Request Patterns
    // ============================================
    // User is asking for help with a task
    const helpPatterns = [
      // Direct help requests
      /\b(how do i|how can i|how to|help me|show me|guide me|walk me through|teach me)\b/i,
      // Task-oriented questions
      /\b(where do i|what do i|when do i|which|should i)\b/i,
      // Instructions/guidance
      /\b(step by step|instructions|tutorial|walkthrough)\b/i,
    ];

    for (const pattern of helpPatterns) {
      if (pattern.test(normalizedMessage)) {
        triggeredHeuristics.push("help_request");
        confidence += 0.7; // Strong indicator - help requests usually need visual context
        break;
      }
    }

    // ============================================
    // HEURISTIC 4: Visual Language Indicators
    // ============================================
    // User is talking about visual elements on screen
    const visualPatterns = [
      // Visibility issues
      /\b(don't see|can't see|can't find|don't find|not seeing|not showing|missing|where is|where's)\b/i,
      // UI element references
      /\b(button|icon|menu|tab|link|field|box|dialog|window|screen|page|form|dropdown|checkbox)\b/i,
      // Actions on UI
      /\b(click|press|tap|select|choose|open|close|expand|collapse|scroll|drag|drop)\b/i,
      // Visual descriptors
      /\b(top|bottom|left|right|corner|side|toolbar|sidebar|header|footer|banner)\b/i,
      // Looking/finding
      /\b(looking for|trying to find|search for|locate)\b/i,
    ];

    for (const pattern of visualPatterns) {
      if (pattern.test(normalizedMessage)) {
        triggeredHeuristics.push("visual_language");
        confidence += 0.6; // Clear visual reference - likely needs screenshot
        break;
      }
    }

    // ============================================
    // HEURISTIC 5: Problem/Error Indicators
    // ============================================
    // User is reporting an issue that needs visual inspection
    const problemPatterns = [
      /\b(error|issue|problem|wrong|broken|not working|doesn't work|isn't working|stuck|confused)\b/i,
      /\b(why is|why isn't|why won't|what's wrong|what happened)\b/i,
    ];

    for (const pattern of problemPatterns) {
      if (pattern.test(normalizedMessage)) {
        triggeredHeuristics.push("problem_report");
        confidence += 0.5; // Problems often need visual diagnosis
        break;
      }
    }

    // ============================================
    // HEURISTIC 6: Demonstrative Language
    // ============================================
    // User is referencing "this" or "here" (likely pointing at screen)
    const demonstrativePatterns = [/\b(this|these|here|that|those)\b/i];

    for (const pattern of demonstrativePatterns) {
      if (pattern.test(normalizedMessage)) {
        triggeredHeuristics.push("demonstrative_reference");
        confidence += 0.7; // The user is most likely talking about their screen, so we should categorise this as a vague prompt
        break;
      }
    }

    // ============================================
    // HEURISTIC 7: Action Verb + Object Patterns
    // ============================================
    // User is describing an action they want to perform
    const actionObjectPatterns = [
      // Create/Add actions
      /\b(create|make|add|insert|upload|post|publish|submit|send)\s+(a|an|the)?\s*\w+/i,
      // Modify actions
      /\b(edit|change|update|modify|delete|remove|rename)\s+(a|an|the|my)?\s*\w+/i,
      // View actions
      /\b(view|see|check|look at|review|inspect|examine)\s+(a|an|the|my)?\s*\w+/i,
    ];

    for (const pattern of actionObjectPatterns) {
      if (pattern.test(normalizedMessage)) {
        triggeredHeuristics.push("action_object_pattern");
        confidence += 0.3; // Moderate signal - combination preferred
        break;
      }
    }

    // ============================================
    // NEGATIVE HEURISTICS (reduce confidence)
    // ============================================
    // These patterns suggest screenshot is NOT needed

    // Pure knowledge/information queries
    const knowledgePatterns = [
      /\b(what is|what are|who is|who are|define|definition|meaning|explain|tell me about)\b/i,
      /\b(why do we|why does|why should|when should|when do we)\b/i,
    ];

    for (const pattern of knowledgePatterns) {
      if (pattern.test(normalizedMessage)) {
        triggeredHeuristics.push("knowledge_query");
        confidence -= 0.3;
        break;
      }
    }

    // Simple greetings
    const greetingPatterns = [
      /^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you|ok|okay|yes|no|sure)$/i,
    ];

    for (const pattern of greetingPatterns) {
      if (pattern.test(normalizedMessage)) {
        triggeredHeuristics.push("greeting");
        confidence -= 0.5;
        break;
      }
    }

    // ============================================
    // DECISION LOGIC
    // ============================================
    // Confidence threshold: 0.5
    // If confidence >= 0.5, capture screenshot
    // Cap confidence between 0 and 1
    confidence = Math.max(0, Math.min(1, confidence));

    const shouldCapture = confidence >= 0.5;

    return {
      shouldCapture,
      reason: shouldCapture
        ? `Screenshot needed (confidence: ${confidence.toFixed(2)}, triggers: ${triggeredHeuristics.join(", ")})`
        : `Screenshot not needed (confidence: ${confidence.toFixed(2)}, triggers: ${triggeredHeuristics.join(", ")})`,
      confidence,
      triggeredHeuristics,
    };
  }

  /**
   * Conditionally capture screenshot based on message content and context
   *
   * @param message - User message content
   * @param context - Conversation context
   * @param options - Capture options (mode, display, etc.)
   * @returns Capture result if screenshot was needed, null otherwise
   */
  async conditionalCapture(
    message: string,
    context: ConversationContext,
    options: CaptureOptions = {}
  ): Promise<{ decision: CaptureDecision; result: CaptureResult | null }> {
    // Evaluate whether screenshot is needed
    const decision = this.evaluateCaptureNeed(message, context);

    console.log("[CaptureService] Capture decision:", {
      shouldCapture: decision.shouldCapture,
      reason: decision.reason,
      confidence: decision.confidence,
      triggeredHeuristics: decision.triggeredHeuristics,
    });

    // If not needed, return early
    if (!decision.shouldCapture) {
      return { decision, result: null };
    }

    // Capture screenshot
    const result = await this.capture(options);

    if (!result) {
      console.error("[CaptureService] Screenshot capture failed despite being needed");
    }

    return { decision, result };
  }

  /**
   * Main capture method - dispatches to specific capture mode
   *
   * @param options - Capture options
   * @returns Capture result with image data and metadata
   */
  async capture(options: CaptureOptions = {}): Promise<CaptureResult | null> {
    const { mode = "full-screen" } = options;

    console.log("[CaptureService] Starting capture:", {
      mode,
      displayId: options.displayId,
      hasBounds: !!options.bounds,
      saveToFile: options.saveToFile,
    });

    try {
      let result: CaptureResult | null;

      switch (mode) {
        case "active-window":
          result = await this.captureActiveWindow(options.saveToFile);
          break;
        case "full-screen":
          result = await this.captureFullScreen(options.displayId, options.saveToFile);
          break;
        case "region":
          if (!options.bounds) {
            throw new Error("Region capture requires bounds parameter");
          }
          result = await this.captureRegion(options.bounds, options.saveToFile);
          break;
        default:
          throw new Error(`Unknown capture mode: ${mode}`);
      }

      if (result) {
        console.log("[CaptureService] Capture successful:", {
          mode,
          width: result.metadata.width,
          height: result.metadata.height,
          hasFile: !!result.filePath,
        });
      }

      return result;
    } catch (error) {
      console.error("[CaptureService] Capture failed:", error);
      return null;
    }
  }

  /**
   * Capture the currently active/focused window
   *
   * @param saveToFile - Whether to save to temp file
   * @returns Capture result or null on failure
   */
  async captureActiveWindow(saveToFile: boolean = false): Promise<CaptureResult | null> {
    try {
      // Get all window sources
      const sources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: {
          width: this.MAX_WIDTH * 2, // Allow for HiDPI
          height: this.MAX_HEIGHT * 2,
        },
      });

      if (sources.length === 0) {
        console.error("[CaptureService] No window sources found");
        return null;
      }

      // Get the first non-Electron window (skip our own windows)
      const targetSource = sources.find(
        (source) => !source.name.includes("Mitable") && source.name.trim().length > 0
      );

      if (!targetSource) {
        console.error("[CaptureService] No suitable window found");
        return null;
      }

      console.log("[CaptureService] Capturing active window:", targetSource.name);

      // Get the thumbnail image
      let image = targetSource.thumbnail;
      const originalSize = image.getSize();

      // Resize if needed
      image = this.resizeIfNeeded(image, this.MAX_WIDTH, this.MAX_HEIGHT);
      const finalSize = image.getSize();

      // Convert to data URL
      const dataUrl = image.toDataURL();

      // Extract window metadata
      const display = screen.getPrimaryDisplay();
      const scaleFactor = display.scaleFactor;
      const windowMetadata: WindowMetadata = {
        title: targetSource.name,
        bounds: {
          x: 0, // Not available from desktopCapturer
          y: 0,
          width: finalSize.width,
          height: finalSize.height,
        },
        sourceId: targetSource.id,
        display: this.displayToInfo(display),
      };

      // Save to temp file if requested
      let filePath: string | undefined;
      if (saveToFile) {
        const fileId = this.generateFileId();
        filePath = await this.saveToTemp(image, fileId);
      }

      return {
        dataUrl,
        filePath,
        metadata: {
          width: finalSize.width,
          height: finalSize.height,
          originalWidth: originalSize.width,
          originalHeight: originalSize.height,
          scaleFactor: scaleFactor,
          captureMode: "active-window",
          timestamp: Date.now(),
          window: windowMetadata,
        },
      };
    } catch (error) {
      console.error("[CaptureService] Active window capture failed:", error);
      return null;
    }
  }

  /**
   * Capture the full screen of a specific display
   *
   * @param displayId - Display ID (defaults to primary display)
   * @param saveToFile - Whether to save to temp file
   * @returns Capture result or null on failure
   */
  async captureFullScreen(
    displayId?: number,
    saveToFile: boolean = false
  ): Promise<CaptureResult | null> {
    try {
      // Get target display
      const displays = screen.getAllDisplays();
      const targetDisplay =
        displayId !== undefined
          ? displays.find((d) => d.id === displayId) || screen.getPrimaryDisplay()
          : screen.getPrimaryDisplay();

      const { width, height } = targetDisplay.size;
      const scaleFactor = targetDisplay.scaleFactor;

      console.log("[CaptureService] Capturing full screen:", {
        displayId: targetDisplay.id,
        width,
        height,
        scaleFactor,
      });

      // Capture screenshot using desktopCapturer
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: width * scaleFactor,
          height: height * scaleFactor,
        },
      });

      if (sources.length === 0) {
        console.error("[CaptureService] No screen sources found");
        return null;
      }

      // Use the first screen source (or match by display if possible)
      // Note: desktopCapturer doesn't directly map to display IDs
      const screenSource = sources[0];
      let image = screenSource.thumbnail;
      const originalSize = image.getSize();

      // Resize if needed
      image = this.resizeIfNeeded(image, this.MAX_WIDTH, this.MAX_HEIGHT);
      const finalSize = image.getSize();

      // Convert to data URL
      const dataUrl = image.toDataURL();

      // Save to temp file if requested
      let filePath: string | undefined;
      if (saveToFile) {
        const fileId = this.generateFileId();
        filePath = await this.saveToTemp(image, fileId);
      }

      return {
        dataUrl,
        filePath,
        metadata: {
          width: finalSize.width,
          height: finalSize.height,
          originalWidth: originalSize.width,
          originalHeight: originalSize.height,
          scaleFactor: scaleFactor,
          captureMode: "full-screen",
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      console.error("[CaptureService] Full screen capture failed:", error);
      return null;
    }
  }

  /**
   * Capture a specific region of the screen
   *
   * @param bounds - Region bounds (x, y, width, height)
   * @param saveToFile - Whether to save to temp file
   * @returns Capture result or null on failure
   */
  async captureRegion(
    bounds: Rectangle,
    saveToFile: boolean = false
  ): Promise<CaptureResult | null> {
    try {
      // First capture full screen, then crop to region
      const fullScreenResult = await this.captureFullScreen(undefined, false);

      if (!fullScreenResult) {
        console.error("[CaptureService] Failed to capture full screen for region crop");
        return null;
      }

      // Extract scaleFactor from full screen capture
      const scaleFactor = fullScreenResult.metadata.scaleFactor;

      // Convert data URL back to NativeImage
      const base64Data = fullScreenResult.dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      let image = nativeImage.createFromBuffer(buffer);

      // Crop to specified region
      image = image.crop(bounds);
      const originalSize = image.getSize();

      // Resize if needed
      image = this.resizeIfNeeded(image, this.MAX_WIDTH, this.MAX_HEIGHT);
      const finalSize = image.getSize();

      // Convert to data URL
      const dataUrl = image.toDataURL();

      // Save to temp file if requested
      let filePath: string | undefined;
      if (saveToFile) {
        const fileId = this.generateFileId();
        filePath = await this.saveToTemp(image, fileId);
      }

      return {
        dataUrl,
        filePath,
        metadata: {
          width: finalSize.width,
          height: finalSize.height,
          originalWidth: originalSize.width,
          originalHeight: originalSize.height,
          scaleFactor: scaleFactor,
          captureMode: "region",
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      console.error("[CaptureService] Region capture failed:", error);
      return null;
    }
  }

  /**
   * Resize image if it exceeds maximum dimensions
   * Maintains aspect ratio
   *
   * @param image - NativeImage to resize
   * @param maxWidth - Maximum width
   * @param maxHeight - Maximum height
   * @returns Resized image (or original if within limits)
   */
  private resizeIfNeeded(image: NativeImage, maxWidth: number, maxHeight: number): NativeImage {
    const { width, height } = image.getSize();

    if (width <= maxWidth && height <= maxHeight) {
      return image; // No resize needed
    }

    // Calculate aspect ratio
    const aspectRatio = width / height;
    let newWidth = width;
    let newHeight = height;

    if (width > maxWidth) {
      newWidth = maxWidth;
      newHeight = Math.round(newWidth / aspectRatio);
    }

    if (newHeight > maxHeight) {
      newHeight = maxHeight;
      newWidth = Math.round(newHeight * aspectRatio);
    }

    console.log("[CaptureService] Resizing image:", {
      original: { width, height },
      resized: { width: newWidth, height: newHeight },
    });

    return image.resize({ width: newWidth, height: newHeight });
  }

  /**
   * Save image to temporary file
   *
   * @param image - NativeImage to save
   * @param fileId - Unique file identifier
   * @returns File path
   */
  private async saveToTemp(image: NativeImage, fileId: string): Promise<string> {
    const fileName = `screenshot-${fileId}.png`;
    const filePath = join(tmpdir(), "mitable-screenshots", fileName);

    // Ensure directory exists
    await fs.mkdir(join(tmpdir(), "mitable-screenshots"), { recursive: true });

    // Save PNG file
    const pngBuffer = image.toPNG();
    await fs.writeFile(filePath, pngBuffer);

    // Track temp file
    const fileInfo: TempFileInfo = {
      filePath,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.TEMP_FILE_TTL_MS,
      size: pngBuffer.length,
    };

    this.tempFiles.set(fileId, fileInfo);

    // Enforce max temp files limit
    if (this.tempFiles.size > this.MAX_TEMP_FILES) {
      await this.cleanupOldestFile();
    }

    console.log("[CaptureService] Saved to temp:", {
      fileId,
      filePath,
      size: pngBuffer.length,
      totalFiles: this.tempFiles.size,
    });

    return filePath;
  }

  /**
   * Generate unique file ID
   *
   * @returns Unique identifier
   */
  private generateFileId(): string {
    return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
  }

  /**
   * Convert Electron Display to DisplayInfo
   *
   * @param display - Electron Display object
   * @returns DisplayInfo object
   */
  private displayToInfo(display: Display): DisplayInfo {
    return {
      id: display.id,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
      internal: display.internal,
    };
  }

  /**
   * Get all connected displays
   *
   * @returns Array of display information
   */
  getAllDisplays(): DisplayInfo[] {
    return screen.getAllDisplays().map((display) => this.displayToInfo(display));
  }

  /**
   * Get primary display information
   *
   * @returns Primary display info
   */
  getPrimaryDisplay(): DisplayInfo {
    return this.displayToInfo(screen.getPrimaryDisplay());
  }

  /**
   * Clean up a specific temp file
   *
   * @param fileId - File identifier
   */
  async cleanupTemp(fileId: string): Promise<void> {
    const fileInfo = this.tempFiles.get(fileId);

    if (!fileInfo) {
      return;
    }

    try {
      await fs.unlink(fileInfo.filePath);
      this.tempFiles.delete(fileId);
      console.log("[CaptureService] Cleaned up temp file:", fileId);
    } catch (error) {
      console.error("[CaptureService] Failed to cleanup temp file:", fileId, error);
    }
  }

  /**
   * Clean up oldest temp file when limit is reached
   */
  private async cleanupOldestFile(): Promise<void> {
    let oldestFileId: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [fileId, fileInfo] of this.tempFiles.entries()) {
      if (fileInfo.createdAt < oldestTimestamp) {
        oldestTimestamp = fileInfo.createdAt;
        oldestFileId = fileId;
      }
    }

    if (oldestFileId) {
      await this.cleanupTemp(oldestFileId);
    }
  }

  /**
   * Clean up all expired temp files
   */
  private async cleanupExpiredFiles(): Promise<void> {
    const now = Date.now();
    const expiredFiles: string[] = [];

    for (const [fileId, fileInfo] of this.tempFiles.entries()) {
      if (now > fileInfo.expiresAt) {
        expiredFiles.push(fileId);
      }
    }

    if (expiredFiles.length > 0) {
      console.log(`[CaptureService] Cleaning up ${expiredFiles.length} expired temp file(s)`);
      await Promise.all(expiredFiles.map((fileId) => this.cleanupTemp(fileId)));
    }
  }

  /**
   * Clean up all temp files (for graceful shutdown)
   */
  async cleanupAll(): Promise<void> {
    console.log(`[CaptureService] Cleaning up all ${this.tempFiles.size} temp file(s)`);
    const fileIds = Array.from(this.tempFiles.keys());
    await Promise.all(fileIds.map((fileId) => this.cleanupTemp(fileId)));
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredFiles();
    }, this.CLEANUP_INTERVAL_MS);

    console.log("[CaptureService] Started cleanup interval");
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log("[CaptureService] Stopped cleanup interval");
    }
  }

  /**
   * Get memory statistics
   *
   * @returns Memory stats object
   */
  getMemoryStats(): MemoryStats {
    let totalSize = 0;

    for (const fileInfo of this.tempFiles.values()) {
      totalSize += fileInfo.size;
    }

    const memoryUsage = process.memoryUsage();

    return {
      tempFileCount: this.tempFiles.size,
      totalTempFileSize: totalSize,
      memoryUsageMB: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100,
    };
  }
}

// ===========================
// Singleton Export
// ===========================

/**
 * Singleton instance of CaptureService
 */
export const captureService = new CaptureService();

// ===========================
// Process Cleanup
// ===========================

/**
 * Clean up on graceful shutdown
 */
process.on("SIGINT", async () => {
  console.log("[CaptureService] Received SIGINT, cleaning up...");
  captureService.stopCleanup();
  await captureService.cleanupAll();
});

process.on("SIGTERM", async () => {
  console.log("[CaptureService] Received SIGTERM, cleaning up...");
  captureService.stopCleanup();
  await captureService.cleanupAll();
});
