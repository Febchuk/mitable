/**
 * Benchmark AI Service
 *
 * AI/LLM integration for benchmark features. Uses Gemini 2.5 Flash
 * to generate benchmark parameters, score work performance, suggest
 * improvements, and detect accomplishments from activity data.
 *
 * Every method has a rule-based fallback so the feature works even
 * when the LLM is unavailable.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../../config.js";
import { createLogger } from "../../shared-infra/lib/logger.js";

const logger = createLogger({ context: "benchmark-ai" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchmarkParameter {
  id: string;
  name: string;
  description: string;
  importance: number;
}

export interface PeriodActivitySummary {
  totalWorkMinutes: number;
  totalMeetingMinutes: number;
  deepFocusMinutes: number;
  collaborationMinutes: number;
  avgWorkPercentage: number;
  onTaskRate: number;
  uniqueAppsUsed: string[];
  categoryBreakdown: Record<string, number>;
  accomplishmentCount: number;
  longestFocusBlockMinutes: number;
  contextSwitchCount: number;
  daysActive: number;
}

export interface ParameterScore {
  parameterId: string;
  score: number;
  reasoning: string;
}

export interface Suggestion {
  text: string;
  category: "scheduling" | "habits" | "encouragement";
}

export interface PriorityParam {
  name: string;
  description: string;
  score: number;
  importance: number;
  gap: number;
}

export interface Accomplishment {
  text: string;
  date: string;
}

export interface SessionContext {
  sessionName: string | null;
  summary: string | null;
  accomplishments: string[];
  keyActivities: string[];
  taskBreakdown: Array<{ shortTitle: string; description: string; minutes: number }>;
  date: string;
}

export interface DayContext {
  date: string;
  daySummary: string | null;
  keyAccomplishments: string[];
}

export interface ActivityContext {
  sessions: SessionContext[];
  dailySummaries: DayContext[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse JSON returned by the LLM, stripping markdown fences if present.
 */
function parseLLMJson<T>(text: string): T {
  const cleaned = text
    .replace(/```(?:json)?\n?/g, "")
    .replace(/```$/g, "")
    .trim();
  return JSON.parse(cleaned);
}

// ---------------------------------------------------------------------------
// Fallback template data
// ---------------------------------------------------------------------------

const MOCK_PARAM_TEMPLATES: Record<string, { name: string; description: string }[]> = {
  code: [
    {
      name: "Code Quality",
      description: "Measures code review scores, test coverage, and adherence to coding standards",
    },
    {
      name: "Velocity",
      description: "Rate of feature delivery and story point completion",
    },
    {
      name: "Technical Debt",
      description: "Reduction of legacy code issues and maintenance burden",
    },
  ],
  communication: [
    {
      name: "Communication",
      description: "Frequency and clarity of updates shared with the team",
    },
    {
      name: "Responsiveness",
      description: "Timeliness of replies to messages and review requests",
    },
    {
      name: "Documentation",
      description: "Quality and completeness of written documentation",
    },
  ],
  leadership: [
    {
      name: "Initiative",
      description: "Proactive problem-solving and self-directed work",
    },
    {
      name: "Mentorship",
      description: "Time spent helping teammates grow and learn",
    },
    {
      name: "Decision Making",
      description: "Quality and timeliness of technical decisions",
    },
  ],
  default: [
    {
      name: "Output Quality",
      description: "Overall quality of work produced",
    },
    {
      name: "Collaboration",
      description: "Effectiveness of working with teammates",
    },
    {
      name: "Growth",
      description: "Progress in developing new skills and knowledge",
    },
    {
      name: "Reliability",
      description: "Consistency in meeting commitments and deadlines",
    },
  ],
};

// ---------------------------------------------------------------------------
// Gemini client (lazy — only created when first needed)
// ---------------------------------------------------------------------------

let _genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }
  return _genAI;
}

