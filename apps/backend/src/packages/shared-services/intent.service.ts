import OpenAI from "openai";
import type { IntentAnalysis, IntentOptions } from "../shared-types/intent.types";

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * Analyze user intent to determine if RAG is needed
 */
export async function analyzeIntent(options: IntentOptions): Promise<IntentAnalysis> {
  const { message, conversationHistory = [] } = options;
  
  const ai = getOpenAI();
  
  const systemPrompt = `You are an intent classifier for a company knowledge assistant.

Analyze the user's message and classify it into ONE of these categories:

1. **greeting** - Simple greetings, pleasantries (hi, hello, good morning, how are you)
2. **knowledge_query** - Questions about company info, documents, people, processes, Slack conversations, or internal knowledge
3. **general_question** - General questions that don't need company context (definitions, explanations, how-to)
4. **clarification** - Follow-up questions asking for more details or clarification
5. **feedback** - Thanks, acknowledgments, confirmations (ok, thanks, got it)

Respond ONLY with valid JSON in this format:
{
  "type": "greeting|knowledge_query|general_question|clarification|feedback",
  "confidence": 0.0-1.0,
  "needsContext": true|false,
  "reasoning": "brief explanation"
}

Examples:
- "Hi" → {"type":"greeting","confidence":1.0,"needsContext":false,"reasoning":"Simple greeting"}
- "What was discussed in engineering channel?" → {"type":"knowledge_query","confidence":0.95,"needsContext":true,"reasoning":"Asking about internal Slack conversations"}
- "What is machine learning?" → {"type":"general_question","confidence":0.9,"needsContext":false,"reasoning":"General definition, no company context needed"}
- "Can you elaborate?" → {"type":"clarification","confidence":0.85,"needsContext":true,"reasoning":"Follow-up seeking more details"}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-3).map(msg => ({ // Only last 3 for context
      role: msg.role as "user" | "assistant",
      content: msg.content
    })),
    { role: "user", content: `Classify this message:\n"${message}"` }
  ];

  const response = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.3, // Lower temp for consistent classification
    max_tokens: 150,
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
    // Default to knowledge_query to be safe
    return {
      type: "knowledge_query",
      confidence: 0.5,
      needsContext: true,
      reasoning: "Failed to classify, defaulting to knowledge query"
    };
  }
}
