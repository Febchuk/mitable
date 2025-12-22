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
  "confidence": 0.0 to 1.0
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

Example responses:
- {"progression_detected": true, "summary_of_action": "Terminal output appeared showing npm packages installed", "change_type": "content_addition", "change_magnitude": "major", "confidence": 0.95}
- {"progression_detected": true, "summary_of_action": "Browser now showing API documentation page", "change_type": "navigation", "change_magnitude": "major", "confidence": 0.92}
- {"progression_detected": true, "summary_of_action": "One line of code was modified in the editor", "change_type": "content_modification", "change_magnitude": "minor", "confidence": 0.88}
- {"progression_detected": false, "summary_of_action": "No meaningful visual change", "change_type": "none", "change_magnitude": "trivial", "confidence": 0.85}
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
You're building a living document that captures what you're working on as it happens. Write in first person, as if you're narrating your own work session to share with your team later.
</role>

<what_you_are_creating>
A "Master Story" - a casual, chronological narrative of your work session written in first person. This is your ongoing log of what you're actually doing. Later, this can be transformed into specific outputs (status updates, documentation), but right now you're simply capturing what's happening as you work.

This story grows with each update. You're not summarizing—you're extending a continuous record.
</what_you_are_creating>

<how_to_document>
**You're discovering the story as it happens**: You don't know where you're headed when the session starts. As you work, patterns emerge. The direction becomes clear. Document what you observe, and let the narrative reveal its own shape.

**Connect the dots between activities**: When you move from your browser to your terminal, from Slack to your IDE—show why. Not just "switched to Chrome," but "found the error message format in the docs, now checking if it matches what I'm seeing in the terminal."

**Capture the texture of the work**: The false starts matter. The "wait, that's weird" moments matter. The three different Stack Overflow tabs you opened before finding the right one—that's the story. This is where the undocumented knowledge lives.

**Write naturally**: Use first person ("I started debugging...", "Found the issue in...", "Tried a few approaches..."). Write like you're explaining to a teammate what you've been up to—casual and conversational, but informative.
</how_to_document>

<understanding_context>
You have context about:
- The user's role and work environment
- The applications and windows being watched
- Everything that's happened so far in this session
- The goal they're working toward (if specified)

Use this context to interpret what you're seeing and write the narrative accordingly. Connect actions to their purpose when it's clear.
</understanding_context>

<as_the_story_develops>
Early on, you might be documenting seemingly disconnected actions: "Opened the codebase. Pulled latest changes. Started reading through error logs."

As the session progresses, the through-line emerges: "I'm debugging a production issue with the payment service. Traced it to a timeout in the third-party integration. Now I'm looking for where retry logic should be added."

Let the story tell you what it's about. Document what's happening, and the meaning will surface.
</as_the_story_develops>

<writing_style>
- Write in first person ("I reviewed...", "Started working on...", "Fixed the bug in...")
- Keep it casual and conversational (like a Slack update, not a formal report)
- Maintain a flowing narrative, not a list of events
- When actions connect, show the connection
- Focus on what matters—skip unnecessary technical details (don't mention programming languages unless relevant)
- When something significant happens (an error, a discovery, a pivot), give it proper attention
- Stay in the present/past tense documenting what's unfolding
</writing_style>`;

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

<task>
You're seeing the latest meaningful action from your workspace. Add to your work log to document this next step. Write as a natural continuation of what's already there, capturing what just happened with enough context that someone reading this later will understand not just what you did, but why.
${context.goalContext?.sessionGoal ? `\nKeep in mind your goal: "${context.goalContext.sessionGoal}". Note if this action seems to advance toward that goal.` : ""}

Write in first person ("I started...", "Found...", "Tried...") and keep it conversational. Return ONLY the updated story (including the previous content plus your additions). Do not include any JSON formatting or metadata - just the narrative text.
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
 * Expected response from the Progression Detector
 */
export interface ProgressionDetectorResponse {
  progression_detected: boolean;
  summary_of_action: string;
  change_type: ChangeType;
  change_magnitude: ChangeMagnitude;
  confidence: number;
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

/**
 * Validate and parse Progression Detector response
 */
export function parseProgressionResponse(rawResponse: string): ProgressionDetectorResponse | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
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

    return {
      progression_detected: parsed.progression_detected,
      summary_of_action: parsed.summary_of_action,
      change_type: changeType,
      change_magnitude: changeMagnitude,
      confidence,
    };
  } catch (error) {
    console.error("[ProgressionDetector] Failed to parse response:", error);
    return null;
  }
}

/**
 * Validate storyteller response (should be plain narrative text)
 */
export function parseStorytellerResponse(rawResponse: string): string {
  // Remove any accidental JSON formatting or markdown code blocks
  const cleaned = rawResponse
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/^[\s\n]*/, "") // Remove leading whitespace
    .replace(/[\s\n]*$/, ""); // Remove trailing whitespace

  return cleaned;
}
