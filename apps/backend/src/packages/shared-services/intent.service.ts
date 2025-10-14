import Groq from "groq-sdk";
import type { IntentAnalysis, IntentOptions } from "../shared-types/intent.types";

let groq: Groq | null = null;

function getGroq(): Groq {
  if (!groq) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY environment variable is required");
    }
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groq;
}

/**
 * Analyze user intent to determine if RAG is needed
 */
export async function analyzeIntent(options: IntentOptions): Promise<IntentAnalysis> {
  const { message, conversationHistory = [] } = options;
  
  const ai = getGroq();
  
  const systemPrompt = `You are an intent classifier for a company knowledge assistant named Mitable (an onboarding platform).

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

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-3).map(msg => ({ // Only last 3 for context
      role: msg.role as "user" | "assistant",
      content: msg.content
    })),
    { role: "user", content: `Classify this message:\n"${message}"` }
  ];

  const response = await ai.chat.completions.create({
    model: "llama-3.3-70b-versatile", // Fast model for classification
    messages,
    temperature: 0.3, // Lower temp for more consistent classification
    response_format: { type: "json_object" }
  });

  const content = response.choices[0]?.message?.content || "{}";
  
  try {
    const analysis = JSON.parse(content) as IntentAnalysis;
    
    console.log(`Intent: ${analysis.type} (confidence: ${analysis.confidence}, needsContext: ${analysis.needsContext})`);
    if (analysis.reasoning) {
      console.log(`Reasoning: ${analysis.reasoning}`);
    }
    
    return analysis;
  } catch (error) {
    console.error("Failed to parse intent response:", content);
    // Default to general to be safe
    return {
      type: "general",
      confidence: 0.5,
      needsContext: true,
      reasoning: "Failed to classify, defaulting to general"
    };
  }
}
