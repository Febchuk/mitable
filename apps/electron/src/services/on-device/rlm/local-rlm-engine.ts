/**
 * Local RLM Engine
 *
 * Shared iterative loop for on-device Recursive Language Model processing.
 * Mirrors the cloud RLM pattern: call LLM → parse JSON → execute tool → repeat.
 * Works with Ollama's native JSON mode (format: "json") — no GBNF grammar needed.
 */

import { createLogger } from "../../../lib/logger";

const logger = createLogger("LocalRLM");

// ── Types ───────────────────────────────────────────────────────────────────

export interface RLMToolParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface RLMTool<TEnv = unknown> {
  name: string;
  description: string;
  parameters: RLMToolParameter[];
  execute: (params: Record<string, unknown>, env: TEnv) => Promise<unknown> | unknown;
}

/** Chat completion function signature — decoupled from ollamaService so the
 *  RLM engine can be used standalone (e.g. reprocess script). */
export type CompletionFn = (
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: { temperature?: number; max_tokens?: number }
) => Promise<string>;

export interface RLMConfig {
  maxIterations: number;
  temperature?: number;
  maxTokens?: number;
  /** Field on the done-response that holds the final result (e.g. "classification", "summary") */
  doneResultField: string;
  /** LLM completion function — injected by caller (should return JSON) */
  completionFn: CompletionFn;
}

interface LLMToolCall {
  done?: boolean;
  tool?: string;
  parameters?: Record<string, unknown>;
  reasoning?: string;
  [key: string]: unknown;
}

export interface RLMResult<T = unknown> {
  success: boolean;
  result: T | null;
  iterations: number;
  toolHistory: Array<{ tool: string; result: unknown }>;
  error?: string;
}

// ── GBNF Grammars ───────────────────────────────────────────────────────────

/**
 * Grammar that forces the LLM to produce either a tool call or a done signal.
 * Allows arbitrary JSON values in "parameters" and extra fields for done responses.
 */
export const RLM_TOOL_CALL_GRAMMAR = `
root        ::= "{" ws members ws "}"
members     ::= pair ( ws "," ws pair )*
pair        ::= string ws ":" ws value
string      ::= "\\"" chars "\\""
chars       ::= char*
char        ::= [^"\\\\\\x00-\\x1f] | "\\\\" escape
escape      ::= ["\\\\/bfnrt] | "u" hex hex hex hex
hex         ::= [0-9a-fA-F]
value       ::= string | number | object | array | "true" | "false" | "null"
object      ::= "{" ws ( pair ( ws "," ws pair )* )? ws "}"
array       ::= "[" ws ( value ( ws "," ws value )* )? ws "]"
number      ::= "-"? digits ( "." digits )? ( [eE] [+-]? digits )?
digits      ::= [0-9]+
ws          ::= [ \\t\\n\\r]*
`.trim();

// ── Engine ──────────────────────────────────────────────────────────────────