function getModel() {
  return getGenAI().getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.4,
    },
  });
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const benchmarkAIService = {
  /**
   * Generate 3-5 benchmark parameters from a text description using the LLM.
   * Falls back to keyword-based template matching when the LLM is unavailable.
   */
  async generateParameters(description: string): Promise<BenchmarkParameter[]> {
    try {
      const model = getModel();
      const prompt = `You are helping create a performance benchmark for a team. Based on this description, generate 3-5 measurable parameters (axes) that should be evaluated.

Description: "${description}"

Each parameter should have a clear name and description of what it measures.

Return JSON only: { "parameters": [{ "name": "...", "description": "..." }] }`;

      logger.info(
        { descriptionLength: description.length },
        "Generating benchmark parameters via LLM"
      );

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = parseLLMJson<{ parameters: { name: string; description: string }[] }>(text);

      if (
        !parsed.parameters ||
        !Array.isArray(parsed.parameters) ||
        parsed.parameters.length === 0
      ) {
        throw new Error("LLM returned empty or invalid parameters array");
      }

      const now = Date.now();
      return parsed.parameters.map((p, i) => ({
        id: `param-${now}-${i}`,
        name: p.name,
        description: p.description,
        importance: 3,
      }));
    } catch (error) {
      logger.warn({ error }, "LLM parameter generation failed, using keyword fallback");
      return generateParametersFallback(description);
    }
  },

  /**
   * Score each benchmark parameter against a period's activity summary.
   * Falls back to rule-based heuristics when the LLM is unavailable.
   */
  async scoreParameters(
    parameters: BenchmarkParameter[],
    periodSummary: PeriodActivitySummary
  ): Promise<ParameterScore[]> {
    try {
      const model = getModel();
      const prompt = `You are scoring a team member's work performance. Here is their activity data for the period:

${JSON.stringify(periodSummary, null, 2)}

Score each parameter on a scale of 1.0 to 5.0 (decimals allowed, where 1=poor, 3=meets expectations, 5=exceptional):

${parameters.map((p) => `- ${p.name} (ID: ${p.id}): ${p.description}`).join("\n")}

Consider the activity data carefully. Higher work minutes, better focus, more collaboration, and more accomplishments generally indicate higher scores.

Return JSON only: { "scores": [{ "parameterId": "...", "score": N, "reasoning": "brief explanation" }] }`;

      logger.info(
        { parameterCount: parameters.length, daysActive: periodSummary.daysActive },
        "Scoring benchmark parameters via LLM"
      );

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = parseLLMJson<{ scores: ParameterScore[] }>(text);

      if (!parsed.scores || !Array.isArray(parsed.scores) || parsed.scores.length === 0) {
        throw new Error("LLM returned empty or invalid scores array");
      }

      // Map scores back to actual parameter IDs by matching name or index.
      // LLMs sometimes corrupt UUIDs, so we don't trust parameterId from the response.
      const paramByName = new Map(parameters.map((p) => [p.name.toLowerCase(), p.id]));
      return parsed.scores.map((s, i) => {
        // Try to match by parameterId first, then by name, then by index
        const matchedId =
          parameters.find((p) => p.id === s.parameterId)?.id ??
          paramByName.get((s as { name?: string }).name?.toLowerCase() ?? "") ??
          parameters[i]?.id ??
          s.parameterId;
        return {
          parameterId: matchedId,
          score: Math.round(Math.min(5, Math.max(1, s.score)) * 10) / 10,
          reasoning: s.reasoning,
        };
      });
    } catch (error) {
      logger.warn({ error }, "LLM scoring failed, using rule-based fallback");
      return scoreParametersFallback(parameters, periodSummary);
    }
  },

  /**
   * Generate actionable improvement suggestions based on priority gaps.
   * Falls back to generic suggestions derived from parameter names.
   */
  async generateSuggestions(
    priorities: PriorityParam[],
    periodSummary: PeriodActivitySummary,
    userName: string
  ): Promise<Suggestion[]> {
    try {
      const model = getModel();
      const prompt = `Based on ${userName}'s work activity data and these improvement areas (sorted by priority):

${priorities.map((p) => `- ${p.name} (scored ${p.score}/5, importance: ${p.importance}/5, gap: ${p.gap.toFixed(1)}): ${p.description}`).join("\n")}

Activity summary: ${JSON.stringify(periodSummary)}

Generate 3 actionable, specific suggestions to improve their performance.
Each suggestion should reference concrete behaviors they can change.
Categorize each as "scheduling" (time management), "habits" (daily practices), or "encouragement" (positive reinforcement).

Return JSON only: { "suggestions": [{ "text": "...", "category": "scheduling|habits|encouragement" }] }`;

      logger.info(
        { userName, priorityCount: priorities.length },
        "Generating improvement suggestions via LLM"
      );

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = parseLLMJson<{ suggestions: Suggestion[] }>(text);

      if (
        !parsed.suggestions ||
        !Array.isArray(parsed.suggestions) ||
        parsed.suggestions.length === 0
      ) {
        throw new Error("LLM returned empty or invalid suggestions array");
      }

      return parsed.suggestions;
    } catch (error) {
      logger.warn({ error }, "LLM suggestion generation failed, using fallback");
      return generateSuggestionsFallback(priorities);
    }
  },

  /**
   * Detect notable accomplishments from a period's activity data.
   * Accomplishments are grounded in specific observed activities from sessions
   * and aligned to the benchmark's parameters.
   * Falls back to extracting raw accomplishments from session data.
   */
  async detectAccomplishments(
    periodSummary: PeriodActivitySummary,
    userName: string,
    activityContext: ActivityContext,
    parameters: PriorityParam[],
    benchmarkName?: string
  ): Promise<Accomplishment[]> {
    try {
      const model = getModel();

      // Build session context blocks (same format as bragbook generator)
      const sessionsBlock = activityContext.sessions
        .map((s, i) => {
          const parts: string[] = [];
          if (s.sessionName) parts.push(`Session: ${s.sessionName}`);
          if (s.summary) parts.push(`Summary: ${s.summary}`);
          if (s.taskBreakdown.length > 0) {
            const tasks = s.taskBreakdown
              .map((t) => `  - ${t.shortTitle}: ${t.description}`)
              .join("\n");
            parts.push(`Tasks:\n${tasks}`);
          }
          if (s.accomplishments.length > 0) {
            parts.push(`Accomplishments: ${s.accomplishments.join("; ")}`);
          }
          if (s.keyActivities.length > 0) {
            parts.push(`Key activities: ${s.keyActivities.join("; ")}`);
          }
          return `<session_${i + 1}>\n${parts.join("\n")}\n</session_${i + 1}>`;
        })
        .join("\n\n");

      const dailyBlock = activityContext.dailySummaries
        .filter((d) => d.daySummary || d.keyAccomplishments.length > 0)
        .map((d) => {
          const parts: string[] = [`Date: ${d.date}`];
          if (d.daySummary) parts.push(`Summary: ${d.daySummary}`);
          if (d.keyAccomplishments.length > 0) {
            parts.push(`Accomplishments: ${d.keyAccomplishments.join("; ")}`);
          }
          return parts.join("\n");
        })
        .join("\n\n");

      const paramsBlock = parameters
        .map((p) => `- ${p.name} (${p.score.toFixed(1)}/5): ${p.description}`)
        .join("\n");

      const prompt = `Identify 2-4 accomplishments from ${userName}'s recent work activity.${benchmarkName ? ` This is for the "${benchmarkName}" benchmark.` : ""}

<benchmark_parameters>
These are the areas being evaluated. Each accomplishment should be legible against at least one parameter:
${paramsBlock}
</benchmark_parameters>

<sessions>
${sessionsBlock || "No session data available."}
</sessions>

<daily_summaries>
${dailyBlock || "No daily summaries available."}
</daily_summaries>

<rules>
A good accomplishment describes a specific, observable activity and the quality of how it was executed. It is grounded in what actually happened.

- Write in plain, active, past-tense prose
- Each accomplishment should name a concrete action: what was done, to/with whom, and in what context
- Align accomplishments to the benchmark parameters above — prefer activities that reflect those focus areas
- Do NOT rephrase metrics ("dedicated X minutes", "maintained X% rate", "utilized N applications")
- Do NOT use self-congratulatory language ("exceptional", "impressive", "showcased", "demonstrated")
- Do NOT produce generic statements that could apply to anyone on any day
- Do NOT fabricate details not present in the session data
- If no meaningful specific accomplishments can be identified from the data, return an empty array
</rules>

<examples>
Good: "Reviewed the mitable.ai website, identified an opportunity for improvement with the CTA, crafted a concise replacement, and shared it in the team channel."
Good: "Responded to a team member's question about the Kestral meeting link in the session it was raised."
Good: "Opened a same-day huddle when coordination with Febe was needed."
Bad: "Demonstrated exceptional teamwork and collaboration, dedicating 1247 minutes to collaborative activities."
Bad: "Exhibited broad technical versatility by utilizing 27 unique applications."
Bad: "Maintained a high on-task rate throughout the period."
</examples>

Return JSON only: { "accomplishments": [{ "text": "...", "date": "YYYY-MM-DD" }] }`;

      logger.info({ userName }, "Detecting accomplishments via LLM");

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = parseLLMJson<{ accomplishments: Accomplishment[] }>(text);

      if (
        !parsed.accomplishments ||
        !Array.isArray(parsed.accomplishments) ||
        parsed.accomplishments.length === 0
      ) {
        throw new Error("LLM returned empty or invalid accomplishments array");
      }

      return parsed.accomplishments;
    } catch (error) {
      logger.warn({ error }, "LLM accomplishment detection failed, using fallback");
      return detectAccomplishmentsFallback(periodSummary, activityContext);
    }
  },
};

