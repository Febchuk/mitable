/**
 * Document Generation Agent
 *
 * RLM-based document generation using tool-calling loop.
 * Uses Claude Sonnet 4.5 (primary), OpenAI GPT-5 (fallback), DeepSeek V3.2 (last resort).
 * Native tool-calling for Claude/OpenAI with per-call fallback chain.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../../config.js";
import type { DocType } from "@mitable/shared";
import type { DocumentGenerationEnvironment } from "./environment.js";
import {
  DOCUMENT_GENERATION_TOOLS,
  executeToolCall,
  type ToolCall,
  type ToolResult,
} from "./tools.js";

const MAX_TOOL_ITERATIONS = 30;
const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const OPENAI_MODEL = "gpt-5";
const DEEPSEEK_MODEL = "deepseek-chat";
const MAX_RETRIES = 2;

interface GenerationStep {
  type: "tool_call" | "content" | "complete";
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  content?: string;
}

/** Parse result from either provider — normalized to OpenAI-like shape */
interface LLMCallResult {
  toolCalls: ToolCall[];
  content: string | null;
}

// ---------------------------------------------------------------------------
// Format converters
// ---------------------------------------------------------------------------

/** Convert OpenAI-format tool defs to Claude tool defs */
function toClaudeTools(tools: typeof DOCUMENT_GENERATION_TOOLS): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
  }));
}

/**
 * Convert accumulated OpenAI-format messages to Claude messages.
 * Claude requires: system separate, tool_result grouped into user messages,
 * and content blocks instead of top-level content strings for tool_use.
 */
