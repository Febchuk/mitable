/**
 * Document Refinement Service
 *
 * Conversational AI assistant for editing documents.
 * Uses the same Claude Sonnet 4.5 + doc generation tools as the initial
 * document creation agent, so the chat has full access to session data,
 * artifacts, and template parsing.
 *
 * Primary: Anthropic Claude Sonnet 4.5 with native tool_use
 * Fallback: OpenAI GPT-5 single-shot (no tool loop)
 * Last resort: Groq GPT-OSS-120B single-shot
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import Groq from "groq-sdk";
import { config } from "../config.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import {
  DOCUMENT_GENERATION_TOOLS,
  executeToolCall,
  type ToolCall,
} from "./document-generation/tools.js";
import { createDocumentEnvironment } from "./document-generation/environment.js";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DocRefinementRequest {
  documentId: string;
  userId: string;
  organizationId: string;
  messages: ChatMessage[];
  currentContent: string;
}

export interface DocRefinementResponse {
  message: string;
  suggestedEdit: string | null;
  toolCallCount: number;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function buildSystemPrompt(currentContent: string, docType: string): string {
  return `You are a document editing assistant for Mitable, a work session tracking tool.
The user has an AI-generated document they want to improve. You have tools to look up their session data, artifacts, and templates on-demand.

## Current Document Being Edited
${currentContent}

## Document Type
${docType}

## Your Tools
You have tools to fetch additional data when needed:
- get_sessions_overview: get high-level overview of sessions in scope
- get_session_timeline: get detailed timeline for a specific session
- get_session_summary: get narrative summary for a session
- get_all_summaries: get summaries for all sessions at once
- get_time_breakdown: get application usage breakdown
- get_top_applications: get top apps by time spent
- filter_sessions_by_priority: filter sessions by priority level
- get_artifact_content: get full text of uploaded reference documents
- search_artifacts: search uploaded documents by semantic similarity
- parse_template_structure: extract document structure from an uploaded template

## When to Use Tools
- User asks to "add more detail about [topic]" → search sessions/artifacts for that topic
- User mentions a template or format → use parse_template_structure
- User asks about specific sessions → get_session_summary or get_session_timeline
- Simple style/format changes → rewrite directly, no tools needed

## Response Format
When rewriting the document (or a section), respond with TWO parts:

1. A brief conversational message (1-2 sentences) explaining what you changed
2. The full rewritten document wrapped in <document> tags

Example:
I've restructured the report to follow your template and added the deployment details from Thursday's session.

<document>
[full rewritten document here — use markdown formatting]
</document>

If the user is just chatting or asking a question (not requesting a rewrite), respond conversationally WITHOUT <document> tags.

## Rules
- Base all content on actual session data and artifacts — never hallucinate facts
- Preserve existing content unless the user asks to change it
- Use markdown formatting (headings, lists, tables, code blocks)
- Be concise in conversational messages, thorough in document rewrites
- If the user asks to add something not in the data, say so clearly`;
}

/** Convert OpenAI-format tool defs to Claude tool defs */
function toClaudeTools(tools: typeof DOCUMENT_GENERATION_TOOLS): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
  }));
}

function parseResponse(raw: string): { message: string; suggestedEdit: string | null } {
  const match = raw.match(/<document>([\s\S]*?)<\/document>/);
  if (match) {
    const suggestedEdit = match[1].trim();
    const message = raw.replace(/<document>[\s\S]*?<\/document>/, "").trim();
    return { message: message || "Here's the revised document:", suggestedEdit };
  }
  return { message: raw.trim(), suggestedEdit: null };
}

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------

class DocRefinementService {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private groq: Groq | null = null;
  private maxToolRounds = 8;

  constructor() {
    if (config.anthropic.apiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
      console.log("[DocRefinement] Claude Sonnet 4.5 configured (primary)");
    }
    if (config.openai.apiKey) {
      this.openai = new OpenAI({ apiKey: config.openai.apiKey });
      console.log("[DocRefinement] OpenAI GPT-5 configured (fallback)");
    }
    if (config.groq.apiKey) {
      this.groq = new Groq({ apiKey: config.groq.apiKey });
      console.log("[DocRefinement] Groq GPT-OSS-120B configured (last resort)");
    }
  }

  async refine(request: DocRefinementRequest): Promise<DocRefinementResponse> {
    // Look up the document to get docType and contributing sessions
    const [doc] = await db
      .select({
        docType: schema.documents.docType,
      })
      .from(schema.documents)
      .where(eq(schema.documents.id, request.documentId))
      .limit(1);

    const docType = (doc?.docType as string) || "knowledge-article";

    // Get contributing session IDs for this document
    const contributions = await db
      .select({ sessionId: schema.sessionDocumentContributions.sessionId })
      .from(schema.sessionDocumentContributions)
      .where(eq(schema.sessionDocumentContributions.documentId, request.documentId));

    const sessionIds = contributions.map((c) => c.sessionId);

    // Create RLM environment so tools can query session data
    const environment = createDocumentEnvironment(
      sessionIds,
      request.organizationId,
      request.userId,
      "", // no query — refinement, not generation
      null, // no date range
      undefined // artifacts auto-discovered by tools
    );

    if (this.anthropic) {
      try {
        return await this.refineWithClaude(request, docType, environment);
      } catch (error) {
        console.warn("[DocRefinement] Claude failed — falling back to GPT-5:", String(error));
      }
    }

    if (this.openai) {
      try {
        return await this.refineWithOpenAI(request, docType);
      } catch (error) {
        console.warn("[DocRefinement] OpenAI also failed — trying Groq:", String(error));
      }
    }

    return this.refineWithGroq(request, docType);
  }

