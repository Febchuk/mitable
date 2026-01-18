/**
 * Session Monitoring Prompt Templates
 *
 * Two core prompts for the Watch Mode Sessions v2 system:
 * 1. Progression Detector - Delta detection between consecutive frames
 * 2. Storyteller - Continuous narrative building (Master Story)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface GoalContext {
  sessionGoal?: string;
  linearIssueId?: string;
  linearIssueTitle?: string;
  relatedDocsContext?: string;
}

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
