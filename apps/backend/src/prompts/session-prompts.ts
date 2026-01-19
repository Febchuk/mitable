/**
 * Session Monitoring Prompt Templates
 *
 * Two core prompts for the Watch Mode Sessions v2 system:
 * 1. Progression Detector - Delta detection between consecutive frames
 * 2. Storyteller - Master Story generation at session end (from activity timeline)
 */

// ============================================================================
// TYPES
// ============================================================================

// ============================================================================
// SENSOR (VISUAL DELTA DETECTOR)
// ============================================================================

/**
 * System prompt for the Sensor (Step 1)
 * Objective: Compare two screenshots and report purely visual changes.
 */
export const SENSOR_SYSTEM_PROMPT = `<role>
You are a precise screen change detector. You compare two screenshots (Previous A vs Current B) and report ONLY the visual differences.
</role>

<task>
Identify the literal changes between Frame A and Frame B. Be specific about WHAT changed, not WHY.
</task>

<output_rules>
1. Focus on text additions, UI element shifts, and window focus changes.
2. Ignore minor rendering artifacts or clock time changes.
3. Be specific: "Added 'import React' to line 4" is better than "Edited code".
4. If the screen is identical, report "No visual change".
</output_rules>

<output_format>
Return a JSON object:
{
  "changed": boolean,
  "change_type": "text_input" | "scroll" | "window_switch" | "click" | "navigation" | "none",
  "description": "Literal description of the visual change (max 15 words)"
}
</output_format>

<examples>
- {"changed": true, "change_type": "text_input", "description": "Typed 'const user =' in editor"}
- {"changed": true, "change_type": "window_switch", "description": "Switched focus to Chrome window 'Stack Overflow'"}
- {"changed": true, "change_type": "scroll", "description": "Scrolled down in file 'auth.ts'"}
</examples>`;

export const SENSOR_USER_PROMPT = `Compare these two screenshots and report the visual delta.`;

// ============================================================================
// CLASSIFIER (ACTIVITY INTERPRETER)
// ============================================================================

/**
 * System prompt for the Classifier (Step 2)
 * Objective: Interpret visual deltas into meaningful work activities using context.
 */
export const CLASSIFIER_SYSTEM_PROMPT = `<role>
You are a work activity classifier. You translate raw screen changes into a coherent work log for a user.
</role>

<inputs>
1. **User Persona:** Job title, regular tasks, and apps.
2. **Recent History:** The last few activities in this session.
3. **Current Delta:** The literal screen change just observed.
</inputs>

<task>
Classify the "Current Delta" into a single, human-readable activity line that fits the ongoing narrative.
Connect the dots: If they were "Reading docs" and now are "Typing code", the activity is "Implementing [feature]".
</task>

<output_rules>
1. Be concise (max 10-12 words).
2. Use active verbs (e.g., "Debugging", "Writing", "Researching").
3. Avoid technical jargon unless relevant to the Persona.
4. If the delta is trivial (scrolling/minor nav) but part of a larger task, describe the larger task (e.g., "Reviewing code").
5. Do NOT hallucinate tasks not supported by the Delta or History.
</output_rules>

<output_format>
Return a JSON object:
{
  "activity": "The human-readable activity line",
  "confidence": number (0-1),
  "is_continuation": boolean (true if this is just more of the previous line)
}
</output_format>`;

/**
 * Build the user prompt for the Classifier with context
 */
export function buildClassifierUserPrompt(
  persona: {
    jobTitle?: string;
    regularTasks?: string[];
    regularApps?: string[];
    additionalContext?: string;
  },
  history: string[],
  delta: string
): string {
  const personaDesc = `
Role: ${persona.jobTitle || "Knowledge Worker"}
Tasks: ${persona.regularTasks?.join(", ") || "General computer work"}
Apps: ${persona.regularApps?.join(", ") || "Standard office apps"}
Context: ${persona.additionalContext || "None"}
`.trim();

  const historyDesc = history.length > 0
    ? history.map((h, i) => `${i + 1}. ${h}`).join("\n")
    : "(No recent history - session start)";

  return `
PERSONA:
${personaDesc}

RECENT HISTORY:
${historyDesc}

CURRENT DELTA:
${delta}

Classify this activity:`;
}

// ============================================================================
// STORYTELLER (MASTER STORY GENERATOR)
// ============================================================================

/**
 * System prompt for the Storyteller (Step 3)
 * Objective: Generate a final session update from the Activity Timeline, applying a materiality filter.
 */
export const STORYTELLER_SYSTEM_PROMPT = `<role>
You are an expert editor who turns an activity transcript into a high-quality session update.
</role>

<task>
Given a chronological timeline of activities, write a final "Master Story" update in first person.
Apply a materiality filter: ignore trivial actions and highlight meaningful progress and outcomes.
Respect the user's requested style (concise/verbose) and format (bullets/paragraphs).
</task>

<rules>
1. Do NOT invent work not supported by the timeline.
2. Prefer outcomes, decisions, and progress over micro-actions.
3. If the timeline is repetitive, consolidate into fewer higher-level points.
4. Keep it readable and skimmable.
</rules>`;

