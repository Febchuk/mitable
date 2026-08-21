/**
 * Local Document Generator
 *
 * Gathers context from block.md files (session data) and calls
 * the BYOK provider to generate document content locally.
 * Also handles AI revision of existing documents.
 */

import { readFile } from "fs/promises";
import { keyVault } from "./keyVault";
import { createProvider } from "./providers";
import type { ChatMessage } from "./providers";
import { pgDb } from "./pgDb";
import { consoleLogger } from "../../main/loggers";

const MAX_CONTEXT_CHARS = 40_000;

async function callByok(messages: ChatMessage[], maxTokens = 4000): Promise<string> {
  const config = await keyVault.load();
  if (!config) {
    throw new Error("No AI provider configured. Go to Settings → Setup to add your API key.");
  }
  const provider = createProvider(config.provider, config.apiKey, config.model);
  return provider.chatCompletion(messages, {
    temperature: 0.7,
    max_tokens: maxTokens,
  });
}

async function gatherSessionContext(sessionIds: string[]): Promise<string> {
  const parts: string[] = [];
  let totalChars = 0;

  for (const sid of sessionIds) {
    if (totalChars >= MAX_CONTEXT_CHARS) break;

    const exportPath = await pgDb.getExportPath(sid);
    if (exportPath) {
      try {
        const raw = await readFile(exportPath, "utf-8");
        const budget = MAX_CONTEXT_CHARS - totalChars;
        const text = raw.length > budget ? raw.slice(0, budget) : raw;
        parts.push(`--- Session ${sid} (block.md) ---\n${text}`);
        totalChars += text.length;
        continue;
      } catch {
        // fall through to DB
      }
    }

    const session = await pgDb.getMonitoringSession(sid);
    if (session) {
      const snippet = JSON.stringify({
        name: session.name,
        summary: session.summary,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      });
      parts.push(`--- Session ${sid} (db) ---\n${snippet}`);
      totalChars += snippet.length;
    }
  }

  return parts.join("\n\n");
}

export async function generateDocument(
  prompt: string,
  sessionIds?: string[]
): Promise<{ content: string; title: string }> {
  let context = "";
  if (sessionIds && sessionIds.length > 0) {
    context = await gatherSessionContext(sessionIds);
  }

  const systemPrompt = `You are a professional document writer. The user will ask you to create a document.
${context ? "You have access to session data from the user's work blocks. Use it as source material." : ""}

Rules:
- Write in clean markdown.
- Start with a # title on the first line, then the body.
- Be thorough, well-structured, and professional.
- Use headings, bullet points, and paragraphs as appropriate.
- Do NOT wrap the output in a code fence.`;

  const userMessage = context
    ? `Here is the source material:\n\n${context}\n\n---\n\nUser request: ${prompt}`
    : prompt;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  consoleLogger.info(
    `[DocGenerator] Generating document, prompt length=${prompt.length}, sessions=${sessionIds?.length ?? 0}, context chars=${context.length}`
  );

  const raw = await callByok(messages, 8000);

  const titleMatch = raw.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : "Untitled Document";

  return { content: raw, title };
}

export async function reviseDocumentLocal(
  instruction: string,
  currentContent: string
): Promise<{ suggestion: string }> {
  const systemPrompt = `You are a professional editor. The user will give you a document and an editing instruction.
Return the FULL revised document in clean markdown. Do NOT wrap in a code fence.
Preserve the overall structure unless the instruction explicitly asks to restructure.`;

  const userMessage = `Here is the current document:\n\n${currentContent}\n\n---\n\nRevision instruction: ${instruction}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  consoleLogger.info(`[DocGenerator] Revising document, instruction length=${instruction.length}`);

  const suggestion = await callByok(messages, 8000);
  return { suggestion };
}
