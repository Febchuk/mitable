/**
 * BYOK Provider Abstraction
 *
 * Common interface for cloud AI providers (Google Gemini, OpenAI, Anthropic).
 * Each provider implements vision (batch frame analysis) and text (summarization)
 * using a single multimodal model per provider.
 *
 * The `chatCompletion` method matches Ollama's signature so the existing
 * localInferenceService pipeline can swap providers transparently.
 */

export type ProviderName = "google" | "openai" | "anthropic";

export interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  model?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<ChatContentPart>;
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatCompletionOptions {
  temperature?: number;
  max_tokens?: number;
  format?: "json" | "text";
}

export interface InferenceProvider {
  readonly name: ProviderName;
  readonly model: string;

  chatCompletion(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<string>;

  testConnection(): Promise<{ ok: boolean; error?: string }>;
}

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  google: "gemini-2.5-flash-lite-preview-06-2025",
  openai: "gpt-5.4-mini",
  anthropic: "claude-haiku-4-5-20251001",
};

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  google: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
};
