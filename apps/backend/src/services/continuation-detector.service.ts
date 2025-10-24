/**
 * Continuation signal detection result
 */
export interface ContinuationSignal {
  isContinuation: boolean;
  type: "explicit" | "implicit" | "screen_change" | "completion" | "none";
  confidence: number; // 0-1
  reason: string;
}

/**
 * Continuation Detector Service
 *
 * Detects when a user is signaling they've completed a workflow step
 * and are ready for the next instruction. Supports:
 * - Explicit signals: "Done", "Next", "Okay"
 * - Implicit signals: Follow-up questions, error reports
 * - Screen change detection: Comparing screenshot hashes
 * - Completion signals: "Thanks", "I got it"
 */
class ContinuationDetectorService {
  /**
   * Explicit continuation phrases
   */
  private readonly EXPLICIT_SIGNALS = [
    // Completion confirmations
    "done",
    "finished",
    "completed",
    "got it",

    // Next step requests
    "next",
    "next step",
    "what's next",
    "what next",
    "now what",
    "and then",
    "continue",

    // Acknowledgments
    "okay",
    "ok",
    "k",
    "sure",
    "yes",
    "yep",
    "yeah",
    "alright",
    "sounds good",

    // Ready signals
    "ready",
    "i'm ready",
    "let's continue",
  ];

  /**
   * Completion/exit signals
   */
  private readonly COMPLETION_SIGNALS = [
    "thanks",
    "thank you",
    "i'm done",
    "i'm good",
    "that's all",
    "got it from here",
    "i can take it from here",
    "no more help needed",
  ];

  /**
   * Implicit continuation indicators (asking about current step)
   */
  private readonly IMPLICIT_INDICATORS = [
    "i don't see",
    "i can't find",
    "where is",
    "where's the",
    "which button",
    "which one",
    "what do you mean",
    "how do i click",
    "it's not working",
    "nothing happened",
    "error",
    "failed",
  ];

  /**
   * Detect continuation signal from user message
   *
   * @param userMessage - The user's message
   * @param previousInstruction - The last instruction given
   * @param screenshotHash - Optional current screenshot hash
   * @param previousScreenshotHash - Optional previous screenshot hash
   * @returns Continuation signal details
   */
  detectContinuation(
    userMessage: string,
    _previousInstruction?: string,
    screenshotHash?: string,
    previousScreenshotHash?: string
  ): ContinuationSignal {
    const messageLower = userMessage.toLowerCase().trim();

    // Check for completion/exit signals first
    for (const signal of this.COMPLETION_SIGNALS) {
      if (messageLower.includes(signal)) {
        return {
          isContinuation: false, // Not continuing - they're done
          type: "completion",
          confidence: 0.95,
          reason: `User signaled completion with "${signal}"`,
        };
      }
    }

    // Check for explicit continuation signals
    for (const signal of this.EXPLICIT_SIGNALS) {
      if (messageLower === signal || messageLower.startsWith(signal + " ")) {
        return {
          isContinuation: true,
          type: "explicit",
          confidence: 0.9,
          reason: `Explicit continuation signal: "${signal}"`,
        };
      }
    }

    // Check for screen change (if screenshots provided)
    if (screenshotHash && previousScreenshotHash && screenshotHash !== previousScreenshotHash) {
      return {
        isContinuation: true,
        type: "screen_change",
        confidence: 0.85,
        reason: "Screen changed - likely progressed to next step",
      };
    }

    // Check for implicit signals (questions about current step)
    for (const indicator of this.IMPLICIT_INDICATORS) {
      if (messageLower.includes(indicator)) {
        return {
          isContinuation: false, // Not ready - having trouble with current step
          type: "implicit",
          confidence: 0.7,
          reason: `User needs clarification: "${indicator}"`,
        };
      }
    }

    // Check if it's a very short message (likely acknowledgment)
    if (messageLower.length <= 3 && /^[a-z]+$/.test(messageLower)) {
      return {
        isContinuation: true,
        type: "explicit",
        confidence: 0.6,
        reason: "Very short message - likely acknowledgment",
      };
    }

    // Check if user is asking a new question (not continuing)
    if (messageLower.includes("how do i") || messageLower.includes("how to")) {
      return {
        isContinuation: false,
        type: "none",
        confidence: 0.8,
        reason: "New question - not a continuation",
      };
    }

    // Default: no clear signal
    return {
      isContinuation: false,
      type: "none",
      confidence: 0.5,
      reason: "No clear continuation signal detected",
    };
  }

  /**
   * Create a simple hash of screenshot data for comparison
   * @param screenshotData - Base64 screenshot data (string or Buffer)
   * @returns Simple hash string
   */
  hashScreenshot(screenshotData: string | Buffer | any): string {
    // Handle null, undefined, or empty
    if (!screenshotData) {
      return "empty-screenshot";
    }

    // Handle Buffer
    if (Buffer.isBuffer(screenshotData)) {
      if (screenshotData.length === 0) {
        return "empty-screenshot";
      }
      screenshotData = screenshotData.toString("base64");
    }

    // Handle non-string types (could be object, array, etc)
    if (typeof screenshotData !== "string") {
      return "empty-screenshot";
    }

    // Handle empty or very short strings
    if (screenshotData.length === 0) {
      return "empty-screenshot";
    }

    // Take a sample of the screenshot data for quick comparison
    // In production, you might use a proper perceptual hash
    const sampleSize = Math.min(1000, screenshotData.length);
    const sample =
      screenshotData.substring(0, sampleSize) +
      (screenshotData.length > sampleSize
        ? screenshotData.substring(screenshotData.length - sampleSize)
        : "");

    // Simple hash based on length and sample content
    let hash = screenshotData.length.toString(36);
    for (let i = 0; i < sample.length; i += 10) {
      hash += sample.charCodeAt(i).toString(36);
    }

    return hash;
  }

  /**
   * Determine if user is stuck on current step
   *
   * @param userMessage - The user's message
   * @param timeSinceLastStep - Time in milliseconds since last step
   * @returns True if user appears stuck
   */
  isUserStuck(userMessage: string, timeSinceLastStep: number): boolean {
    const messageLower = userMessage.toLowerCase();

    // Check for stuck indicators
    const stuckIndicators = [
      "i don't see",
      "can't find",
      "not working",
      "nothing happened",
      "stuck",
      "confused",
      "help",
      "still don't",
    ];

    const hasStuckIndicator = stuckIndicators.some((indicator) => messageLower.includes(indicator));

    // If they've been on the same step for > 2 minutes and asking questions
    const STUCK_THRESHOLD = 2 * 60 * 1000; // 2 minutes
    const takingTooLong = timeSinceLastStep > STUCK_THRESHOLD;

    return hasStuckIndicator || (takingTooLong && messageLower.includes("?"));
  }
}

// Export singleton instance
export const continuationDetectorService = new ContinuationDetectorService();