  // --------------------------------------------------------------------------
  // Primary: Claude Sonnet 4.5 with native tool_use
  // --------------------------------------------------------------------------

  private async refineWithClaude(
    input: DocRefinementRequest,
    docType: string,
    environment: ReturnType<typeof createDocumentEnvironment>
  ): Promise<DocRefinementResponse> {
    const systemPrompt = buildSystemPrompt(input.currentContent, docType);

    const anthropicMessages: Anthropic.MessageParam[] = input.messages.map((m, i) => ({
      role: m.role,
      content:
        i === 0 && m.role === "user"
          ? `[User's request about the document above:]\n${m.content}`
          : m.content,
    }));

    let toolCallCount = 0;
    let rounds = 0;

    while (rounds < this.maxToolRounds) {
      rounds++;

      const response = await this.anthropic!.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 10000,
        system: systemPrompt,
        messages: anthropicMessages,
        tools: toClaudeTools(DOCUMENT_GENERATION_TOOLS),
      });

      // Check for tool_use blocks
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolUseBlocks.length > 0) {
        toolCallCount += toolUseBlocks.length;

        // Add assistant response with tool_use
        anthropicMessages.push({
          role: "assistant",
          content: response.content,
        });

        // Execute tools and add results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of toolUseBlocks) {
          const toolCall: ToolCall = {
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          };
          const result = await executeToolCall(toolCall, environment);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result.content,
          });
        }

        anthropicMessages.push({ role: "user", content: toolResults });
        continue;
      }

      // No tool calls — extract text response
      const textContent = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      const parsed = parseResponse(textContent);
      return { ...parsed, toolCallCount };
    }

    return {
      message: "I ran out of processing steps. Please try a simpler request.",
      suggestedEdit: null,
      toolCallCount,
    };
  }

  // --------------------------------------------------------------------------
  // Fallback: OpenAI GPT-5 single-shot (no tool loop)
  // --------------------------------------------------------------------------

  private async refineWithOpenAI(
    input: DocRefinementRequest,
    docType: string
  ): Promise<DocRefinementResponse> {
    if (!this.openai) {
      throw new Error("OpenAI client not configured");
    }

    const systemPrompt = buildSystemPrompt(input.currentContent, docType);

    const openaiMessages = [
      { role: "system" as const, content: systemPrompt },
      ...input.messages.map((m, i) => ({
        role: m.role as "user" | "assistant",
        content:
          i === 0 && m.role === "user"
            ? `[User's request about the document above:]\n${m.content}`
            : m.content,
      })),
    ];

    const completion = await this.openai.chat.completions.create({
      model: "gpt-5",
      messages: openaiMessages,
      max_completion_tokens: 16384,
      temperature: 0.4,
    });

    const content = completion.choices[0]?.message?.content || "Failed to generate response.";
    const parsed = parseResponse(content);
    return { ...parsed, toolCallCount: 0 };
  }

  // --------------------------------------------------------------------------
  // Last resort: Groq GPT-OSS-120B single-shot
  // --------------------------------------------------------------------------

  private async refineWithGroq(
    input: DocRefinementRequest,
    docType: string
  ): Promise<DocRefinementResponse> {
    if (!this.groq) {
      throw new Error(
        "No LLM available — all providers (Anthropic, OpenAI, Groq) failed or unconfigured"
      );
    }

    console.log("[DocRefinement] ⚠️⚠️ Using Groq GPT-OSS-120B (last resort)");
    const systemPrompt = buildSystemPrompt(input.currentContent, docType);

    const groqMessages = [
      {
        role: "system" as const,
        content:
          systemPrompt +
          "\n\nIMPORTANT: Do NOT call any tools. Respond directly based on the document content provided above.",
      },
      ...input.messages.map((m, i) => ({
        role: m.role as "user" | "assistant",
        content:
          i === 0 && m.role === "user"
            ? `[User's request about the document above:]\n${m.content}`
            : m.content,
      })),
    ];

    const completion = await this.groq.chat.completions.create({
      model: config.groq.chatModel || "openai/gpt-oss-120b",
      messages: groqMessages,
      max_tokens: 8000,
      temperature: 0.4,
    });

    const content = completion.choices[0]?.message?.content || "Failed to generate response.";
    const parsed = parseResponse(content);
    return { ...parsed, toolCallCount: 0 };
  }
}

export const docRefinementService = new DocRefinementService();
