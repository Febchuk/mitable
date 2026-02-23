/**
 * Document Generation Agent
 *
 * RLM-based document generation using tool-calling loop.
 * Uses Claude Sonnet 4.5 (primary), OpenAI GPT-5 (fallback), Groq GPT-OSS-120B (last resort).
 * Native tool-calling for Claude/OpenAI with per-call fallback chain.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import Groq from "groq-sdk";
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
const GROQ_MODEL = config.groq?.chatModel || "openai/gpt-oss-120b";
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
  private groq: Groq | null = null;

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

    if (config.groq.apiKey) {
      this.groq = new Groq({ apiKey: config.groq.apiKey });
      console.log(`[DocGenAgent] Groq ${GROQ_MODEL} configured (last resort)`);
    } else {
      console.warn("[DocGenAgent] GROQ_API_KEY not set — no last-resort fallback");
    }
  }

  /**
   * Generate document using RLM pattern.
   * Yields progress steps for streaming.
   */
  async *generateDocument(
    docType: DocType,
    userPrompt: string,
    environment: DocumentGenerationEnvironment
  ): AsyncGenerator<GenerationStep, string, unknown> {
    console.log(`[DocGenAgent] Starting RLM generation for ${docType}`);
    console.log(`[DocGenAgent] Environment: ${environment.sessionIds.length} sessions`);

    // Messages stored in OpenAI format — converted to Claude format at call time
    const messages: any[] = [
      {
        role: "system",
        content: this.buildSystemPrompt(docType, userPrompt, environment),
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
        console.log(`[DocGenAgent] LLM returned content (${result.content.length} chars)`);
        finalDocument = result.content;

        yield { type: "content", content: result.content };
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
        console.warn("[DocGenAgent] OpenAI also failed — trying Groq:", String(error));
      }
    }

    if (this.groq) {
      console.log(`[DocGenAgent] ⚠️⚠️ Using Groq ${GROQ_MODEL} (last resort)`);
      return this.callGroq(openaiMessages);
    }

    throw new Error(
      "No LLM available — all providers (Anthropic, OpenAI, Groq) failed or unconfigured"
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

  /** Call Groq GPT-OSS-120B (last resort — single-shot, no tool-calling) */
  private async callGroq(openaiMessages: any[]): Promise<LLMCallResult> {
    if (!this.groq) {
      throw new Error("Groq client not configured");
    }

    // Groq doesn't support tool_choice/tools — collapse to single-shot prompt
    const systemMsg = openaiMessages.find((m: any) => m.role === "system");
    const nonSystemMsgs = openaiMessages.filter(
      (m: any) => m.role !== "system" && m.role !== "tool"
    );
    const groqMessages = [
      ...(systemMsg
        ? [
            {
              role: "system" as const,
              content:
                systemMsg.content +
                "\n\nIMPORTANT: Do NOT call any tools. Generate the complete document directly based on whatever context you have.",
            },
          ]
        : []),
      ...nonSystemMsgs.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content || "",
      })),
    ];

    const completion = await this.groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: groqMessages,
      max_tokens: 8000,
      temperature: 0.4,
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
    environment: DocumentGenerationEnvironment
  ): string {
    const docTypeInstructions = this.getDocTypeInstructions(docType);
    const hasArtifacts = environment.artifactIds && environment.artifactIds.length > 0;

    return `You are an expert document generation agent. Your task is to create a ${docType} document based on the user's work sessions.

**User Request:**
"${userPrompt}"

**Available Session Data:**
- ${environment.sessionIds.length} sessions in scope
${environment.dateRange ? `- Date range: ${environment.dateRange.start.toLocaleDateString()} to ${environment.dateRange.end.toLocaleDateString()}` : ""}
${hasArtifacts ? `- ${environment.artifactIds!.length} uploaded document(s) available as reference material` : ""}

**Your Process:**
1. **Examine the data** — Use tools to explore sessions, timelines, summaries, and time breakdowns
2. **Check for reference material** — If the user mentions a template, report format, or uploaded document, use get_artifact_content or search_artifacts to find it, then use parse_template_structure to extract its layout so you can replicate it
3. **Identify key information** — Find accomplishments, activities, blockers, time spent on different tasks
4. **Structure the document** — Organize findings according to the ${docType} format (or follow an uploaded template if one was found)
5. **Generate content** — Create the complete document in Markdown format

**Document Type Guidance:**
${docTypeInstructions}

**Output Format:**
- Use Markdown formatting (headings, lists, tables, code blocks)
- Include specific details from the session data
- Be concise but comprehensive
- If a template was found via parse_template_structure, replicate its section headings, ordering, and formatting style

**Important:**
- Call tools to gather data BEFORE generating content
- Use multiple tool calls to get a complete picture
- Base your document ONLY on actual session data and artifact content (no hallucination)
- When you have enough information, generate the complete document

Begin by examining the session data using the available tools.`;
  }

  private getDocTypeInstructions(docType: DocType): string {
    switch (docType) {
      case "how-to":
        return `A how-to guide should:
- Start with a clear title describing what will be accomplished
- Include prerequisites if needed
- Present step-by-step instructions
- Include specific examples from the session data
- End with success criteria or next steps`;

      case "knowledge-article":
        return `A knowledge article should:
- Start with an overview/introduction
- Organize information into logical sections
- Include practical examples from session activities
- Use tables or lists for clarity
- End with related topics or resources`;

      case "troubleshooting":
        return `A troubleshooting guide should:
- Start with the problem statement
- List symptoms observed
- Present potential causes
- Provide diagnostic steps
- Give solution steps for each cause
- Include prevention tips`;

      default:
        return `Follow best practices for ${docType} documents.`;
    }
  }
}

export const documentGenerationAgent = new DocumentGenerationAgent();
