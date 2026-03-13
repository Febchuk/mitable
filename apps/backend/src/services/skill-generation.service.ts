import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config.js";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ module: "SkillGenerationService" });

export interface ExtractedSkill {
  name: string;
  description: string;
  category:
    | "communication"
    | "development"
    | "project_management"
    | "documentation"
    | "meetings"
    | "design"
    | "research";
  contextSummary: string;
  relatedApps: string[];
}

class SkillGenerationService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }

  async generateFromSession(sessionId: string, userId: string): Promise<ExtractedSkill[]> {
    // 1. Load session data — scope to the requesting user to prevent data leakage
    const session = await db
      .select()
      .from(schema.monitoringSessions)
      .where(
        and(
          eq(schema.monitoringSessions.id, sessionId),
          eq(schema.monitoringSessions.userId, userId)
        )
      )
      .limit(1);

    if (!session.length) {
      throw new Error("Session not found");
    }

    const s = session[0];

    if (!s.finalSummary) {
      logger.info({ sessionId }, "Session has no summary, skipping skill generation");
      return [];
    }

    // 2. Build prompt with session data
    const prompt = `Analyze this work session and extract reusable "skills" — knowledge profiles about how this person works.

Session Summary: ${s.finalSummary}
Key Activities: ${JSON.stringify(s.keyActivities || [])}
Time Breakdown: ${JSON.stringify(s.timeBreakdown || {})}
Task Breakdown: ${JSON.stringify(s.taskBreakdown || {})}

Extract 1-3 skills. Each skill should capture a reusable pattern about how this person works.

Return a JSON array of objects with these fields:
- name: short skill name (e.g. "Slack Communication Style", "VS Code Development Workflow")
- description: one-line description
- category: one of "communication", "development", "project_management", "documentation", "meetings", "design", "research"
- contextSummary: 2-3 sentences the AI agent can use to understand how the user works in this area. Include specific details like apps used, preferred workflows, communication tone.
- relatedApps: array of app names detected (e.g. ["Slack", "VS Code", "Chrome"])

Return ONLY the JSON array, no other text.`;

    // 3. Call Gemini Flash with structured JSON output
    const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();

    try {
      const skills = JSON.parse(text) as ExtractedSkill[];
      logger.info({ sessionId, count: skills.length }, "Generated skills from session");
      return skills;
    } catch (e) {
      logger.error({ sessionId, text }, "Failed to parse Gemini skill response");
      return [];
    }
  }
}

export const skillGenerationService = new SkillGenerationService();
