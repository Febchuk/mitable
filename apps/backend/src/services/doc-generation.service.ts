/**
 * Doc Generation Service
 *
 * AI pipeline for generating documentation from monitoring sessions.
 * Supports different doc types:
 * - How-to Guides: Step-by-step instructions
 * - Knowledge Articles: Concept explanations
 * - Troubleshooting Docs: Problem → Solution guides
 */

import Groq from "groq-sdk";
import { config } from "../config.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, desc, inArray, and } from "drizzle-orm";
import type {
  DocType,
  GenerateDocumentResponse,
  EnhanceDocumentResponse,
  MultiSessionGenerateDocumentResponse,
} from "@mitable/shared";
import { documentExtractionService } from "./document-extraction.service.js";

// Configuration
const DOC_GEN_CONFIG = {
  TEXT_MODEL: "llama-3.1-8b-instant",
  TEMPERATURE: 0.4,
  MAX_TOKENS: 2000,
};

// Prompt templates by doc type
const DOC_TYPE_PROMPTS: Record<DocType, string> = {
  "how-to": `You are an expert technical writer creating a how-to guide from a work session.

Session Context:
- Duration: {duration}
- Apps Used: {appBreakdown}
- Key Activities: {keyActivities}
- Accomplishments: {accomplishments}

Session Summary:
{sessionSummary}

Create a step-by-step how-to guide that:
1. Has a clear, action-oriented title
2. Includes a prerequisites section if applicable
3. Breaks down the process into numbered steps
4. Each step should have:
   - Clear action instruction
   - Expected outcome (when helpful)
   - Tips or warnings if relevant
5. Includes a troubleshooting section if blockers were mentioned
6. Ends with verification/success criteria

Format in Markdown. Use code blocks for any commands or code snippets.
Keep it concise but comprehensive.

{additionalContext}`,

  "knowledge-article": `You are creating a knowledge article from observed work patterns.

Session Context:
- Focus Areas: {appBreakdown}
- Key Activities: {keyActivities}
- Learnings: {accomplishments}

Session Summary:
{sessionSummary}

Create a knowledge article that:
1. Has an informative title explaining the topic
2. Opens with a brief overview (2-3 sentences)
3. Organizes content into logical sections with headers
4. Explains concepts clearly for someone unfamiliar
5. Includes practical examples from the session where applicable
6. Adds relevant tips and best practices
7. Notes any related topics or next steps

Target audience: New team members learning this domain.
Format in Markdown with proper heading hierarchy (##, ###).

{additionalContext}`,

  troubleshooting: `You are creating a troubleshooting guide from a debugging/problem-solving session.

Session Context:
- Problem Domain: {appBreakdown}
- Activities: {keyActivities}
- Blockers Encountered: {blockers}
- Resolution: {accomplishments}

Session Summary:
{sessionSummary}

Create a troubleshooting guide that:
1. Has a clear problem statement title
2. Starts with symptoms section (how to recognize this issue)
3. Lists potential causes in order of likelihood
4. Provides diagnostic steps to identify the cause
5. Gives solution steps for each cause
6. Includes prevention tips
7. Lists related issues that may appear similar

Format in Markdown with clear sections.
Use bullet points for lists, code blocks for commands.

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
  id?: string;
  name?: string;
  date?: string;
  summary: string;
  keyActivities: string[];
  accomplishments: string[];
  blockers: string[];
  timeBreakdown: Record<string, number>;
  duration: string;
}

interface MultiSessionGenerateParams {
  sessionIds: string[];
  artifactIds?: string[];
  docType: DocType;
  title?: string;
  additionalContext?: string;
  mergeStrategy: "chronological" | "thematic";
  organizationId: string;
  userId: string;
}

interface ArtifactData {
  id: string;
  filename: string;
  extractedText: string | null;
}

class DocGenerationService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: config.groq.apiKey });
  }

  /**
   * Generate a new document from a monitoring session
   */
  async generateFromSession(params: GenerateParams): Promise<GenerateDocumentResponse> {
    const startTime = Date.now();
    const { sessionId, docType, title, additionalContext, organizationId, userId } = params;

    console.log(`[DocGeneration] Generating ${docType} from session: ${sessionId}`);

    // Get session data
    const sessionData = await this.getSessionData(sessionId);

    // Build prompt
    const prompt = this.buildGenerationPrompt(docType, sessionData, additionalContext);

    // Generate content
    const completion = await this.groq.chat.completions.create({
      model: DOC_GEN_CONFIG.TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: DOC_GEN_CONFIG.TEMPERATURE,
      max_tokens: DOC_GEN_CONFIG.MAX_TOKENS,
    });

    const generatedContent = completion.choices[0]?.message?.content || "";
    const tokenCount = completion.usage?.total_tokens || 0;

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
        generationModel: DOC_GEN_CONFIG.TEXT_MODEL,
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
        model: DOC_GEN_CONFIG.TEXT_MODEL,
        tokenCount,
        generationTimeMs,
      },
    };
  }

  /**
   * Generate a document from multiple monitoring sessions with optional artifacts
   */
  async generateFromMultipleSessions(
    params: MultiSessionGenerateParams
  ): Promise<MultiSessionGenerateDocumentResponse> {
    const startTime = Date.now();
    const {
      sessionIds,
      artifactIds = [],
      docType,
      title,
      additionalContext,
      mergeStrategy,
      organizationId,
      userId,
    } = params;

    console.log(
      `[DocGeneration] Generating ${docType} from ${sessionIds.length} sessions, ` +
        `${artifactIds.length} artifacts (strategy: ${mergeStrategy})`
    );

    // Fetch all sessions in parallel
    const sessionsData = await Promise.all(
      sessionIds.map((id) => this.getSessionDataWithMeta(id))
    );

    // Sort by date if chronological strategy
    if (mergeStrategy === "chronological") {
      sessionsData.sort(
        (a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
      );
    }

    // Fetch artifact data if provided
    let artifactsData: ArtifactData[] = [];
    if (artifactIds.length > 0) {
      artifactsData = await this.getArtifactsData(artifactIds, organizationId);
    }

    // Build multi-session prompt
    const prompt = this.buildMultiSessionPrompt(
      docType,
      sessionsData,
      artifactsData,
      additionalContext,
      mergeStrategy
    );

    // Generate content
    const completion = await this.groq.chat.completions.create({
      model: DOC_GEN_CONFIG.TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: DOC_GEN_CONFIG.TEMPERATURE,
      max_tokens: DOC_GEN_CONFIG.MAX_TOKENS * 2, // Allow longer output for multi-session
    });

    const generatedContent = completion.choices[0]?.message?.content || "";
    const tokenCount = completion.usage?.total_tokens || 0;

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
        generationModel: DOC_GEN_CONFIG.TEXT_MODEL,
        generationPromptVersion: 2, // Version 2 for multi-session
      })
      .returning();

    // Build change summary based on sources
    const sourceParts: string[] = [];
    if (sessionIds.length > 0) {
      sourceParts.push(`${sessionIds.length} session${sessionIds.length > 1 ? "s" : ""}`);
    }
    if (artifactIds.length > 0) {
      sourceParts.push(`${artifactIds.length} artifact${artifactIds.length > 1 ? "s" : ""}`);
    }
    const changeSummary = `Generated ${docType} from ${sourceParts.join(" and ")}`;

    // Create initial version
    await db.insert(schema.documentVersions).values({
      documentId: document.id,
      version: 1,
      content: generatedContent,
      changeType: "created",
      changedBy: userId,
      changeSummary,
    });

    // Create session contribution links for each session (only if sessions provided)
    if (sessionsData.length > 0) {
      await Promise.all(
        sessionsData.map((sessionData) =>
          db
            .insert(schema.sessionDocumentContributions)
            .values({
              sessionId: sessionData.id!,
              documentId: document.id,
              contributionType: "source",
              insightsUsed: sessionData.keyActivities.map((a) => ({ activity: a })),
            })
            .onConflictDoNothing()
        )
      );
    }

    // Create artifact source links for each artifact
    if (artifactIds.length > 0) {
      await Promise.all(
        artifactIds.map((artifactId) =>
          db
            .insert(schema.documentArtifactSources)
            .values({
              documentId: document.id,
              artifactId,
              contributionType: "source",
            })
            .onConflictDoNothing()
        )
      );
    }

    const generationTimeMs = Date.now() - startTime;
    console.log(`[DocGeneration] Multi-session document generated in ${generationTimeMs}ms`);

    return {
      document: document as any,
      generationMetadata: {
        model: DOC_GEN_CONFIG.TEXT_MODEL,
        tokenCount,
        generationTimeMs,
        sessionsUsed: sessionIds.length,
        artifactsUsed: artifactIds.length,
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

    // Get session data
    const sessionData = await this.getSessionData(sessionId);

    // Build enhancement prompt
    const prompt = this.buildEnhancementPrompt(
      enhancementType,
      document.content,
      sessionData,
      userNotes
    );

    // Generate enhanced content
    const completion = await this.groq.chat.completions.create({
      model: DOC_GEN_CONFIG.TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: DOC_GEN_CONFIG.TEMPERATURE,
      max_tokens: DOC_GEN_CONFIG.MAX_TOKENS,
    });

    const enhancedContent = completion.choices[0]?.message?.content || "";

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

    const completion = await this.groq.chat.completions.create({
      model: DOC_GEN_CONFIG.TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: DOC_GEN_CONFIG.MAX_TOKENS,
    });

    return completion.choices[0]?.message?.content?.trim() || "";
  }

  /**
   * Get session data for doc generation
   */
  private async getSessionData(sessionId: string): Promise<SessionData> {
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

    return {
      summary: session.finalSummary || session.rawActivitySummary || "",
      keyActivities: (session.keyActivities as any[]) || [],
      accomplishments: (session.accomplishments as any[]) || [],
      blockers: (session.blockers as any[]) || [],
      timeBreakdown: (session.timeBreakdown as Record<string, number>) || {},
      duration,
    };
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
        .join(", ") || "Various applications";

    // Format activities
    const keyActivities =
      sessionData.keyActivities
        .map((a) => (typeof a === "string" ? a : (a as any).activity || JSON.stringify(a)))
        .join("\n- ") || "Work activities";

    const accomplishments =
      sessionData.accomplishments
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join("\n- ") || "Tasks completed";

    const blockers =
      sessionData.blockers
        .map((b) => (typeof b === "string" ? b : JSON.stringify(b)))
        .join("\n- ") || "None";

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

  /**
   * Get session data with additional metadata for multi-session generation
   */
  private async getSessionDataWithMeta(sessionId: string): Promise<SessionData> {
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

    return {
      id: session.id,
      name: session.name || "Work Session",
      date: session.startedAt?.toISOString().split("T")[0],
      summary: session.finalSummary || session.rawActivitySummary || "",
      keyActivities: (session.keyActivities as any[]) || [],
      accomplishments: (session.accomplishments as any[]) || [],
      blockers: (session.blockers as any[]) || [],
      timeBreakdown: (session.timeBreakdown as Record<string, number>) || {},
      duration,
    };
  }

  /**
   * Get artifacts data for document generation
   */
  private async getArtifactsData(
    artifactIds: string[],
    organizationId: string
  ): Promise<ArtifactData[]> {
    if (artifactIds.length === 0) return [];

    const artifacts = await db
      .select({
        id: schema.artifacts.id,
        filename: schema.artifacts.filename,
        extractedText: schema.artifacts.extractedText,
      })
      .from(schema.artifacts)
      .where(
        and(
          inArray(schema.artifacts.id, artifactIds),
          eq(schema.artifacts.organizationId, organizationId)
        )
      );

    return artifacts.map((a) => ({
      id: a.id,
      filename: a.filename,
      extractedText: a.extractedText,
    }));
  }

  /**
   * Build prompt for multi-session document generation
   */
  private buildMultiSessionPrompt(
    docType: DocType,
    sessions: SessionData[],
    artifacts: ArtifactData[],
    additionalContext?: string,
    mergeStrategy: "chronological" | "thematic" = "chronological"
  ): string {
    // Build session sections (only if sessions provided)
    let sessionSections = "";
    if (sessions.length > 0) {
      sessionSections = sessions
        .map((session, index) => {
          const appBreakdown =
            Object.entries(session.timeBreakdown)
              .map(([app, ms]) => `${app}: ${this.formatDuration(ms)}`)
              .join(", ") || "Various applications";

          const keyActivities =
            session.keyActivities
              .map((a) => (typeof a === "string" ? a : (a as any).activity || JSON.stringify(a)))
              .join("\n    - ") || "Work activities";

          const accomplishments =
            session.accomplishments
              .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
              .join("\n    - ") || "Tasks completed";

          const blockers =
            session.blockers
              .map((b) => (typeof b === "string" ? b : JSON.stringify(b)))
              .join("\n    - ") || "None";

          return `
=== SESSION ${index + 1}: ${session.name} (${session.date}) ===
Duration: ${session.duration}
Apps Used: ${appBreakdown}
Key Activities:
    - ${keyActivities}
Accomplishments:
    - ${accomplishments}
Blockers: ${blockers}
Summary: ${session.summary}
`;
        })
        .join("\n");
    }

    // Build artifacts section if any
    let artifactsSection = "";
    if (artifacts.length > 0) {
      const artifactTexts = artifacts
        .filter((a) => a.extractedText && a.extractedText.length > 0)
        .map((a) => {
          // Truncate to avoid token limit issues
          const text = documentExtractionService.truncateForTokenLimit(
            a.extractedText!,
            2000
          );
          return `
--- ${a.filename} ---
${text}
`;
        })
        .join("\n");

      if (artifactTexts) {
        artifactsSection = `
=== REFERENCE MATERIALS ===
${artifactTexts}
`;
      }
    }

    // Build final prompt based on doc type
    const docTypeInstructions: Record<DocType, string> = {
      "how-to": `Create a comprehensive how-to guide that:
1. Has a clear, action-oriented title
2. Synthesizes the processes from ALL sessions into a unified workflow
3. Includes a prerequisites section if applicable
4. Breaks down the process into numbered steps
5. Incorporates relevant information from reference materials
6. Includes tips, warnings, and best practices observed across sessions
7. Ends with verification/success criteria`,

      "knowledge-article": `Create a comprehensive knowledge article that:
1. Has an informative title explaining the topic
2. Opens with a brief overview synthesizing learnings from ALL sessions
3. Organizes content into logical sections with headers
4. Identifies patterns and common themes across sessions
5. Incorporates relevant information from reference materials
6. Includes practical examples from the sessions
7. Notes related topics and next steps`,

      troubleshooting: `Create a comprehensive troubleshooting guide that:
1. Has a clear problem statement title
2. Synthesizes issues encountered across ALL sessions
3. Lists symptoms to recognize each issue type
4. Provides diagnostic steps based on session learnings
5. Gives solution steps observed to work across sessions
6. Incorporates relevant information from reference materials
7. Includes prevention tips based on session blockers`,
    };

    const strategyInstruction =
      mergeStrategy === "chronological"
        ? "Present information in chronological order, showing progression over time."
        : "Group information thematically, combining related insights regardless of when they occurred.";

    // Build intro based on what sources are provided
    let intro = "";
    if (sessions.length > 0 && artifacts.length > 0) {
      intro = `You are an expert technical writer creating a ${docType} from work sessions and reference materials.`;
    } else if (sessions.length > 0) {
      intro = `You are an expert technical writer creating a ${docType} from ${sessions.length > 1 ? "MULTIPLE work sessions" : "a work session"}.`;
    } else {
      intro = `You are an expert technical writer creating a ${docType} from reference materials/artifacts.`;
    }

    // Build important notes based on sources
    let importantNotes = "";
    if (sessions.length > 0 && artifacts.length > 0) {
      importantNotes = `Important:
- Synthesize insights from ALL ${sessions.length} session${sessions.length > 1 ? "s" : ""} and ${artifacts.length} artifact${artifacts.length > 1 ? "s" : ""} into ONE unified document
- Identify patterns and common themes across all sources
- Reference specific sessions or artifacts when citing examples
- Use Markdown formatting with proper heading hierarchy
- Keep it comprehensive but concise`;
    } else if (sessions.length > 0) {
      importantNotes = `Important:
- Synthesize insights from ALL ${sessions.length} session${sessions.length > 1 ? "s" : ""} into ONE unified document
- Identify patterns and common themes across sessions
- Reference specific sessions when citing examples
- Use Markdown formatting with proper heading hierarchy
- Keep it comprehensive but concise`;
    } else {
      importantNotes = `Important:
- Synthesize content from ALL ${artifacts.length} artifact${artifacts.length > 1 ? "s" : ""} into ONE unified document
- Extract key information and organize it logically
- Reference specific documents when citing information
- Use Markdown formatting with proper heading hierarchy
- Keep it comprehensive but concise`;
    }

    return `${intro}

${sessionSections}
${artifactsSection}
=== INSTRUCTIONS ===
${docTypeInstructions[docType]}

${sessions.length > 1 ? `Organization strategy: ${strategyInstruction}` : ""}

${additionalContext ? `Additional context from user: ${additionalContext}` : ""}

${importantNotes}

Output in Markdown format.`;
  }
}

// Export singleton
export const docGenerationService = new DocGenerationService();
