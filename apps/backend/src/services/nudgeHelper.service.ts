import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import type { Message } from "../db/schema/conversations.schema";

/**
 * Nudge Helper Service
 *
 * Generates context summaries and actionable questions from conversation history
 * for expert nudges. Uses Gemini 2.0 Flash for cost-effective text generation.
 *
 * Used by FindExpertTool to automatically populate nudge content when
 * expert matching is triggered from a conversation.
 */
export class NudgeHelperService {
  private gemini: GoogleGenerativeAI;

  constructor() {
    this.gemini = new GoogleGenerativeAI(config.gemini.apiKey);
  }

  /**
   * Generate nudge context from conversation messages
   *
   * Analyzes the conversation and creates a concise summary for the expert.
   * Uses Gemini 2.0 Flash for cost-effective text generation.
   *
   * @param messages - Conversation history
   * @returns 300-word context summary in third person
   */
  async generateContext(messages: Message[]): Promise<string> {
    try {
      // Format conversation for AI
      const conversationText = messages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");

      const prompt = `Based on this conversation, write a concise context summary (max 300 words) that explains what the user needs help with. This will be shared with an expert who can provide assistance.

Focus on:
- What the user is trying to accomplish
- What they've tried so far
- What specific problems or blockers they're encountering
- Any relevant technical details

Keep it professional and actionable. Write in third person (e.g., "The user is trying to...").

Conversation:
${conversationText}

Context summary:`;

      const model = this.gemini.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      return text.trim() || "Unable to generate context.";
    } catch (error) {
      console.error("[NudgeHelperService] Error generating context:", error);
      throw new Error("Failed to generate context from conversation");
    }
  }

  /**
   * Generate specific question from conversation
   *
   * Extracts or formulates the main question the user needs answered.
   *
   * @param messages - Conversation history
   * @returns 1-2 sentence actionable question
   */
  async generateQuestion(messages: Message[]): Promise<string> {
    try {
      // Format conversation for AI
      const conversationText = messages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");

      const prompt = `Based on this conversation, formulate a specific, actionable question (1-2 sentences) that captures what the user needs help with. This question will be shared with an expert.

Make it:
- Direct and clear
- Focused on the main issue
- Actionable (the expert should know what to address)
- Professional tone

Conversation:
${conversationText}

Specific question:`;

      const model = this.gemini.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      return text.trim() || "Unable to generate question.";
    } catch (error) {
      console.error("[NudgeHelperService] Error generating question:", error);
      throw new Error("Failed to generate question from conversation");
    }
  }
}

// Export singleton instance
export const nudgeHelperService = new NudgeHelperService();