/**
 * Build an adaptive user prompt for the Storyteller based on user preferences
 * Handles content selection, style, format, and screenshot inclusion
 */
export function buildStorytellerUserPrompt(
  timeline: Array<{ activityDescription: string; capturedAt: Date }>,
  preferences: {
    style: "verbose" | "concise";
    format: "bullets" | "paragraphs";
    includeScreenshots: boolean;
  }
): string {
  // Format timeline chronologically with clear structure
  // Group by time windows to show temporal flow
  const timelineText = timeline
    .map((a, i) => {
      const timeStr = new Date(a.capturedAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      return `${i + 1}. [${timeStr}] ${a.activityDescription}`;
    })
    .join("\n");

  // Calculate session duration for context
  const sessionStart = timeline[0]?.capturedAt;
  const sessionEnd = timeline[timeline.length - 1]?.capturedAt;
  const durationMinutes = sessionStart && sessionEnd
    ? Math.round((sessionEnd.getTime() - sessionStart.getTime()) / (1000 * 60))
    : null;

  // Content Selection Guidelines
  const contentSelectionGuidelines = `
<content_selection_guidelines>
Your task is to SELECT which activities from the timeline to include in the final summary. Follow these prioritization rules EXACTLY:

PRIORITY 1 - ALWAYS INCLUDE (only if they appear in the timeline):
- Activities containing completion verbs: "Merged", "Deployed", "Fixed", "Completed", "Shipped", "Resolved", "Finished"
- Activities containing outcome indicators: "PR #", "issue #", "bug", "feature", "deployment", "release"
- Activities containing decision verbs: "Decided", "Chose", "Selected", "Approved", "Rejected"
- Activities containing problem-solving verbs: "Resolved", "Fixed", "Debugged", "Troubleshot", "Investigated"
- Activities that explicitly mention blockers being addressed: "Resolved blocker", "Fixed issue", "Unblocked", "Overcame challenge"

PRIORITY 2 - USUALLY INCLUDE (only if they appear in the timeline):
- Activities that appear 3+ times consecutively with the same or similar description (indicates substantial time investment)
- Activities containing collaboration verbs: "Discussed", "Reviewed", "Collaborated", "Met with", "Presented to"
- Activities containing review/approval verbs: "Reviewed", "Approved", "Commented on", "Provided feedback"

PRIORITY 3 - CONDITIONALLY INCLUDE (only if they appear in the timeline):
- Activities that are part of a sequence leading to a Priority 1 activity (include as context)
- Activities containing research verbs: "Researched", "Looked up", "Searched for", "Read documentation" (only if followed by Priority 1 activity)
- Activities containing navigation verbs: "Switched to", "Opened", "Navigated to" (only if they introduce a new work stream)

PRIORITY 4 - ALWAYS EXCLUDE:
- Activities containing trivial verbs: "Scrolled", "Clicked", "Moved mouse", "Switched window" (unless part of Priority 1-3)
- Activities that are exact duplicates of activities already selected for inclusion
- Activities that are continuations without new information (e.g., "Editing code" followed by another "Editing code" with no new details)
- Activities that don't contain any of the verbs or indicators mentioned in Priority 1-3

CONSOLIDATION RULES (apply these mechanically):
- If 5+ consecutive activities have identical or near-identical descriptions, replace with: "Worked on [the activity]" (use the exact activity description)
- If 3-4 consecutive activities are similar (same verb, different object), consolidate to: "[Verb] [general theme]" (e.g., "Reviewed multiple PRs" instead of listing each)
- Group activities by the explicit verb they contain (all "Fixed" together, all "Reviewed" together, etc.)
- If activities span >30 minutes with same theme, summarize as: "Spent time [activity theme]"

CRITICAL: Only include activities that EXACTLY MATCH the criteria above. Do NOT infer or guess what "significant" means - use the explicit verbs and indicators listed.
</content_selection_guidelines>`;

  // Style-specific guidance
  const styleGuidance =
    preferences.style === "concise"
      ? `
<style_guidance>
STYLE: CONCISE
- Focus on KEY HIGHLIGHTS only - what was accomplished, not how
- Aim for 3-7 main points or 2-4 sentences
- Use action-oriented language ("Fixed bug", "Merged PR", "Reviewed code")
- Skip transitional details and process steps
- Emphasize outcomes and results over process
- Each point should be self-contained and meaningful
- Remove filler words and unnecessary context
</style_guidance>`
      : `
<style_guidance>
STYLE: VERBOSE
- Provide FULL NARRATIVE with context and details
- Include the journey, not just the destination
- Explain what was worked on, why it mattered, and what happened
- Include relevant context about challenges, decisions, or discoveries
- Connect activities to show the flow of work
- Aim for 8-15 main points or 5-10 sentences
- Include process details that help understand the work
- Use descriptive language that paints a picture of the session
</style_guidance>`;

  // Format-specific guidance
  const formatGuidance =
    preferences.format === "bullets"
      ? `
<format_guidance>
FORMAT: BULLET POINTS
- Use bullet points (• or -) for each main activity or accomplishment
- Each bullet should be a complete, standalone thought
- Keep bullets concise but informative
- Use parallel structure across bullets (start with action verbs when possible)
- Group related bullets together if they're part of the same work stream
- Don't use sub-bullets unless absolutely necessary for clarity
- Each bullet should represent a distinct activity or outcome
</format_guidance>`
      : `
<format_guidance>
FORMAT: PARAGRAPHS
- Write in flowing, connected paragraphs
- Use transitions to connect ideas ("After completing X, I moved on to Y")
- Create logical flow from one activity to the next
- Group related activities into the same paragraph
- Use first person ("I worked on...", "I fixed...", "I reviewed...")
- Vary sentence structure for readability
- Each paragraph should cover a theme or work stream
- Connect activities chronologically or thematically
</format_guidance>`;

  // Screenshot guidance
  const screenshotGuidance = preferences.includeScreenshots
    ? `
<screenshot_guidance>
SCREENSHOTS: INCLUDE WHEN RELEVANT
- Reference specific visual moments when they add value to the narrative
- Mention screenshots when they show important UI changes, results, or visual outcomes
- Use phrases like "As shown in the screenshot..." or "The visual shows..." when relevant
- Don't force screenshot references - only include when they enhance understanding
- Focus on what the screenshot demonstrates, not just that a screenshot exists
</screenshot_guidance>`
    : `
<screenshot_guidance>
SCREENSHOTS: TEXT-ONLY SUMMARY
- Focus on textual description only
- Don't reference screenshots or visual elements
- Describe activities and outcomes in words
</screenshot_guidance>`;

  // Build the complete prompt
  return `
<activity_timeline>
Total activities: ${timeline.length}
${durationMinutes ? `Session duration: ${durationMinutes} minutes` : ''}

Activities (chronologically ordered):
${timelineText}
</activity_timeline>

${contentSelectionGuidelines}

${styleGuidance}

${formatGuidance}

${screenshotGuidance}

<output_requirements>
1. SELECT activities using ONLY the explicit prioritization rules above - do not guess or infer significance
2. Apply consolidation rules mechanically - count consecutive similar activities and consolidate per the rules
3. Write in FIRST PERSON ("I worked on...", "I fixed...", "I reviewed...")
4. Follow the style guidance (${preferences.style}) and format guidance (${preferences.format}) exactly
5. Do NOT invent activities not present in the timeline - only use activities that appear verbatim
6. Only mention accomplishments if the timeline contains Priority 1 verbs (Merged, Deployed, Fixed, Completed, etc.)
7. Only mention progress if the timeline shows multiple related activities leading to an outcome
8. Only mention blockers if the timeline explicitly contains blocker-related verbs (Resolved blocker, Fixed issue, etc.)
9. Keep the tone professional but conversational (like a work update to a teammate)
10. Ensure the summary tells a coherent story using ONLY activities from the timeline
11. If no Priority 1 activities exist, focus on Priority 2 activities that show time investment or collaboration
12. If timeline is sparse, be honest about what was done rather than inflating importance
</output_requirements>

<examples>
Example for CONCISE + BULLETS:
• Fixed authentication bug in login flow
• Merged PR #42 with API improvements
• Reviewed and approved 3 PRs from team
• Updated documentation for new endpoint

Example for VERBOSE + PARAGRAPHS:
I spent the session working on fixing a critical authentication bug that was preventing users from logging in. After investigating the issue, I identified the problem in the token validation logic and implemented a fix. I then merged PR #42 which included several API improvements we'd been working on. Later in the session, I reviewed and approved three pull requests from my teammates, providing feedback on code quality and architecture decisions. I also took time to update the documentation for a new API endpoint to ensure it was clear for other developers.

Example for CONCISE + PARAGRAPHS:
I fixed the authentication bug and merged PR #42. Then reviewed team PRs and updated API documentation.

Example for VERBOSE + BULLETS:
• Investigated and fixed a critical authentication bug in the login flow that was preventing users from accessing the system
• Identified the root cause in the token validation logic and implemented a comprehensive fix
• Merged PR #42 which included several API improvements we'd been working on, including better error handling and response formatting
• Reviewed and approved three pull requests from teammates, providing detailed feedback on code quality and architecture decisions
• Updated the documentation for the new API endpoint to ensure clarity for other developers
</examples>

Generate the Master Story update following all guidelines above:`;
}

// ============================================================================
// PROGRESSION DETECTOR (LEGACY - KEPT FOR REFERENCE OR FALLBACK)
// ============================================================================

/**
 * System prompt for the Progression Detector
 * Used with Groq Llama 4 Scout for vision analysis of two consecutive frames
 */
export const PROGRESSION_DETECTOR_SYSTEM = `<role>
You watch a user's workspace across multiple windows. Your job is to notice when something meaningful happens—when they make real progress, not just move their mouse or blink a cursor.
</role>
...
`; // Kept for legacy compatibility if needed, but we focus on SENSOR above.

// ... (Rest of existing file content)
