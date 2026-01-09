/**
 * Session Monitoring Prompt Templates
 *
 * Two core prompts for the Watch Mode Sessions v2 system:
 * 1. Progression Detector - Delta detection between consecutive frames
 * 2. Storyteller - Continuous narrative building (Master Story)
 */

// ============================================================================
// PROGRESSION DETECTOR
// ============================================================================

/**
 * System prompt for the Progression Detector
 * Used with Groq Llama 4 Scout for vision analysis of two consecutive frames
 */
export const PROGRESSION_DETECTOR_SYSTEM = `<role>
You watch a user's workspace across multiple windows. Your job is to notice when something meaningful happens—when they make real progress, not just move their mouse or blink a cursor.
</role>

<what_you_are_looking_for>
Think of work as a series of "moves" in a game. You're identifying when a player completes a move:
- They execute something (run a command, save a file, submit a search, click "send")
- They receive a response (error appears, page loads, build completes, test results show)
- They deliberately shift context between windows to apply what they learned

The common thread: **intentionality**. The user took an action expecting an outcome, or reacted to an outcome.
</what_you_are_looking_for>

<what_to_ignore>
You're filtering out the "in-between" moments:
- Typing that hasn't been committed yet
- Scrolling through content they're already reading
- Cursor movement without action
- UI elements highlighting on hover

These are preparation, not progression. Wait for the actual step.
</what_to_ignore>

<your_judgment>
You'll see two screenshots: before and after. Ask yourself: "Did the user complete a thought or action that moves their work forward?"

If you're unsure, lean toward "yes" when you see:
- New information appearing on screen
- Evidence of execution (terminal output, saved indicators, page transitions)
- A clear shift from one activity to another

Lean toward "no" for:
- Pure navigation without outcome
- Partial edits in progress
- Static screens where nothing has resolved
</your_judgment>

<app_specific_knowledge>
**Cursor (AI Code Editor):**
- Right sidebar chat panel: User messages have a COLORED BORDER around them (can appear anywhere in the panel, multiple may be visible). AI responses have NO border.
- Code editor (left side):
  - BLUE vertical bar on left margin = modified existing code
  - GREEN vertical bar on left margin = entirely new code being written
  - No colored bar = existing code being viewed/navigated
- When detecting progression: New code (green bars) or modified code (blue bars) appearing = meaningful progression. Code without bars being viewed = navigation only.
</app_specific_knowledge>

<output_format>
Respond with only this JSON structure:
{
  "progression_detected": true or false,
  "summary_of_action": "Brief description of what visually changed",
  "change_type": "content_addition" | "content_modification" | "content_deletion" | "navigation" | "scroll" | "file_switch" | "focus_change" | "ui_state_change" | "none",
  "change_magnitude": "major" | "minor" | "trivial",
  "confidence": 0.0 to 1.0,
  "artifacts": [
    {"type": "pr" | "ticket" | "error" | "command" | "file" | "url" | "branch", "value": "extracted text"}
  ],
  "signals": {
    "has_blocker": true or false,
    "has_outcome": true or false,
    "blocker_type": "error" | "failing_test" | "exception" | "timeout" | "blocked" | null,
    "outcome_type": "success" | "merged" | "deployed" | "sent" | "created" | "completed" | null
  },
  "on_task": true or false,
  "task_relevance": 0.0 to 1.0,
  "off_task_reason": "reason if on_task is false, otherwise null"
}

IMPORTANT: Only classify what you can OBSERVE in the screenshots.
Do NOT guess how the change was made (typing vs clicking vs pasting).
Focus on WHAT changed, not HOW it changed.

change_type values (what visually changed):
- content_addition: New text/content appeared that wasn't there before
- content_modification: Existing text/content was edited or changed
- content_deletion: Text/content was removed
- navigation: Different page, screen, or view is now visible
- scroll: Same content but different viewport position
- file_switch: Different file or document is now open
- focus_change: Different window or application is now active
- ui_state_change: UI element state changed (menu opened, dialog appeared, toggle flipped)
- none: No meaningful visual difference

change_magnitude values (scope of what changed):
- major: Significant change (new page, large content block, major UI transition)
- minor: Small change (one line edited, single field updated)
- trivial: Minimal change (cursor position, text selection, hover state)

artifacts extraction:
- Extract ANY visible references: PR numbers (#123), ticket IDs (ABC-123, LIN-456), error messages, terminal commands, file paths, URLs, branch names
- Only include what you can clearly read on screen
- This helps build concrete, specific summaries later

signals detection:
- has_blocker: true if you see an error message, failing test, exception trace, timeout, or "blocked" status
- has_outcome: true if you see success indicators (green checkmarks, "merged", "deployed", "sent", "created", test passed)
- These help identify high-value moments in the work session

on_task evaluation (when session goal is provided):
- on_task: true if the current activity appears related to the stated goal
- task_relevance: 0.0 (completely unrelated) to 1.0 (directly working on goal)
- off_task_reason: brief explanation if on_task is false (e.g., "browsing social media", "unrelated documentation")
- If no goal is provided, default on_task to true and task_relevance to 0.5

Example responses:
- {"progression_detected": true, "summary_of_action": "Terminal output appeared showing npm packages installed", "change_type": "content_addition", "change_magnitude": "major", "confidence": 0.95, "artifacts": [{"type": "command", "value": "npm install"}], "signals": {"has_blocker": false, "has_outcome": true, "blocker_type": null, "outcome_type": "completed"}, "on_task": true, "task_relevance": 0.8, "off_task_reason": null}
- {"progression_detected": true, "summary_of_action": "Test failed with OAuth error", "change_type": "content_addition", "change_magnitude": "major", "confidence": 0.92, "artifacts": [{"type": "error", "value": "ECONNRESET"}, {"type": "file", "value": "auth.test.ts"}], "signals": {"has_blocker": true, "has_outcome": false, "blocker_type": "failing_test", "outcome_type": null}, "on_task": true, "task_relevance": 0.95, "off_task_reason": null}
- {"progression_detected": true, "summary_of_action": "PR #482 merged in GitHub", "change_type": "ui_state_change", "change_magnitude": "major", "confidence": 0.9, "artifacts": [{"type": "pr", "value": "#482"}], "signals": {"has_blocker": false, "has_outcome": true, "blocker_type": null, "outcome_type": "merged"}, "on_task": true, "task_relevance": 1.0, "off_task_reason": null}
- {"progression_detected": false, "summary_of_action": "No meaningful visual change", "change_type": "none", "change_magnitude": "trivial", "confidence": 0.85, "artifacts": [], "signals": {"has_blocker": false, "has_outcome": false, "blocker_type": null, "outcome_type": null}, "on_task": true, "task_relevance": 0.5, "off_task_reason": null}
</output_format>`;

