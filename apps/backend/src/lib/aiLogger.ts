import { logger } from "./logger";
import { analytics } from "./analytics";

interface AILogContext {
  model: string;
  agent?: string;
  userId?: string;
  conversationId?: string;
  hasScreenshot?: boolean;
}

interface AILogResult {
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  success: boolean;
  errorType?: string;
  errorMessage?: string;
}

/**
 * Log AI request metadata (not full prompts) for debugging and analytics.
 * Logs to both Pino (Railway) and PostHog (analytics patterns).
 */
export function logAIRequest(context: AILogContext, result: AILogResult) {
  const logData = {
    ...context,
    ...result,
    totalTokens: (result.promptTokens || 0) + (result.completionTokens || 0),
  };

  if (result.success) {
    logger.info(logData, `AI request completed: ${context.model}`);
  } else {
    // Log truncated error for debugging
    logger.error(
      {
        ...logData,
        errorMessage: result.errorMessage?.substring(0, 500),
      },
      `AI request failed: ${context.model}`
    );
  }

  // Track in PostHog for patterns
  if (context.userId) {
    analytics.track(context.userId, "ai_request", {
      model: context.model,
      agent: context.agent,
      latencyMs: result.latencyMs,
      success: result.success,
      hasScreenshot: context.hasScreenshot,
      tokenCount: logData.totalTokens,
      errorType: result.errorType,
    });
  }
}

/**
 * Create a timer for measuring AI request latency
 */
export function createAITimer() {
  const startTime = Date.now();
  return {
    elapsed: () => Date.now() - startTime,
  };
}
