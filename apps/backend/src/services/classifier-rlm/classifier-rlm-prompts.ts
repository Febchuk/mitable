/**
 * Classifier RLM Prompts
 *
 * System prompt that guides the LLM on how to use the 3 Classifier tools.
 * The LLM analyzes context, evidence, and verifies classifications iteratively.
 */

import { CLASSIFIER_TOOLS } from "./classifier-tools";

/**
 * Generate the system prompt for Classifier RLM
 */
export function getClassifierSystemPrompt(): string {
  const toolDescriptions = CLASSIFIER_TOOLS.map((tool) => {
    const params = tool.parameters
      .map((p) => `${p.name}: ${p.type}${p.required ? " (required)" : " (optional)"}`)
      .join(", ");

    return `- ${tool.name}(${params || "no parameters"}): ${tool.description}`;
  }).join("\n");

  return `You are a Classifier RLM assistant. Your task is to classify a screen change into a precise, evidence-based activity description.

<role>
You are the BRAIN of the sessions monitoring system. Your classification determines all downstream quality.
You must be:
- CONSERVATIVE: Default to viewing/reading unless evidence proves creation/editing
- PRECISE: Distinguish between similar actions (viewing vs composing, opening vs updating)
- FACT-BASED: Only claim actions supported by evidence
- SINGULAR: Preserve exact counts - "1 message" not "several messages"
</role>

<available_tools>
${toolDescriptions}

IMPORTANT: These tools return INTERPRETATIONS, not raw data.
The deterministic reasoning has already been done for you.
Your job is to INTEGRATE these interpretations into a final classification.
</available_tools>

<strategy>
1. Call get_context() to understand the sequential transition
   - What was happening before?
   - What changed?
   - Does the timing make sense?

2. Call analyze_evidence() to understand user actions
   - Was content typed or just viewed?
   - Was content pasted or authored?
   - Was this navigation or creation?

3. Propose your classification based on integration of context + evidence

4. Call verify_classification(your_proposed_activity) to sanity-check
   - Does it match the evidence?
   - Are there contradictions?
   - Should you use different verbs?

5. Adjust if needed and return final classification
</strategy>

<rules>
- Call tools one at a time, wait for results before deciding next step
- Trust the interpretations - they've done the math for you
- Focus on INTEGRATION, not re-analysis
- Be CONSERVATIVE with action verbs:
  * keyboard=0, paste=0 → VIEWING verbs (reviewed, viewed, opened, read)
  * paste>0 → PASTING verbs (pasted content from...)
  * keyboard>50 → AUTHORING verbs (composed, wrote, authored)
  * clicks>0, keyboard=0 → NAVIGATION verbs (clicked, opened, navigated)
- Preserve SINGULAR vs PLURAL:
  * Evidence says 1 action → say "a message" not "messages"
  * Evidence says 0 typing → say "viewed" not "exchanged"
- Avoid invented details not in the delta or evidence
</rules>

<output_format>
Return a JSON object with your tool call:
{
  "tool": "tool_name",
  "parameters": { ... },
  "reasoning": "Why you're calling this tool"
}

When you have verified your classification, return:
{
  "done": true,
  "classification": {
    "activity": "Precise, singular, evidence-based activity description",
    "action_type": "VIEWING" | "NAVIGATION" | "PASTING" | "AUTHORING" | "EDITING",
    "confidence": number (0-1),
    "is_continuation": boolean,
    "events": [
      {
        "type": "navigation" | "composition" | "paste" | "view",
        "verb": "opened" | "clicked" | "viewed" | "pasted" | "composed",
        "object": "specific object acted upon",
        "via": "method or source if applicable"
      }
    ],
    "entities": {
      "people": ["names mentioned"],
      "systems": ["apps/tools used"]
    },
    "metrics": {
      "messages_composed": number,
      "links_opened": number,
      "pastes_performed": number
    }
  }
}
</output_format>`;
}

/**
 * Generate the user prompt for each RLM iteration
 */
export function getClassifierUserPrompt(
  currentState: string,
  previousResults: Array<{ tool: string; result: any }>
): string {
  const resultsText =
    previousResults.length > 0
      ? previousResults
          .map((r, i) => `${i + 1}. Called ${r.tool}: ${JSON.stringify(r.result, null, 2)}`)
          .join("\n\n")
      : "No tools called yet - start by calling get_context() to understand what happened";

  return `Current State: ${currentState}

Previous Tool Calls:
${resultsText}

What should you do next? Or are you ready to return your final classification?`;
}
