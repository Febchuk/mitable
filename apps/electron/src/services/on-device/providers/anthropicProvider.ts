/**
 * Anthropic Provider
 *
 * Uses the Messages API with vision support.
 * Model: claude-haiku-4-5 — fast, cheap, multimodal.
 */

import { createLogger } from "../../../lib/logger";
import type {
  InferenceProvider,
  ChatMessage,
  ChatCompletionOptions,
  ChatContentPart,
  ProviderName,
} from "./types";
import { DEFAULT_MODELS } from "./types";

const logger = createLogger("AnthropicProvider");

export class AnthropicProvider implements InferenceProvider {
  readonly name: ProviderName = "anthropic";
  readonly model: string;
  private apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODELS.anthropic;
  }

  async chatCompletion(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<string> {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystemMsgs = messages.filter((m) => m.role !== "system");

    const anthropicMessages = nonSystemMsgs.map((m) => ({
      role: m.role as "user" | "assistant",
      content: this.convertContent(m.content),
    }));

    const forceJson = options?.format === "json";

    if (forceJson) {
      anthropicMessages.push({ role: "assistant", content: "{" });
    }

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options?.max_tokens ?? 2048,
      messages: anthropicMessages,
    };

    if (systemMsg && typeof systemMsg.content === "string") {
      body.system = systemMsg.content;
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const textBlocks = data.content?.filter((b) => b.type === "text") ?? [];
    const text = textBlocks.map((b) => b.text || "").join("");
    if (!text) {
      logger.warn("Anthropic returned empty response");
    }
    return forceJson ? `{${text}` : text;
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

  private convertContent(
    content: string | Array<ChatContentPart>
  ): string | Array<Record<string, unknown>> {
    if (typeof content === "string") return content;

    return content.map((part) => {
      if (part.type === "text") {
        return { type: "text", text: part.text };
      }
      const dataUrl = part.image_url.url;
      const { mediaType, data } = this.parseDataUrl(dataUrl);
      return {
        type: "image",
        source: { type: "base64", media_type: mediaType, data },
      };
    });
  }

  private parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
    if (!dataUrl.startsWith("data:")) {
      return { mediaType: "image/png", data: dataUrl };
    }
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mediaType: match[1], data: match[2] };
    }
    return { mediaType: "image/png", data: dataUrl };
  }
}
