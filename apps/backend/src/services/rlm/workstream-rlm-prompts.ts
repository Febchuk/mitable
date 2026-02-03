/**
 * Workstream RLM Prompts
 *
 * Prompt templates for workstream detection and analysis.
 */

interface CaptureForPrompt {
  id: string;
  capturedAt: string;
  appName: string | null;
  windowTitle: string | null;
  activityDescription: string | null;
}

interface WorkstreamForPrompt {
  id: string;
  name: string;
  captureCount: number;
  appsUsed: string[];
  summary: string | null;
  category: string | null;
}

interface SessionContextForPrompt {
  sessionId: string;
  linearIssueTitle: string | null;
  durationMinutes: number;
  analysisNumber: number;
}

/**
 * Build the system prompt for workstream analysis
 */
export function getWorkstreamSystemPrompt(): string {
  return `You are an AI that analyzes work sessions to identify logical workstreams.

A "workstream" is a coherent unit of work that may span multiple applications. For example:
- "JWT Authentication Implementation" might span VS Code (coding), Terminal (testing), and Chrome (research)
- "Communications" groups all Slack, email, and messaging activity
- "Design Review" might span Figma and Slack
- "Y Combinator Application Research" might span multiple browser tabs about YC, application tips, successful founders

Your job is to analyze activity and group it into meaningful workstreams.

RULES:
1. MERGE activities that are clearly part of the same task
2. Keep Communications (Slack, email, etc.) as separate workstreams
3. Keep Meetings (Zoom, Meet, etc.) as separate workstreams
4. Use descriptive names based on the actual work being done
5. Aim for 2-6 workstreams per session (consolidate AGGRESSIVELY if needed)
6. Consider temporal proximity - activities close in time are often related

SEMANTIC GROUPING RULES (CRITICAL):
7. EXTRACT key topics/keywords from window titles and activity descriptions
   - Look for repeated words, phrases, or themes across activities
   - Examples: "Y Combinator", "authentication", "database", "React", "deployment"
8. GROUP activities with overlapping topics/keywords into ONE workstream
   - Multiple articles about "Y Combinator Application" = ONE workstream
   - Multiple files related to "auth" = ONE workstream
9. For RESEARCH activities (browser tabs), be AGGRESSIVE about consolidation
   - Multiple Google searches on same topic = ONE "Research: [Topic]" workstream
   - Reading documentation for same technology = ONE workstream
10. Look for SEMANTIC similarity, not just exact matches
    - "YC", "Y Combinator", "YCombinator" = SAME topic
    - "auth", "authentication", "login", "JWT" = SAME topic
    - "db", "database", "postgres", "SQL" = SAME topic
11. When in doubt, CONSOLIDATE rather than create separate workstreams
    - Prefer fewer, more meaningful workstreams over many fragmented ones

You must respond with valid JSON matching the exact schema specified.`;
}

/**
 * Build the user prompt for incremental workstream analysis
 */