// ---------------------------------------------------------------------------
// Fallback implementations
// ---------------------------------------------------------------------------

function generateParametersFallback(description: string): BenchmarkParameter[] {
  const lower = description.toLowerCase();
  let templates = MOCK_PARAM_TEMPLATES.default;

  if (lower.includes("code") || lower.includes("engineer") || lower.includes("development")) {
    templates = MOCK_PARAM_TEMPLATES.code;
  } else if (
    lower.includes("communicat") ||
    lower.includes("writing") ||
    lower.includes("update")
  ) {
    templates = MOCK_PARAM_TEMPLATES.communication;
  } else if (lower.includes("lead") || lower.includes("manag") || lower.includes("senior")) {
    templates = MOCK_PARAM_TEMPLATES.leadership;
  }

  return templates.map((t, i) => ({
    id: `param-${Date.now()}-${i}`,
    name: t.name,
    description: t.description,
    importance: 3,
  }));
}

function scoreParametersFallback(
  parameters: BenchmarkParameter[],
  periodSummary: PeriodActivitySummary
): ParameterScore[] {
  return parameters.map((parameter) => {
    let score = 3.0;
    const name = parameter.name.toLowerCase();

    if (name.includes("focus") || name.includes("deep work")) {
      score = Math.min(
        5,
        Math.max(1, (periodSummary.deepFocusMinutes / (periodSummary.daysActive * 60)) * 5)
      );
    } else if (name.includes("communication") || name.includes("collaboration")) {
      score = Math.min(
        5,
        Math.max(1, (periodSummary.collaborationMinutes / (periodSummary.daysActive * 30)) * 5)
      );
    } else if (name.includes("quality") || name.includes("reliability")) {
      score = Math.min(5, Math.max(1, periodSummary.onTaskRate * 5));
    } else if (name.includes("growth") || name.includes("adoption")) {
      score = Math.min(5, Math.max(1, periodSummary.uniqueAppsUsed.length / 3));
    } else {
      score = Math.min(5, Math.max(1, periodSummary.avgWorkPercentage / 20));
    }

    return {
      parameterId: parameter.id,
      score: Math.round(score * 10) / 10,
      reasoning: "Rule-based score",
    };
  });
}

