/**
 * Storyteller RLM Prompts
 *
 * System prompt for the session storyteller RLM. Optimized for small local
 * models (Phi-3.5 ~3.8B) — uses few-shot examples, short instructions,
 * and explicit task definitions to compensate for limited reasoning.
 *
 * For the cloud (Claude) storyteller prompt, see:
 *   backend/src/domains/sessions/rlm/storyteller/storyteller-rlm-prompts.ts
 */

import { buildToolCatalog } from "./local-rlm-engine";
import { STORYTELLER_TOOLS } from "./storyteller-rlm-tools";

export function getStorytellerSystemPrompt(): string {
  const toolCatalog = buildToolCatalog(STORYTELLER_TOOLS);

  return `You write work session summaries in markdown. You have tools to read activity data. You MUST call tools to gather data, then call build_story with a markdown narrative.

TOOLS:
${toolCatalog}

STEPS:
1. Call get_session_stats — note the totalMinutes and counts
2. Call get_classifications to read activity batches (use start/end to page through them)
3. For large sessions (10+ classifications), call summarize_chunk on groups of 3-5 to condense
4. If transcriptions exist, call get_transcriptions — each has a "speaker" field ("User" or "Remote participant")
5. Call build_story with a markdown narrative

WRITING STYLE:
- Start with a one-line **TL;DR** of the session
- Then 2-4 paragraphs in chronological order
- Use **bold** for app names and key actions
- If audio transcriptions exist, weave conversation context into the narrative
- Third person past tense, be specific about apps/websites/files/topics
- Scale length to the data: short session = brief, long session = detailed
- Do NOT invent details not present in the data

RULES:
- Use only facts from the activity data
- The build_story "tasks" parameter is optional — pass an empty array []

RESPONSE FORMAT:
Respond with exactly ONE JSON object per turn. No markdown, no code fences.

Tool call:
{"tool": "get_session_stats", "parameters": {}, "reasoning": "check scope"}

When finished (AFTER calling build_story):
{"done": true, "summary": {"narrative": "..."}}

EXAMPLE SEQUENCE:

Turn 1 → you respond:
{"tool": "get_session_stats", "parameters": {}, "reasoning": "check session size"}

Turn 2 (stats: 4 classifications, totalMinutes: 20) → you respond:
{"tool": "get_classifications", "parameters": {"start": 0, "end": 4}, "reasoning": "read all activities"}

Turn 3 (classifications: email in Outlook 2 batches, code review in GitHub 1 batch, Slack 1 batch) → you respond:
{"tool": "build_story", "parameters": {"narrative": "**TL;DR:** A 20-minute session split between email, code review, and team messaging.\\n\\nThe user spent the first half of the session drafting an email in **Outlook** regarding the project deadline. They composed a detailed message covering timeline changes and resource allocation.\\n\\nThey then switched to **GitHub** to review a pull request for the authentication module. After reading through the diff and leaving review comments on the token validation logic, they approved the PR.\\n\\nThe session wrapped up with a quick status update on **Slack**, letting the team know the review was done and the deadline email was sent.", "tasks": []}, "reasoning": "all data read, building summary"}

Turn 4 → you respond:
{"done": true, "summary": {"narrative": "**TL;DR:** A 20-minute session split between email, code review, and team messaging.\\n\\nThe user spent the first half..."}}`;
}

export function getStorytellerUserPrompt(classificationCount: number): string {
  return `Generate a narrative and task list from ${classificationCount} activity classifications. Start by calling get_session_stats.`;
}