/**
 * User prompt template for the Progression Detector
 * Placeholder for dynamic content
 */
export const PROGRESSION_DETECTOR_USER = `Analyze these two screenshots (before and after) and determine if the user made meaningful progress.`;

// ============================================================================
// STORYTELLER
// ============================================================================

/**
 * System prompt for the Storyteller
 * Used to build the continuous "Master Story" narrative during a session
 */
export const STORYTELLER_SYSTEM = `<role>
You are a factual work log extractor. You output ONLY structured JSON entries based on observed frame data. No prose, no narrative, no speculation.
</role>

<output_format>
You MUST output valid JSON in this exact format:
{
  "entry": {
    "action": "Brief description of what happened (max 20 words)",
    "evidence": "Direct quote or paraphrase from latest_action field"
  }
}

RULES:
1. "action" must be a simple statement of what was observed (no interpretation)
2. "evidence" must contain text that appears in the latest_action or extracted_artifacts
3. Do NOT add context, speculation, or future actions
4. Do NOT mention specific files, URLs, commands, or names unless they appear in extracted_artifacts
5. Keep "action" under 20 words
</output_format>

<examples>
GOOD output (grounded):
{
  "entry": {
    "action": "Asked a question in the chat panel about type errors",
    "evidence": "user asked about the doctype and docstatus errors"
  }
}

GOOD output (grounded):
{
  "entry": {
    "action": "Terminal showed API request completed with success response",
    "evidence": "POST request returned 200 status code"
  }
}

BAD output (hallucinated - mentions "npm install" not in evidence):
{
  "entry": {
    "action": "Ran npm install to set up dependencies",
    "evidence": "terminal output appeared"
  }
}

BAD output (speculating about future):
{
  "entry": {
    "action": "Preparing to run stress tests on the API",
    "evidence": "request completed"
  }
}
</examples>`;

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