export function getWorkstreamUserPrompt(
  newCaptures: CaptureForPrompt[],
  existingWorkstreams: WorkstreamForPrompt[],
  context: SessionContextForPrompt
): string {
  const formattedCaptures = newCaptures
    .map((c, i) => {
      const time = new Date(c.capturedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `[${i + 1}] ${time} | ${c.appName || "Unknown"} | ${c.windowTitle || "No title"}
    Activity: ${c.activityDescription || "No description"}
    ID: ${c.id}`;
    })
    .join("\n\n");

  const formattedWorkstreams =
    existingWorkstreams.length > 0
      ? existingWorkstreams
          .map(
            (w) => `- "${w.name}" (ID: ${w.id})
    Captures: ${w.captureCount}
    Apps: ${w.appsUsed.join(", ") || "None"}
    Summary: ${w.summary || "No summary yet"}
    Category: ${w.category || "other"}`
          )
          .join("\n\n")
      : "No existing workstreams yet.";

  return `## Session Context
- Session Goal: ${context.linearIssueTitle || "General work session"}
- Duration: ${context.durationMinutes} minutes
- Analysis #${context.analysisNumber}

## Current Workstreams
${formattedWorkstreams}

## Activities to Analyze
${formattedCaptures}

## IMPORTANT: Semantic Grouping Instructions
Look for SEMANTIC RELATIONSHIPS between ALL activities shown above.
- If multiple window titles contain similar keywords or topics (like "Y Combinator", "Application", "Tips", "Guide"), they should be grouped into a SINGLE workstream
- Generate a DESCRIPTIVE name like "Y Combinator Application Research" - NOT just the window title
- DO NOT create separate workstreams for:
  - Multiple browser tabs on the same topic
  - Different articles about the same subject
  - Research that's clearly about one theme
  - Code files that are part of the same feature

## Instructions
Analyze the activities and:
1. Assign each to the most appropriate workstream (existing or new)
2. MERGE workstreams that should be combined (same topic, same theme, same project)
3. Update workstream names/summaries to be descriptive of the ACTUAL work, not just app names
4. Aim for 2-6 final workstreams maximum - consolidate aggressively!

## Required Output Format
Respond with ONLY valid JSON matching this exact structure:

{
  "assignments": {
    "<capture_id>": "<workstream_id OR 'NEW:Workstream Name'>"
  },
  "updates": {
    "<existing_workstream_id>": {
      "name": "Updated name (or same)",
      "summary": "Updated summary",
      "category": "development|communication|meeting|research|design|review|other"
    }
  },
  "newWorkstreams": [
    {
      "tempId": "NEW:Workstream Name",
      "name": "Descriptive Workstream Name",
      "summary": "Brief summary of what this workstream involves",
      "category": "development|communication|meeting|research|design|review|other"
    }
  ],
  "merges": [
    {
      "fromId": "<workstream_id_to_merge>",
      "intoId": "<target_workstream_id>",
      "reason": "Brief reason for merge"
    }
  ]
}

Important:
- Every capture ID must appear in "assignments"
- Use "NEW:Name" syntax for assigning to a new workstream
- Each new workstream referenced in assignments must be defined in "newWorkstreams"
- Only include "merges" if workstreams should be combined
- Only include "updates" for workstreams that need changes`;
}

/**
 * Build prompt for final session analysis (more thorough)
 */
export function getFinalAnalysisPrompt(
  allCaptures: CaptureForPrompt[],
  existingWorkstreams: WorkstreamForPrompt[],
  context: SessionContextForPrompt
): string {
  const formattedCaptures = allCaptures
    .map((c, i) => {
      const time = new Date(c.capturedAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `[${i + 1}] ${time} | ${c.appName || "Unknown"} | ${c.windowTitle?.slice(0, 50) || "No title"}
    Activity: ${c.activityDescription || "No description"}`;
    })
    .join("\n");

  const formattedWorkstreams = existingWorkstreams
    .map((w) => `- "${w.name}" (${w.captureCount} captures, ${w.category || "other"})`)
    .join("\n");

  return `## Final Session Analysis

This is the FINAL analysis for session ${context.sessionId}.
Review ALL activities and produce the definitive workstream assignments.

Session Goal: ${context.linearIssueTitle || "General work session"}
Total Duration: ${context.durationMinutes} minutes
Total Activities: ${allCaptures.length}

## Current Workstreams
${formattedWorkstreams || "None yet"}

## All Session Activities (Chronological)
${formattedCaptures}

## Instructions for Final Analysis
1. Review ALL activities holistically
2. Consolidate related workstreams (aim for 2-5 final workstreams)
3. Generate polished summaries for each workstream
4. Ensure every activity is assigned appropriately

## Required Output Format
{
  "workstreams": [
    {
      "id": "<existing_id or NEW:Name>",
      "name": "Final polished name",
      "summary": "Comprehensive summary of accomplishments",
      "category": "development|communication|meeting|research|design|review|other",
      "captureIds": ["id1", "id2", ...]
    }
  ],
  "merges": [
    {
      "fromId": "<workstream_to_merge>",
      "intoId": "<target_workstream>",
      "reason": "Reason"
    }
  ]
}`;
}

/**
 * Parse and validate RLM response
 */
export interface WorkstreamAnalysisResult {
  assignments: Record<string, string>;
  updates: Record<
    string,
    {
      name?: string;
      summary?: string;
      category?: string;
    }
  >;
  newWorkstreams: Array<{
    tempId: string;
    name: string;
    summary: string;
    category: string;
  }>;
  merges: Array<{
    fromId: string;
    intoId: string;
    reason: string;
  }>;
}

export function parseWorkstreamAnalysisResponse(content: string): WorkstreamAnalysisResult {
  // Clean the response - remove markdown code blocks if present
  let cleaned = content.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  // Provide defaults for optional fields
  return {
    assignments: parsed.assignments || {},
    updates: parsed.updates || {},
    newWorkstreams: parsed.newWorkstreams || [],
    merges: parsed.merges || [],
  };
}
