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
// SECURITY HELPERS
// ============================================================================

/**
 * Escape user-provided fields to prevent prompt injection attacks.
 * - Removes angle brackets (potential XML/tag injection)
 * - Normalizes newlines to spaces (prevents multi-line injection)
 * - Truncates to max length to prevent prompt overflow
 */
function escapePromptField(value: string, maxLength = 200): string {
  return value
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
    .substring(0, maxLength)
    .trim();
}

// ============================================================================
// SENSOR (VISUAL DELTA DETECTOR)
// ============================================================================

/**
 * System prompt for the Sensor (Step 1)
 * Objective: Compare two screenshots and report purely visual changes.
 */
export const SENSOR_SYSTEM_PROMPT = `<role>
You are a precise screen change detector with contextual awareness. You compare two screenshots (Previous A vs Current B) and report the visual differences along with important scene context.
</role>

<task>
1. Identify the literal changes between Frame A and Frame B. Be specific about WHAT changed.
2. Describe the surrounding context: what application environment is visible, who is on screen, and whether this appears to be the user's own work or someone else's shared screen.
</task>

<output_rules>
1. Read and transcribe visible text content verbatim - this includes names, message snippets, code, URLs, document titles, recipient names, etc.
2. Use your visual intelligence to understand UI context:
   - Distinguish input boxes (drafting) from sent messages/published content
   - Recognize messaging interfaces, code editors, browsers, documents, etc.
   - In chat/messaging interfaces: Header/title shows RECIPIENT, message bubbles show SENDER
   - Example: LinkedIn chat with "Sarah Chen" in header + "John Doe" in message = John is messaging Sarah
   - Identify recipient names from chat headers, window titles, or "To:" fields
3. Be thorough and capture what the user is actually doing - don't use generic descriptions like "typed a message" when you can see "Drafting message to Sarah: 'Can we meet tomorrow?'"
4. Ignore minor rendering artifacts or clock time changes.
5. Be specific: "Added 'import React' to line 4" is better than "Edited code".
6. If the screen is identical, report "No visual change".
7. Report visible scene context — who is on screen, what environment surrounds the change:
   - Visible names in participant bars, meeting UI, chat headers, email To/From fields, avatars
   - Whether this is a meeting/call with screen sharing (look for presenting indicators, participant strips, call controls)
   - If someone else is sharing their screen, note WHO is presenting (read their name from the UI)
   - Application environment: remote desktop sessions, browser tabs, IDE projects, document titles
   - Any other contextual information that helps understand the scene beyond just the diff
</output_rules>

<output_format>
Return a JSON object:
{
  "changed": boolean,
  "change_type": "text_input" | "scroll" | "window_switch" | "click" | "navigation" | "none",
  "description": "Detailed literal description of the visual change (max 150 words)",
  "context": "Scene context: application environment, visible people, screen sharing status, or other relevant observations. Null if nothing notable beyond the change itself."
}
</output_format>

<examples>
- {"changed": true, "change_type": "text_input", "description": "Typed 'const user = await fetchUser()' in VS Code editor, line 42 of auth.ts", "context": "User's own VS Code workspace, project 'mitable-backend' open in sidebar"}
- {"changed": true, "change_type": "text_input", "description": "Drafting message to Oluwaseun Obikoya in LinkedIn: 'Hey Olu, when will you be free to meet up and talk about the YC thing? sometime next week?'", "context": null}
- {"changed": true, "change_type": "navigation", "description": "Navigated from Solution Explorer to MaximoServiceWrapper.cs, now viewing line 262 with SendAsync method", "context": "Microsoft Teams meeting — Cupp, Mark is presenting his screen. Visual Studio is visible inside the shared screen. Participant bar shows Cupp, Mark and Npounengnong, Aurel."}
- {"changed": true, "change_type": "window_switch", "description": "Switched focus to Chrome window 'API Documentation - Stripe'", "context": null}
- {"changed": true, "change_type": "scroll", "description": "Scrolled down in file 'auth.ts', now viewing lines 120-150", "context": "Citrix remote desktop session to jdcapetsd006"}
- {"changed": true, "change_type": "text_input", "description": "Added paragraph to Google Doc 'Q1 Product Roadmap': 'We will prioritize authentication improvements...'", "context": "Document shared with 3 editors visible in the header"}
- {"changed": true, "change_type": "text_input", "description": "Drafting email to Anil Chinthala and Michael Powers about IPDF configuration", "context": "Outlook email compose window, To: field shows Anil Chinthala; Michael Powers"}
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

<reasoning_process>
Before classifying, THINK THROUGH:
1. **Context Analysis:** What is the user actually doing based on the delta and history?
2. **Pattern Recognition:** Does this continue the previous activity or start something new?
3. **Precision Check:** What EXACTLY happened vs what might have happened?
   - "Checking team messages" is NOT the same as "Joining a team meeting"
   - "Scrolling through chat" is NOT the same as "Participating in meeting"
4. **Evidence Verification:** Is there clear evidence in the delta for this classification?
5. **Avoid Assumptions:** Only classify what you can clearly see in the delta.
</reasoning_process>

<output_rules>
1. Be concise (max 10-12 words).
2. Use active verbs (e.g., "Debugging", "Writing", "Researching").
3. Avoid technical jargon unless relevant to the Persona.
4. If the delta is trivial (scrolling/minor nav) but part of a larger task, describe the larger task (e.g., "Reviewing code").
5. Do NOT hallucinate tasks not supported by the Delta or History.
6. Be PRECISE: Distinguish between similar but different activities (checking messages vs joining meeting).
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
 * All user-provided fields are escaped to prevent prompt injection
 */
export function buildClassifierUserPrompt(
  persona: {
    jobTitle?: string;
    regularTasks?: string[];
    regularApps?: string[];
    additionalContext?: string;
  },
  history: string[],
  delta: string,
  windowInfo?: {
    appName: string;
    windowTitle: string;
  },
  previousDelta?: string,
  timeElapsedSec?: number,
  intervalEvidence?: {
    keyboardEventCount: number;
    copyCount: number;
    pasteCount: number;
    cutCount: number;
    mouseClickCount: number;
    mouseScrollCount: number;
  }
): string {
  // Escape all user-provided persona fields to prevent prompt injection
  const safeJobTitle = escapePromptField(persona.jobTitle || "Knowledge Worker");
  const safeTasks = persona.regularTasks
    ? escapePromptField(persona.regularTasks.join(", "), 500)
    : "General computer work";
  const safeApps = persona.regularApps
    ? escapePromptField(persona.regularApps.join(", "), 500)
    : "Standard office apps";
  const safeContext = escapePromptField(persona.additionalContext || "None");

  const personaDesc = `