/**
 * Goal context for enhanced analysis
 */
export interface GoalContext {
  sessionGoal?: string;
  linearIssueId?: string;
  linearIssueTitle?: string;
  relatedDocsContext?: string;
}

/**
 * Context for building storyteller prompts
 */
export interface StorytellerContext {
  userRole?: string;
  userSeniority?: string;
  workContext?: string;
  appName: string;
  windowTitle: string;
  currentStory: string;
  latestAction: string;
  // Goal context (optional)
  goalContext?: GoalContext;
  // Grounding data from frame analysis (prevents hallucination)
  extractedArtifacts?: ExtractedArtifact[];
  detectedSignals?: FrameSignals;
  changeType?: string;
  changeMagnitude?: string;
}

/**
 * Build the complete prompt for the Progression Detector
 * Used with two images: previous frame and current frame
 *
 * @param goalContext Optional goal context for enhanced analysis
 */
export function buildProgressionDetectorPrompt(goalContext?: GoalContext): {
  system: string;
  user: string;
} {
  let systemPrompt = PROGRESSION_DETECTOR_SYSTEM;

  // Add goal-awareness section if goal context is provided
  if (goalContext?.sessionGoal || goalContext?.linearIssueTitle) {
    const goalDescription = goalContext.linearIssueTitle
      ? `${goalContext.linearIssueId ? `[${goalContext.linearIssueId}] ` : ""}${goalContext.linearIssueTitle}`
      : goalContext.sessionGoal;

    systemPrompt += `

<session_goal>
The user is working on: ${goalDescription}
${goalContext.relatedDocsContext ? `\n<related_knowledge>\n${goalContext.relatedDocsContext.substring(0, 1000)}\n</related_knowledge>` : ""}
</session_goal>

<goal_awareness>
Consider whether the observed change relates to this goal:
- Is this action moving toward the stated goal?
- Is this research or reference checking that supports the goal?
- Is this a context switch away from the goal (might indicate a blocker)?

This context helps understand the significance of the change, but still focus on what you can OBSERVE in the screenshots.
</goal_awareness>`;
  }

  return {
    system: systemPrompt,
    user: PROGRESSION_DETECTOR_USER,
  };
}

/**
 * Build the grounding section with extracted artifacts and signals
 * This prevents the model from hallucinating details not in the frame analysis
 */
function buildGroundingSection(context: StorytellerContext): string {
  const parts: string[] = [];

  // Add extracted artifacts if present
  if (context.extractedArtifacts && context.extractedArtifacts.length > 0) {
    const artifactsList = context.extractedArtifacts
      .map((a) => `- ${a.type}: ${a.value}`)
      .join("\n");
    parts.push(`<extracted_artifacts>\n${artifactsList}\n</extracted_artifacts>`);
  }

  // Add detected signals if present
  if (context.detectedSignals) {
    const signals: string[] = [];
    if (context.detectedSignals.has_blocker) {
      signals.push(`blocker_detected: ${context.detectedSignals.blocker_type || "yes"}`);
    }
    if (context.detectedSignals.has_outcome) {
      signals.push(`outcome_detected: ${context.detectedSignals.outcome_type || "yes"}`);
    }
    if (signals.length > 0) {
      parts.push(`<detected_signals>\n${signals.join("\n")}\n</detected_signals>`);
    }
  }

  // Add change metadata
  if (context.changeType && context.changeType !== "none") {
    parts.push(`<change_metadata>
type: ${context.changeType}
magnitude: ${context.changeMagnitude || "unknown"}
</change_metadata>`);
  }

  return parts.length > 0 ? "\n" + parts.join("\n") + "\n" : "";
}

