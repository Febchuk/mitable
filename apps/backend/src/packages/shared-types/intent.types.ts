export type IntentType = 
  | "greeting"              // Hi, hello, etc.
  | "company"               // About the company: mission, business model, values, strategy
  | "product"               // Features, roadmap, PRDs, specs
  | "operations"            // Processes, workflows, how we work, past discussions
  | "technical"             // Code, architecture, APIs, tech docs
  | "general";              // General questions, can answer without context

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
