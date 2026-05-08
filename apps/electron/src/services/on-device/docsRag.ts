/**
 * Docs RAG Service
 *
 * Hybrid retrieval-augmented generation for local documents:
 * 1. Keyword search over doc chunks (always available)
 * 2. Vector search with pgvector (when embeddings are available)
 * 3. Top-K chunks fed to BYOK provider for answer synthesis
 */

import { pgDb } from "./pgDb";
import { keyVault } from "./keyVault";
import { createProvider } from "./providers";
import type { ChatMessage } from "./providers";
import { createLogger } from "../../lib/logger";

const logger = createLogger("DocsRAG");

const TOP_K = 10;
const MAX_CONTEXT_CHARS = 12_000;

export interface RagResult {
  answer: string;
  sources: Array<{ documentName: string; chunkIndex: number }>;
}

export async function queryDocs(userId: string, question: string): Promise<RagResult> {
  // 1. Retrieve relevant chunks via keyword search
  const chunks = await pgDb.searchDocChunks(question, userId, TOP_K);

  if (chunks.length === 0) {
    return {
      answer:
        "I couldn't find any relevant content in your documents. Try rephrasing your question or adding more documents.",
      sources: [],
    };
  }

  // 2. Build context window (trim to budget)
  let contextChars = 0;
  const selectedChunks: typeof chunks = [];
  for (const chunk of chunks) {
    if (contextChars + chunk.content.length > MAX_CONTEXT_CHARS) break;
    selectedChunks.push(chunk);
    contextChars += chunk.content.length;
  }

  const context = selectedChunks
    .map((c, i) => `[Source ${i + 1}: ${c.documentName}, chunk ${c.chunkIndex}]\n${c.content}`)
    .join("\n\n---\n\n");

  // 3. Call BYOK provider
  const config = await keyVault.load();
  if (!config) {
    throw new Error("No AI provider configured. Go to Settings → Setup to add your API key.");
  }

  const provider = createProvider(config.provider, config.apiKey, config.model);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a document Q&A assistant. Answer the user's question based ONLY on the provided document excerpts. If the excerpts don't contain enough information to answer, say so clearly. Cite source numbers [Source N] when referencing specific content. Be concise and accurate.`,
    },
    {
      role: "user",
      content: `<documents>\n${context}\n</documents>\n\nQuestion: ${question}`,
    },
  ];

  const answer = await provider.chatCompletion(messages, {
    temperature: 0.3,
    max_tokens: 2000,
  });

  const sources = selectedChunks.map((c) => ({
    documentName: c.documentName,
    chunkIndex: c.chunkIndex,
  }));

  logger.info(
    `RAG query completed: ${selectedChunks.length} chunks, ${contextChars} chars context`
  );

  return { answer, sources };
}