export async function runRLMLoop<TEnv, TResult>(
  systemPrompt: string,
  initialUserMessage: string,
  tools: RLMTool<TEnv>[],
  environment: TEnv,
  config: RLMConfig
): Promise<RLMResult<TResult>> {
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: initialUserMessage },
  ];

  const toolHistory: Array<{ tool: string; result: unknown }> = [];
  let iterations = 0;

  while (iterations < config.maxIterations) {
    iterations++;

    let llmResponse: LLMToolCall;
    try {
      const raw = await config.completionFn(messages, {
        temperature: config.temperature ?? 0.1,
        max_tokens: config.maxTokens ?? 1024,
      });

      llmResponse = parseJsonResponse(raw);
    } catch (err) {
      logger.error(`RLM iteration ${iterations} LLM call failed:`, String(err));
      break;
    }

    messages.push({ role: "assistant", content: JSON.stringify(llmResponse) });

    if (llmResponse.done) {
      const result = llmResponse[config.doneResultField] as TResult | undefined;
      if (result !== undefined) {
        logger.info(`RLM completed in ${iterations} iterations`);
        return { success: true, result, iterations, toolHistory };
      }
      logger.warn(`RLM returned done=true but missing "${config.doneResultField}" field`);
      break;
    }

    if (llmResponse.tool && llmResponse.parameters !== undefined) {
      const tool = tools.find((t) => t.name === llmResponse.tool);
      if (!tool) {
        logger.warn(`RLM requested unknown tool: ${llmResponse.tool}`);
        messages.push({
          role: "user",
          content: `Error: Unknown tool "${llmResponse.tool}". Available tools: ${tools.map((t) => t.name).join(", ")}. Try again.`,
        });
        continue;
      }

      try {
        const toolResult = await tool.execute(llmResponse.parameters, environment);
        toolHistory.push({ tool: tool.name, result: toolResult });

        messages.push({
          role: "user",
          content: `Tool "${tool.name}" returned:\n${JSON.stringify(toolResult, null, 2)}\n\nContinue with the next step.`,
        });
      } catch (err) {
        logger.error(`RLM tool "${tool.name}" failed:`, String(err));
        messages.push({
          role: "user",
          content: `Tool "${tool.name}" failed with error: ${String(err)}. Try a different approach or finish with what you have.`,
        });
      }
    } else {
      logger.warn("RLM returned neither done nor tool call, stopping");
      break;
    }
  }

  if (iterations >= config.maxIterations) {
    logger.warn(`RLM hit max iterations (${config.maxIterations})`);
  }

  // Fallback: try to extract a result from the last tool history entry
  const lastDone = toolHistory.find((h) => h.tool === "classify" || h.tool === "build_story");
  if (lastDone?.result) {
    return {
      success: true,
      result: lastDone.result as TResult,
      iterations,
      toolHistory,
      error: "Completed via tool history fallback",
    };
  }

  return {
    success: false,
    result: null,
    iterations,
    toolHistory,
    error: `RLM did not produce a final result after ${iterations} iterations`,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseJsonResponse(raw: string): LLMToolCall {
  const trimmed = raw.trim();

  // Try direct parse first
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  // Strip markdown fences if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      /* fall through */
    }
  }

  // Try to find first { ... } block
  const braceStart = trimmed.indexOf("{");
  const braceEnd = trimmed.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    try {
      return JSON.parse(trimmed.slice(braceStart, braceEnd + 1));
    } catch {
      /* fall through */
    }
  }

  // Truncated JSON recovery: if the LLM ran out of tokens mid-response,
  // try to salvage a build_story narrative from the incomplete JSON.
  const narrativeMatch = trimmed.match(/"narrative"\s*:\s*"([\s\S]+)/);
  if (narrativeMatch) {
    let narrative = narrativeMatch[1];
    // Strip trailing incomplete JSON artifacts
    narrative = narrative.replace(/"\s*,?\s*"tasks"[\s\S]*$/, "");
    narrative = narrative.replace(/"\s*}\s*}\s*$/, "");
    narrative = narrative.replace(/"\s*$/, "");
    // Unescape JSON string escapes
    try {
      narrative = JSON.parse(`"${narrative}"`);
    } catch {
      narrative = narrative.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    if (narrative.length > 20) {
      logger.warn(`Recovered truncated narrative (${narrative.length} chars) from incomplete JSON`);
      return {
        tool: "build_story",
        parameters: { narrative, tasks: [] },
      };
    }
  }

  throw new Error(`Could not parse LLM response as JSON: ${trimmed.slice(0, 200)}`);
}

/** Build the tool catalog section for a system prompt */
export function buildToolCatalog<TEnv>(tools: RLMTool<TEnv>[]): string {
  return tools
    .map((tool) => {
      const params = tool.parameters
        .map(
          (p) =>
            `${p.name}: ${p.type}${p.required ? " (required)" : " (optional)"} — ${p.description}`
        )
        .join("\n    ");
      return `- ${tool.name}(${params || "no parameters"}): ${tool.description}`;
    })
    .join("\n");
}
