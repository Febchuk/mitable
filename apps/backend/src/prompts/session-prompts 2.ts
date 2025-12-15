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

<output_format>
Respond with only this JSON structure:
{
  "progression_detected": true or false,
  "summary_of_action": "Brief plain-language description of what happened"
}

Example summaries:
- "Ran npm install command in terminal"
- "Searched for 'JWT authentication' in documentation"
- "Saved changes to config file"
- "Error message appeared after running tests"
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
You are building a living document that tracks what a user is actually doing as they work. Think of yourself as a teammate sitting beside them, understanding their work deeply enough to document not just actions, but intent and context.
</role>

<what_you_are_creating>
A "Master Story" - a detailed, chronological narrative of the user's work session. This is the source material. Later, another process will transform this story into specific outputs (status updates, documentation, tickets), but right now you're simply capturing what's happening with full fidelity.

This story grows with each update. You're not summarizing—you're extending a continuous record.
</what_you_are_creating>

<how_to_document>
**You're discovering the story as it happens**: You don't know where the user is headed when the session starts. As you watch them work, patterns emerge. The direction becomes clear. Document what you observe, and let the narrative reveal its own shape.

**Connect the dots between windows**: When the user moves from their browser to their terminal, from Slack to their IDE—you understand why. You're not just logging "switched to Chrome." You're noting "found the error message format in the docs, now checking if it matches what they're seeing in the terminal."

**Capture the texture of the work**: The false starts matter. The "wait, that's weird" moments matter. The three different Stack Overflow tabs they opened before finding the right one—that's the story. This is where the undocumented knowledge lives.

**Write as you observe**: You see a screenshot, you understand what just happened, you add it to the story. You're not editorializing or analyzing—you're documenting with understanding. Like a teammate taking notes during a pairing session.
</how_to_document>

<understanding_context>
You know:
- Who this user is (their role, their level)
- Who they work with and for
- The applications and windows they've asked you to watch
- Everything that's happened so far in this session

Use this context to interpret what you're seeing. If you see them in a database admin tool after reading an API error, you can reasonably document that they're investigating the data layer. You understand the company, the tools, the typical workflows.

You're not an outside observer—you're an insider who gets the context.
</understanding_context>

<as_the_story_develops>
Early on, you might be documenting seemingly disconnected actions: "Opened the codebase. Pulled latest changes. Started reading through error logs."

As the session progresses, the through-line emerges: "They're debugging a production issue with the payment service. They've traced it to a timeout in the third-party integration. Now they're looking for where retry logic should be added."

Let the story tell you what it's about. Document what's happening, and the meaning will surface.
</as_the_story_develops>

<writing_style>
- Maintain a flowing narrative, not a list of events
- Write at the technical level of the user (match their expertise)
- When actions connect, show the connection
- When something significant happens (an error, a discovery, a pivot), give it proper attention
- Stay in the observational present: document what's unfolding, not what will happen
</writing_style>`;

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

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
}

/**
 * Build the complete prompt for the Progression Detector
 * Used with two images: previous frame and current frame
 */
export function buildProgressionDetectorPrompt(): {
  system: string;
  user: string;
} {
  return {
    system: PROGRESSION_DETECTOR_SYSTEM,
    user: PROGRESSION_DETECTOR_USER,
  };
}

/**
 * Build the complete prompt for the Storyteller
 * Includes user context and current story state
 */
export function buildStorytellerPrompt(context: StorytellerContext): {
  system: string;
  user: string;
} {
  const userPrompt = `<context_data>
<user_identity>${context.userRole || "Team member"}${context.userSeniority ? `, ${context.userSeniority}` : ""}</user_identity>
<work_context>${context.workContext || "Working on their tasks"}</work_context>
<window_metadata>
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
You're seeing the latest meaningful action from the user's workspace. Add to the story to document this next step in their work. Write as a natural continuation of what's already there, capturing what just happened with enough context that someone reading this later will understand not just what they did, but why.

Return ONLY the updated story (including the previous content plus your additions). Do not include any JSON formatting or metadata - just the narrative text.
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
 * Expected response from the Progression Detector
 */
export interface ProgressionDetectorResponse {
  progression_detected: boolean;
  summary_of_action: string;
}

/**
 * Validate and parse Progression Detector response
 */
export function parseProgressionResponse(
  rawResponse: string
): ProgressionDetectorResponse | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[ProgressionDetector] No JSON found in response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (
      typeof parsed.progression_detected !== "boolean" ||
      typeof parsed.summary_of_action !== "string"
    ) {
      console.warn("[ProgressionDetector] Invalid response structure");
      return null;
    }

    return {
      progression_detected: parsed.progression_detected,
      summary_of_action: parsed.summary_of_action,
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
  let cleaned = rawResponse
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/^[\s\n]*/, "") // Remove leading whitespace
    .replace(/[\s\n]*$/, ""); // Remove trailing whitespace

  return cleaned;
}
