/**
 * Provider Factory
 *
 * Creates the appropriate InferenceProvider based on org configuration.
 */

export type {
  InferenceProvider,
  ProviderConfig,
  ProviderName,
  ChatMessage,
  ChatContentPart,
  ChatCompletionOptions,
} from "./types";
export { DEFAULT_MODELS, PROVIDER_LABELS } from "./types";

import type { InferenceProvider, ProviderName } from "./types";
import { DEFAULT_MODELS } from "./types";
import { GeminiProvider } from "./geminiProvider";
import { OpenAIProvider } from "./openaiProvider";
import { AnthropicProvider } from "./anthropicProvider";

export function createProvider(
  providerName: ProviderName,
  apiKey: string,
  model?: string
): InferenceProvider {
  switch (providerName) {
    case "google":
      return new GeminiProvider(apiKey, model || DEFAULT_MODELS.google);
    case "openai":
      return new OpenAIProvider(apiKey, model || DEFAULT_MODELS.openai);
    case "anthropic":
      return new AnthropicProvider(apiKey, model || DEFAULT_MODELS.anthropic);
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}
