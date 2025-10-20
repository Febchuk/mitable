/**
 * Trust-Based Ranking Types
 *
 * Defines intent categories and source type multipliers for intelligent
 * result ranking based on query type.
 */

export type IntentType =
  | "company" // Business model, mission, what Mitable does
  | "product" // Features, roadmap, PRDs, specs
  | "operations" // Processes, workflows, history, team
  | "technical" // Code, APIs, architecture, implementation
  | "greeting" // Hi, hello, thanks, bye
  | "general"; // General knowledge (definitions, how-to)

export type SourceType = "codebase" | "document" | "chat";

export interface IntentAnalysis {
  type: IntentType;
  confidence: number; // 0.0 - 1.0
  needsContext: boolean; // Does this query need knowledge base?
  reasoning?: string; // Why this classification
}

export interface IntentOptions {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export interface TrustConfig {
  multipliers: {
    codebase: number;
    document: number;
    chat: number;
  };
}

/**
 * Intent-to-Trust mapping
 *
 * Defines how to boost different source types based on query intent:
 * - Company questions → Boost documents (Notion, Google Drive)
 * - Product questions → Boost documents (PRDs, roadmaps, specs)
 * - Operations questions → Boost chat (Slack conversations, real workflow)
 * - Technical questions → Boost codebase (code, APIs) and docs
 * - Greeting/General → Equal treatment (no boosting)
 */
export const INTENT_TRUST_MAP: Record<IntentType, TrustConfig> = {
  company: {
    multipliers: {
      codebase: 1.0,
      document: 2.5, // Boost Notion, Google Drive for company info
      chat: 1.0,
    },
  },
  product: {
    multipliers: {
      codebase: 1.0,
      document: 2.0, // Boost PRDs, roadmaps, product specs
      chat: 1.0,
    },
  },
  operations: {
    multipliers: {
      codebase: 1.0,
      document: 1.0,
      chat: 2.5, // Boost Slack for workflow, history, "what happened"
    },
  },
  technical: {
    multipliers: {
      codebase: 3.0, // Strongly boost code for technical questions
      document: 1.5, // Moderately boost docs (API docs, architecture)
      chat: 1.0,
    },
  },
  greeting: {
    multipliers: {
      codebase: 1.0,
      document: 1.0,
      chat: 1.0, // No boosting for greetings
    },
  },
  general: {
    multipliers: {
      codebase: 1.0,
      document: 1.0,
      chat: 1.0, // No boosting for general questions
    },
  },
};

/**
 * Confidence threshold for applying trust ranking
 * Only apply ranking if intent confidence >= this value
 */
export const TRUST_CONFIDENCE_THRESHOLD = 0.7;
