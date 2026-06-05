/**
 * Agent Local RLM
 *
 * On-device RLM loop for conversational queries about the user's work.
 * Uses BYOK provider (keyVault) instead of backend LLM keys.
 * Mirrors the backend POST /api/agent/ask loop.
 */

import { AgentLocalEnvironment } from "./agent-local-environment";
import { getAgentLocalToolByName } from "./agent-local-tools";
import { getAgentLocalSystemPrompt } from "./agent-local-prompts";
import { parseJsonResponse } from "./parse-json";
import { keyVault } from "../keyVault";
import { createProvider } from "../providers";
import type { ChatMessage } from "../providers";
import { consoleLogger } from "../../../main/loggers";

const MAX_ITERATIONS = 10;

interface RlmDecision {
  tool?: string;
  parameters?: Record<string, string>;
  reasoning?: string;
  done?: boolean;
  response?: string;
}

export interface AgentLocalRlmResult {
  response: string;
  iterations: number;
  toolCalls: number;
}

export type RlmProgressCallback = (event: {
  phase: "thinking" | "tool_call" | "tool_result" | "composing";
  tool?: string;
  iteration: number;
}) => void;

async function callByokLlm(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const config = await keyVault.load();
  if (!config) {
    throw new Error("No AI provider configured. Go to Settings → Setup to add your API key.");
  }

  const provider = createProvider(config.provider, config.apiKey, config.model);

  const chatMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    })),
  ];

  return provider.chatCompletion(chatMessages, {
    temperature: 0.7,
    max_tokens: 4000,
    format: "json",
  });
}

export async function runAgentLocalRlm(
  userId: string,
  userName: string,
  message: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  timezone?: string,
  onProgress?: RlmProgressCallback
): Promise<AgentLocalRlmResult> {
  const environment = new AgentLocalEnvironment(userId);
  const systemPrompt = getAgentLocalSystemPrompt(userName, timezone);

  const rlmMessages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...conversationHistory,
    { role: "user", content: message },
  ];

  let iterations = 0;
  let toolCalls = 0;
  let finalResponse = "";

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    onProgress?.({ phase: "thinking", iteration: iterations });

    const llmRaw = await callByokLlm(systemPrompt, rlmMessages);

    let decision: RlmDecision;
    try {
      decision = parseJsonResponse<RlmDecision>(llmRaw);
    } catch {
      finalResponse = llmRaw;
      break;
    }

    rlmMessages.push({ role: "assistant", content: JSON.stringify(decision) });

    if (decision.done && decision.response) {
      onProgress?.({ phase: "composing", iteration: iterations });
      finalResponse = decision.response;
      break;
    }

    if (decision.tool && decision.parameters !== undefined) {
      const tool = getAgentLocalToolByName(decision.tool);
      if (!tool) {
        rlmMessages.push({
          role: "user",
          content: `Error: Unknown tool "${decision.tool}". Use only tools listed in <available_tools>.`,
        });
        continue;
      }

      onProgress?.({ phase: "tool_call", tool: decision.tool, iteration: iterations });

      try {
        const toolResult = await tool.execute(decision.parameters, environment);
        toolCalls++;

        onProgress?.({ phase: "tool_result", tool: decision.tool, iteration: iterations });

        rlmMessages.push({
          role: "user",
          content: `Tool "${decision.tool}" returned:\n${JSON.stringify(toolResult, null, 2)}\n\nContinue with the next step.`,
        });
      } catch (err) {
        rlmMessages.push({
          role: "user",
          content: `Tool "${decision.tool}" failed: ${String(err)}\n\nTry a different approach or respond with what you know.`,
        });
      }
    } else {
      if (decision.response) finalResponse = decision.response;
      break;
    }
  }

  if (!finalResponse) {
    finalResponse = "I wasn't able to generate a response. Please try rephrasing your question.";
  }

  consoleLogger.info(
    `[AgentLocalRLM] Completed: ${iterations} iterations, ${toolCalls} tool calls`
  );

  return { response: finalResponse, iterations, toolCalls };
}