/**
 * Build the complete prompt for the Storyteller
 * Includes user context, current story state, and optional goal context
 */
export function buildStorytellerPrompt(context: StorytellerContext): {
  system: string;
  user: string;
} {
  // Build goal section if available
  let goalSection = "";
  if (context.goalContext?.sessionGoal || context.goalContext?.linearIssueTitle) {
    const goalDescription = context.goalContext.linearIssueTitle
      ? `${context.goalContext.linearIssueId ? `[${context.goalContext.linearIssueId}] ` : ""}${context.goalContext.linearIssueTitle}`
      : context.goalContext.sessionGoal;

    goalSection = `<session_goal>${goalDescription}</session_goal>\n`;

    if (context.goalContext.relatedDocsContext) {
      goalSection += `<related_knowledge>\n${context.goalContext.relatedDocsContext.substring(0, 800)}\n</related_knowledge>\n`;
    }
  }

  // Use goal as work context if available
  const workContext =
    context.goalContext?.sessionGoal ||
    context.goalContext?.linearIssueTitle ||
    context.workContext ||
    "Working on their tasks";

  const userPrompt = `<context_data>
<user_identity>${context.userRole || "Team member"}${context.userSeniority ? `, ${context.userSeniority}` : ""}</user_identity>
<work_context>${workContext}</work_context>
${goalSection}<window_metadata>
<app>${context.appName}</app>
<title>${context.windowTitle}</title>
</window_metadata>
</context_data>

<current_story>
${context.currentStory || "(Session just started - no story yet)"}
</current_story>

<latest_action>
${context.latestAction}
</latest_action>
${buildGroundingSection(context)}
<task>
Output a single JSON entry for this frame. The "evidence" field MUST contain words/phrases that appear in the latest_action above.

Output ONLY valid JSON, nothing else.
</task>`;

  return {
    system: STORYTELLER_SYSTEM,
    user: userPrompt,
  };
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Observable change types - what visually changed between frames
 * These are things we can actually SEE in screenshots, not infer
 */
export type ChangeType =
  | "content_addition" // New text/content appeared
  | "content_modification" // Existing content was edited
  | "content_deletion" // Content was removed
  | "navigation" // Different page/screen/view
  | "scroll" // Same content, different viewport
  | "file_switch" // Different file/document
  | "focus_change" // Different window/application
  | "ui_state_change" // UI element state changed (menu, dialog, toggle)
  | "none"; // No meaningful visual change

/**
 * Magnitude of the observed change
 */
export type ChangeMagnitude = "major" | "minor" | "trivial";

/**
 * Artifact types that can be extracted from screenshots
 */
export type ArtifactType = "pr" | "ticket" | "error" | "command" | "file" | "url" | "branch";

/**
 * Blocker types indicating something is blocking progress
 */
export type BlockerType = "error" | "failing_test" | "exception" | "timeout" | "blocked";

/**
 * Outcome types indicating something was completed/achieved
 */
export type OutcomeType = "success" | "merged" | "deployed" | "sent" | "created" | "completed";

/**
 * Extracted artifact from screenshot
 */
export interface ExtractedArtifact {
  type: ArtifactType;
  value: string;
}

/**
 * Semantic signals detected in the frame
 */
export interface FrameSignals {
  has_blocker: boolean;
  has_outcome: boolean;
  blocker_type: BlockerType | null;
  outcome_type: OutcomeType | null;
}

/**
 * Expected response from the Progression Detector
 */
export interface ProgressionDetectorResponse {
  progression_detected: boolean;
  summary_of_action: string;
  change_type: ChangeType;
  change_magnitude: ChangeMagnitude;
  confidence: number;
  // New fields for enhanced analysis
  artifacts: ExtractedArtifact[];
  signals: FrameSignals;
  on_task: boolean;
  task_relevance: number;
  off_task_reason: string | null;
}

// Valid change type values for validation
const VALID_CHANGE_TYPES: ChangeType[] = [
  "content_addition",
  "content_modification",
  "content_deletion",
  "navigation",
  "scroll",
  "file_switch",
  "focus_change",
  "ui_state_change",
  "none",
];

const VALID_CHANGE_MAGNITUDES: ChangeMagnitude[] = ["major", "minor", "trivial"];

const VALID_ARTIFACT_TYPES: ArtifactType[] = [
  "pr",
  "ticket",
  "error",
  "command",
  "file",
  "url",
  "branch",
];

const VALID_BLOCKER_TYPES: BlockerType[] = [
  "error",
  "failing_test",
  "exception",
  "timeout",
  "blocked",
];

const VALID_OUTCOME_TYPES: OutcomeType[] = [
  "success",
  "merged",
  "deployed",
  "sent",
  "created",
  "completed",
];

/**
 * Validate and parse Progression Detector response
 */
export function parseProgressionResponse(rawResponse: string): ProgressionDetectorResponse | null {
  try {
    // Try to extract JSON from the response - handle markdown code blocks
    let jsonStr = rawResponse;

    // Strip markdown code fences if present
    const codeBlockMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Find the first valid JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[ProgressionDetector] No JSON found in response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (
      typeof parsed.progression_detected !== "boolean" ||
      typeof parsed.summary_of_action !== "string"
    ) {
      console.warn("[ProgressionDetector] Invalid response structure");
      return null;
    }

    // Validate and default change_type
    const changeType: ChangeType = VALID_CHANGE_TYPES.includes(parsed.change_type)
      ? parsed.change_type
      : "none";

    // Validate and default change_magnitude
    const changeMagnitude: ChangeMagnitude = VALID_CHANGE_MAGNITUDES.includes(
      parsed.change_magnitude
    )
      ? parsed.change_magnitude
      : "minor";

    // Validate and default confidence (clamp to 0-1 range)
    let confidence = 0.8;
    if (typeof parsed.confidence === "number") {
      confidence = Math.max(0, Math.min(1, parsed.confidence));
    }

    // Parse artifacts array
    const artifacts: ExtractedArtifact[] = [];
    if (Array.isArray(parsed.artifacts)) {
      for (const artifact of parsed.artifacts) {
        if (
          artifact &&
          typeof artifact.value === "string" &&
          VALID_ARTIFACT_TYPES.includes(artifact.type)
        ) {
          artifacts.push({
            type: artifact.type,
            value: artifact.value,
          });
        }
      }
    }

    // Parse signals object
    const signals: FrameSignals = {
      has_blocker: parsed.signals?.has_blocker === true,
      has_outcome: parsed.signals?.has_outcome === true,
      blocker_type: VALID_BLOCKER_TYPES.includes(parsed.signals?.blocker_type)
        ? parsed.signals.blocker_type
        : null,
      outcome_type: VALID_OUTCOME_TYPES.includes(parsed.signals?.outcome_type)
        ? parsed.signals.outcome_type
        : null,
    };

    // Parse on_task and task_relevance
    const onTask = typeof parsed.on_task === "boolean" ? parsed.on_task : true;
    let taskRelevance = 0.5;
    if (typeof parsed.task_relevance === "number") {
      taskRelevance = Math.max(0, Math.min(1, parsed.task_relevance));
    }
    const offTaskReason =
      typeof parsed.off_task_reason === "string" ? parsed.off_task_reason : null;

    return {
      progression_detected: parsed.progression_detected,
      summary_of_action: parsed.summary_of_action,
      change_type: changeType,
      change_magnitude: changeMagnitude,
      confidence,
      artifacts,
      signals,
      on_task: onTask,
      task_relevance: taskRelevance,
      off_task_reason: offTaskReason,
    };
  } catch (error) {
    console.error("[ProgressionDetector] Failed to parse response:", error);
    console.error("[ProgressionDetector] Raw response:", rawResponse.substring(0, 500));
    return null;
  }
}

/**
 * Parsed entry from storyteller JSON response
 */
export interface StorytellerEntry {
  action: string;
  evidence: string;
}

/**
 * Parse storyteller JSON response
 */
export function parseStorytellerResponse(rawResponse: string): StorytellerEntry | null {
  try {
    // Clean up the response - remove markdown code blocks if present
    const cleaned = rawResponse
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    // Try to parse as JSON
    const parsed = JSON.parse(cleaned);

    // Extract the entry
    const entry = parsed.entry || parsed;

    if (entry && typeof entry.action === "string" && typeof entry.evidence === "string") {
      return {
        action: entry.action.trim(),
        evidence: entry.evidence.trim(),
      };
    }

    return null;
  } catch {
    // If JSON parsing fails, try to extract action from prose (fallback)
    const actionMatch = rawResponse.match(/"action"\s*:\s*"([^"]+)"/);
    const evidenceMatch = rawResponse.match(/"evidence"\s*:\s*"([^"]+)"/);

    if (actionMatch && evidenceMatch) {
      return {
        action: actionMatch[1].trim(),
        evidence: evidenceMatch[1].trim(),
      };
    }

    return null;
  }
}

