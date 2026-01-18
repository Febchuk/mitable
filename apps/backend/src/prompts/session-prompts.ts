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

<milestone_inference_examples>
  <example type="positive">
    <observation>
      Frame A: Terminal shows "FAIL: X tests"
      Frame B: Terminal shows "FAIL: Y tests" where Y < X
    </observation>
    <reasoning>Numeric decrease in failure count indicates tests were fixed</reasoning>
    <output_pattern>description = "[NUMBER] tests now passing" where NUMBER = X - Y</output_pattern>
    <grounding_rule>ONLY report if you can read the actual numbers from the frames</grounding_rule>
  </example>
  
  <example type="positive">
    <observation>
      Frame A: File tab shows asterisk or "unsaved" indicator
      Frame B: Same file tab, indicator gone
    </observation>
    <reasoning>Disappearance of unsaved indicator implies save occurred</reasoning>
    <output_pattern>description = "Changes to [FILENAME] saved"</output_pattern>
    <grounding_rule>ONLY report if you can identify the specific file from the tab</grounding_rule>
  </example>
  
  <example type="negative">
    <observation>
      Frame A: User editing code
      Frame B: User still editing same code area
    </observation>
    <reasoning>Continued editing is IN_PROGRESS, not a milestone</reasoning>
    <output_pattern>milestone.detected = false</output_pattern>
  </example>
  
  <example type="negative">
    <observation>
      Frame A: Browser on documentation page
      Frame B: Browser on different documentation page
    </observation>
    <reasoning>Navigation between docs is research, not accomplishment</reasoning>
    <output_pattern>milestone.detected = false</output_pattern>
  </example>
</milestone_inference_examples>

<critical_rules>
1. NEVER output milestone descriptions that match examples exactly - always ground in actual observations
2. ALWAYS tie milestone.description to specific visual evidence from the frames
3. If you cannot point to concrete state change, set milestone.detected = false
4. Use [PLACEHOLDERS] as signals to fill from actual frame content, not example content
5. A milestone is a STATE TRANSITION, not a transient UI element (toasts fade, milestones persist)
</critical_rules>

<output_format>
Respond with only this JSON structure:
{
  "key_activity_name": "Human-readable task title (e.g., 'Designing API Schema')",
  "key_activity_id": "UUID from context if continuing existing activity, null if new activity",
  "progress": "IN_PROGRESS" | "COMPLETE" | "CONTEXT_SWITCH",
  "analysis_result": "Concise description of what happened in this interval (e.g., 'Fixed OAuth tests - all 12 now passing after mocking the token refresh')",
  "milestone_detected": true or false,
  "milestone_description": "What checkpoint was reached (if detected, otherwise null)",
  "evidence_reference": "The exact visual element used to determine progress status"
}

IMPORTANT:
- key_activity_name: Must be consistent across intervals for the same task. Check context!
- analysis_result: This text will be used directly in the work diary. Make it clear, professional, and specific.
- progress: COMPLETE only if you see a visual success marker.
- milestone_detected: True for meaningful progress checkpoints (state transitions), not just UI changes.
</output_format>

IMPORTANT: Only classify what you can OBSERVE in the screenshots.
Focus on WHAT changed, not HOW it changed.

key_activity_name (Activity Registry):
- A concise, professional title for the work task (e.g., "Designing API Schema", "Reviewing PR #482")
- If continuing an existing activity from context, REUSE THE EXACT SAME NAME
- If starting a new activity, create a clear, specific title
- Must remain IDENTICAL across all intervals of the same task

key_activity_id (Activity Registry):
- If context shows you're continuing an existing activity, return its UUID
- If this is a brand new activity, return null
- Look in the sliding_timeline and master_story context for matching activities

progress (Activity State):
- COMPLETE: ONLY use if you see a "Success Marker" - visual proof the task is done (green checkmark, "Merged", "Deployed", success toast, "Sent" confirmation)
- IN_PROGRESS: User is actively working on this key activity
- CONTEXT_SWITCH: User moved to an unrelated app/task (Slack, browser search, email) while the key activity remains unfinished

