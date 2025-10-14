import OpenAI from "openai";
import type { EmbeddingOptions } from "../shared-types/embedding.types";

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * Generate an embedding vector for the given text
 */
export async function generateEmbedding(options: EmbeddingOptions): Promise<number[]> {
  const { text, model = "text-embedding-3-small", dimensions = 1024 } = options;
  
  const ai = getOpenAI();
  
  const response = await ai.embeddings.create({
    model,
    input: text,
    dimensions,
  });

  return response.data[0].embedding;
}
