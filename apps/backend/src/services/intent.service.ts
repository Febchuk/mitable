import Groq from "groq-sdk";
import { config } from "../config.js";
import type { IntentAnalysis, IntentOptions } from "../types/trust.types.js";

/**
 * Intent Detection Service
 *
 * Analyzes user queries to determine intent category and whether
 * knowledge base context is needed. Uses Groq for fast classification.
 *
 * Intent categories:
 * - company: Business model, mission, what Mitable does
 * - product: Features, roadmap, PRDs, specs
 * - operations: Processes, workflows, history, team
 * - technical: Code, APIs, architecture, implementation
 * - greeting: Hi, hello, thanks, bye
 * - general: General knowledge questions
 */
class IntentService {
  private groq: Groq;

  constructor() {
    if (!config.groq.apiKey) {
      throw new Error("GROQ_API_KEY is not configured. Please set it in your .env file.");
    }

    this.groq = new Groq({
      apiKey: config.groq.apiKey,
    });
  }

  /**
   * Analyze user intent to determine query category and context needs
   */
  async analyzeIntent(options: IntentOptions): Promise<IntentAnalysis> {
    const { message, conversationHistory = [] } = options;

    const systemPrompt = `You are an intent classifier for a company knowledge assistant named Mitable (a work context capture and time insights platform).

Analyze the user's message and classify it into ONE of these categories:

1. **company** - Questions about THE COMPANY: business model, mission, values, strategy, what Mitable does
2. **product** - Questions about product features, roadmap, PRDs, specs, what we're building
3. **operations** - Questions about processes, workflows, how we work, past discussions, what happened when, team members
4. **technical** - Questions about code, architecture, APIs, implementation, engineering
5. **greeting** - Simple greetings (hi, hello, thanks, bye)
6. **general** - General knowledge questions that don't need company context (definitions, how-to)

Rules:
- If mentions "Mitable", "our company", "we", "us" → company-specific (NOT general)
- If asks "what happened", "when did", "who said" → operations (includes history)
- If asks about concepts/definitions without company context → general

Respond ONLY with valid JSON:
{
  "type": "company|product|operations|technical|greeting|general",
  "confidence": 0.0-1.0,
  "needsContext": true|false,
  "reasoning": "brief explanation"
}

Examples:
- "What is Mitable's business model?" → {"type":"company","confidence":0.95,"needsContext":true,"reasoning":"Company-specific question"}
- "What features are in the PRD?" → {"type":"product","confidence":0.95,"needsContext":true,"reasoning":"Product specs"}
- "What happened on October 7th?" → {"type":"operations","confidence":0.9,"needsContext":true,"reasoning":"Past events query"}
- "How do we deploy?" → {"type":"operations","confidence":0.9,"needsContext":true,"reasoning":"Company process"}
- "What's the API endpoint?" → {"type":"technical","confidence":0.95,"needsContext":true,"reasoning":"Technical implementation"}
- "What is REST API?" → {"type":"general","confidence":0.95,"needsContext":false,"reasoning":"General definition"}
- "Hi" → {"type":"greeting","confidence":1.0,"needsContext":false,"reasoning":"Greeting"}`;

    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-3).map(
        (msg) =>
          ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          }) as Groq.Chat.ChatCompletionMessageParam
      ),
      {
        role: "user",
        content: `Classify this message:\n"${message}"`,
      },
    ];

    try {
      const response = await this.groq.chat.completions.create({
        model: config.groq.chatModel, // openai/gpt-oss-120b
        messages,
        temperature: 0.3, // Lower temp for consistent classification
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";

      const analysis = JSON.parse(content) as IntentAnalysis;

      console.log(
        `[IntentService] Intent: ${analysis.type} (confidence: ${analysis.confidence}, needsContext: ${analysis.needsContext})`
      );
      if (analysis.reasoning) {
        console.log(`[IntentService] Reasoning: ${analysis.reasoning}`);
      }

      return analysis;
    } catch (error) {
      console.error("[IntentService] Failed to analyze intent:", error);
      // Default to general with context to be safe
      return {
        type: "general",
        confidence: 0.5,
        needsContext: true,
        reasoning: "Failed to classify, defaulting to general",
      };
    }
  }
}

// Export singleton instance
export const intentService = new IntentService();
