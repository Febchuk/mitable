/**
 * Google Gemini Provider
 *
 * Uses REST API directly (no SDK dependency needed in Electron).
 * Model: gemini-2.5-flash-lite — cheapest multimodal option.
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

const logger = createLogger("GeminiProvider");

export class GeminiProvider implements InferenceProvider {
  readonly name: ProviderName = "google";
  readonly model: string;
  private apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODELS.google;
  }

  async chatCompletion(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<string> {
    const parts = this.buildParts(messages);

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: options?.temperature ?? 0.2,
        maxOutputTokens: options?.max_tokens ?? 2048,
        ...(options?.format === "json" && { responseMimeType: "application/json" }),
      },
    };

    const systemMsg = messages.find((m) => m.role === "system");
    if (systemMsg && typeof systemMsg.content === "string") {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) {
      logger.warn("Gemini returned empty response");
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

  private buildParts(messages: ChatMessage[]): Array<Record<string, unknown>> {
    const parts: Array<Record<string, unknown>> = [];

    for (const msg of messages) {
      if (msg.role === "system") continue;
      if (typeof msg.content === "string") {
        parts.push({ text: msg.content });
      } else {
        for (const part of msg.content as ChatContentPart[]) {
          if (part.type === "text") {
            parts.push({ text: part.text });
          } else if (part.type === "image_url") {
            const dataUrl = part.image_url.url;
            const { mimeType, data } = this.parseDataUrl(dataUrl);
            parts.push({ inlineData: { mimeType, data } });
          }
        }
      }
    }

    return parts;
  }

  private parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
    if (!dataUrl.startsWith("data:")) {
      return { mimeType: "image/png", data: dataUrl };
    }
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
    return { mimeType: "image/png", data: dataUrl };
  }
}
