import { db } from "../db/client";
import { users, sessionCaptures } from "../db/schema";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import Groq from "groq-sdk";
import { config } from "../config";
import {
  CLASSIFIER_SYSTEM_PROMPT,
  buildClassifierUserPrompt,
} from "../prompts/session-prompts";
import { createSessionLogger } from "../lib/sessionLogger";

export interface ClassifierInput {
  userId: string;
  sessionId: string;
  deltaDescription: string;
  frameId: string;
}

export interface ClassifierResult {
  activity: string;
  confidence: number;
  isContinuation: boolean;
}

class ClassifierService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: config.groq.apiKey });
  }

  /**
   * Classify the current delta into a meaningful activity
   */
  async classifyActivity(input: ClassifierInput): Promise<ClassifierResult | null> {
    const log = createSessionLogger({ sessionId: input.sessionId });

    try {
      // 1. Fetch User Persona
      const user = await db.query.users.findFirst({
        where: eq(users.id, input.userId),
        columns: {
          jobTitle: true,
          regularTasks: true,
          regularApps: true,
          additionalContext: true,
        },
      });

      if (!user) {
        log.warn("User not found for classification", { userId: input.userId });
        return null; // Should ideally have a fallback
      }

      // 2. Fetch Recent History (Last 5 valid activities)
      // We look for captures that HAVE an activityDescription already
      const historyCaptures = await db.query.sessionCaptures.findMany({
        where: and(
          eq(sessionCaptures.sessionId, input.sessionId),
          isNotNull(sessionCaptures.activityDescription)
        ),
        orderBy: [desc(sessionCaptures.sequenceNumber)],
        limit: 5,
        columns: {
          activityDescription: true,
        },
      });

      // Reverse to get chronological order [oldest ... newest]
      const history = historyCaptures
        .map((c) => c.activityDescription as string)
        .reverse();

      // 3. Build Prompt
      const userPrompt = buildClassifierUserPrompt(
        {
          jobTitle: user.jobTitle || undefined,
          regularTasks: (user.regularTasks as string[]) || undefined,
          regularApps: (user.regularApps as string[]) || undefined,
          additionalContext: user.additionalContext || undefined,
        },
        history,
        input.deltaDescription
      );

      // 4. Call LLM (Llama 3 70b or 8b for speed/quality balance)
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        model: "llama-3.3-70b-versatile", // High intelligence for context understanding
        temperature: 0.1, // Low temp for consistency
        response_format: { type: "json_object" },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("Empty response from Classifier LLM");

      // 5. Parse Output
      const parsed = JSON.parse(content);

      return {
        activity: parsed.activity || input.deltaDescription, // Fallback to delta if missing
        confidence: parsed.confidence || 0.5,
        isContinuation: parsed.is_continuation || false,
      };

    } catch (error) {
      log.error("Classifier failed", {
        error: error instanceof Error ? error.message : String(error),
        delta: input.deltaDescription,
      });
      // Fallback: Use the raw delta as the activity
      return {
        activity: input.deltaDescription,
        confidence: 0.1,
        isContinuation: false,
      };
    }
  }
}

export const classifierService = new ClassifierService();