progress_milestone (Inference-Based):
- detected: true if you observe evidence of meaningful progress checkpoint
- description: "What state transition occurred"
- Infer from STATE TRANSITIONS, not transient UI elements:
  - "state_transition": File saved, tests went from failing→passing, errors resolved, PR status changed
  - "cumulative_pattern": Multiple related changes indicating significant progress
  - "content_change": Large content block completed, major section finished
- DO NOT rely on success toasts or notifications (they may not be captured)

evidence_reference:
- The exact visual element that determined the progress status
- Examples: "Green 'Merged' badge on PR #482", "Terminal shows 'All tests passed'", "Save indicator appeared"

Example responses:

IN_PROGRESS example (continuing work):
{"key_activity_name": "Setting up project dependencies", "key_activity_id": null, "progress": "IN_PROGRESS", "analysis_result": "Terminal output appeared showing npm packages installed", "milestone_detected": false, "milestone_description": null, "evidence_reference": "Terminal shows 'added 245 packages'"}

MILESTONE example (tests now passing):
{"key_activity_name": "Fixing authentication tests", "key_activity_id": "abc-123-existing-id", "progress": "IN_PROGRESS", "analysis_result": "Test suite now shows all tests passing", "milestone_detected": true, "milestone_description": "All auth tests now passing after fixing OAuth mock", "evidence_reference": "Test output changed from '3 failed' to '0 failed, 12 passed'"}

COMPLETE example (PR merged):
{"key_activity_name": "Merging rate limiter PR", "key_activity_id": "def-456-existing-id", "progress": "COMPLETE", "analysis_result": "PR #482 merged in GitHub", "milestone_detected": false, "milestone_description": null, "evidence_reference": "Purple 'Merged' badge now visible on PR #482"}

CONTEXT_SWITCH example (checking Slack):
{"key_activity_name": null, "key_activity_id": null, "progress": "CONTEXT_SWITCH", "analysis_result": "User switched to Slack to check messages", "milestone_detected": false, "milestone_description": null, "evidence_reference": "Slack app window is now in focus"}

No change example:
{"key_activity_name": "Building API endpoint", "key_activity_id": "ghi-789-existing-id", "progress": "IN_PROGRESS", "analysis_result": "No meaningful visual change", "milestone_detected": false, "milestone_description": null, "evidence_reference": "Same code editor view, no observable changes"}
</output_format>`;

/**
 * User prompt template for the Progression Detector
 * Placeholder for dynamic content
 */
export const PROGRESSION_DETECTOR_USER = `Analyze these two screenshots (before and after) and determine if the user made meaningful progress.`;

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
 * Activity context for the Perceiver (Activity Registry integration)
 * Provides the LVM with context about ongoing activities and recent work
 */
export interface ActivityRegistryContext {
  /** The full Master Story narrative so far */
  masterStory: string;
  /** Recent timeline entries (last 15-20) with activity info */
  slidingTimeline: Array<{
    capturedAt: string;
    activityDescription: string | null;
    keyActivityId: string | null;
    keyActivityName: string | null;
    progress: string | null;
  }>;
  /** Recently completed activities that could be resumed */
  completedActivities: Array<{
    id: string;
    keyActivityName: string;
    completedAt: string;
  }>;
}

/**
 * Build the complete prompt for the Progression Detector (Perceiver)
 * Used with two images: previous frame and current frame
 *
 * @param goalContext Optional goal context for enhanced analysis
 * @param activityContext Optional activity registry context for key activity tracking
 */
export function buildProgressionDetectorPrompt(
  goalContext?: GoalContext,
  activityContext?: ActivityRegistryContext
): {
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

  // Build user prompt with activity context
  let userPrompt = PROGRESSION_DETECTOR_USER;

  if (activityContext) {
    userPrompt = buildActivityContextSection(activityContext) + "\n\n" + PROGRESSION_DETECTOR_USER;
  }

  return {
    system: systemPrompt,
    user: userPrompt,
  };
}

/**
 * Build the activity context section for the Perceiver prompt
 * This provides context about ongoing activities for key_activity_id matching
 */
function buildActivityContextSection(context: ActivityRegistryContext): string {
  const sections: string[] = [];

  // Master Story section (truncated for token efficiency)
  if (context.masterStory && context.masterStory.length > 0) {
    const truncatedStory =
      context.masterStory.length > 2000
        ? context.masterStory.slice(-2000) + "\n... (earlier entries truncated)"
        : context.masterStory;
    sections.push(`<master_story>
