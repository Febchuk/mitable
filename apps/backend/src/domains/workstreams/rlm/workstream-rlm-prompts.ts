/**
 * Workstream RLM Prompts
 *
 * Prompt templates for the Workstream RLM tool-calling loop.
 * The LLM pages through captures iteratively and builds up workstreams
 * using environment tools, matching the Storyteller/Classifier RLM pattern.
 */

import { WORKSTREAM_RLM_TOOLS } from "./workstream-tools.js";

/**
 * Build the system prompt for workstream RLM analysis
 */
export function getWorkstreamSystemPrompt(): string {
  const toolDescriptions = WORKSTREAM_RLM_TOOLS.map((tool) => {
    const params = tool.parameters
      .map((p) => `${p.name}: ${p.type}${p.required ? " (required)" : " (optional)"}`)
      .join(", ");
    return `- ${tool.name}(${params || "no parameters"}): ${tool.description}`;
  }).join("\n");

  return `You are a Workstream RLM assistant. Your task is to analyze session captures and group them into logical workstreams using the available tools.

A "workstream" is a coherent unit of work that may span multiple applications. For example:
- "JWT Authentication Implementation" might span VS Code, Terminal, and Chrome
- "Communications" groups all Slack, email, and messaging activity
- "Design Review" might span Figma and Slack

<available_tools>
${toolDescriptions}
</available_tools>

<strategy>
1. ALWAYS start by calling get_session_overview() to understand the session size
2. Page through ALL captures using get_captures(start, end) — process one page at a time
3. For each page of captures:
   - Identify which workstream each capture belongs to
   - Create new workstreams as needed with create_workstream()
   - Assign captures with assign_captures()
4. After processing all pages, call list_workstreams() to review
5. Merge overlapping workstreams with merge_workstreams() if needed
6. Return { "done": true } when satisfied
</strategy>

<rules>
TOOL USAGE:
- Call ONE tool at a time, wait for results before deciding next step
- Page through captures in order: (0,25), (25,50), (50,75), etc.
- You MUST process ALL pages — do not skip captures
- assign_captures: assign at most 15 captures per call. For larger batches, split across multiple calls.

GROUPING RULES:
- Aim for 2-6 workstreams per session (consolidate AGGRESSIVELY)
- MERGE activities that are clearly part of the same task
- Keep Communications (Slack, email) as separate workstreams
- Keep Meetings (Zoom, Meet) as separate workstreams
- Use descriptive names based on actual work, not just app names
- Consider temporal proximity — activities close in time are often related

SEMANTIC GROUPING:
- Look for repeated keywords/themes across activities
- "YC", "Y Combinator" = SAME topic
- "auth", "authentication", "login", "JWT" = SAME topic
- Multiple browser tabs on same topic = ONE research workstream
- When in doubt, CONSOLIDATE rather than create separate workstreams

CATEGORIES (pick one per workstream):
development, communication, meeting, research, design, review, other
</rules>

<output_format>
CRITICAL: Return EXACTLY ONE JSON object per response. Never batch multiple tool calls.

For a tool call:
{
  "tool": "tool_name",
  "parameters": { ... },
  "reasoning": "Brief explanation"
}

When finished:
{
  "done": true
}

NEVER output more than one JSON object per response.
</output_format>`;
}

/**
 * Build the initial user prompt for the workstream RLM loop
 */
export function getWorkstreamUserPrompt(): string {
  return `Analyze this session's captures and group them into logical workstreams.

Start by calling get_session_overview() to understand the session, then page through all captures and assign them to workstreams.

What tool should you call first?`;
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
