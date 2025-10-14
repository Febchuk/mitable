import OpenAI from "openai";
import type { ChatCompletionOptions, ChatResponse } from "../shared-types/llm.types";

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
 * Generate a chat completion using OpenAI
 */
export async function generateChatCompletion(options: ChatCompletionOptions): Promise<ChatResponse> {
  const {
    messages,
    model = "gpt-4o-mini",
    temperature = 0.7,
    maxTokens = 500
  } = options;
  
  const ai = getOpenAI();
  
  const completion = await ai.chat.completions.create({
    model,
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    temperature,
    max_tokens: maxTokens,
  });

  const content = completion.choices[0]?.message?.content || "I apologize, but I couldn't generate a response.";
  
  return {
    content,
    model: completion.model,
    usage: completion.usage ? {
      promptTokens: completion.usage.prompt_tokens,
      completionTokens: completion.usage.completion_tokens,
      totalTokens: completion.usage.total_tokens
    } : undefined
  };
}

/**
 * Build a system prompt for RAG-based chat
 */
export function buildRAGSystemPrompt(contextString: string): string {
  return `You are a helpful AI assistant for Mitable, an onboarding platform.

IMPORTANT: You have been provided with context from company documents below. You MUST use this context to answer the user's question. The context comes from Slack messages, Notion pages, and Google Drive documents that have been uploaded to the knowledge base.

Answer the user's question based ONLY on the information provided in the context below. If the context contains relevant information, use it to form your answer. Be specific and reference the details from the context.

If the context doesn't contain information to answer the question, say "I don't have information about that in the current knowledge base."

CONTEXT FROM COMPANY DOCUMENTS:
${contextString}

---
Now answer the user's question based on the context above.`;
}