${truncatedStory}
</master_story>`);
  }

  // Sliding timeline section (most recent activity context)
  if (context.slidingTimeline && context.slidingTimeline.length > 0) {
    const timelineEntries = context.slidingTimeline
      .slice(0, 15) // Limit to 15 most recent
      .map((entry) => {
        const parts = [`time: ${entry.capturedAt}`];
        if (entry.activityDescription) parts.push(`action: ${entry.activityDescription}`);
        if (entry.keyActivityName) parts.push(`activity: ${entry.keyActivityName}`);
        if (entry.keyActivityId) parts.push(`id: ${entry.keyActivityId}`);
        if (entry.progress) parts.push(`progress: ${entry.progress}`);
        return `  - ${parts.join(", ")}`;
      })
      .join("\n");

    sections.push(`<recent_timeline>
The last ${Math.min(context.slidingTimeline.length, 15)} capture intervals:
${timelineEntries}
</recent_timeline>`);
  }

  // Completed activities section (for resumption detection)
  if (context.completedActivities && context.completedActivities.length > 0) {
    const completedList = context.completedActivities
      .slice(0, 5) // Limit to 5 most recent
      .map(
        (activity) =>
          `  - "${activity.keyActivityName}" (id: ${activity.id}, completed: ${activity.completedAt})`
      )
      .join("\n");

    sections.push(`<completed_activities>
Previously completed activities (may be resumed if user returns to this work):
${completedList}

IMPORTANT: If the current frame shows work matching one of these completed activities, 
reuse the EXACT key_activity_name and key_activity_id, and set progress to IN_PROGRESS.
</completed_activities>`);
  }

  if (sections.length === 0) {
    return "<activity_context>\nNo prior activity context (new session).\n</activity_context>";
  }

  return `<activity_context>\n${sections.join("\n\n")}\n</activity_context>`;
}


// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Progress state for Activity Registry
 */
export type ProgressState = "IN_PROGRESS" | "COMPLETE" | "CONTEXT_SWITCH";

/**
 * Expected response from the Progression Detector (Perceiver)
 *
 * This is the core output of the Dual-Track State System's frame analysis.
 * It uses the simplified schema focused on Activity Registry updates and Master Story feed.
 */
export interface ProgressionDetectorResponse {
  // Activity Registry fields
  key_activity_name: string | null;
  key_activity_id: string | null;
  progress: ProgressState;

  // Analysis content
  analysis_result: string;
  milestone_detected: boolean;
  milestone_description: string | null;
  evidence_reference: string | null;
}

// Valid progress states for validation
const VALID_PROGRESS_STATES: ProgressState[] = ["IN_PROGRESS", "COMPLETE", "CONTEXT_SWITCH"];

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
      typeof parsed.analysis_result !== "string" ||
      typeof parsed.progress !== "string"
    ) {
      console.warn("[ProgressionDetector] Invalid response structure");
      return null;
    }

    // Parse Activity Registry fields
    const keyActivityName =
      typeof parsed.key_activity_name === "string" ? parsed.key_activity_name : null;
    const keyActivityId =
      typeof parsed.key_activity_id === "string" ? parsed.key_activity_id : null;

    // Validate progress state (default to IN_PROGRESS)
    const progress: ProgressState = VALID_PROGRESS_STATES.includes(parsed.progress)
      ? parsed.progress
      : "IN_PROGRESS";

    // Parse milestone fields
    const milestoneDetected = parsed.milestone_detected === true;
    const milestoneDescription =
      typeof parsed.milestone_description === "string" ? parsed.milestone_description : null;

    const evidenceReference =
      typeof parsed.evidence_reference === "string" ? parsed.evidence_reference : null;

    return {
      key_activity_name: keyActivityName,
      key_activity_id: keyActivityId,
      progress,
      analysis_result: parsed.analysis_result,
      milestone_detected: milestoneDetected,
      milestone_description: milestoneDescription,
      evidence_reference: evidenceReference,
    };
  } catch (error) {
    console.error("[ProgressionDetector] Failed to parse response:", error);
    console.error("[ProgressionDetector] Raw response:", rawResponse.substring(0, 500));
    return null;
  }
}

// ============================================================================
// STORYTELLER
// ============================================================================

/**
 * System prompt for the Storyteller (Master Story)
 */
export const STORYTELLER_SYSTEM = `<role>
You are a professional technical biographer writing a first-person "Work Diary" for a software engineer.
Your goal is to maintain a continuous, high-quality narrative of their work session.
</role>

