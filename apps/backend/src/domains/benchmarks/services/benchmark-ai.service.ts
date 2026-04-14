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
import { z } from "zod";
import { config } from "../../../config.js";
import { createLogger } from "../../shared-infra/lib/logger.js";
import { toGeminiSchema } from "../../../utils/gemini-schema.js";
import type { ScoringRubric, ScoreLevel } from "../schema/benchmarks.schema.js";

const logger = createLogger({ context: "benchmark-ai" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { ScoringRubric, ScoreLevel };

export interface BenchmarkParameter {
  id: string;
  name: string;
  description: string;
  importance: number;
  scoringRubric?: ScoringRubric | null;
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

// Zod schema for structured scoring output
const ScoringResponseSchema = z.object({
  scores: z.array(
    z.object({
      parameterId: z.string(),
      score: z.number(),
      reasoning: z.string(),
    })
  ),
});

/**
 * Dedicated scoring model: temperature 0 + structured JSON output.
 * Used only for scoreParameters() to maximise determinism.
 */
function getScoringModel() {
  return getGenAI().getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: toGeminiSchema(ScoringResponseSchema) as any,
    },
  });
}

// Zod schema for rubric generation output
const RubricResponseSchema = z.object({
  levels: z.array(
    z.object({
      score: z.number(),
      label: z.string(),
      criteria: z.string(),
    })
  ),
  relevantMetrics: z.array(z.string()),
  scoringGuidance: z.string(),
});

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
   * Generate a scoring rubric for a benchmark parameter.
   * Called once at parameter creation/edit time — the result is stored in the DB
   * and reused at every scoring run for deterministic evaluation.
   */
  async generateScoringRubric(
    paramName: string,
    paramDescription: string,
    benchmarkName: string
  ): Promise<ScoringRubric> {
    try {
      const model = getGenAI().getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
          responseSchema: toGeminiSchema(RubricResponseSchema) as any,
        },
      });

      const prompt = `You are creating a scoring rubric for a benchmark parameter used to evaluate employee work performance.

Benchmark: "${benchmarkName}"
Parameter: "${paramName}"
Description: "${paramDescription}"

Available activity metrics the scoring system can observe for each employee over a period:
- totalWorkMinutes: Total minutes spent working
- totalMeetingMinutes: Minutes in meetings
- deepFocusMinutes: Minutes in uninterrupted focus blocks (>25 min)
- collaborationMinutes: Minutes in collaborative activities
- avgWorkPercentage: Average percentage of time spent working (0-100)
- onTaskRate: Fraction of time on-task (0.0-1.0)
- uniqueAppsUsed: List of unique applications used
- categoryBreakdown: App categories mapped to minutes spent
- accomplishmentCount: Number of accomplishments detected
- longestFocusBlockMinutes: Longest single uninterrupted focus block
- contextSwitchCount: Number of context switches between tasks
- daysActive: Number of days with recorded activity
- Session-level data: session names, summaries, task breakdowns, key activities, accomplishments

Create a rubric with exactly 5 score levels (1.0 through 5.0). Each level must describe concrete, observable criteria that a scorer can verify against the activity data above. Use specific numeric thresholds where quantitative metrics apply (e.g., "averaging over 120 minutes/day of deep focus"). For qualitative aspects, describe observable patterns in session data (e.g., "session summaries show cross-team coordination").

Also identify which activity metrics from the list above are most relevant to this parameter, and provide brief scoring guidance on how to weigh quantitative vs qualitative signals.`;

      logger.info({ paramName, benchmarkName }, "Generating scoring rubric via LLM");

      const result = await model.generateContent(prompt);
      const parsed = JSON.parse(result.response.text()) as {
        levels: ScoreLevel[];
        relevantMetrics: string[];
        scoringGuidance: string;
      };

      if (!parsed.levels || parsed.levels.length !== 5) {
        throw new Error(`Expected 5 rubric levels, got ${parsed.levels?.length ?? 0}`);
      }

      return {
        levels: parsed.levels,
        relevantMetrics: parsed.relevantMetrics ?? [],
        scoringGuidance: parsed.scoringGuidance ?? "",
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.warn({ error, paramName }, "LLM rubric generation failed, using fallback");
      return generateRubricFallback(paramName, paramDescription);
    }
  },

  /**
   * Score each benchmark parameter against a period's activity summary.
   * Uses stored rubrics (temperature 0 + structured output) for determinism.
   * Falls back to rule-based heuristics for legacy parameters without rubrics.
   */
  async scoreParameters(
    parameters: BenchmarkParameter[],
    periodSummary: PeriodActivitySummary
  ): Promise<ParameterScore[]> {
    // Split parameters into those with stored rubrics and legacy ones without
    const withRubric = parameters.filter((p) => p.scoringRubric);
    const withoutRubric = parameters.filter((p) => !p.scoringRubric);

    const results: ParameterScore[] = [];

    // Score parameters with rubrics using temperature 0 + structured output
    if (withRubric.length > 0) {
      try {
        const model = getScoringModel();

        const rubricBlock = withRubric
          .map((p) => {
            const rubric = p.scoringRubric!;
            const levels = rubric.levels
              .map((l) => `  ${l.score} (${l.label}): ${l.criteria}`)
              .join("\n");
            return `Parameter: ${p.name} (ID: ${p.id})
Description: ${p.description}
Scoring rubric:
${levels}
Guidance: ${rubric.scoringGuidance}`;
          })
          .join("\n\n---\n\n");

        const prompt = `Score this employee's work performance using the rubrics below.
Evaluate the activity data against each parameter's rubric criteria strictly.
Assign the score that best matches the observed data. Use decimal scores (e.g., 3.4)
when performance falls between two levels. Do not deviate from the rubric thresholds.

Activity data for the period:
${JSON.stringify(periodSummary, null, 2)}

${rubricBlock}

For each parameter, return the score and a brief reasoning citing specific data points from the activity data.`;

        logger.info(
          { parameterCount: withRubric.length, daysActive: periodSummary.daysActive },
          "Scoring benchmark parameters via LLM with stored rubrics (temperature 0)"
        );

        const result = await model.generateContent(prompt);
        const parsed = JSON.parse(result.response.text()) as {
          scores: ParameterScore[];
        };

        if (!parsed.scores || !Array.isArray(parsed.scores) || parsed.scores.length === 0) {
          throw new Error("LLM returned empty or invalid scores array");
        }

        // Map scores back to actual parameter IDs
        const paramByName = new Map(withRubric.map((p) => [p.name.toLowerCase(), p.id]));
        for (let i = 0; i < parsed.scores.length; i++) {
          const s = parsed.scores[i];
          const matchedId =
            withRubric.find((p) => p.id === s.parameterId)?.id ??
            paramByName.get((s as { name?: string }).name?.toLowerCase() ?? "") ??
            withRubric[i]?.id ??
            s.parameterId;
          results.push({
            parameterId: matchedId,
            score: Math.round(Math.min(5, Math.max(1, s.score)) * 10) / 10,
            reasoning: s.reasoning,
          });
        }
      } catch (error) {
        logger.warn({ error }, "LLM rubric-based scoring failed, falling back to rule-based");
        for (const p of withRubric) {
          results.push(scoreParameterFallbackSingle(p, periodSummary));
        }
      }
    }

    // Score legacy parameters without rubrics using deterministic rule-based fallback
    for (const p of withoutRubric) {
      results.push(scoreParameterFallbackSingle(p, periodSummary));
    }

    return results;
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

/**
 * Score a single parameter using rule-based heuristics (deterministic).
 * Used for legacy parameters that don't have a stored rubric.
 */
function scoreParameterFallbackSingle(
  parameter: BenchmarkParameter,
  periodSummary: PeriodActivitySummary
): ParameterScore {
  let score = 3.0;
  const name = parameter.name.toLowerCase();

  if (name.includes("focus") || name.includes("deep work")) {
    const perDay =
      periodSummary.daysActive > 0 ? periodSummary.deepFocusMinutes / periodSummary.daysActive : 0;
    score = Math.min(5, Math.max(1, (perDay / 60) * 5));
  } else if (name.includes("communication") || name.includes("collaboration")) {
    const perDay =
      periodSummary.daysActive > 0
        ? periodSummary.collaborationMinutes / periodSummary.daysActive
        : 0;
    score = Math.min(5, Math.max(1, (perDay / 30) * 5));
  } else if (name.includes("quality") || name.includes("reliability")) {
    score = Math.min(5, Math.max(1, periodSummary.onTaskRate * 5));
  } else if (name.includes("growth") || name.includes("adoption")) {
    score = Math.min(
      5,
      Math.max(
        1,
        (Array.isArray(periodSummary.uniqueAppsUsed) ? periodSummary.uniqueAppsUsed.length : 0) / 3
      )
    );
  } else {
    score = Math.min(5, Math.max(1, periodSummary.avgWorkPercentage / 20));
  }

  return {
    parameterId: parameter.id,
    score: Math.round(score * 10) / 10,
    reasoning: "Rule-based score (no rubric available)",
  };
}

/**
 * Generate a fallback rubric when LLM is unavailable.
 * Produces a generic rubric based on keyword matching against the parameter name.
 */
function generateRubricFallback(paramName: string, _paramDescription: string): ScoringRubric {
  const name = paramName.toLowerCase();

  let metricHint = "avgWorkPercentage";
  let guidance = "Score based on overall work percentage as a general proxy.";

  if (name.includes("focus") || name.includes("deep work")) {
    metricHint = "deepFocusMinutes";
    guidance = "Score primarily on deep focus minutes per active day.";
  } else if (name.includes("communication") || name.includes("collaboration")) {
    metricHint = "collaborationMinutes";
    guidance = "Score primarily on collaboration minutes per active day.";
  } else if (name.includes("quality") || name.includes("reliability")) {
    metricHint = "onTaskRate";
    guidance = "Score primarily on on-task rate (0-1 scale).";
  } else if (name.includes("growth") || name.includes("adoption")) {
    metricHint = "uniqueAppsUsed";
    guidance = "Score based on breadth of tools and applications used.";
  }

  return {
    levels: [
      { score: 1.0, label: "Poor", criteria: `Very low ${metricHint} activity observed.` },
      { score: 2.0, label: "Below Average", criteria: `Below-average ${metricHint} activity.` },
      {
        score: 3.0,
        label: "Meets Expectations",
        criteria: `Average ${metricHint} activity for the period.`,
      },
      { score: 4.0, label: "Strong", criteria: `Above-average ${metricHint} activity.` },
      {
        score: 5.0,
        label: "Exceptional",
        criteria: `Outstanding ${metricHint} activity, well above typical levels.`,
      },
    ],
    relevantMetrics: [metricHint],
    scoringGuidance: guidance,
    generatedAt: new Date().toISOString(),
  };
}
