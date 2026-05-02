import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null = null;

export function getAnthropic() {
  if (!cached) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    cached = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return cached;
}

export const HAIKU_MODEL = "claude-haiku-4-5";