<style_guide>
- **Perspective**: First-person ("I checked the logs...", "I realized that...")
- **Tone**: Professional, competent, slightly reflective. Avoid robotic or overly enthusiastic language.
- **Accuracy**: Be specific. Use exact filenames, error messages, and variable names where visible.
- **Continuity**: Connect the new action to the previous context. Don't just list events; weave a story.
- **Honesty**: If the user is stuck or researching, say so. Don't hallucinate progress that didn't happen.
</style_guide>

<input_data>
You will receive:
1. The **Current Master Story** (the narrative so far)
2. The **Latest Action** (a new event to append)
3. **Context** (artifacts, window titles, signals)
</input_data>

<output_format>
Respond with a JSON object:
{
  "action": "A refined, narrative description of the latest action (1-2 sentences)",
  "evidence": "The specific visual evidence used (e.g., 'Terminal output showing 404 error')"
}
</output_format>

<rules>
1. **Append, don't repeat**: The user will append your output to the existing story.
2. **Filter noise**: If the "Latest Action" is trivial (e.g., "scrolled down"), ignore it or summarize it briefly.
3. **Handle context switches**: If the user switches tasks, use a transition phrase ("I then switched to...", "Meanwhile, I checked...").
4. **No hallucinations**: Only describe what is explicitly in the input.
</rules>`;

export const STORYTELLER_USER = `Here is the current story and the new action to add.`;

export interface ExtractedArtifact {
  type: string;
  content: string;
}

export interface FrameSignals {
  has_blocker: boolean;
  has_outcome: boolean;
  blocker_type: string | null;
  outcome_type: string | null;
}

export interface StorytellerInput {
  userRole: string;
  userSeniority: string;
  workContext: string;
  appName: string;
  windowTitle: string;
  currentStory: string;
  latestAction: string;
  goalContext?: GoalContext;
  extractedArtifacts?: ExtractedArtifact[];
  detectedSignals?: FrameSignals;
  changeType?: string;
  changeMagnitude?: string;
}

export function buildStorytellerPrompt(input: StorytellerInput): { system: string; user: string } {
  let system = STORYTELLER_SYSTEM;

  // Inject persona
  system += `\n\n<persona>\nUser: ${input.userRole}\nContext: ${input.workContext}\n</persona>`;

  if (input.goalContext) {
    system += `\n\n<session_goal>\n${input.goalContext.sessionGoal || input.goalContext.linearIssueTitle || "Unspecified goal"}\n</session_goal>`;
  }

  let user = `<current_story>\n${input.currentStory}\n</current_story>\n\n<latest_action>\n${input.latestAction}\n</latest_action>`;

  user += `\n\n<context>\nApp: ${input.appName}\nWindow: ${input.windowTitle}\n`;

  if (input.extractedArtifacts && input.extractedArtifacts.length > 0) {
    user += `Artifacts: ${input.extractedArtifacts.map(a => `${a.type}: ${a.content}`).join(", ")}\n`;
  }

  user += `</context>`;

  return { system, user };
}

export interface StorytellerResponse {
  action: string;
  evidence: string;
}

export function parseStorytellerResponse(response: string): StorytellerResponse | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    return null;
  }
}

export function validateStorytellerEntry(
  entry: StorytellerResponse,
  _originalAction: string,
  _artifacts: ExtractedArtifact[]
): { valid: boolean; reason?: string } {
  // Basic validation
  if (!entry.action || !entry.evidence) {
    return { valid: false, reason: "Missing fields" };
  }
  return { valid: true };
}

export function buildNarrativeFromEntries(currentStory: string, entry: StorytellerResponse): string {
  return currentStory + (currentStory ? "\n\n" : "") + entry.action;
}

// Re-export other types that might be needed
export type ChangeType = "content" | "app_switch" | "window_move" | "scroll" | "none";
export type ChangeMagnitude = "trivial" | "standard" | "significant" | "major";