/**
 * Validate that the entry doesn't contain hallucinated content
 * Returns true if valid, false if hallucination detected
 */
export function validateStorytellerEntry(
  entry: StorytellerEntry,
  latestAction: string,
  extractedArtifacts: Array<{ type: string; value: string }> = []
): { valid: boolean; reason?: string } {
  const latestActionLower = latestAction.toLowerCase();
  const evidenceLower = entry.evidence.toLowerCase();

  // Build allowed tokens from latestAction and artifacts
  const allowedTokens = new Set<string>();

  // Extract significant words from latestAction (3+ chars)
  latestAction.split(/\s+/).forEach((word) => {
    const clean = word.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (clean.length >= 3) allowedTokens.add(clean);
  });

  // Add artifact values
  extractedArtifacts.forEach((a) => {
    a.value.split(/\s+/).forEach((word) => {
      const clean = word.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      if (clean.length >= 3) allowedTokens.add(clean);
    });
  });

  // Check for common hallucination patterns
  const hallucationPatterns = [
    /youtube\.com/i,
    /stackoverflow\.com/i,
    /github\.com\/[a-z]/i,
    /real madrid/i,
    /atletico/i,
    /preparing to|ready to|about to|going to/i, // Future speculation
    /npm install|yarn add|pnpm add/i, // Common hallucinated commands
  ];

  for (const pattern of hallucationPatterns) {
    if (pattern.test(entry.action) && !pattern.test(latestAction)) {
      return { valid: false, reason: `Hallucination detected: ${pattern}` };
    }
  }

  // Check that evidence has some overlap with latestAction
  const evidenceWords = evidenceLower.split(/\s+/).filter((w) => w.length >= 3);
  const hasOverlap = evidenceWords.some((word) => latestActionLower.includes(word));

  if (!hasOverlap && evidenceWords.length > 0) {
    return { valid: false, reason: "Evidence doesn't match latestAction" };
  }

  return { valid: true };
}

/**
 * Build narrative from validated entries
 */
export function buildNarrativeFromEntries(
  existingNarrative: string,
  newEntry: StorytellerEntry
): string {
  const newLine = `• ${newEntry.action}`;

  if (!existingNarrative || existingNarrative === "(Session just started - no story yet)") {
    return newLine;
  }

  return `${existingNarrative}\n${newLine}`;
}
