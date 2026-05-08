/**
 * OpenAI Provider
 *
 * Uses chat completions API with vision support.
 * Model: gpt-4.1-mini — good balance of cost and capability.
 */

import { createLogger } from "../../../lib/logger";
import type { InferenceProvider, ChatMessage, ChatCompletionOptions, ProviderName } from "./types";
import { DEFAULT_MODELS } from "./types";

const logger = createLogger("OpenAIProvider");

export class OpenAIProvider implements InferenceProvider {
  readonly name: ProviderName = "openai";
  readonly model: string;
  private apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODELS.openai;
  }

  async chatCompletion(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.max_tokens ?? 2048,
    };

    if (options?.format === "json") {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errText.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const text = data.choices?.[0]?.message?.content?.trim() || "";
    if (!text) {
      logger.warn("OpenAI returned empty response");
    }
    return text;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await this.chatCompletion([{ role: "user", content: "Say OK" }], {
        max_tokens: 10,
        temperature: 0,
      });
      return { ok: result.length > 0 };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}
