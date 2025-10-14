export type IntentType = 
  | "greeting"           // Hi, hello, etc.
  | "knowledge_query"    // Needs RAG (company info, documents)
  | "general_question"   // Can answer without context
  | "clarification"      // Follow-up, asking for more details
  | "feedback";          // Thanks, acknowledgment

export interface IntentAnalysis {
  type: IntentType;
  confidence: number;
  needsContext: boolean;
  reasoning?: string;
}

export interface IntentOptions {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}