function toClaudeMessages(openaiMessages: any[]): {
  system: string;
  messages: Anthropic.MessageParam[];
} {
  let system = "";
  const messages: Anthropic.MessageParam[] = [];

  for (let i = 0; i < openaiMessages.length; i++) {
    const msg = openaiMessages[i];

    if (msg.role === "system") {
      system = msg.content;
      continue;
    }

    if (msg.role === "assistant") {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push({
          role: "assistant",
          content: msg.tool_calls.map((tc: any) => ({
            type: "tool_use" as const,
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments),
          })),
        });
      } else if (msg.content) {
        messages.push({ role: "assistant", content: msg.content });
      }
      continue;
    }

    if (msg.role === "tool") {
      // Group consecutive tool messages into a single user message
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let j = i;
      while (j < openaiMessages.length && openaiMessages[j].role === "tool") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: openaiMessages[j].tool_call_id,
          content: openaiMessages[j].content,
        });
        j++;
      }
      messages.push({ role: "user", content: toolResults });
      i = j - 1; // skip processed messages (loop will increment)
      continue;
    }

    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
    }
  }

  return { system, messages };
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export class DocumentGenerationAgent {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private deepseek: OpenAI | null = null;

  constructor() {
    if (config.anthropic.apiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
      console.log("[DocGenAgent] Claude Sonnet 4.5 configured (primary)");
    } else {
      console.warn("[DocGenAgent] ANTHROPIC_API_KEY not set — will use OpenAI fallback");
    }

    if (config.openai.apiKey) {
      this.openai = new OpenAI({ apiKey: config.openai.apiKey });
      console.log("[DocGenAgent] OpenAI GPT-5 configured (fallback)");
    } else {
      console.warn("[DocGenAgent] OPENAI_API_KEY not set");
    }

    if (config.deepseek.apiKey) {
      this.deepseek = new OpenAI({
        apiKey: config.deepseek.apiKey,
        baseURL: "https://api.deepseek.com",
      });
      console.log(`[DocGenAgent] DeepSeek V3.2 (${DEEPSEEK_MODEL}) configured (last resort)`);
    } else {
      console.warn("[DocGenAgent] DEEPSEEK_API_KEY not set — no last-resort fallback");
    }
  }

  /**
   * Generate document using RLM pattern.
   * Yields progress steps for streaming.
   */
  async *generateDocument(
    docType: DocType,
    userPrompt: string,
    environment: DocumentGenerationEnvironment,
    authorName?: string
  ): AsyncGenerator<GenerationStep, string, unknown> {
    console.log(`[DocGenAgent] Starting RLM generation for ${docType}`);
    console.log(`[DocGenAgent] Environment: ${environment.sessionIds.length} sessions`);

    // Messages stored in OpenAI format — converted to Claude format at call time
    const messages: any[] = [
      {
        role: "system",
        content: this.buildSystemPrompt(docType, userPrompt, environment, authorName),
      },
      {
        role: "user",
        content: `Generate a ${docType} document for: "${userPrompt}". Start by examining the available session data using tools.`,
      },
    ];

    let iterations = 0;
    let finalDocument = "";

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;
      console.log(`[DocGenAgent] Iteration ${iterations}/${MAX_TOOL_ITERATIONS}`);

      const result = await this.callWithTools(messages);

      if (result.toolCalls.length > 0) {
        console.log(`[DocGenAgent] LLM called ${result.toolCalls.length} tools`);

        // Add assistant message with tool calls (OpenAI format)
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: result.toolCalls,
        });

        // Execute all tool calls
        const toolResults: ToolResult[] = [];
        for (const toolCall of result.toolCalls) {
          console.log(`[DocGenAgent] Executing: ${toolCall.function.name}`);
          const tr = await executeToolCall(toolCall, environment);
          toolResults.push(tr);
        }

        // Add tool results to messages
        messages.push(...toolResults);

        yield {
          type: "tool_call",
          toolCalls: result.toolCalls,
          toolResults,
        };

        continue;
      }

      // LLM returned content (no more tool calls)
      if (result.content) {
        console.log(`[DocGenAgent] LLM returned raw content (${result.content.length} chars)`);

        // Strip any preamble reasoning before the actual document.
        // The document always starts with a markdown heading (#).
        const headingMatch = result.content.match(/^(#{1,3}\s)/m);
        if (headingMatch && headingMatch.index && headingMatch.index > 0) {
          finalDocument = result.content.slice(headingMatch.index);
          console.log(`[DocGenAgent] Stripped ${headingMatch.index} chars of preamble`);
        } else {
          finalDocument = result.content;
        }

        yield { type: "content", content: finalDocument };
        break;
      }

      console.log(`[DocGenAgent] Warning: No tool calls or content in iteration ${iterations}`);
      break;
    }

    if (iterations >= MAX_TOOL_ITERATIONS) {
      console.log(`[DocGenAgent] Reached max iterations (${MAX_TOOL_ITERATIONS})`);
    }

    yield { type: "complete" };
    return finalDocument;
  }

  // -------------------------------------------------------------------------
  // LLM call with per-call fallback
  // -------------------------------------------------------------------------

  /**
   * Call LLM with native tool-calling.
   * Tries Claude Sonnet 4.5 first, falls back to OpenAI GPT-5.
   */
  private async callWithTools(openaiMessages: any[]): Promise<LLMCallResult> {
    if (this.anthropic) {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          return await this.callClaude(openaiMessages);
        } catch (error) {
          const errStr = String(error);
          const isFatal = /401|403|invalid.*key|billing|authentication/i.test(errStr);
          if (isFatal) {
            console.error("[DocGenAgent] Claude auth/billing error — disabling:", errStr);
            this.anthropic = null;
            break;
          }
          const isRetryable = /429|rate.?limit|529|overloaded/i.test(errStr);
          if (isRetryable && attempt < MAX_RETRIES) {
            const delayMs = (attempt + 1) * 5000;
            console.warn(`[DocGenAgent] Claude rate-limited — retrying in ${delayMs / 1000}s`);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
          console.warn("[DocGenAgent] Claude failed — falling back to OpenAI:", errStr);
          break;
        }
      }
    }

    if (this.openai) {
      try {
        console.log("[DocGenAgent] ⚠️ Using OpenAI GPT-5 (fallback)");
        return await this.callOpenAI(openaiMessages);
      } catch (error) {
        console.warn("[DocGenAgent] OpenAI also failed — trying DeepSeek V3.2:", String(error));
      }
    }

    if (this.deepseek) {
      console.log(`[DocGenAgent] ⚠️⚠️ Using DeepSeek V3.2 (${DEEPSEEK_MODEL}) (last resort)`);
      return this.callDeepSeek(openaiMessages);
    }

    throw new Error(
      "No LLM available — all providers (Anthropic, OpenAI, DeepSeek) failed or unconfigured"
    );
  }

  /** Call Claude Sonnet 4.5 with native tool-calling */
  private async callClaude(openaiMessages: any[]): Promise<LLMCallResult> {
    const { system, messages } = toClaudeMessages(openaiMessages);

    const response = await this.anthropic!.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16384,
      temperature: 0.4,
      system,
      messages,
      tools: toClaudeTools(DOCUMENT_GENERATION_TOOLS),
    });

    // Parse response → normalized shape
    const toolCalls: ToolCall[] = [];
    let textContent = "";

    for (const block of response.content) {
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      } else if (block.type === "text") {
        textContent += block.text;
      }
    }

    // If Claude returned both text and tool_use, prioritize tool_use
    if (toolCalls.length > 0) {
      return { toolCalls, content: null };
    }
    return { toolCalls: [], content: textContent || null };
  }

  /** Call OpenAI GPT-5 with native tool-calling (fallback) */
  private async callOpenAI(openaiMessages: any[]): Promise<LLMCallResult> {
    if (!this.openai) {
      throw new Error("OpenAI client not configured");
    }

    const completion = await this.openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: openaiMessages,
      tools: DOCUMENT_GENERATION_TOOLS as any,
      tool_choice: "auto",
      temperature: 0.4,
      max_completion_tokens: 16384,
    });

    const message = completion.choices[0].message;
    const toolCalls: ToolCall[] = (message.tool_calls || []).map((tc: any) => ({
      id: tc.id,
      type: "function" as const,
      function: { name: tc.function.name, arguments: tc.function.arguments },
    }));

    if (toolCalls.length > 0) {
      return { toolCalls, content: null };
    }
    return { toolCalls: [], content: message.content || null };
  }

  /** Call DeepSeek V3.2 (last resort — single-shot, no tool-calling) */
  private async callDeepSeek(openaiMessages: any[]): Promise<LLMCallResult> {
    if (!this.deepseek) {
      throw new Error("DeepSeek client not configured");
    }

    // DeepSeek reasoner doesn't support tool_choice/tools — collapse to single-shot prompt
    const systemMsg = openaiMessages.find((m: any) => m.role === "system");
    const nonSystemMsgs = openaiMessages.filter(
      (m: any) => m.role !== "system" && m.role !== "tool"
    );
    const deepseekMessages = [
      ...(systemMsg
        ? [
            {
              role: "system" as const,
              content:
                systemMsg.content +
                "\n\nIMPORTANT: Do NOT call any tools. Generate the document directly based on the context already gathered in this conversation. Only write about what you can see in the conversation history — do NOT invent or extrapolate. If the context is thin, produce a shorter document and mark gaps with *[Please add your notes here]*.",
            },
          ]
        : []),
      ...nonSystemMsgs.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content || "",
      })),
    ];

    const completion = await this.deepseek.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: deepseekMessages,
      max_tokens: 8000,
    });

    const content = completion.choices[0]?.message?.content;
    return { toolCalls: [], content: content || null };
  }

  // -------------------------------------------------------------------------
  // Prompt building
  // -------------------------------------------------------------------------

  private buildSystemPrompt(
    docType: DocType,
    userPrompt: string,
    environment: DocumentGenerationEnvironment,
    authorName?: string
  ): string {
    const docTypeInstructions = this.getDocTypeInstructions(docType);
    const hasArtifacts = environment.artifactIds && environment.artifactIds.length > 0;

    return `You are an expert document generation agent. Your task is to create a ${docType} document based on the user's work sessions.
${
  authorName
    ? `
**Author:** ${authorName}
When the document requires a name (e.g. "Prepared by", author attribution, signatures), use "${authorName}". Never use placeholder names like "[Name]" or "[Your Name]".`
    : ""
}

**User Request:**
"${userPrompt}"

**Available Session Data:**
- ${environment.sessionIds.length} sessions in scope
${environment.dateRange ? `- Date range: ${environment.dateRange.start.toLocaleDateString()} to ${environment.dateRange.end.toLocaleDateString()}` : ""}
${hasArtifacts ? `- ${environment.artifactIds!.length} uploaded document(s) available as reference material` : ""}

**Your Process:**
1. **Examine the data** — Use tools to explore sessions, timelines, summaries, and time breakdowns
2. **Check for reference material** — If the user mentions a template, report format, or uploaded document, use get_artifact_content or search_artifacts to find it, then use parse_template_structure to extract its layout so you can replicate it
3. **Assess what you know** — Determine which topics have strong observational evidence and which are thin or missing
4. **Structure the document freely** — Choose the structure and sections that best fit the actual data you found. Do NOT force a rigid template unless the user explicitly provided one
5. **Generate honest content** — Write only what the data supports. For gaps, leave a clear prompt for the user to fill in

${docTypeInstructions ? `**Document Type Guidance:**\n${docTypeInstructions}\n` : ""}
**Accuracy Rules (critical):**
- Write ONLY what you have directly observed from session data, summaries, and artifacts
- NEVER invent, extrapolate, or pad content to make the document longer or more "complete"
- If a section has insufficient data, include a short note in italics like: *[No activity data found for this area — please add your notes here]*
- It is perfectly fine for the document to be short. A concise, accurate document is always better than a long, padded one
- The document does not need to fill every possible section — only include sections where you have real information
- If the overall data is very sparse, say so up front and produce a shorter document focused on what IS known

**Output Format:**
- Use Markdown formatting (headings, lists, tables, code blocks)
- Include specific details from the session data — timestamps, app names, durations, actual activities
- Structure the document however best serves the content. You have full creative freedom over headings, ordering, and layout
- If a template was found via parse_template_structure, follow its structure — but still leave gaps marked rather than filling them with invented content
- Never use placeholder text like "[Name]", "[Date]", or "[Your Name]" — use real data or mark as a gap for the user

**Important:**
- Call tools to gather data BEFORE generating content
- Use multiple tool calls to get a complete picture
- When you have enough information, generate the document — even if it's short

Begin by examining the session data using the available tools.`;
  }

  private getDocTypeInstructions(docType: DocType): string {
    switch (docType) {
      case "how-to":
        return `This is a how-to guide. Consider including steps, prerequisites, and examples — but only for things you actually observed in the session data. Skip sections you don't have data for.`;

      case "knowledge-article":
        return `This is a knowledge article. Organize what you found into logical sections. Use tables or lists where helpful. Only cover topics with real data behind them.`;

      case "troubleshooting":
        return `This is a troubleshooting guide. Document the problem, symptoms, and solutions you found in the data. If diagnostic steps or causes aren't clear from the sessions, mark those as gaps for the user.`;

      default:
        return "";
    }
  }
}

export const documentGenerationAgent = new DocumentGenerationAgent();