Role: ${safeJobTitle}
Tasks: ${safeTasks}
Apps: ${safeApps}
Context: ${safeContext}
`.trim();

  // Escape history entries (from previous classifications)
  const historyDesc =
    history.length > 0
      ? history.map((h, i) => `${i + 1}. ${escapePromptField(h, 150)}`).join("\n")
      : "(No recent history - session start)";

  // Escape the current delta (from vision model output)
  const safeDelta = escapePromptField(delta, 300);

  // Build app context (NEW: helps LLM reason about app types)
  let appContext = "(Unknown application)";
  if (windowInfo) {
    const safeAppName = escapePromptField(windowInfo.appName, 100);
    const safeWindowTitle = escapePromptField(windowInfo.windowTitle, 200);
    appContext = `App: ${safeAppName}\nWindow: ${safeWindowTitle}`;
  }

  // Build evidence-based reasoning section
  let evidenceContext = "";
  if (intervalEvidence || previousDelta || timeElapsedSec !== undefined) {
    evidenceContext = "\n\nACTIVITY EVIDENCE:";

    if (previousDelta) {
      const safePreviousDelta = escapePromptField(previousDelta, 200);
      evidenceContext += `\nPrevious state: ${safePreviousDelta}`;
    }

    if (timeElapsedSec !== undefined) {
      evidenceContext += `\nTime elapsed: ${timeElapsedSec}s`;
    }

    if (intervalEvidence) {
      evidenceContext += `
Keyboard events: ${intervalEvidence.keyboardEventCount}
Copy commands: ${intervalEvidence.copyCount} (Ctrl+C)
Paste commands: ${intervalEvidence.pasteCount} (Ctrl+V)
Cut commands: ${intervalEvidence.cutCount} (Ctrl+X)
Mouse clicks: ${intervalEvidence.mouseClickCount}
Mouse scrolls: ${intervalEvidence.mouseScrollCount}

REASONING RULES:
- If pasteCount > 0: User pasted content (not authored)
- If copyCount > 0 + pasteCount > 0: User copied and pasted
- If cutCount > 0: User moved/removed content
- If keyboardEventCount < 5 AND pasteCount = 0 AND content appears: User opened existing file
- If keyboardEventCount > 50: User likely authored/edited content
- If mouseScrollCount > 10 AND keyboardEventCount < 5: User reading/reviewing
- Default to "viewing/reviewing" verbs unless evidence supports "editing/authoring"`;
    }
  }

  return `
PERSONA:
${personaDesc}

APPLICATION CONTEXT:
${appContext}${evidenceContext}

RECENT HISTORY:
${historyDesc}

CURRENT DELTA:
${safeDelta}

Before classifying, work through this analysis step-by-step:

1. PREVIOUS STATE ANALYSIS: What was visible/happening in the previous capture?
   - Review the "Previous state" or last history item
   - What context does this provide?

2. CURRENT STATE ANALYSIS: What changed between previous and current?
   - What is now visible that wasn't before?
   - What disappeared or changed?
   - Was this a major change or minor adjustment?

3. ACTIVITY EVIDENCE ANALYSIS: What do the event counts tell us?
   - If keyboard events = 0 and paste = 0: User is VIEWING, not creating
   - If paste > 0: User PASTED content (not authored)
   - If keyboard events > 20: User is TYPING/AUTHORING
   - If only clicks/scrolls: User is NAVIGATING/READING
   - BE CONSERVATIVE: Absence of typing evidence means NO typing occurred

4. TEMPORAL ANALYSIS: How much time elapsed?
   - Short time (<15s) + major change = Navigation/opening
   - Long time (>30s) + text visible = Likely reading/reviewing
   - Consider if the time allows for the claimed action

5. SEQUENTIAL LOGIC: Does the transition make sense?
   - Previous: Chat visible → Current: Webpage open + clicks = 3 → Conclusion: Clicked link
   - Previous: Empty editor → Current: Code visible + keyboard = 0 → Conclusion: Opened file
   - Previous: Text selected → Current: Pasted elsewhere + paste = 1 → Conclusion: Copy-pasted

Based on this analysis, classify with PRECISION. Output your final classification:`;
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
      const timeStr = new Date(a.capturedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      return `${i + 1}. [${timeStr}] ${a.activityDescription}`;
    })
    .join("\n");

  // Calculate session duration for context
  const sessionStart = timeline[0]?.capturedAt;
  const sessionEnd = timeline[timeline.length - 1]?.capturedAt;
  const durationMinutes =
    sessionStart && sessionEnd
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
${durationMinutes ? `Session duration: ${durationMinutes} minutes` : ""}

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
