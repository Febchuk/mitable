/**
 * Doc Generation Service
 *
 * AI pipeline for generating documentation from monitoring sessions.
 * Supports different doc types:
 * - How-to Guides: Step-by-step instructions
 * - Knowledge Articles: Concept explanations
 * - Troubleshooting Docs: Problem → Solution guides
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { config } from "../config.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, desc } from "drizzle-orm";
import type { DocType, GenerateDocumentResponse, EnhanceDocumentResponse } from "@mitable/shared";
import { sessionRetrieverService } from "./session-retriever.service.js";

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const OPENAI_MODEL = "gpt-5";

const DOC_GEN_CONFIG = {
  TEMPERATURE: 0.4,
  MAX_TOKENS: 16000,
};

// Prompt templates by doc type
const DOC_TYPE_PROMPTS: Record<DocType, string> = {
  "how-to": `You are creating a how-to guide from a work session.

Session Context:
- Duration: {duration}
- Apps Used: {appBreakdown}
- Key Activities: {keyActivities}
- Accomplishments: {accomplishments}

Session Summary:
{sessionSummary}

Write a how-to guide based on what was actually observed in this session. Structure it however best fits the content — you have full freedom over headings, ordering, and format.

ACCURACY RULES:
- ONLY write about activities, steps, and details that appear in the session data above
- Do NOT invent steps, outcomes, or details that aren't supported by the data
- If information is missing or unclear, include a note in italics: *[Please fill in: description of what's needed]*
- A short, accurate guide is better than a long, padded one — do not add filler content
- Skip sections entirely if you have no data for them

Format in Markdown.

{additionalContext}`,

  "knowledge-article": `You are creating a knowledge article from observed work patterns.

Session Context:
- Focus Areas: {appBreakdown}
- Key Activities: {keyActivities}
- Learnings: {accomplishments}

Session Summary:
{sessionSummary}

Write a knowledge article based on what was actually observed. Choose the structure and sections that best fit the data — you have full freedom over format.

ACCURACY RULES:
- ONLY write about topics, patterns, and details that appear in the session data above
- Do NOT extrapolate or invent information to fill out sections
- If information is missing or unclear, include a note in italics: *[Please fill in: description of what's needed]*
- A short, focused article is better than a long, speculative one
- Only include sections where you have real information

Format in Markdown.

{additionalContext}`,

  troubleshooting: `You are creating a troubleshooting guide from a debugging/problem-solving session.

Session Context:
- Problem Domain: {appBreakdown}
- Activities: {keyActivities}
- Blockers Encountered: {blockers}
- Resolution: {accomplishments}

Session Summary:
{sessionSummary}

Write a troubleshooting guide based on what was actually observed. Document the problem, what was tried, and any resolution found. Structure it however best fits the data.

ACCURACY RULES:
- ONLY write about problems, symptoms, and solutions that appear in the session data above
- Do NOT invent causes, diagnostic steps, or solutions that aren't in the data
- If the root cause or resolution is unclear from the session, say so and mark it: *[Please fill in: what the resolution was]*
- A short, accurate guide is better than a speculative one
- Skip sections you don't have data for

Format in Markdown.

{additionalContext}`,
};

// Enhancement prompts
const ENHANCEMENT_PROMPTS: Record<"append" | "merge" | "supplement", string> = {
  append: `You are updating an existing document with new insights from a recent work session.

Existing Document:
"""
{existingContent}
"""

New Session Insights:
- Activities: {newActivities}
- Learnings: {newInsights}
- Blockers/Issues: {newBlockers}

Add NEW sections at the end of the document that capture the new learnings.
Do not modify existing content - only append new sections.
Use "## New Additions" as a header before the new content.

User notes: {userNotes}

Return the complete document with new sections added.`,

  merge: `You are merging new insights into an existing document.

Existing Document:
"""
{existingContent}
"""

New Session Insights:
- Activities: {newActivities}
- Learnings: {newInsights}
- Blockers/Issues: {newBlockers}

Integrate the new information into relevant existing sections.
Maintain the document's structure and voice.
Add new sections only if the insights don't fit existing sections.

User notes: {userNotes}

Return the complete merged document.`,

  supplement: `You are supplementing an existing document with additional details and examples.

Existing Document:
"""
{existingContent}
"""

New Session Insights:
- Activities: {newActivities}
- Learnings: {newInsights}
- Examples observed: {newBlockers}

Add supporting details, examples, and clarifications to existing sections.
Enrich existing content without changing its core message.
Make the document more comprehensive and practical.

User notes: {userNotes}

Return the complete enhanced document.`,
};

interface GenerateParams {
  sessionId: string;
  docType: DocType;
  title?: string;
  additionalContext?: string;
  organizationId: string;
  userId: string;
}

interface EnhanceParams {
  documentId: string;
  sessionId: string;
  enhancementType: "append" | "merge" | "supplement";
  userNotes?: string;
  userId: string;
}

interface SessionData {
  summary: string;
  keyActivities: string[];
  accomplishments: string[];
  blockers: string[];
  timeBreakdown: Record<string, number>;
  duration: string;
}

class DocGenerationService {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;

  constructor() {
    if (config.anthropic.apiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
    }
    if (config.openai.apiKey) {
      this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    }
  }

  private async chatCompletion(prompt: string): Promise<{ content: string; model: string; tokens: number }> {
    if (this.anthropic) {
      try {
        const response = await this.anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: DOC_GEN_CONFIG.MAX_TOKENS,
          temperature: DOC_GEN_CONFIG.TEMPERATURE,
          messages: [{ role: "user", content: prompt }],
        });
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        return {
          content: text,
          model: CLAUDE_MODEL,
          tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        };
      } catch (err) {
        console.warn("[DocGen] Claude failed, falling back to OpenAI:", String(err));
      }
    }

    if (this.openai) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: OPENAI_MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: DOC_GEN_CONFIG.TEMPERATURE,
          max_tokens: DOC_GEN_CONFIG.MAX_TOKENS,
        });
        return {
          content: completion.choices[0]?.message?.content || "",
          model: OPENAI_MODEL,
          tokens: completion.usage?.total_tokens || 0,
        };
      } catch (err) {
        console.warn("[DocGen] OpenAI also failed:", String(err));
      }
    }

    throw new Error("No LLM available — both Anthropic and OpenAI failed or are unconfigured");
  }

  /**
   * Generate a new document from a monitoring session
   */
  async generateFromSession(params: GenerateParams): Promise<GenerateDocumentResponse> {
    const startTime = Date.now();
    const { sessionId, docType, title, additionalContext, organizationId, userId } = params;

    console.log(`[DocGeneration] Generating ${docType} from session: ${sessionId}`);

    // Get session data using RAG
    const sessionData = await this.getSessionData(sessionId, organizationId);

    // Build prompt
    const prompt = this.buildGenerationPrompt(docType, sessionData, additionalContext);

    // Generate content
    const result = await this.chatCompletion(prompt);

    const generatedContent = result.content;
    const tokenCount = result.tokens;

    // Extract title from content if not provided
    const docTitle = title || this.extractTitle(generatedContent, docType);

    // Create document
    const [document] = await db
      .insert(schema.documents)
      .values({
        organizationId,
        createdBy: userId,
        title: docTitle,
        docType,
        content: generatedContent,
        status: "draft",
        generationModel: result.model,
        generationPromptVersion: 1,
      })
      .returning();

    // Create initial version
    await db.insert(schema.documentVersions).values({
      documentId: document.id,
      version: 1,
      content: generatedContent,
      changeType: "created",
      changedBy: userId,
      changeSummary: `Generated ${docType} from session`,
    });

    // Create session contribution link
    await db.insert(schema.sessionDocumentContributions).values({
      sessionId,
      documentId: document.id,
      contributionType: "source",
      insightsUsed: sessionData.keyActivities.map((a) => ({ activity: a })),
    });

    const generationTimeMs = Date.now() - startTime;
    console.log(`[DocGeneration] Document generated in ${generationTimeMs}ms`);

    return {
      document: document as any,
      generationMetadata: {
        model: result.model,
        tokenCount,
        generationTimeMs,
      },
    };
  }

  /**
   * Enhance an existing document with session insights
   */
  async enhanceWithSession(params: EnhanceParams): Promise<EnhanceDocumentResponse> {
    const { documentId, sessionId, enhancementType, userNotes, userId } = params;

    console.log(`[DocGeneration] Enhancing document ${documentId} with session ${sessionId}`);

    // Get existing document
    const [document] = await db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, documentId))
      .limit(1);

    if (!document) {
      throw new Error("Document not found");
    }

    // Get session data using RAG
    const sessionData = await this.getSessionData(sessionId, document.organizationId);

    // Build enhancement prompt
    const prompt = this.buildEnhancementPrompt(
      enhancementType,
      document.content,
      sessionData,
      userNotes
    );

    // Generate enhanced content
    const enhanceResult = await this.chatCompletion(prompt);
    const enhancedContent = enhanceResult.content;

    // Get latest version number
    const [latestVersion] = await db
      .select({ version: schema.documentVersions.version })
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.documentId, documentId))
      .orderBy(desc(schema.documentVersions.version))
      .limit(1);

    const newVersion = (latestVersion?.version || 0) + 1;

    // Update document
    const [updated] = await db
      .update(schema.documents)
      .set({
        content: enhancedContent,
        updatedAt: new Date(),
      })
      .where(eq(schema.documents.id, documentId))
      .returning();

    // Create new version
    await db.insert(schema.documentVersions).values({
      documentId,
      version: newVersion,
      content: enhancedContent,
      changeType: "session_update",
      changedBy: userId,
      changeSummary: `Enhanced with insights from session (${enhancementType})`,
    });

    // Create session contribution link
    await db
      .insert(schema.sessionDocumentContributions)
      .values({
        sessionId,
        documentId,
        contributionType: "update",
        insightsUsed: sessionData.keyActivities.map((a) => ({ activity: a })),
      })
      .onConflictDoNothing();

    console.log(`[DocGeneration] Document enhanced to version ${newVersion}`);

    return {
      document: updated as any,
      changesApplied: [`Enhanced via ${enhancementType} method`],
      newVersion,
    };
  }

  /**
   * AI-assisted content revision
   */
  async reviseContent(
    currentContent: string,
    instruction: string,
    docType: DocType
  ): Promise<string> {
    const prompt = `You are an AI assistant helping to revise a ${docType} document.

Current document:
"""
${currentContent}
"""

User's revision request:
"${instruction}"

Please revise the document according to the user's request. Keep the same general structure unless the user asks for a different format.

Important:
- Maintain a professional tone
- Keep it concise unless asked to expand
- Preserve key information and structure
- Use appropriate Markdown formatting
- Only output the revised document, no explanations

Revised document:`;

    const reviseResult = await this.chatCompletion(prompt);
    return reviseResult.content.trim();
  }

  /**
   * Get session data for doc generation using RAG from session_chunks
   */
  private async getSessionData(sessionId: string, organizationId: string): Promise<SessionData> {
    const [session] = await db
      .select()
      .from(schema.monitoringSessions)
      .where(eq(schema.monitoringSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Calculate duration
    const startTime = new Date(session.startedAt).getTime();
    const endTime = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
    const totalMs = endTime - startTime - (session.totalPausedMs || 0);
    const duration = this.formatDuration(totalMs);

    // Fetch session chunks using RAG
    const { chunks, sessionMap } = await sessionRetrieverService.getSessionChunks(
      [sessionId],
      organizationId
    );

    if (chunks.length === 0) {
      throw new Error(
        `No chunks found for session: ${sessionId}. Session may not be ingested yet.`
      );
    }

    // Build context from chunks
    const sessionContext = sessionRetrieverService.buildDocumentContext(sessionMap);

    // Extract key activities, accomplishments, and blockers
    const keyActivities = this.extractActivities(chunks);
    const accomplishments = this.extractAccomplishments(chunks);
    const blockers: string[] = Array.isArray(session.blockers)
      ? (session.blockers as string[])
      : [];

    return {
      summary: sessionContext,
      keyActivities,
      accomplishments,
      blockers,
      timeBreakdown: (session.timeBreakdown as Record<string, number>) || {},
      duration,
    };
  }

  /**
   * Extract key activities from session chunks
   */
  private extractActivities(chunks: any[]): string[] {
    const activities: string[] = [];

    for (const chunk of chunks) {
      if (chunk.chunkType === "classifier" && chunk.metadata?.eventTypes) {
        activities.push(...chunk.metadata.eventTypes);
      }
    }

    return [...new Set(activities)]; // Deduplicate
  }

  /**
   * Extract accomplishments from storyteller chunks
   */
  private extractAccomplishments(chunks: any[]): string[] {
    const accomplishments: string[] = [];

    for (const chunk of chunks) {
      if (chunk.chunkType === "storyteller_summary") {
        // Extract key achievements from summary text
        const text = chunk.text;
        const lines = text
          .split("\n")
          .filter(
            (line: string) =>
              line.toLowerCase().includes("completed") ||
              line.toLowerCase().includes("accomplished") ||
              line.toLowerCase().includes("finished")
          );
        accomplishments.push(...lines);
      }
    }

    return accomplishments;
  }

  /**
   * Build generation prompt based on doc type
   */
  private buildGenerationPrompt(
    docType: DocType,
    sessionData: SessionData,
    additionalContext?: string
  ): string {
    let prompt = DOC_TYPE_PROMPTS[docType];

    // Format app breakdown
    const appBreakdown =
      Object.entries(sessionData.timeBreakdown)
        .map(([app, ms]) => `${app}: ${this.formatDuration(ms)}`)
        .join(", ") || "No app data available";

    // Format activities
    const keyActivities =
      sessionData.keyActivities
        .map((a) => (typeof a === "string" ? a : (a as any).activity || JSON.stringify(a)))
        .join("\n- ") || "No activities recorded";

    const accomplishments =
      sessionData.accomplishments
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join("\n- ") || "No accomplishments recorded";

    const blockers =
      sessionData.blockers
        .map((b) => (typeof b === "string" ? b : JSON.stringify(b)))
        .join("\n- ") || "None recorded";

    // Replace placeholders
    prompt = prompt
      .replace("{duration}", sessionData.duration)
      .replace("{appBreakdown}", appBreakdown)
      .replace("{keyActivities}", keyActivities ? `- ${keyActivities}` : "")
      .replace("{accomplishments}", accomplishments ? `- ${accomplishments}` : "")
      .replace("{blockers}", blockers ? `- ${blockers}` : "None")
      .replace("{sessionSummary}", sessionData.summary)
      .replace(
        "{additionalContext}",
        additionalContext ? `Additional context from user: ${additionalContext}` : ""
      );

    return prompt;
  }

  /**
   * Build enhancement prompt
   */
  private buildEnhancementPrompt(
    enhancementType: "append" | "merge" | "supplement",
    existingContent: string,
    sessionData: SessionData,
    userNotes?: string
  ): string {
    let prompt = ENHANCEMENT_PROMPTS[enhancementType];

    const newActivities =
      sessionData.keyActivities
        .map((a) => (typeof a === "string" ? a : (a as any).activity || JSON.stringify(a)))
        .join(", ") || "New activities";

    const newInsights =
      sessionData.accomplishments
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(", ") || "New learnings";

    const newBlockers =
      sessionData.blockers.map((b) => (typeof b === "string" ? b : JSON.stringify(b))).join(", ") ||
      "None";

    prompt = prompt
      .replace("{existingContent}", existingContent)
      .replace("{newActivities}", newActivities)
      .replace("{newInsights}", newInsights)
      .replace("{newBlockers}", newBlockers)
      .replace("{userNotes}", userNotes || "None");

    return prompt;
  }

  /**
   * Extract title from generated content
   */
  private extractTitle(content: string, docType: DocType): string {
    // Try to extract first heading
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      return headingMatch[1].trim();
    }

    // Fallback titles by type
    const fallbacks: Record<DocType, string> = {
      "how-to": "How-To Guide",
      "knowledge-article": "Knowledge Article",
      troubleshooting: "Troubleshooting Guide",
    };

    return fallbacks[docType];
  }

  /**
   * Format duration in ms to human-readable string
   */
  private formatDuration(ms: number): string {
    if (ms < 60000) {
      return `${Math.round(ms / 1000)}s`;
    }
    if (ms < 3600000) {
      return `${Math.round(ms / 60000)}m`;
    }
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.round((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }
}

// Export singleton
export const docGenerationService = new DocGenerationService();
