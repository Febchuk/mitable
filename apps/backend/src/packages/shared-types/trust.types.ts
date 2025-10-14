import type { IntentType } from "./intent.types";

export type SourceType = "codebase" | "document" | "chat";

export interface TrustMultipliers {
  codebase: number;   // Future: GitHub repos
  document: number;   // Google Drive, Notion, PDFs
  chat: number;       // Slack messages
}

export interface IntentSourcePreference {
  primary: SourceType;
  multipliers: TrustMultipliers;
}

// Map each intent type to preferred sources and their multipliers
export const INTENT_TRUST_MAP: Record<IntentType, IntentSourcePreference | null> = {
  // Company questions: Documents first (business model, mission, strategy)
  company: {
    primary: "document",
    multipliers: {
      codebase: 0.8,   // Not relevant
      document: 2.5,   // Very strong boost for company docs
      chat: 1.0,       // Baseline for discussions
    }
  },
  
  // Product questions: Documents first (PRDs, specs, roadmaps)
  product: {
    primary: "document",
    multipliers: {
      codebase: 1.0,   // Not relevant yet
      document: 2.0,   // Strong boost for docs
      chat: 1.0,       // Baseline for discussions
    }
  },
  
  // Operations questions: Chat first (real workflows, how we actually work, history)
  operations: {
    primary: "chat",
    multipliers: {
      codebase: 0.8,   // Usually not relevant
      document: 1.2,   // Process docs and meeting notes
      chat: 2.0,       // Strong boost for Slack conversations and history
    }
  },
  
  // Technical questions: Code first (when available), then docs
  technical: {
    primary: "codebase",
    multipliers: {
      codebase: 3.0,   // Huge boost for actual code (future)
      document: 1.5,   // Tech docs are good
      chat: 1.0,       // Baseline for discussions
    }
  },
  
  // No ranking for these (skip RAG or use baseline)
  greeting: null,
  general: null,
};

// Minimum confidence to apply trust ranking
export const TRUST_CONFIDENCE_THRESHOLD = 0.7;
