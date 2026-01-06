import crypto from "crypto";
import { logger } from "./logger";
import { analytics } from "./analytics";
import * as Sentry from "@sentry/node";

// ============================================================================
// Session Logger Configuration
// ============================================================================

const VERBOSE = process.env.VERBOSE_SESSION_LOGGING === "true";
const LOG_AI_PROMPTS = process.env.SESSION_LOG_AI_PROMPTS === "true";

// In-memory tracking for duplicate detection (development/debugging)
const recentSummaries = new Map<
  string,
  { sessionId: string; timestamp: number; prefix: string }
>();
const DUPLICATE_CHECK_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// Types
// ============================================================================

export interface SessionContext {
  sessionId: string;
  userId?: string;
  organizationId?: string;
  correlationId?: string;
}

export interface CheckpointData {
  checkpoint: string;
  sessionId: string;
  [key: string]: unknown;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique correlation ID for tracking operations across services
 */
export function generateCorrelationId(): string {
  return `sess_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Create a short hash of content for comparison (duplicate detection)
 */
export function createContentHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Truncate content for logging (avoid huge log entries)
 */
function truncate(str: string, maxLength: number = 150): string {
  if (!str) return "";
  return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
}

/**
 * Clean up old entries from duplicate tracking map
 */
function cleanupDuplicateMap(): void {
  const now = Date.now();
  for (const [hash, entry] of recentSummaries) {
    if (now - entry.timestamp > DUPLICATE_CHECK_WINDOW_MS) {
      recentSummaries.delete(hash);
    }
  }
}

// ============================================================================
// Session Logger Factory
// ============================================================================

/**
 * Create a session-aware logger with context automatically attached
 */
export function createSessionLogger(context: SessionContext) {
  const { sessionId, userId, organizationId, correlationId } = context;

  // Create a child logger with session context
  const sessionLogger = logger.child({
    sessionId,
    userId,
    organizationId,
    correlationId: correlationId || generateCorrelationId(),
    component: "session",
  });

  // Set Sentry context for this session (Sentry v8+ API)
  Sentry.setTag("sessionId", sessionId);
  if (userId) Sentry.setUser({ id: userId });
  if (organizationId) Sentry.setTag("organizationId", organizationId);

  return {
    /**
     * Log at debug level (only when VERBOSE_SESSION_LOGGING=true)
     */
    debug(message: string, data?: Record<string, unknown>) {
      if (VERBOSE) {
        sessionLogger.debug(data || {}, message);
      }
    },

    /**
     * Log at info level
     */
    info(message: string, data?: Record<string, unknown>) {
      sessionLogger.info(data || {}, message);
    },

    /**
     * Log at warn level
     */
    warn(message: string, data?: Record<string, unknown>) {
      sessionLogger.warn(data || {}, message);
      Sentry.addBreadcrumb({
        message,
        level: "warning",
        data: { sessionId, ...data },
      });
    },

    /**
     * Log at error level
     */
    error(message: string, data?: Record<string, unknown>) {
      sessionLogger.error(data || {}, message);
      Sentry.addBreadcrumb({
        message,
        level: "error",
        data: { sessionId, ...data },
      });
    },

    /**
     * Log a debug checkpoint with structured data (for tracing the duplicate bug)
     */
    checkpoint(name: string, data: Record<string, unknown>) {
      const checkpointData: CheckpointData = {
        checkpoint: name,
        sessionId,
        ...data,
      };

      sessionLogger.info(checkpointData, `[CHECKPOINT] ${name}`);

      // Also add Sentry breadcrumb for checkpoint
      Sentry.addBreadcrumb({
        message: `Checkpoint: ${name}`,
        category: "session.checkpoint",
        level: "info",
        data: { sessionId, checkpoint: name, ...data },
      });
    },

    /**
     * Log AI prompt and response (only when SESSION_LOG_AI_PROMPTS=true)
     */
    logAIInteraction(
      stage: string,
      prompt: string,
      response?: string,
      metadata?: Record<string, unknown>
    ) {
      if (LOG_AI_PROMPTS) {
        sessionLogger.info(
          {
            stage,
            promptLength: prompt.length,
            promptPreview: truncate(prompt, 500),
            responseLength: response?.length,
            responsePreview: response ? truncate(response, 500) : undefined,
            ...metadata,
          },
          `[AI] ${stage}`
        );
      } else {
        // Always log metadata even if not logging full prompts
        sessionLogger.debug(
          {
            stage,
            promptLength: prompt.length,
            responseLength: response?.length,
            ...metadata,
          },
          `[AI] ${stage}`
        );
      }
    },

    /**
     * Track analytics event for this session
     */
    trackEvent(event: string, properties?: Record<string, unknown>) {
      if (userId) {
        analytics.track(userId, event, {
          sessionId,
          organizationId,
          ...properties,
        });
      }
    },

    /**
     * Get the underlying pino logger for advanced use cases
     */
    raw: sessionLogger,
  };
}

// ============================================================================
// Timer Utility
// ============================================================================

/**
 * Create a timer for measuring operation latency
 */
export function createTimer(operationName: string) {
  const startTime = Date.now();
  const startHrTime = process.hrtime.bigint();

  return {
    /**
     * Get elapsed time in milliseconds
     */
    elapsed(): number {
      return Date.now() - startTime;
    },

    /**
     * Get elapsed time in milliseconds with high precision
     */
    elapsedPrecise(): number {
      const diff = process.hrtime.bigint() - startHrTime;
      return Number(diff) / 1_000_000; // nanoseconds to milliseconds
    },

    /**
     * Log completion with timing
     */
    complete(
      log: ReturnType<typeof createSessionLogger>,
      message?: string,
      data?: Record<string, unknown>
    ) {
      const elapsedMs = this.elapsed();
      log.info(message || `${operationName} completed`, {
        operation: operationName,
        durationMs: elapsedMs,
        ...data,
      });
    },
  };
}

// ============================================================================
// Duplicate Detection
// ============================================================================

/**
 * Check if a summary appears to be a duplicate from another session.
 * Returns the previous session ID if duplicate detected, null otherwise.
 */
export function checkDuplicateSummary(
  sessionId: string,
  summary: string
): { isDuplicate: boolean; previousSessionId?: string; hash: string } {
  cleanupDuplicateMap();

  const hash = createContentHash(summary);
  const existing = recentSummaries.get(hash);

  if (existing && existing.sessionId !== sessionId) {
    // Duplicate detected! Different session has same summary
    const result = {
      isDuplicate: true,
      previousSessionId: existing.sessionId,
      hash,
    };

    // Log and alert
    logger.error(
      {
        alert: "DUPLICATE_SUMMARY_DETECTED",
        currentSessionId: sessionId,
        previousSessionId: existing.sessionId,
        timeSincePreviousMs: Date.now() - existing.timestamp,
        summaryHash: hash,
        summaryPrefix: truncate(summary, 100),
      },
      "ALERT: Duplicate summary detected across sessions"
    );

    // Send to Sentry as a high-priority error
    Sentry.captureMessage("Duplicate session summary detected", {
      level: "error",
      tags: {
        sessionId,
        previousSessionId: existing.sessionId,
        summaryHash: hash,
      },
      extra: {
        currentSessionId: sessionId,
        previousSessionId: existing.sessionId,
        timeDiffMs: Date.now() - existing.timestamp,
        summaryPrefix: truncate(summary, 200),
      },
    });

    return result;
  }

  // Store this summary for future duplicate checks
  recentSummaries.set(hash, {
    sessionId,
    timestamp: Date.now(),
    prefix: truncate(summary, 100),
  });

  return { isDuplicate: false, hash };
}

// ============================================================================
// Checkpoint Constants (for consistent naming)
// ============================================================================

export const CHECKPOINTS = {
  // Master Story Service
  MASTER_STORY_INIT: "MASTER_STORY_INIT",
  MASTER_STORY_EXTEND: "MASTER_STORY_EXTEND",
  MASTER_STORY_RETRIEVAL: "MASTER_STORY_RETRIEVAL",

  // Session Summarization Service
  SUMMARY_GENERATION_START: "SUMMARY_GENERATION_START",
  SUMMARY_PATH_DECISION: "SUMMARY_PATH_DECISION",
  SUMMARY_GENERATION_INPUT: "SUMMARY_GENERATION_INPUT",
  AI_REFINEMENT_OUTPUT: "AI_REFINEMENT_OUTPUT",
  SUMMARY_SAVE: "SUMMARY_SAVE",

  // Frame Analysis Service
  FRAME_ANALYSIS_START: "FRAME_ANALYSIS_START",
  FRAME_ANALYSIS_COMPLETE: "FRAME_ANALYSIS_COMPLETE",

  // Session Delivery Service
  DELIVERY_START: "DELIVERY_START",
  DELIVERY_COMPLETE: "DELIVERY_COMPLETE",
  DELIVERY_FAILED: "DELIVERY_FAILED",

  // Monitoring Routes
  SESSION_START: "SESSION_START",
  SESSION_END: "SESSION_END",
  SESSION_PAUSE: "SESSION_PAUSE",
  SESSION_RESUME: "SESSION_RESUME",
} as const;

// ============================================================================
// PostHog Session Events
// ============================================================================

export const SESSION_EVENTS = {
  SESSION_STARTED: "session_started",
  SESSION_ENDED: "session_ended",
  SESSION_PAUSED: "session_paused",
  SESSION_RESUMED: "session_resumed",
  SUMMARY_GENERATED: "session_summary_generated",
  SUMMARY_PATH_USED: "session_summary_path",
  MASTER_STORY_EXTENDED: "session_master_story_extended",
  FRAME_ANALYZED: "session_frame_analyzed",
  DELIVERY_ATTEMPTED: "session_delivery_attempted",
  DELIVERY_SUCCEEDED: "session_delivery_succeeded",
  DELIVERY_FAILED: "session_delivery_failed",
  DUPLICATE_DETECTED: "session_duplicate_detected",
} as const;