function generateSuggestionsFallback(priorities: PriorityParam[]): Suggestion[] {
  const categories: Array<"scheduling" | "habits" | "encouragement"> = [
    "scheduling",
    "habits",
    "encouragement",
  ];

  return priorities.slice(0, 3).map((p, i) => ({
    text: `Focus on improving ${p.name} by dedicating more structured time to ${p.description.toLowerCase()}.`,
    category: categories[i],
  }));
}

function detectAccomplishmentsFallback(
  _periodSummary: PeriodActivitySummary,
  activityContext: ActivityContext
): Accomplishment[] {
  const today = new Date().toISOString().split("T")[0];
  const seen = new Set<string>();
  const accomplishments: Accomplishment[] = [];

  // Patterns that indicate metric-rephrasing rather than real accomplishments
  const metricPatterns = /\d+\s*minutes?|\d+\s*hours?|\d+%|\d+\s*apps?|\d+\s*tools?/i;

  // 1. Extract raw accomplishments from sessions (most specific source)
  for (const session of activityContext.sessions) {
    for (const text of session.accomplishments) {
      const key = text.toLowerCase().trim();
      if (!seen.has(key) && !metricPatterns.test(text)) {
        seen.add(key);
        accomplishments.push({ text, date: session.date || today });
      }
    }
  }

  // 2. Extract from daily key accomplishments
  for (const day of activityContext.dailySummaries) {
    for (const text of day.keyAccomplishments) {
      const key = text.toLowerCase().trim();
      if (!seen.has(key) && !metricPatterns.test(text)) {
        seen.add(key);
        accomplishments.push({ text, date: day.date || today });
      }
    }
  }

  // Cap at 4, preferring most recent
  accomplishments.sort((a, b) => b.date.localeCompare(a.date));
  return accomplishments.slice(0, 4);
}
